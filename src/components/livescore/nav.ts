import { todaySaoPaulo } from "@/lib/livescore/parse";
import type { LivescoreSearch } from "@/lib/livescore/types";

export type NavId = "live" | "jogos" | "favoritos" | "competicoes";

export const navItems: { id: NavId; label: string }[] = [
  { id: "live", label: "Ao vivo" },
  { id: "jogos", label: "Jogos" },
  { id: "favoritos", label: "Favoritos" },
  { id: "competicoes", label: "Competições" },
];

export function activeNav(search: LivescoreSearch): NavId {
  if (search.aba === "favoritos") return "favoritos";
  if (search.aba === "competicoes") return "competicoes";
  if (search.filtro === "live") return "live";
  return "jogos";
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
