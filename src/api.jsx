import { auth } from "./firebase";

export async function api(path, options = {}) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json();
}

export async function download(path, filename) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}