import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "../Layout";
import { api } from "../api";
import { peso, toCentavos, toPesos } from "../money";

const CATEGORIES = ["Rent", "Utilities", "Supplies", "Transportation",
                    "Marketing", "Salaries", "Equipment", "Other"];

const today = () => new Date().toLocaleDateString("en-CA");   // YYYY-MM-DD
const EMPTY = () => ({ name: "", amount: "", expense_date: today(), category: "", product_id: "", notes: "" });

function errorText(e) {
  try {
    const d = JSON.parse(e.message).detail;
    if (Array.isArray(d)) return d.map((x) => `${x.loc?.slice(-1)[0]}: ${x.msg}`).join(", ");
    return d || e.message;
  } catch {
    return e.message;
  }
}

export default function Expenses() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [stockSpent, setStockSpent] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api(`/expenses?month=${month}`));
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api("/products").then(setProducts).catch(() => {}); }, []);
  useEffect(() => {
  const tz = -new Date().getTimezoneOffset();
  api(`/restock/history?month=${month}&tz=${tz}`)
    .then((r) => setStockSpent(r.total_spent_centavos))
    .catch(() => {});
}, [month]);

  const productName = (id) => products.find((p) => p.id === id)?.name;

  const { total, byCategory } = useMemo(() => {
    const map = {};
    let sum = 0;
    for (const e of items) {
      sum += e.amount_centavos;
      const k = e.category || "Uncategorized";
      map[k] = (map[k] || 0) + e.amount_centavos;
    }
    return { total: sum, byCategory: Object.entries(map).sort((a, b) => b[1] - a[1]) };
  }, [items]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const openNew = () => { setEditingId(null); setForm(EMPTY()); setFormError(""); };
  const openEdit = (x) => {
    setEditingId(x.id);
    setFormError("");
    setForm({
      name: x.name, amount: toPesos(x.amount_centavos), expense_date: x.expense_date,
      category: x.category || "", product_id: x.product_id || "", notes: x.notes || "",
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setFormError("");
    const cents = toCentavos(form.amount);
    if (cents <= 0) return setFormError("Amount must be greater than zero.");
    setBusy(true);
    try {
      await api(editingId ? `/expenses/${editingId}` : "/expenses", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          amount_centavos: cents,
          expense_date: form.expense_date,
          category: form.category.trim() || null,
          product_id: form.product_id || null,
          notes: form.notes.trim() || null,
        }),
      });
      setForm(null);
      // jump to the month of the saved expense so it's visible
      const m = form.expense_date.slice(0, 7);
      if (m !== month) setMonth(m); else await load();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (x) => {
    if (!confirm(`Delete "${x.name}" (${peso(x.amount_centavos)})?`)) return;
    try { await api(`/expenses/${x.id}`, { method: "DELETE" }); await load(); }
    catch (e) { setError(errorText(e)); }
  };

  return (
    <Layout>
      <div className="page-head">
        <h1>Expenses</h1>
        <button onClick={openNew}>+ Add expense</button>
      </div>

      <div className="toolbar">
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ maxWidth: 200 }} />
      </div>

      <section className="grid" style={{ marginBottom: "1.5rem" }}>
        <div className="stat"><h3>Total this month</h3><div className="value">{peso(total)}</div></div>
        <div className="stat">
          <h3>Spent on stock</h3>
          <div className="value">{peso(stockSpent)}</div>
          <p className="muted">Not counted in profit</p>
        </div>
        {byCategory.slice(0, 3).map(([cat, amt]) => (
          <div className="stat" key={cat}><h3>{cat}</h3><div className="value">{peso(amt)}</div></div>
        ))}
      </section>

      {error && <p className="error">{error}</p>}
      {loading ? <p className="muted">Loading…</p> : items.length === 0 ? (
        <p className="muted">No expenses recorded for this month.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Expense</th><th>Category</th><th>Amount</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td>{x.expense_date}</td>
                  <td>
                    <strong>{x.name}</strong>
                    <div className="muted">
                      {[productName(x.product_id) && `For: ${productName(x.product_id)}`, x.notes]
                        .filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td>{x.category || "–"}</td>
                  <td>{peso(x.amount_centavos)}</td>
                  <td className="actions">
                    <button className="outline small" onClick={() => openEdit(x)}>Edit</button>
                    <button className="link" onClick={() => remove(x)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="modal-back" onClick={() => setForm(null)}>
          <form className="modal card" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h2>{editingId ? "Edit expense" : "New expense"}</h2>
            <input placeholder="What was it for? (e.g. Electric bill)" value={form.name} onChange={set("name")} required />
            <div className="row">
              <label>Amount (₱)<input type="number" min="0.01" step="0.01" value={form.amount} onChange={set("amount")} required /></label>
              <label>Date<input type="date" value={form.expense_date} onChange={set("expense_date")} required /></label>
            </div>
            <label>Category
              <input list="expense-cats" placeholder="Pick or type your own" value={form.category} onChange={set("category")} />
              <datalist id="expense-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label>Linked product (optional)
              <select value={form.product_id} onChange={set("product_id")}>
                <option value="">None, general expense</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <input placeholder="Notes (optional)" value={form.notes} onChange={set("notes")} />
            {formError && <p className="error">{formError}</p>}
            <div className="row">
              <button type="button" className="outline" onClick={() => setForm(null)}>Cancel</button>
              <button disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
}