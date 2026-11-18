import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { peso } from "../money";
import { colors } from "../theme";

export default function Products() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // the owner_uid filter is required: the security rules only allow queries limited to your own documents
    const qry = query(collection(db, "products"), where("owner_uid", "==", user.uid));
    return onSnapshot(
      qry,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => setError(e.message),
    );
  }, [user.uid]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (items || [])
      .filter((p) => p.is_active)
      .filter((p) => !t || [p.name, p.sku, p.category].some((v) => v?.toLowerCase().includes(t)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, q]);

  if (error) return <Text style={s.error}>{error}</Text>;

  return (
    <View style={{ flex: 1 }}>
      <TextInput style={s.search} placeholder="Search products…" placeholderTextColor={colors.teal300}
                 value={q} onChangeText={setQ} />
      {items === null ? <Text style={s.muted}>Loading…</Text> : (
        <FlatList
          data={shown}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListEmptyComponent={<Text style={s.muted}>No products found.</Text>}
          renderItem={({ item: p }) => {
            const low = p.stock_quantity <= p.reorder_level;
            const cost = Object.values(p.costs || {}).reduce((a, b) => a + b, 0);
            return (
              <View style={s.card}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{p.name}</Text>
                  <Text style={s.muted}>{[p.sku, p.category].filter(Boolean).join(" · ")}</Text>
                  <Text style={s.muted}>
                    {peso(p.selling_price_centavos)} · profit {peso(p.selling_price_centavos - cost)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[s.stock, low && { color: colors.danger }]}>{p.stock_quantity}</Text>
                  <Text style={s.muted}>{low ? "low stock" : "in stock"}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  search: { margin: 16, marginBottom: 0, borderWidth: 1, borderColor: colors.teal500,
            borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, fontSize: 16, color: colors.teal900 },
  card: { flexDirection: "row", gap: 12, borderWidth: 1, borderColor: colors.teal700, borderRadius: 20, padding: 14 },
  name: { fontSize: 16, fontWeight: "700", color: colors.teal900 },
  stock: { fontSize: 22, fontWeight: "800", color: colors.teal900 },
  muted: { color: colors.teal500, fontSize: 13, padding: 2 },
  error: { color: colors.danger, padding: 16 },
});