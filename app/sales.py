from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .deps import db, client, current_user

router = APIRouter(prefix="/sales", tags=["sales"])


class SaleItemIn(BaseModel):
    product_id: str
    quantity: int = Field(ge=1, le=100000)


class SaleIn(BaseModel):
    items: list[SaleItemIn] = Field(min_length=1)
    payment_method: Literal["cash", "gcash", "card", "other"] = "cash"


def oid(value: str, what: str = "Sale") -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(404, f"{what} not found")


# ---- "today" and "this month" depend on the user's timezone ----
# tz = minutes east of UTC (Philippines = 480); the frontend sends it.

def local_today(tz: int) -> date:
    return (datetime.now(timezone.utc) + timedelta(minutes=tz)).date()


def local_range(start: date, end: date, tz: int):
    def utc(d):
        return datetime.combine(d, time.min) - timedelta(minutes=tz)  # naive = UTC
    return utc(start), utc(end)


def totals(uid: str, start: datetime, end: datetime):
    """(revenue, gross profit) in centavos over completed sales."""
    r = list(db.sales.aggregate([
        {"$match": {"owner_uid": uid, "status": "completed",
                    "sale_date": {"$gte": start, "$lt": end}}},
        {"$unwind": "$items"},
        {"$group": {
            "_id": None,
            "revenue": {"$sum": {"$multiply": ["$items.quantity", "$items.unit_price_centavos"]}},
            "profit": {"$sum": {"$multiply": [
                "$items.quantity",
                {"$subtract": ["$items.unit_price_centavos", "$items.unit_cost_centavos"]}]}},
        }},
    ]))
    return (r[0]["revenue"], r[0]["profit"]) if r else (0, 0)


def out(s: dict) -> dict:
    s["id"] = str(s.pop("_id"))
    s.pop("owner_uid", None)
    s["sale_date"] = s["sale_date"].isoformat() + "Z"
    if s.get("voided_at"):
        s["voided_at"] = s["voided_at"].isoformat() + "Z"
    if s.get("customer_id"):
        s["customer_id"] = str(s["customer_id"])
    for it in s["items"]:
        it["product_id"] = str(it["product_id"])
    s["profit_centavos"] = sum(
        (i["unit_price_centavos"] - i["unit_cost_centavos"]) * i["quantity"] for i in s["items"])
    return s


@router.get("")
def list_sales(date: str | None = None, tz: int = 0, user=Depends(current_user)):
    try:
        day = __import__("datetime").date.fromisoformat(date) if date else local_today(tz)
    except ValueError:
        raise HTTPException(422, "date must look like 2026-11-10")
    start, end = local_range(day, day + timedelta(days=1), tz)
    rows = db.sales.find({"owner_uid": user["uid"], "sale_date": {"$gte": start, "$lt": end}}) \
                   .sort("sale_date", -1)
    return [out(s) for s in rows]


@router.post("", status_code=201)
def create_sale(body: SaleIn, user=Depends(current_user)):
    uid = user["uid"]
    wanted: dict[ObjectId, int] = {}
    for it in body.items:                               # merge duplicate lines
        pid = oid(it.product_id, "Product")
        wanted[pid] = wanted.get(pid, 0) + it.quantity

    sale_id = ObjectId()
    now = datetime.now(timezone.utc)

    def txn(session):
        lines, total = [], 0
        for pid, qty in wanted.items():
            # atomic: only succeeds if the product is yours, active and has enough stock.
            # Returns the document as it was BEFORE the update (price/cost snapshot).
            p = db.products.find_one_and_update(
                {"_id": pid, "owner_uid": uid, "is_active": True,
                 "stock_quantity": {"$gte": qty}},
                {"$inc": {"stock_quantity": -qty}},
                session=session,
            )
            if p is None:
                known = db.products.find_one({"_id": pid, "owner_uid": uid}, session=session)
                if not known or not known.get("is_active"):
                    raise HTTPException(404, "A product in the cart is no longer available")
                raise HTTPException(
                    409, f"Not enough stock for {known['name']} (only {known['stock_quantity']} left)")
            cost = sum(p.get("costs", {}).values())
            lines.append({
                "product_id": pid, "name": p["name"], "quantity": qty,
                "unit_price_centavos": p["selling_price_centavos"],
                "unit_cost_centavos": cost,
            })
            total += qty * p["selling_price_centavos"]
            db.inventory_movements.insert_one({
                "owner_uid": uid, "product_id": pid, "type": "sale",
                "quantity": -qty, "reference_sale_id": sale_id, "created_at": now,
            }, session=session)

        db.sales.insert_one({
            "_id": sale_id, "owner_uid": uid, "customer_id": None, "sale_date": now,
            "payment_method": body.payment_method, "status": "completed",
            "items": lines, "total_centavos": total,
        }, session=session)

    with client.start_session() as s:
        s.with_transaction(txn)
    return out(db.sales.find_one({"_id": sale_id}))


@router.post("/{sid}/void")
def void_sale(sid: str, user=Depends(current_user)):
    uid, sale_oid, now = user["uid"], oid(sid), datetime.now(timezone.utc)

    def txn(session):
        sale = db.sales.find_one_and_update(
            {"_id": sale_oid, "owner_uid": uid, "status": "completed"},
            {"$set": {"status": "voided", "voided_at": now}},
            session=session,
        )
        if sale is None:
            raise HTTPException(409, "Sale not found or already voided")
        for it in sale["items"]:                        # put the stock back
            db.products.update_one({"_id": it["product_id"], "owner_uid": uid},
                                   {"$inc": {"stock_quantity": it["quantity"]}}, session=session)
            db.inventory_movements.insert_one({
                "owner_uid": uid, "product_id": it["product_id"], "type": "void",
                "quantity": it["quantity"], "reference_sale_id": sale_oid, "created_at": now,
            }, session=session)

    with client.start_session() as s:
        s.with_transaction(txn)
    return out(db.sales.find_one({"_id": sale_oid}))