import { CalendarDays, Radio, Trophy } from "lucide-react";

import { todaySaoPaulo } from "@/lib/livescore/parse";
import type { LivescoreSearch } from "@/lib/livescore/types";

export type NavId = "live" | "jogos" | "competicoes";
export type JogosItem = "favoritos" | "ended" | "upcoming";

export const navIcons: Record<NavId, typeof Radio> = {
  live: Radio,
  jogos: CalendarDays,
  competicoes: Trophy,
};

export const navItems: { id: NavId; label: string }[] = [
  { id: "live", label: "Ao vivo" },
  { id: "jogos", label: "Jogos" },
  { id: "competicoes", label: "Competições" },
];

export const jogosItems: { id: JogosItem; label: string }[] = [
  { id: "favoritos", label: "Favoritos" },
  { id: "ended", label: "Finalizados" },
  { id: "upcoming", label: "Próximos" },
];

export function activeNav(search: LivescoreSearch): NavId {
  if (search.aba === "competicoes") return "competicoes";
  if (search.aba !== "favoritos" && search.filtro === "live") return "live";
  return "jogos";
}

export function activeJogos(search: LivescoreSearch): JogosItem | null {
  if (search.aba === "competicoes" || (search.aba !== "favoritos" && search.filtro === "live")) return null;
  if (search.aba === "favoritos") return "favoritos";
  if (search.filtro === "ended") return "ended";
  if (search.filtro === "upcoming") return "upcoming";
  return null;
}

export function jogosSearch(search: LivescoreSearch, id: JogosItem): LivescoreSearch {
  if (id === "favoritos") return { ...search, aba: "favoritos", liga: "" };
  return { ...search, aba: "todos", filtro: id, liga: "" };
}

export function navSearch(search: LivescoreSearch, id: NavId): LivescoreSearch {
  if (id === "live") {
    return { ...search, aba: "todos", filtro: "live", data: todaySaoPaulo(), liga: "" };
  }
  if (id === "jogos") {
    return {
      ...search,
      aba: "todos",
      filtro: search.filtro === "live" ? "upcoming" : search.filtro,
      liga: "",
    };
  }
  return { ...search, aba: id, liga: "" };
}
