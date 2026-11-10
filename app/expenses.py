from datetime import date, datetime, time, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from .deps import db, current_user

router = APIRouter(prefix="/expenses", tags=["expenses"])


class ExpenseIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    amount_centavos: int = Field(gt=0)
    expense_date: date
    category: str | None = None
    product_id: str | None = None
    notes: str | None = None

    @field_validator("category", "product_id", "notes", mode="before")
    @classmethod
    def blank_to_none(cls, v):
        v = v.strip() if isinstance(v, str) else v
        return v or None


def oid(value: str, what: str = "Expense") -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(404, f"{what} not found")


def to_dt(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


def month_range(month: str | None):
    today = date.today()
    try:
        y, m = (int(x) for x in month.split("-")) if month else (today.year, today.month)
        start = date(y, m, 1)
    except (ValueError, AttributeError):
        raise HTTPException(422, "month must look like 2026-11")
    end = date(y + (m == 12), 1 if m == 12 else m + 1, 1)
    return to_dt(start), to_dt(end)


def out(e: dict) -> dict:
    e["id"] = str(e.pop("_id"))
    e.pop("owner_uid", None)
    e["expense_date"] = e["expense_date"].date().isoformat()
    if e.get("product_id"):
        e["product_id"] = str(e["product_id"])
    return e


def build_doc(body: ExpenseIn, uid: str) -> dict:
    doc = body.model_dump(exclude_none=True)       # blank optionals are omitted
    doc["expense_date"] = to_dt(body.expense_date)
    if body.product_id:
        pid = oid(body.product_id, "Product")
        if not db.products.find_one({"_id": pid, "owner_uid": uid}, {"_id": 1}):
            raise HTTPException(404, "Product not found")
        doc["product_id"] = pid
    return doc


@router.get("")
def list_expenses(month: str | None = None, user=Depends(current_user)):
    start, end = month_range(month)
    flt = {"owner_uid": user["uid"], "expense_date": {"$gte": start, "$lt": end}}
    rows = db.expenses.find(flt).sort([("expense_date", -1), ("_id", -1)])
    return [out(e) for e in rows]


@router.post("", status_code=201)
def create_expense(body: ExpenseIn, user=Depends(current_user)):
    doc = build_doc(body, user["uid"])
    doc["owner_uid"] = user["uid"]
    res = db.expenses.insert_one(doc)
    return out(db.expenses.find_one({"_id": res.inserted_id}))


@router.put("/{eid}")
def update_expense(eid: str, body: ExpenseIn, user=Depends(current_user)):
    doc = build_doc(body, user["uid"])
    unset = {k: "" for k in ("category", "product_id", "notes") if k not in doc}
    update = {"$set": doc}
    if unset:
        update["$unset"] = unset
    res = db.expenses.update_one({"_id": oid(eid), "owner_uid": user["uid"]}, update)
    if res.matched_count == 0:
        raise HTTPException(404, "Expense not found")
    return out(db.expenses.find_one({"_id": oid(eid)}))


@router.delete("/{eid}")
def delete_expense(eid: str, user=Depends(current_user)):
    res = db.expenses.delete_one({"_id": oid(eid), "owner_uid": user["uid"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Expense not found")
    return {"ok": True}