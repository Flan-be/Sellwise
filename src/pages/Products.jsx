import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "../Layout";
import { api } from "../api";
import { peso, toCentavos, toPesos } from "../money";

const EMPTY = {
  name: "", sku: "", category: "", description: "",
  price: "", material: "", packaging: "", other: "",
  reorder_level: "0", stock_quantity: "0",
};

function errorText(e) {
  try {
    const d = JSON.parse(e.message).detail;
    if (Array.isArray(d)) return d.map((x) => `${x.loc?.slice(-1)[0]}: ${x.msg}`).join(", ");
    return d || e.message;
  } catch {
    return e.message;
  }
}

export default function Products() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState(null);       // null = closed
  const [editingId, setEditingId] = useState(null);
  const [stock, setStock] = useState(null);     // { product, type, qty, notes }
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await api(`/products?include_inactive=${showArchived}`));
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((p) =>
      [p.name, p.sku, p.category].some((v) => v?.toLowerCase().includes(t)));
  }, [items, q]);

  const openNew = () => { setEditingId(null); setForm(EMPTY); setFormError(""); };
  const openEdit = (p) => {
    setEditingId(p.id);
    setFormError("");
    setForm({
      name: p.name, sku: p.sku || "", category: p.category || "", description: p.description || "",
      price: toPesos(p.selling_price_centavos),
      material: toPesos(p.costs?.material_centavos),
      packaging: toPesos(p.costs?.packaging_centavos),
      other: toPesos(p.costs?.other_centavos),
      reorder_level: String(p.reorder_level), stock_quantity: "0",
    });
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const price = toCentavos(form?.price);
  const cost = toCentavos(form?.material) + toCentavos(form?.packaging) + toCentavos(form?.other);
  const margin = price ? (((price - cost) / price) * 100).toFixed(1) : "0.0";

  const save = async (e) => {
    e.preventDefault();
    setFormError("");
    setBusy(true);
    const body = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      category: form.category.trim() || null,
      description: form.description.trim(),
      selling_price_centavos: price,
      costs: {
        material_centavos: toCentavos(form.material),
        packaging_centavos: toCentavos(form.packaging),
        other_centavos: toCentavos(form.other),
      },
      reorder_level: parseInt(form.reorder_level, 10) || 0,
    };
    if (!editingId) body.stock_quantity = parseInt(form.stock_quantity, 10) || 0;
    try {
      await api(editingId ? `/products/${editingId}` : "/products", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setForm(null);
      await load();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const archive = async (p) => {
    if (!confirm(`Archive "${p.name}"? It will be hidden but past sales stay intact.`)) return;
    try { await api(`/products/${p.id}`, { method: "DELETE" }); await load(); }
    catch (e) { setError(errorText(e)); }
  };

  const restore = async (p) => {
    try {
      await api(`/products/${p.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: p.name, sku: p.sku || null, category: p.category || null,
          description: p.description || "", selling_price_centavos: p.selling_price_centavos,
          costs: p.costs, reorder_level: p.reorder_level, is_active: true,
        }),
      });
      await load();
    } catch (e) { setError(errorText(e)); }
  };

  const saveStock = async (e) => {
    e.preventDefault();
    setFormError("");
    const n = parseInt(stock.qty, 10);
    if (!n) return setFormError("Enter a quantity.");
    const delta = stock.type === "restock" ? Math.abs(n)
                : stock.type === "damage" ? -Math.abs(n) : n;
    setBusy(true);
    try {
      await api(`/products/${stock.product.id}/stock`, {
        method: "POST",
        body: JSON.stringify({ type: stock.type, delta, notes: stock.notes.trim() || null }),
      });
      setStock(null);
      await load();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <div className="page-head">
        <h1>Products</h1>
        <button onClick={openNew}>+ Add product</button>
      </div>

      <div className="toolbar">
        <input placeholder="Search name, SKU, category…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {loading ? <p className="muted">Loading…</p> : visible.length === 0 ? (
        <p className="muted">No products yet. Add your first one.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th><th>Price</th><th>Cost</th><th>Profit / unit</th>
                <th>Stock</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const low = p.is_active && p.stock_quantity <= p.reorder_level;
                return (
                  <tr key={p.id} className={p.is_active ? "" : "archived"}>
                    <td>
                      <strong>{p.name}</strong>
                      <div className="muted">{[p.sku, p.category].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td>{peso(p.selling_price_centavos)}</td>
                    <td>{peso(p.total_cost_centavos)}</td>
                    <td>{peso(p.profit_centavos)} <span className="muted">({p.margin}%)</span></td>
                    <td>
                      {p.stock_quantity}
                      {low && <span className="badge">Low</span>}
                    </td>
                    <td className="actions">
                      {p.is_active ? (
                        <>
                          <button className="outline small" onClick={() => { setFormError(""); setStock({ product: p, type: "restock", qty: "", notes: "" }); }}>Stock</button>
                          <button className="outline small" onClick={() => openEdit(p)}>Edit</button>
                          <button className="link" onClick={() => archive(p)}>Archive</button>
                        </>
                      ) : (
                        <button className="outline small" onClick={() => restore(p)}>Restore</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="modal-back" onClick={() => setForm(null)}>
          <form className="modal card" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h2>{editingId ? "Edit product" : "New product"}</h2>
            <input placeholder="Product name" value={form.name} onChange={set("name")} required />
            <div className="row">
              <input placeholder="SKU (optional)" value={form.sku} onChange={set("sku")} />
              <input placeholder="Category (optional)" value={form.category} onChange={set("category")} />
            </div>
            <input placeholder="Description (optional)" value={form.description} onChange={set("description")} />

            <p className="eyebrow">PRICING &amp; COSTS (₱)</p>
            <div className="row">
              <label>Selling price<input type="number" min="0" step="0.01" value={form.price} onChange={set("price")} required /></label>
              <label>Material<input type="number" min="0" step="0.01" value={form.material} onChange={set("material")} /></label>
            </div>
            <div className="row">
              <label>Packaging<input type="number" min="0" step="0.01" value={form.packaging} onChange={set("packaging")} /></label>
              <label>Other<input type="number" min="0" step="0.01" value={form.other} onChange={set("other")} /></label>
            </div>
            <p className="muted">
              Total cost {peso(cost)} · Profit per unit {peso(price - cost)} · Margin {margin}%
            </p>

            <p className="eyebrow">INVENTORY</p>
            <div className="row">
              {!editingId && (
                <label>Opening stock<input type="number" min="0" step="1" value={form.stock_quantity} onChange={set("stock_quantity")} /></label>
              )}
              <label>Reorder level<input type="number" min="0" step="1" value={form.reorder_level} onChange={set("reorder_level")} /></label>
            </div>
            {editingId && <p className="muted">To change stock, use the Stock button on the list.</p>}

            {formError && <p className="error">{formError}</p>}
            <div className="row">
              <button type="button" className="outline" onClick={() => setForm(null)}>Cancel</button>
              <button disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </div>
      )}

      {stock && (
        <div className="modal-back" onClick={() => setStock(null)}>
          <form className="modal card" onClick={(e) => e.stopPropagation()} onSubmit={saveStock}>
            <h2>Update stock</h2>
            <p className="muted">{stock.product.name} · currently {stock.product.stock_quantity}</p>
            <select value={stock.type} onChange={(e) => setStock({ ...stock, type: e.target.value })}>
              <option value="restock">Restock (add)</option>
              <option value="damage">Damaged / lost (remove)</option>
              <option value="adjustment">Correction (+ or −)</option>
            </select>
            <input type="number" step="1" placeholder={stock.type === "adjustment" ? "e.g. -3 or 5" : "Quantity"}
                   value={stock.qty} onChange={(e) => setStock({ ...stock, qty: e.target.value })} required />
            <input placeholder="Notes (optional)" value={stock.notes}
                   onChange={(e) => setStock({ ...stock, notes: e.target.value })} />
            {formError && <p className="error">{formError}</p>}
            <div className="row">
              <button type="button" className="outline" onClick={() => setStock(null)}>Cancel</button>
              <button disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
}