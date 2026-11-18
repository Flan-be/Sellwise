import { useEffect, useState } from "react";
import { auth } from "./firebase";
import { api } from "./api";

let cache = { uid: null, data: null };

export function useSettings() {
  const uid = auth.currentUser?.uid;
  const [s, setS] = useState(cache.uid === uid ? cache.data : null);

  useEffect(() => {
    if (cache.uid === uid && cache.data) return;
    api("/settings")
      .then((r) => { cache = { uid, data: r }; setS(r); })
      .catch(() => {});
  }, [uid]);

  const save = (r) => { cache = { uid, data: r }; setS(r); };
  return [s, save];
}