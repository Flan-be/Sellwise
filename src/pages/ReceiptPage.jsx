import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "../Layout";
import { api } from "../api";
import { peso } from "../money";
import { useSettings } from "../useSettings";

export default function ReceiptPage() {
  const { id } = useParams();
  const [settings] = useSettings();
  const [sale, setSale] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api(`/sales/${id}`)
      .then(setSale)
      .catch((e) => {
        try { setError(JSON.parse(e.message).detail); } catch { setError(e.message); }
      });
  }, [id]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Layout>
      <div className="page-head no-print">
        <h1>Receipt</h1>
        <div className="btn-row">
          <Link to="/sales"><button className="outline">← Back to sales</button></Link>
          <button className="outline" onClick={copyLink}>{copied ? "Copied!" : "Copy link"}</button>
          <button onClick={() => window.print()} disabled={!sale}>Print / Save PDF</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {!sale && !error && <p className="muted">Loading…</p>}

      {sale && (
        <div className="receipt">
          {sale.status === "voided" && <div className="receipt-void">VOIDED</div>}
          <h2>{sale.business_name || settings?.business_name || "SellWise"}</h2>
          <p className="center">Official receipt</p>
          <hr />
          <div className="r-row"><span>Receipt no.</span><span>{sale.receipt_no || sale.id.slice(-8).toUpperCase()}</span></div>
          <div className="r-row"><span>Date</span><span>{new Date(sale.sale_date).toLocaleString()}</span></div>
          <div className="r-row"><span>Payment</span><span>{sale.payment_method}</span></div>
          <hr />
          {sale.items.map((i, n) => (
            <div key={n} className="r-item">
              <div>{i.name}</div>
              <div className="r-row">
                <span>{i.quantity} × {peso(i.unit_price_centavos)}</span>
                <span>{peso(i.quantity * i.unit_price_centavos)}</span>
              </div>
            </div>
          ))}
          <hr />
          <div className="r-row r-total"><span>TOTAL</span><span>{peso(sale.total_centavos)}</span></div>
          <hr />
          <p className="center">Thank you for your purchase!</p>
        </div>
      )}
    </Layout>
  );
}