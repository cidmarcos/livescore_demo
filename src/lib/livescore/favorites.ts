import { useSyncExternalStore } from "react";

const KEY = "livescore-demo-favorites";
const EMPTY: string[] = [];
let snapshot = EMPTY;
let snapshotRaw = "[]";

function readFavorites() {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(KEY) ?? "[]";
  if (raw === snapshotRaw) return snapshot;
  snapshotRaw = raw;
  try {
    const parsed = JSON.parse(raw) as unknown;
    snapshot = Array.isArray(parsed) ? parsed.map(String) : EMPTY;
  } catch {
    snapshot = EMPTY;
  }
  return snapshot;
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("livescore-favorites", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener("livescore-favorites", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function useFavorites() {
  const ids = useSyncExternalStore(subscribe, readFavorites, () => EMPTY);

  function toggle(fixtureId: string) {
    const current = readFavorites();
    const next = current.includes(fixtureId)
      ? current.filter((id) => id !== fixtureId)
      : [...current, fixtureId];
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("livescore-favorites"));
  }

  return { ids, toggle };
}
