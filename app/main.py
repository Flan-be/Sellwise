from datetime import date, datetime, timedelta, timezone

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .deps import db, current_user
from .products import router as products_router
from .expenses import router as expenses_router, month_range
from .sales import router as sales_router, local_today, local_range, totals
from .reports import router as reports_router
from .restock import router as restock_router, restock_list, restock_spent
from .sales import out as sale_out, router as sales_router, local_today, local_range, totals

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

db.users.create_index("firebase_uid", unique=True)
app.include_router(products_router)
app.include_router(expenses_router)
app.include_router(sales_router)
app.include_router(reports_router)
app.include_router(restock_router)


class SyncIn(BaseModel):
    display_name: str | None = None


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/users/sync")
def sync_user(body: SyncIn, user=Depends(current_user)):
    now = datetime.now(timezone.utc)
    set_fields = {"email": user.get("email"), "last_login": now}
    if body.display_name:
        set_fields["display_name"] = body.display_name
    db.users.update_one(
        {"firebase_uid": user["uid"]},
        {"$set": set_fields,
         "$setOnInsert": {"firebase_uid": user["uid"], "role": "customer", "created_at": now}},
        upsert=True,
    )
    return db.users.find_one({"firebase_uid": user["uid"]}, {"_id": 0})


@app.get("/dashboard/summary")
def summary(tz: int = 0, user=Depends(current_user)):
    uid = user["uid"]
    base = {"owner_uid": uid, "is_active": True}

    today = local_today(tz)
    d0, d1 = local_range(today, today + timedelta(days=1), tz)
    m0 = today.replace(day=1)
    m1 = date(m0.year + (m0.month == 12), 1 if m0.month == 12 else m0.month + 1, 1)
    s0, s1 = local_range(m0, m1, tz)

    sales_today, _ = totals(uid, d0, d1)
    sales_month, gross_month = totals(uid, s0, s1)

    e0, e1 = month_range(None)
    exp_match = {"owner_uid": uid, "expense_date": {"$gte": e0, "$lt": e1}}
    categories = [
        {"category": r["_id"], "amount_centavos": r["total"]}
        for r in db.expenses.aggregate([
            {"$match": exp_match},
            {"$group": {"_id": {"$ifNull": ["$category", "Uncategorized"]},
                        "total": {"$sum": "$amount_centavos"}}},
            {"$sort": {"total": -1}},
        ])
    ]
    expenses_month = sum(c["amount_centavos"] for c in categories)

    top_products = [
        {"name": r["name"], "quantity": r["qty"], "profit_centavos": r["profit"]}
        for r in db.sales.aggregate([
            {"$match": {"owner_uid": uid, "status": "completed",
                        "sale_date": {"$gte": s0, "$lt": s1}}},
            {"$unwind": "$items"},
            {"$group": {"_id": "$items.product_id", "name": {"$last": "$items.name"},
                        "qty": {"$sum": "$items.quantity"},
                        "profit": {"$sum": {"$multiply": [
                            "$items.quantity",
                            {"$subtract": ["$items.unit_price_centavos",
                                           "$items.unit_cost_centavos"]}]}}}},
            {"$sort": {"profit": -1}},
            {"$limit": 3},
        ])
    ]

    recent_sales = [sale_out(s) for s in
                    db.sales.find({"owner_uid": uid}).sort("sale_date", -1).limit(5)]

    restock = restock_list(uid)

    return {
        "product_count": db.products.count_documents(base),
        "low_stock_count": len(restock),
        "sales_today_centavos": sales_today,
        "sales_month_centavos": sales_month,
        "expenses_month_centavos": expenses_month,
        "profit_month_centavos": gross_month - expenses_month,
        "gross_month_centavos": gross_month,
        "top_products": top_products,
        "expense_categories": categories[:3],
        "recent_sales": recent_sales,
        "restock": restock[:5],
        "stock_spent_month_centavos": restock_spent(uid, s0, s1),
    }