from datetime import date, datetime, timedelta, timezone
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query

from .deps import db, current_user
from .sales import local_today, local_range

router = APIRouter(prefix="/restock", tags=["restock"])

ORDER = {"out": 0, "low": 1, "soon": 2}


def restock_list(uid: str, window: int = 30, cover: int = 14):
    """Products that need reordering.
    out  = no stock left
    low  = at or below the reorder level
    soon = will run out within 7 days at the recent selling speed
    """
    since = datetime.now(timezone.utc) - timedelta(days=window)
    sold = {r["_id"]: r["qty"] for r in db.sales.aggregate([
        {"$match": {"owner_uid": uid, "status": "completed", "sale_date": {"$gte": since}}},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.product_id", "qty": {"$sum": "$items.quantity"}}},
    ])}

    rows = []
    for p in db.products.find({"owner_uid": uid, "is_active": True}):
        stock, level = p["stock_quantity"], p["reorder_level"]
        units = sold.get(p["_id"], 0)
        per_day = units / window
        days_left = round(stock / per_day, 1) if per_day > 0 else None

        if stock <= 0:
            status = "out"
        elif stock <= level:
            status = "low"
        elif days_left is not None and days_left <= 7:
            status = "soon"
        else:
            continue

        target = max(level * 2, ceil(per_day * cover))
        suggested = max(target - stock, 1)
        unit_cost = sum(p.get("costs", {}).values())
        rows.append({
            "id": str(p["_id"]), "name": p["name"], "sku": p.get("sku"),
            "category": p.get("category"), "status": status,
            "stock_quantity": stock, "reorder_level": level,
            "sold_in_window": units, "days_left": days_left,
            "suggested_qty": suggested, "unit_cost_centavos": unit_cost,
        })

    rows.sort(key=lambda r: (ORDER[r["status"]],
                             r["days_left"] if r["days_left"] is not None else 9999))
    return rows


def restock_spent(uid: str, start: datetime, end: datetime) -> int:
    """Plain helper (NOT a route): total paid for restocks in a time range."""
    r = list(db.inventory_movements.aggregate([
        {"$match": {"owner_uid": uid, "type": "restock",
                    "created_at": {"$gte": start, "$lt": end}}},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$cost_centavos", 0]}}}},
    ]))
    return r[0]["total"] if r else 0


@router.get("")
def get_restock(window: int = Query(30, ge=7, le=90), cover: int = Query(14, ge=3, le=60),
                user=Depends(current_user)):
    items = restock_list(user["uid"], window, cover)
    return {
        "window": window, "cover": cover, "items": items,
        "counts": {s: sum(1 for i in items if i["status"] == s) for s in ORDER},
    }


@router.get("/history")
def restock_history(month: str | None = None, tz: int = 0, user=Depends(current_user)):
    uid = user["uid"]
    today = local_today(tz)
    try:
        y, m = (int(x) for x in month.split("-")) if month else (today.year, today.month)
        first = date(y, m, 1)
    except (ValueError, AttributeError):
        raise HTTPException(422, "month must look like 2026-11")
    nxt = date(y + (m == 12), 1 if m == 12 else m + 1, 1)
    start, end = local_range(first, nxt, tz)

    rows = list(db.inventory_movements.find({
        "owner_uid": uid, "type": "restock", "notes": {"$ne": "Opening stock"},
        "created_at": {"$gte": start, "$lt": end},
    }).sort("created_at", -1))

    names = {p["_id"]: p["name"] for p in db.products.find(
        {"_id": {"$in": [r["product_id"] for r in rows]}, "owner_uid": uid}, {"name": 1})}

    return {
        "total_spent_centavos": restock_spent(uid, start, end),
        "items": [{
            "id": str(r["_id"]), "product_id": str(r["product_id"]),
            "name": names.get(r["product_id"], "(deleted product)"),
            "quantity": r["quantity"], "cost_centavos": r.get("cost_centavos"),
            "created_at": r["created_at"].isoformat() + "Z",
        } for r in rows],
    }