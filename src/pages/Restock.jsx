import { useCallback, useEffect, useState } from "react";
import Layout from "../Layout";
import { api } from "../api";
import { peso } from "../money";

const TZ = -new Date().getTimezoneOffset();
const LABEL = { out: "Out of stock", low: "Low", soon: "Running out" };
const thisMonth = () => new Date().toLocaleDateString("en-CA").slice(0, 7);

function errorText(e) {
  try {
    const d = JSON.parse(e.message).detail;
    if (Array.isArray(d)) return d.map((x) => `${x.loc?.slice(-1)[0]}: ${x.msg}`).join(", ");
    return d || e.message;
  } catch {
    return e.message;
  }
}

export default function Restock() {
  const [data, setData] = useState(null);
  const [cover, setCover] = useState(14);
  const [qty, setQty] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [histMonth, setHistMonth] = useState(thisMonth());
  const [hist, setHist] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api(`/restock?cover=${cover}`));
      setQty({});
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [cover]);

  const loadHistory = useCallback(async () => {
    try {
      setHist(await api(`/restock/history?month=${histMonth}&tz=${TZ}`));
    } catch (e) {
      setError(errorText(e));
    }
  }, [histMonth]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const amount = (i) => {
    const v = parseInt(qty[i.id], 10);
    return v > 0 ? v : 0;
  };

  const receive = async (i) => {
    const n = amount(i);
    if (!n) return setError("Enter a quantity greater than zero.");
    setBusyId(i.id);
    try {
      await api(`/products/${i.id}/stock`, {
        method: "POST",
        body: JSON.stringify({
          type: "restock",
          delta: n,
          notes: "Restocked from reorder list",
        }),
      });
      await Promise.all([load(), loadHistory()]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const items = data?.items || [];
  const c = data?.counts || {};
  const estimate = items.reduce((s, i) => s + i.suggested_qty * i.unit_cost_centavos, 0);

  return (
    <Layout>
      <div className="page-head">
        <h1>Restock</h1>
        <label className="check">
          Cover the next
          <select value={cover} onChange={(e) => setCover(Number(e.target.value))} style={{ width: "auto" }}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="grid" style={{ marginBottom: "1.5rem" }}>
        <div className="stat"><h3>Out of stock</h3><div className="value">{c.out ?? "–"}</div></div>
        <div className="stat"><h3>Low</h3><div className="value">{c.low ?? "–"}</div></div>
        <div className="stat"><h3>Running out soon</h3><div className="value">{c.soon ?? "–"}</div></div>
        <div className="stat"><h3>Est. restock cost</h3><div className="value">{peso(estimate)}</div></div>
      </section>

      {loading && !data ? <p className="muted">Loading…</p> : items.length === 0 ? (
        <p className="muted">Everything is well stocked. 🎉</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th><th>Status</th><th>Stock</th><th>Sold (30d)</th>
                <th>Days left</th><th>Order qty</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{i.name}</strong>
                    <div className="muted">{[i.sku, i.category].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td><span className={`badge ${i.status}`} style={{ marginLeft: 0 }}>{LABEL[i.status]}</span></td>
                  <td>{i.stock_quantity} <span className="muted">/ reorder at {i.reorder_level}</span></td>
                  <td>{i.sold_in_window}</td>
                  <td>{i.days_left ?? "–"}</td>
                  <td>
                    <div className="qty-row">
                      <input type="number" min="1" step="1" className="qty" placeholder="Qty"
                             value={qty[i.id] ?? ""}
                             onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} />
                      <button type="button" className="link" title="Use the suggested quantity"
                              onClick={() => setQty({ ...qty, [i.id]: String(i.suggested_qty) })}>
                        Suggested: {i.suggested_qty}
                      </button>
                    </div>
                    {amount(i) > 0 && (
                      <div className="muted">Cost ≈ {peso(amount(i) * i.unit_cost_centavos)}</div>
                    )}
                  </td>
                  <td className="actions">
                    <button className="outline small"
                            disabled={busyId === i.id || amount(i) === 0}
                            onClick={() => receive(i)}>
                      {busyId === i.id ? "Saving…" : "Mark received"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="page-head" style={{ marginTop: "2.5rem" }}>
        <h2>Restock history</h2>
        <input type="month" value={histMonth} style={{ maxWidth: 200 }}
               onChange={(e) => e.target.value && setHistMonth(e.target.value)} />
      </div>

      <section className="grid" style={{ marginBottom: "1.5rem" }}>
        <div className="stat">
          <h3>Spent on stock</h3>
          <div className="value">{peso(hist?.total_spent_centavos)}</div>
          <p className="muted">Not subtracted from profit</p>
        </div>
        <div className="stat"><h3>Restocks logged</h3><div className="value">{hist?.items.length ?? "–"}</div></div>
      </section>

      {hist && hist.items.length === 0 ? (
        <p className="muted">No restocks recorded this month.</p>
      ) : hist && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>Cost</th><th>Per unit</th></tr></thead>
            <tbody>
              {hist.items.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}</td>
                  <td><strong>{h.name}</strong></td>
                  <td>{h.quantity}</td>
                  <td>{h.cost_centavos == null ? <span className="muted">not logged</span> : peso(h.cost_centavos)}</td>
                  <td>{h.cost_centavos == null ? "–" : peso(Math.round(h.cost_centavos / h.quantity))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ marginTop: "1rem" }}>
        Restock cost is calculated from each product's material, packaging and other costs.
        It's tracked as "Spent on stock" and isn't subtracted from profit, so nothing is double counted.
      </p>
    </Layout>
  );
}