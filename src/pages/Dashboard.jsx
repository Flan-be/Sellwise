import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../Layout";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { peso } from "../money";

const LABEL = { out: "Out", low: "Low", soon: "Soon" };

function Panel({ title, to, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        <Link to={to}>View all →</Link>
      </div>
      {children}
    </section>
  );
}

const Row = ({ left, right, sub, danger }) => (
  <div className="mini-row">
    <span>{left}{sub && <div className="muted">{sub}</div>}</span>
    <strong className={danger ? "neg-text" : ""}>{right}</strong>
  </div>
);

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [s, setS] = useState(null);
  const name = profile?.display_name || user.email;

  useEffect(() => {
    const tz = -new Date().getTimezoneOffset();
    api(`/dashboard/summary?tz=${tz}`).then(setS).catch(console.error);
  }, []);

  const time = (iso) =>
    new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <Layout>
      <h1 style={{ marginBottom: "0.5rem" }}>Hello, {name}</h1>
      <p className="muted" style={{ marginBottom: "2rem" }}>Here's how your business is doing.</p>

      <section className="grid" style={{ marginBottom: "2rem" }}>
        <div className="stat"><h3>Sales today</h3><div className="value">{peso(s?.sales_today_centavos)}</div></div>
        <div className="stat"><h3>Sales this month</h3><div className="value">{peso(s?.sales_month_centavos)}</div></div>
        <div className="stat"><h3>Expenses this month</h3><div className="value">{peso(s?.expenses_month_centavos)}</div></div>
        <div className="stat"><h3>Profit this month</h3>
          <div className={`value ${s?.profit_month_centavos < 0 ? "neg-text" : ""}`}>{peso(s?.profit_month_centavos)}</div></div>
      </section>

      <div className="panels">
        <Panel title="Recent sales" to="/sales">
          {!s ? <p className="muted">Loading…</p> : s.recent_sales.length === 0
            ? <p className="muted">No sales yet.</p>
            : s.recent_sales.map((x) => (
              <Row key={x.id}
                   left={x.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                   sub={`${time(x.sale_date)} · ${x.payment_method}${x.status === "voided" ? " · voided" : ""}`}
                   right={peso(x.total_centavos)} />
            ))}
        </Panel>

        <Panel title="Profit this month" to="/profit">
          <Row left="Gross profit" right={peso(s?.gross_month_centavos)} />
          <Row left="Expenses" right={`− ${peso(s?.expenses_month_centavos)}`} />
          <Row left="Net profit" right={peso(s?.profit_month_centavos)} danger={s?.profit_month_centavos < 0} />
          {s?.top_products.length > 0 && <p className="eyebrow" style={{ marginTop: 12 }}>TOP EARNERS</p>}
          {s?.top_products.map((p) => (
            <Row key={p.name} left={p.name} sub={`${p.quantity} sold`} right={peso(p.profit_centavos)} />
          ))}
        </Panel>

        <Panel title="Restock" to="/restock">
          {!s ? <p className="muted">Loading…</p> : s.restock.length === 0
            ? <p className="muted">Everything is well stocked.</p>
            : s.restock.map((r) => (
              <Row key={r.id}
                   left={<>{r.name} <span className={`badge ${r.status}`}>{LABEL[r.status]}</span></>}
                   sub={`Order ~${r.suggested_qty}`}
                   right={`${r.stock_quantity} left`} />
            ))}
          {s && s.low_stock_count > s.restock.length &&
            <p className="muted">+ {s.low_stock_count - s.restock.length} more</p>}
        </Panel>

        <Panel title="Expenses this month" to="/expenses">
          {!s ? <p className="muted">Loading…</p> : s.expense_categories.length === 0
            ? <p className="muted">No expenses this month.</p>
            : s.expense_categories.map((c) => (
              <Row key={c.category} left={c.category} right={peso(c.amount_centavos)} />
            ))}
        </Panel>

        <Panel title="Products" to="/products">
          <Row left="Active products" right={s?.product_count ?? "–"} />
          <Row left="Need restocking" right={s?.low_stock_count ?? "–"} danger={s?.low_stock_count > 0} />
          <Row left="Spent on stock" sub="not in profit" right={peso(s?.stock_spent_month_centavos)} />
        </Panel>
      </div>
    </Layout>
  );
}