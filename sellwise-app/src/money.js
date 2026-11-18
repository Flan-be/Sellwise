export const peso = (centavos) =>
  "₱" + ((centavos || 0) / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });