export const passwordProblems = (pw) => {
  const p = [];
  if (pw.length < 8) p.push("at least 8 characters");
  if (!/[A-Z]/.test(pw)) p.push("an uppercase letter");
  if (!/[a-z]/.test(pw)) p.push("a lowercase letter");
  if (!/[0-9]/.test(pw)) p.push("a number");
  return p;
};