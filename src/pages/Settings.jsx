import { useEffect, useState } from "react";
import Layout from "../Layout";
import { api, download } from "../api";
import { useSettings } from "../useSettings";

const TZ = -new Date().getTimezoneOffset();
const fmt = (d) => d.toLocaleDateString("en-CA");
const monthStart = () => { const n = new Date(); return fmt(new Date(n.getFullYear(), n.getMonth(), 1)); };
const tzLabel = (m) => {
  const a = Math.abs(m), mm = a % 60;
  return `UTC${m >= 0 ? "+" : "-"}${Math.floor(a / 60)}${mm ? ":" + String(mm).padStart(2, "0") : ""}`;
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

export default function Settings() {
  const [saved, setSaved] = useSettings();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [range, setRange] = useState({ start: monthStart(), end: fmt(new Date()) });
  const [exporting, setExporting] = useState("");

  useEffect(() => {
    if (saved && !form) {
      setForm({
        business_name: saved.business_name,
        default_reorder_level: String(saved.default_reorder_level),
        soon_days: String(saved.soon_days),
        cover_days: String(saved.cover_days),
      });
    }
  }, [saved, form]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setError(""); setMsg(""); setBusy(true);
    try {
      const r = await api("/settings", {
        method: "PUT",
        body: JSON.stringify({
          business_name: form.business_name.trim(),
          default_reorder_level: parseInt(form.default_reorder_level, 10) || 0,
          soon_days: parseInt(form.soon_days, 10) || 7,
          cover_days: parseInt(form.cover_days, 10) || 14,
          tz: TZ,
        }),
      });
      setSaved(r);
      setMsg("Saved.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const run = async (kind, ranged) => {
    setError(""); setExporting(kind);
    try {
      const q = ranged ? `?start=${range.start}&end=${range.end}&tz=${TZ}` : "";
      const file = ranged
        ? `sellwise-${kind}-${range.start}-to-${range.end}.csv`
        : `sellwise-${kind}-${fmt(new Date())}.csv`;
      await download(`/export/${kind}${q}`, file);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setExporting("");
    }
  };

  return (
    <Layout>
      <div className="page-head"><h1>Settings</h1></div>
      {error && <p className="error">{error}</p>}

      <section className="panels">
        <form className="card" style={{ maxWidth: "none" }} onSubmit={save}>
          <h2>Business</h2>
          {!form ? <p className="muted">Loading…</p> : (
            <>
              <label>Business name
                <input value={form.business_name} onChange={set("business_name")} placeholder="Shown in the top bar and on receipts" />
              </label>
              <label>Default reorder level for new products
                <input type="number" min="0" value={form.default_reorder_level} onChange={set("default_reorder_level")} />
              </label>
              <div className="row">
                <label>"Running out soon" when days left ≤
                  <input type="number" min="1" max="60" value={form.soon_days} onChange={set("soon_days")} />
                </label>
                <label>Suggested restock covers (days)
                  <input type="number" min="3" max="60" value={form.cover_days} onChange={set("cover_days")} />
                </label>
              </div>
              <p className="muted">Timezone: {tzLabel(TZ)} (taken from this device when you save). It decides what counts as "today".</p>
              {msg && <p className="info">{msg}</p>}
              <button disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
            </>
          )}
        </form>

        <div className="card" style={{ maxWidth: "none" }}>
          <h2>Export data (CSV)</h2>
          <p className="muted">Opens in Excel or Google Sheets. Money is in pesos.</p>
          <div className="row">
            <label>From<input type="date" value={range.start} max={range.end}
              onChange={(e) => e.target.value && setRange({ ...range, start: e.target.value })} /></label>
            <label>To<input type="date" value={range.end} min={range.start}
              onChange={(e) => e.target.value && setRange({ ...range, end: e.target.value })} /></label>
          </div>
          <div className="btn-row">
            <button className="outline" disabled={!!exporting} onClick={() => run("sales", true)}>
              {exporting === "sales" ? "Preparing…" : "Sales"}</button>
            <button className="outline" disabled={!!exporting} onClick={() => run("expenses", true)}>
              {exporting === "expenses" ? "Preparing…" : "Expenses"}</button>
            <button className="outline" disabled={!!exporting} onClick={() => run("movements", true)}>
              {exporting === "movements" ? "Preparing…" : "Stock movements"}</button>
            <button className="outline" disabled={!!exporting} onClick={() => run("products", false)}>
              {exporting === "products" ? "Preparing…" : "Products (current)"}</button>
          </div>
        </div>
      </section>
    </Layout>
  );
}