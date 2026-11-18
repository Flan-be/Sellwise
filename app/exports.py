import csv
import io
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from .deps import db, current_user
from .sales import local_range

router = APIRouter(prefix="/export", tags=["export"])


def safe(v):
    """Stops text like =SUM(...) from running as a formula when opened in Excel."""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


def pesos(c) -> str:
    return f"{(c or 0) / 100:.2f}"


def local(dt: datetime, tz: int) -> str:
    return (dt + timedelta(minutes=tz)).strftime("%Y-%m-%d %H:%M")


def csv_response(filename: str, header: list, rows) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow([safe(c) for c in r])
    # the BOM makes Excel read the file as UTF-8
    return Response("\ufeff" + buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def parse_range(start: str | None, end: str | None):
    try:
        d0, d1 = date.fromisoformat(start or ""), date.fromisoformat(end or "")
    except ValueError:
        raise HTTPException(422, "start and end must look like 2026-11-10")
    if d1 < d0:
        raise HTTPException(422, "end must not be before start")
    if (d1 - d0).days > 366:
        raise HTTPException(422, "Range can't be longer than one year")
    return d0, d1


@router.get("/{kind}")
def export(kind: str, start: str | None = None, end: str | None = None,
           tz: int = 0, user=Depends(current_user)):
    uid = user["uid"]

    if kind == "products":
        rows = []
        for p in db.products.find({"owner_uid": uid}).sort("name", 1):
            c = p.get("costs", {})
            cost = sum(c.values())
            price = p["selling_price_centavos"]
            rows.append([
                p["name"], p.get("sku", ""), p.get("category", ""), pesos(price),
                pesos(c.get("material_centavos")), pesos(c.get("packaging_centavos")),
                pesos(c.get("other_centavos")), pesos(cost), pesos(price - cost),
                round((price - cost) / price * 100, 1) if price else 0,
                p["stock_quantity"], p["reorder_level"], "yes" if p["is_active"] else "no",
            ])
        return csv_response(
            "sellwise-products.csv",
            ["Product", "SKU", "Category", "Price", "Material", "Packaging", "Other",
             "Total cost", "Profit per unit", "Margin %", "Stock", "Reorder level", "Active"],
            rows)

    if kind not in ("sales", "expenses", "movements"):
        raise HTTPException(404, "Unknown export")

    d0, d1 = parse_range(start, end)
    after = d1 + timedelta(days=1)
    s0, s1 = local_range(d0, after, tz)                       # timestamps shift by timezone
    e0 = datetime.combine(d0, time.min, tzinfo=timezone.utc)  # expenses are midnight UTC
    e1 = datetime.combine(after, time.min, tzinfo=timezone.utc)

    if kind == "sales":
        rows = []
        for s in db.sales.find({"owner_uid": uid, "sale_date": {"$gte": s0, "$lt": s1}}).sort("sale_date", 1):
            for i in s["items"]:
                q, price, cost = i["quantity"], i["unit_price_centavos"], i["unit_cost_centavos"]
                rows.append([
                    local(s["sale_date"], tz), str(s["_id"]), s["status"], s["payment_method"],
                    i["name"], q, pesos(price), pesos(cost), pesos(q * price), pesos(q * (price - cost)),
                ])
        header = ["Date", "Sale ID", "Status", "Payment", "Product", "Qty",
                  "Unit price", "Unit cost", "Line total", "Line profit"]

    elif kind == "expenses":
        rows = [[e["expense_date"].date().isoformat(), e["name"], e.get("category", ""),
                 pesos(e["amount_centavos"]), e.get("notes", "")]
                for e in db.expenses.find({"owner_uid": uid, "expense_date": {"$gte": e0, "$lt": e1}})
                                    .sort("expense_date", 1)]
        header = ["Date", "Expense", "Category", "Amount", "Notes"]

    else:  # movements
        moves = list(db.inventory_movements.find(
            {"owner_uid": uid, "created_at": {"$gte": s0, "$lt": s1}}).sort("created_at", 1))
        names = {p["_id"]: p["name"] for p in db.products.find(
            {"owner_uid": uid, "_id": {"$in": [m["product_id"] for m in moves]}}, {"name": 1})}
        rows = [[local(m["created_at"], tz), names.get(m["product_id"], "(deleted)"), m["type"],
                 m["quantity"], pesos(m.get("unit_cost_centavos")) if "unit_cost_centavos" in m else "",
                 pesos(m.get("cost_centavos")) if "cost_centavos" in m else "", m.get("notes", "")]
                for m in moves]
        header = ["Date", "Product", "Type", "Quantity", "Unit cost", "Total cost", "Notes"]

    return csv_response(f"sellwise-{kind}-{start}-to-{end}.csv", header, rows)