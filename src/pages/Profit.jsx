import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "../Layout";
import { api } from "../api";
import { peso } from "../money";

const TZ = -new Date().getTimezoneOffset();
const fmt = (d) => d.toLocaleDateString("en-CA");          // YYYY-MM-DD

function presetRange(key) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (key === "today") return { start: fmt(now), end: fmt(now) };
  if (key === "7d") return { start: fmt(new Date(y, m, now.getDate() - 6)), end: fmt(now) };
  if (key === "month") return { start: fmt(new Date(y, m, 1)), end: fmt(now) };
  if (key === "last") return { start: fmt(new Date(y, m - 1, 1)), end: fmt(new Date(y, m, 0)) };
  if (key === "year") return { start: fmt(new Date(y, 0, 1)), end: fmt(now) };
}

const PRESETS = [
  ["today", "Today"], ["7d", "Last 7 days"], ["month", "This month"],
  ["last", "Last month"], ["year", "This year"], ["custom", "Custom"],
];

function errorText(e) {
  try {
    const d = JSON.parse(e.message).detail;
    if (Array.isArray(d)) return d.map((x) => `${x.loc?.slice(-1)[0]}: ${x.msg}`).join(", ");
    return d || e.message;
  } catch {
    return e.message;
  }
}

export default function Profit() {
  const [preset, setPreset] = useState("month");
  const [range, setRange] = useState(presetRange("month"));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState({ key: "profit_centavos", dir: -1 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api(`/reports/profit?start=${range.start}&end=${range.end}&tz=${TZ}`));
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const pick = (key) => {
    setPreset(key);
    if (key !== "custom") setRange(presetRange(key));
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const { key, dir } = sort;
    return [...data.products].sort((a, b) =>
      (typeof a[key] === "string" ? a[key].localeCompare(b[key]) : a[key] - b[key]) * dir);
  }, [data, sort]);

  const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }));
  const arrow = (key) => (sort.key === key ? (sort.dir === -1 ? " ↓" : " ↑") : "");

  const s = data?.summary;
  const days = data?.days || [];
  const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.net_centavos)));
  const maxCat = Math.max(1, ...(data?.expense_categories || []).map((c) => c.amount_centavos));

  return (
    <Layout>
      <div className="page-head"><h1>Profit</h1></div>

      <div className="toolbar">
        <div className="chips">
          {PRESETS.map(([k, label]) => (
            <button key={k} type="button" className={`chip ${preset === k ? "on" : ""}`} onClick={() => pick(k)}>
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="range">
            <input type="date" value={range.start} max={range.end}
                   onChange={(e) => e.target.value && setRange({ ...range, start: e.target.value })} />
            <span className="muted">to</span>
            <input type="date" value={range.end} min={range.start} max={fmt(new Date())}
                   onChange={(e) => e.target.value && setRange({ ...range, end: e.target.value })} />
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {loading && !data ? <p className="muted">Loading…</p> : s && (
        <>
          <section className="grid" style={{ marginBottom: "1.5rem" }}>
            <div className="stat"><h3>Revenue</h3><div className="value">{peso(s.revenue_centavos)}</div>
              <p className="muted">{s.transactions} sales · {s.units_sold} units</p></div>
            <div className="stat"><h3>Cost of goods</h3><div className="value">{peso(s.cogs_centavos)}</div></div>
            <div className="stat"><h3>Gross profit</h3><div className="value">{peso(s.gross_profit_centavos)}</div>
              <p className="muted">{s.gross_margin}% margin</p></div>
            <div className="stat"><h3>Expenses</h3><div className="value">{peso(s.expenses_centavos)}</div></div>
            <div className="stat net"><h3>Net profit</h3>
              <div className={`value ${s.net_profit_centavos < 0 ? "neg-text" : ""}`}>{peso(s.net_profit_centavos)}</div>
              <p className="muted">{s.net_margin}% of revenue</p></div>
          </section>

          <h2 style={{ marginBottom: "0.75rem" }}>Daily net profit</h2>
          <div className="chart-wrap">
            <div className="chart">
              {days.map((d) => {
                const h = (Math.abs(d.net_centavos) / maxAbs) * 100;
                const neg = d.net_centavos < 0;
                return (
                  <div className="col" key={d.date}
                       title={`${d.date}\nSales ${peso(d.revenue_centavos)}\nGross ${peso(d.gross_profit_centavos)}\nExpenses ${peso(d.expenses_centavos)}\nNet ${peso(d.net_centavos)}`}>
                    <div className="half up">{!neg && <div className="bar" style={{ height: `${h}%` }} />}</div>
                    <div className="half down">{neg && <div className="bar neg" style={{ height: `${h}%` }} />}</div>
                  </div>
                );
              })}
            </div>
            <div className="chart-axis muted">
              <span>{days[0]?.date}</span><span>{days[days.length - 1]?.date}</span>
            </div>
          </div>

          <h2 style={{ margin: "2rem 0 0.75rem" }}>Profit by product</h2>
          {rows.length === 0 ? <p className="muted">No completed sales in this period.</p> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => sortBy("name")}>Product{arrow("name")}</th>
                    <th className="sortable" onClick={() => sortBy("quantity")}>Sold{arrow("quantity")}</th>
                    <th className="sortable" onClick={() => sortBy("revenue_centavos")}>Revenue{arrow("revenue_centavos")}</th>
                    <th className="sortable" onClick={() => sortBy("cost_centavos")}>Cost{arrow("cost_centavos")}</th>
                    <th className="sortable" onClick={() => sortBy("profit_centavos")}>Profit{arrow("profit_centavos")}</th>
                    <th className="sortable" onClick={() => sortBy("margin")}>Margin{arrow("margin")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.product_id}>
                      <td><strong>{p.name}</strong></td>
                      <td>{p.quantity}</td>
                      <td>{peso(p.revenue_centavos)}</td>
                      <td>{peso(p.cost_centavos)}</td>
                      <td className={p.profit_centavos < 0 ? "neg-text" : ""}>{peso(p.profit_centavos)}</td>
                      <td>{p.margin}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 style={{ margin: "2rem 0 0.75rem" }}>Where the money went</h2>
          {data.expense_categories.length === 0 ? <p className="muted">No expenses in this period.</p> : (
            <div className="card" style={{ maxWidth: "none" }}>
              {data.expense_categories.map((c) => (
                <div className="cat-row" key={c.category}>
                  <span>{c.category}</span>
                  <div className="cat-track"><div className="cat-fill" style={{ width: `${(c.amount_centavos / maxCat) * 100}%` }} /></div>
                  <strong>{peso(c.amount_centavos)}</strong>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}