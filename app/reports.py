from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from .deps import db, current_user

router = APIRouter(prefix="/reports", tags=["reports"])


def parse(value: str, name: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, f"{name} must look like 2026-11-10")


def offset_str(tz: int) -> str:
    h, m = divmod(abs(tz), 60)
    return f"{'+' if tz >= 0 else '-'}{h:02d}:{m:02d}"


def pct(part: int, whole: int) -> float:
    return round(part / whole * 100, 1) if whole else 0


@router.get("/profit")
def profit_report(start: str, end: str, tz: int = 0, user=Depends(current_user)):
    """start/end are inclusive local dates. tz = minutes east of UTC (Philippines = 480)."""
    uid = user["uid"]
    d0, d1 = parse(start, "start"), parse(end, "end")
    if d1 < d0:
        raise HTTPException(422, "end must not be before start")
    if (d1 - d0).days > 366:
        raise HTTPException(422, "Range can't be longer than one year")

    after = d1 + timedelta(days=1)
    # sales are timestamps, so shift by the user's timezone
    s0 = datetime.combine(d0, time.min) - timedelta(minutes=tz)
    s1 = datetime.combine(after, time.min) - timedelta(minutes=tz)
    # expenses are stored as midnight UTC of the chosen day, so no shift
    e0 = datetime.combine(d0, time.min, tzinfo=timezone.utc)
    e1 = datetime.combine(after, time.min, tzinfo=timezone.utc)

    sale_match = {"owner_uid": uid, "status": "completed",
                  "sale_date": {"$gte": s0, "$lt": s1}}
    line_rev = {"$multiply": ["$items.quantity", "$items.unit_price_centavos"]}
    line_cost = {"$multiply": ["$items.quantity", "$items.unit_cost_centavos"]}

    # ---- per product ----
    products = []
    for r in db.sales.aggregate([
        {"$match": sale_match},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.product_id", "name": {"$last": "$items.name"},
                    "quantity": {"$sum": "$items.quantity"},
                    "revenue": {"$sum": line_rev}, "cost": {"$sum": line_cost}}},
    ]):
        profit = r["revenue"] - r["cost"]
        products.append({
            "product_id": str(r["_id"]), "name": r["name"], "quantity": r["quantity"],
            "revenue_centavos": r["revenue"], "cost_centavos": r["cost"],
            "profit_centavos": profit, "margin": pct(profit, r["revenue"]),
        })

    # ---- per day ----
    sales_by_day = {r["_id"]: r for r in db.sales.aggregate([
        {"$match": sale_match},
        {"$unwind": "$items"},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$sale_date",
                                              "timezone": offset_str(tz)}},
                    "revenue": {"$sum": line_rev}, "cost": {"$sum": line_cost}}},
    ])}
    exp_match = {"owner_uid": uid, "expense_date": {"$gte": e0, "$lt": e1}}
    exp_by_day = {r["_id"]: r["total"] for r in db.expenses.aggregate([
        {"$match": exp_match},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$expense_date"}},
                    "total": {"$sum": "$amount_centavos"}}},
    ])}

    days, d = [], d0
    while d <= d1:
        key = d.isoformat()
        s = sales_by_day.get(key, {"revenue": 0, "cost": 0})
        gross = s["revenue"] - s["cost"]
        exp = exp_by_day.get(key, 0)
        days.append({"date": key, "revenue_centavos": s["revenue"],
                     "gross_profit_centavos": gross, "expenses_centavos": exp,
                     "net_centavos": gross - exp})
        d += timedelta(days=1)

    # ---- expenses by category ----
    expense_categories = [
        {"category": r["_id"], "amount_centavos": r["total"]}
        for r in db.expenses.aggregate([
            {"$match": exp_match},
            {"$group": {"_id": {"$ifNull": ["$category", "Uncategorized"]},
                        "total": {"$sum": "$amount_centavos"}}},
            {"$sort": {"total": -1}},
        ])
    ]

    revenue = sum(p["revenue_centavos"] for p in products)
    cogs = sum(p["cost_centavos"] for p in products)
    gross = revenue - cogs
    expenses = sum(c["amount_centavos"] for c in expense_categories)
    net = gross - expenses

    return {
        "summary": {
            "revenue_centavos": revenue, "cogs_centavos": cogs,
            "gross_profit_centavos": gross, "gross_margin": pct(gross, revenue),
            "expenses_centavos": expenses, "net_profit_centavos": net,
            "net_margin": pct(net, revenue),
            "transactions": db.sales.count_documents(sale_match),
            "units_sold": sum(p["quantity"] for p in products),
        },
        "products": products,
        "days": days,
        "expense_categories": expense_categories,
    }