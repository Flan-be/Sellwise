export const when = (s) =>
  s.sale_date?.toDate ? s.sale_date.toDate() : new Date(s.sale_date);   // Firestore Timestamp or string

export const receiptNo = (s) => s.receipt_no || s.id.slice(-8).toUpperCase();