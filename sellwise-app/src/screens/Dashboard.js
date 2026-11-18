import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { peso } from "../money";
import { colors } from "../theme";

const STATUS = { out: "Out", low: "Low", soon: "Soon" };

function Stat({ label, value, danger }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, danger && { color: colors.danger }]}>{value}</Text>
    </View>
  );
}

function Panel({ title, children }) {
  return (
    <View style={s.panel}>
      <Text style={s.panelTitle}>{title}</Text>
      {children}
    </View>
  );
}

const Row = ({ left, sub, right }) => (
  <View style={s.row}>
    <View style={{ flex: 1 }}>
      <Text style={s.rowLeft}>{left}</Text>
      {!!sub && <Text style={s.muted}>{sub}</Text>}
    </View>
    <Text style={s.rowRight}>{right}</Text>
  </View>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(undefined);   // undefined = loading, null = no document yet
  const [error, setError] = useState("");

  useEffect(() => {
    // live listener: Firestore pushes a new snapshot whenever the worker rewrites this document
    return onSnapshot(
      doc(db, "summaries", user.uid),
      (snap) => setData(snap.exists() ? snap.data() : null),
      (e) => setError(e.message),
    );
  }, [user.uid]);

  if (error) return <Text style={s.error}>{error}</Text>;
  if (data === undefined) return <Text style={s.muted}>Loading…</Text>;
  if (data === null) {
    return <Text style={s.muted}>No summary yet. Make sure the sync worker is running.</Text>;
  }

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Text style={s.hello}>{data.business_name || user.displayName || user.email}</Text>

      <View style={s.grid}>
        <Stat label="Sales today" value={peso(data.sales_today_centavos)} />
        <Stat label="Sales this month" value={peso(data.sales_month_centavos)} />
        <Stat label="Expenses" value={peso(data.expenses_month_centavos)} />
        <Stat label="Profit this month" value={peso(data.profit_month_centavos)}
              danger={data.profit_month_centavos < 0} />
      </View>

      <Panel title="Recent sales">
        {data.recent_sales?.length ? data.recent_sales.map((x) => (
          <Row key={x.id}
               left={x.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
               sub={`${new Date(x.sale_date).toLocaleString()} · ${x.payment_method}${x.status === "voided" ? " · voided" : ""}`}
               right={peso(x.total_centavos)} />
        )) : <Text style={s.muted}>No sales yet.</Text>}
      </Panel>

      <Panel title="Restock">
        {data.restock?.length ? data.restock.map((r) => (
          <Row key={r.id} left={`${r.name}  (${STATUS[r.status]})`}
               sub={`Order ~${r.suggested_qty}`} right={`${r.stock_quantity} left`} />
        )) : <Text style={s.muted}>Everything is well stocked.</Text>}
      </Panel>

      <Panel title="Top earners this month">
        {data.top_products?.length ? data.top_products.map((p) => (
          <Row key={p.name} left={p.name} sub={`${p.quantity} sold`} right={peso(p.profit_centavos)} />
        )) : <Text style={s.muted}>No sales this month.</Text>}
      </Panel>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, gap: 14 },
  hello: { fontSize: 26, fontWeight: "800", color: colors.teal700 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: { width: "48%", borderWidth: 1, borderColor: colors.teal700, borderRadius: 20, padding: 14 },
  statLabel: { color: colors.teal500, fontWeight: "700", fontSize: 12 },
  statValue: { color: colors.teal900, fontWeight: "800", fontSize: 20, marginTop: 6 },
  panel: { borderWidth: 1, borderColor: colors.teal700, borderRadius: 20, padding: 16, gap: 10 },
  panelTitle: { fontSize: 17, fontWeight: "800", color: colors.teal700 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12,
         paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.teal100 },
  rowLeft: { color: colors.teal900, fontWeight: "600" },
  rowRight: { color: colors.teal900, fontWeight: "700" },
  muted: { color: colors.teal500, fontSize: 13, padding: 2 },
  error: { color: colors.danger, padding: 16 },
});