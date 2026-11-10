import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "../Layout";
import { api } from "../api";
import { peso } from "../money";

const TZ = -new Date().getTimezoneOffset();            // minutes east of UTC
const todayStr = () => new Date().toLocaleDateString("en-CA");

function errorText(e) {
  try {
    const d = JSON.parse(e.message).detail;
    if (Array.isArray(d)) return d.map((x) => `${x.loc?.slice(-1)[0]}: ${x.msg}`).join(", ");
    return d || e.message;
  } catch {
    return e.message;
  }
}

export default function Sales() {
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState({});                // { productId: qty }
  const [payment, setPayment] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [day, setDay] = useState(todayStr());
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadProducts = useCallback(async () => {
    try { setProducts(await api("/products")); } catch (e) { setError(errorText(e)); }
  }, []);

  const loadSales = useCallback(async () => {
    setLoading(true);
    try { setSales(await api(`/sales?date=${day}&tz=${TZ}`)); }
    catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [day]);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => { loadSales(); }, [loadSales]);

  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  const pickList = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter((p) =>
      !t || [p.name, p.sku, p.category].some((v) => v?.toLowerCase().includes(t)));
  }, [products, q]);

  const lines = Object.entries(cart)
    .filter(([id]) => byId[id])
    .map(([id, qty]) => ({ p: byId[id], qty }));
  const total = lines.reduce((s, l) => s + l.p.selling_price_centavos * l.qty, 0);

  const add = (p) => {
    const have = cart[p.id] || 0;
    if (have >= p.stock_quantity) return;
    setCart({ ...cart, [p.id]: have + 1 });
  };
  const setQty = (p, v) => {
    const n = Math.max(0, Math.min(parseInt(v, 10) || 0, p.stock_quantity));
    const next = { ...cart };
    if (n === 0) delete next[p.id]; else next[p.id] = n;
    setCart(next);
  };

  const checkout = async () => {
    setError("");
    setBusy(true);
    try {
      await api("/sales", {
        method: "POST",
        body: JSON.stringify({
          payment_method: payment,
          items: lines.map((l) => ({ product_id: l.p.id, quantity: l.qty })),
        }),
      });
      setCart({});
      await loadProducts();
      if (day !== todayStr()) setDay(todayStr()); else await loadSales();
    } catch (e) {
      setError(errorText(e));
      loadProducts();                                   // stock may have changed
    } finally {
      setBusy(false);
    }
  };

  const voidSale = async (s) => {
    if (!confirm(`Void this ${peso(s.total_centavos)} sale? Stock will be returned.`)) return;
    try {
      await api(`/sales/${s.id}/void`, { method: "POST" });
      await Promise.all([loadProducts(), loadSales()]);
    } catch (e) { setError(errorText(e)); }
  };

  const done = sales.filter((s) => s.status === "completed");
  const dayTotal = done.reduce((s, x) => s + x.total_centavos, 0);
  const dayProfit = done.reduce((s, x) => s + x.profit_centavos, 0);

  return (
    <Layout>
      <div className="page-head"><h1>Sales</h1></div>
      {error && <p className="error">{error}</p>}

      <section className="pos">
        <div className="card">
          <h2>Pick products</h2>
          <input placeholder="Search name, SKU, category…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="pick-list">
            {pickList.length === 0 && <p className="muted">No products found.</p>}
            {pickList.map((p) => (
              <button key={p.id} type="button" className="pick outline"
                      disabled={p.stock_quantity <= (cart[p.id] || 0)} onClick={() => add(p)}>
                <span><strong>{p.name}</strong>
                  <span className="muted"> · {p.stock_quantity} in stock</span></span>
                <span>{peso(p.selling_price_centavos)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Current sale</h2>
          {lines.length === 0 ? <p className="muted">Tap a product to add it.</p> : lines.map(({ p, qty }) => (
            <div className="cart-line" key={p.id}>
              <span>{p.name}<div className="muted">{peso(p.selling_price_centavos)} each</div></span>
              <input type="number" min="0" max={p.stock_quantity} value={qty}
                     onChange={(e) => setQty(p, e.target.value)} />
              <strong>{peso(p.selling_price_centavos * qty)}</strong>
            </div>
          ))}
          <div className="cart-total"><span>Total</span><span>{peso(total)}</span></div>
          <select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="gcash">GCash</option>
            <option value="card">Card</option>
            <option value="other">Other</option>
          </select>
          <button disabled={busy || lines.length === 0} onClick={checkout}>
            {busy ? "Saving…" : "Record sale"}
          </button>
          {lines.length > 0 && (
            <button type="button" className="link" onClick={() => setCart({})}>Clear</button>
          )}
        </div>
      </section>

      <div className="page-head" style={{ marginTop: "2.5rem" }}>
        <h2>Sales history</h2>
        <input type="date" value={day} max={todayStr()}
               onChange={(e) => e.target.value && setDay(e.target.value)} style={{ maxWidth: 200 }} />
      </div>

      <section className="grid" style={{ marginBottom: "1.5rem" }}>
        <div className="stat"><h3>Sales</h3><div className="value">{peso(dayTotal)}</div></div>
        <div className="stat"><h3>Gross profit</h3><div className="value">{peso(dayProfit)}</div></div>
        <div className="stat"><h3>Transactions</h3><div className="value">{done.length}</div></div>
      </section>

      {loading ? <p className="muted">Loading…</p> : sales.length === 0 ? (
        <p className="muted">No sales on this day.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Items</th><th>Payment</th><th>Total</th><th></th></tr></thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className={s.status === "voided" ? "archived" : ""}>
                  <td>{new Date(s.sale_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{s.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}</td>
                  <td>{s.payment_method}</td>
                  <td>{peso(s.total_centavos)}{s.status === "voided" && <span className="badge">Voided</span>}</td>
                  <td className="actions">
                    {s.status === "completed" && (
                      <button className="link" onClick={() => voidSale(s)}>Void</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}