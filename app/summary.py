from datetime import date, datetime, time, timedelta, timezone

from .deps import db
from .restock import restock_list, restock_spent
from .sales import out as sale_out, local_today, local_range, totals
from .settings import get_settings


def build_summary(uid: str, tz: int) -> dict:
    base = {"owner_uid": uid, "is_active": True}

    today = local_today(tz)
    d0, d1 = local_range(today, today + timedelta(days=1), tz)
    m0 = today.replace(day=1)
    m1 = date(m0.year + (m0.month == 12), 1 if m0.month == 12 else m0.month + 1, 1)
    s0, s1 = local_range(m0, m1, tz)
    e0 = datetime.combine(m0, time.min, tzinfo=timezone.utc)
    e1 = datetime.combine(m1, time.min, tzinfo=timezone.utc)

    sales_today, _ = totals(uid, d0, d1)
    sales_month, gross_month = totals(uid, s0, s1)

    categories = [
        {"category": r["_id"], "amount_centavos": r["total"]}
        for r in db.expenses.aggregate([
            {"$match": {"owner_uid": uid, "expense_date": {"$gte": e0, "$lt": e1}}},
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
        "business_name": get_settings(uid)["business_name"],
        "product_count": db.products.count_documents(base),
        "low_stock_count": len(restock),
        "sales_today_centavos": sales_today,
        "sales_month_centavos": sales_month,
        "expenses_month_centavos": expenses_month,
        "profit_month_centavos": gross_month - expenses_month,
        "gross_month_centavos": gross_month,
        "stock_spent_month_centavos": restock_spent(uid, s0, s1),
        "top_products": top_products,
        "expense_categories": categories[:3],
        "recent_sales": recent_sales,
        "restock": restock[:5],
    }