import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { peso } from "../money";
import { colors } from "../theme";
import { when, receiptNo } from "../receiptUtils";

const mono = Platform.select({ ios: "Menlo", android: "monospace" });

export default function Receipt({ sale, onBack }) {
  const name = sale.business_name || "SellWise";
  const date = when(sale).toLocaleString();

  const shareText = () => {
    const lines = [
      name, "Official receipt", "--------------------------------",
      `Receipt no.: ${receiptNo(sale)}`, `Date: ${date}`, `Payment: ${sale.payment_method}`,
      "--------------------------------",
      ...sale.items.map((i) =>
        `${i.name}\n  ${i.quantity} x ${peso(i.unit_price_centavos)} = ${peso(i.quantity * i.unit_price_centavos)}`),
      "--------------------------------",
      `TOTAL: ${peso(sale.total_centavos)}`,
      ...(sale.status === "voided" ? ["*** VOIDED ***"] : []),
      "Thank you for your purchase!",
    ];
    Share.share({ message: lines.join("\n") });
  };

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <View style={s.bar}>
        <Pressable onPress={onBack}><Text style={s.link}>← Back</Text></Pressable>
        <Pressable onPress={shareText}><Text style={s.link}>Share</Text></Pressable>
      </View>

      <View style={s.paper}>
        {sale.status === "voided" && <Text style={s.void}>VOIDED</Text>}
        <Text style={s.name}>{name}</Text>
        <Text style={s.center}>Official receipt</Text>
        <View style={s.hr} />
        <Row l="Receipt no." r={receiptNo(sale)} />
        <Row l="Date" r={date} />
        <Row l="Payment" r={sale.payment_method} />
        <View style={s.hr} />
        {sale.items.map((i, n) => (
          <View key={n} style={{ marginBottom: 8 }}>
            <Text style={s.text}>{i.name}</Text>
            <Row l={`${i.quantity} × ${peso(i.unit_price_centavos)}`} r={peso(i.quantity * i.unit_price_centavos)} />
          </View>
        ))}
        <View style={s.hr} />
        <Row l="TOTAL" r={peso(sale.total_centavos)} bold />
        <View style={s.hr} />
        <Text style={s.center}>Thank you for your purchase!</Text>
      </View>
    </ScrollView>
  );
}

const Row = ({ l, r, bold }) => (
  <View style={s.row}>
    <Text style={[s.text, bold && s.bold]}>{l}</Text>
    <Text style={[s.text, bold && s.bold]}>{r}</Text>
  </View>
);

const s = StyleSheet.create({
  scroll: { padding: 16 },
  bar: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  link: { color: colors.teal700, fontWeight: "700", fontSize: 16 },
  paper: { backgroundColor: colors.white, padding: 20, borderWidth: 1, borderStyle: "dashed", borderColor: colors.teal500 },
  name: { fontSize: 20, fontWeight: "800", textAlign: "center", color: "#222", fontFamily: mono },
  center: { textAlign: "center", color: "#222", fontFamily: mono, fontSize: 13 },
  hr: { borderTopWidth: 1, borderStyle: "dashed", borderColor: "#999", marginVertical: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  text: { color: "#222", fontFamily: mono, fontSize: 13, flexShrink: 1 },
  bold: { fontWeight: "800", fontSize: 15 },
  void: { color: colors.danger, fontWeight: "800", fontSize: 22, textAlign: "center", marginBottom: 6 },
});
