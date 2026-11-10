const fmt = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export const peso = (centavos) => fmt.format((centavos || 0) / 100);
export const toCentavos = (value) => Math.round((Number(value) || 0) * 100);
export const toPesos = (centavos) => ((centavos || 0) / 100).toString();