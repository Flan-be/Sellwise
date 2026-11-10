from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from pymongo.errors import DuplicateKeyError

from .deps import db, client, current_user

router = APIRouter(prefix="/products", tags=["products"])


class Costs(BaseModel):
    material_centavos: int = Field(0, ge=0)
    packaging_centavos: int = Field(0, ge=0)
    other_centavos: int = Field(0, ge=0)


class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    sku: str | None = None
    category: str | None = None
    description: str = ""
    selling_price_centavos: int = Field(ge=0)
    costs: Costs = Costs()
    reorder_level: int = Field(0, ge=0)

    @field_validator("sku", "category", mode="before")
    @classmethod
    def blank_to_none(cls, v):
        v = v.strip() if isinstance(v, str) else v
        return v or None


class ProductCreate(ProductBase):
    stock_quantity: int = Field(0, ge=0)


class ProductUpdate(ProductBase):
    is_active: bool | None = None


class StockIn(BaseModel):
    type: Literal["restock", "adjustment", "damage"]
    delta: int          # signed: + adds stock, - removes it
    notes: str | None = None
    


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(404, "Product not found")


def out(p: dict) -> dict:
    p["id"] = str(p.pop("_id"))
    p.pop("owner_uid", None)
    cost = sum(p.get("costs", {}).values())
    price = p["selling_price_centavos"]
    p["total_cost_centavos"] = cost
    p["profit_centavos"] = price - cost
    p["margin"] = round((price - cost) / price * 100, 1) if price else 0
    return p


@router.get("")
def list_products(include_inactive: bool = False, user=Depends(current_user)):
    flt = {"owner_uid": user["uid"]}
    if not include_inactive:
        flt["is_active"] = True
    return [out(p) for p in db.products.find(flt).sort("name", 1)]


@router.post("", status_code=201)
def create_product(body: ProductCreate, user=Depends(current_user)):
    now = datetime.now(timezone.utc)
    doc = body.model_dump(exclude_none=True)   # sku/category omitted when blank
    doc.update(owner_uid=user["uid"], is_active=True, created_at=now)

    def txn(session):
        res = db.products.insert_one(doc, session=session)
        if doc["stock_quantity"] > 0:
            db.inventory_movements.insert_one({
                "owner_uid": user["uid"], "product_id": res.inserted_id,
                "type": "restock", "quantity": doc["stock_quantity"],
                "notes": "Opening stock", "created_at": now,
            }, session=session)
        return res.inserted_id

    try:
        with client.start_session() as s:
            pid = s.with_transaction(txn)
    except DuplicateKeyError:
        raise HTTPException(409, "You already have a product with that SKU")
    return out(db.products.find_one({"_id": pid}))


@router.put("/{pid}")
def update_product(pid: str, body: ProductUpdate, user=Depends(current_user)):
    fields = body.model_dump(exclude_none=True)
    unset = {k: "" for k in ("sku", "category") if getattr(body, k) is None}
    update = {"$set": fields}
    if unset:
        update["$unset"] = unset
    try:
        res = db.products.update_one({"_id": oid(pid), "owner_uid": user["uid"]}, update)
    except DuplicateKeyError:
        raise HTTPException(409, "You already have a product with that SKU")
    if res.matched_count == 0:
        raise HTTPException(404, "Product not found")
    return out(db.products.find_one({"_id": oid(pid)}))


@router.delete("/{pid}")
def archive_product(pid: str, user=Depends(current_user)):
    """Soft delete: past sales still reference the product."""
    res = db.products.update_one({"_id": oid(pid), "owner_uid": user["uid"]},
                                 {"$set": {"is_active": False}})
    if res.matched_count == 0:
        raise HTTPException(404, "Product not found")
    return {"ok": True}


@router.post("/{pid}/stock")
def adjust_stock(pid: str, body: StockIn, user=Depends(current_user)):
    if body.delta == 0:
        raise HTTPException(422, "Quantity can't be zero")
    if body.type == "restock" and body.delta < 0:
        raise HTTPException(422, "Restock must add stock")
    if body.type == "damage" and body.delta > 0:
        raise HTTPException(422, "Damage must remove stock")

    flt = {"_id": oid(pid), "owner_uid": user["uid"]}
    if body.delta < 0:
        flt["stock_quantity"] = {"$gte": -body.delta}   # never go below zero

    def txn(session):
        p = db.products.find_one_and_update(
            flt, {"$inc": {"stock_quantity": body.delta}}, session=session)
        if p is None:
            return False
        movement = {
            "owner_uid": user["uid"], "product_id": oid(pid), "type": body.type,
            "quantity": body.delta, "created_at": datetime.now(timezone.utc),
        }
        if body.notes:
            movement["notes"] = body.notes
        if body.type == "restock":
            unit = sum(p.get("costs", {}).values())      # current cost per unit
            movement["unit_cost_centavos"] = unit
            movement["cost_centavos"] = unit * body.delta
        db.inventory_movements.insert_one(movement, session=session)
        return True

    
    with client.start_session() as s:
        ok = s.with_transaction(txn)
    if not ok:
        raise HTTPException(409, "Product not found, or not enough stock")
    return out(db.products.find_one({"_id": oid(pid)}))