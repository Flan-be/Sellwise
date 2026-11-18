import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { peso } from "../money";
import { colors } from "../theme";
import { when, receiptNo } from "../receiptUtils";

export default function Sales({ onOpen }) {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const qry = query(collection(db, "sales"), where("owner_uid", "==", user.uid));
    return onSnapshot(
      qry,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => setError(e.message),
    );
  }, [user.uid]);

  const sorted = useMemo(
    () => (items || []).sort((a, b) => when(b) - when(a)).slice(0, 100), [items]);

  if (error) return <Text style={s.error}>{error}</Text>;
  if (items === null) return <Text style={s.muted}>Loading…</Text>;

  return (
    <FlatList
      data={sorted}
      keyExtractor={(x) => x.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      ListEmptyComponent={<Text style={s.muted}>No sales yet.</Text>}
      renderItem={({ item: x }) => (
        <Pressable style={[s.card, x.status === "voided" && { opacity: 0.5 }]} onPress={() => onOpen(x)}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{receiptNo(x)}{x.status === "voided" ? "  (voided)" : ""}</Text>
            <Text style={s.muted}>{x.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</Text>
            <Text style={s.muted}>{when(x).toLocaleString()} · {x.payment_method}</Text>
          </View>
          <Text style={s.total}>{peso(x.total_centavos)}</Text>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  card: { flexDirection: "row", gap: 12, borderWidth: 1, borderColor: colors.teal700, borderRadius: 20, padding: 14 },
  title: { fontSize: 16, fontWeight: "700", color: colors.teal900 },
  total: { fontSize: 17, fontWeight: "800", color: colors.teal900 },
  muted: { color: colors.teal500, fontSize: 13, padding: 2 },
  error: { color: colors.danger, padding: 16 },
});