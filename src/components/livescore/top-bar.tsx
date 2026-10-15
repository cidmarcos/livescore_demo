import { Activity, Bell, CalendarDays, Radio, Search, Star, Trophy } from "lucide-react";
import { toast } from "sonner";

import { activeNav, navItems, type NavId } from "@/components/livescore/nav";
import { UserMenu } from "@/components/livescore/user-menu";
import type { LivescoreSearch } from "@/lib/livescore/types";
import { cn } from "@/lib/utils";

export const navIcons: Record<NavId, typeof Radio> = {
  live: Radio,
  jogos: CalendarDays,
  favoritos: Star,
  competicoes: Trophy,
};

export function TopBar({
  search,
  liveCount,
  onQuery,
  onNav,
  onHome,
}: {
  search: LivescoreSearch;
  liveCount: number;
  onQuery: (q: string) => void;
  onNav: (id: NavId) => void;
  onHome: () => void;
}) {
  const active = activeNav(search);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 md:px-6">
        <button type="button" onClick={onHome} className="flex shrink-0 items-center gap-2.5">
          <span className="ls-brand grid size-9 place-items-center rounded-xl shadow-[0_8px_24px_-8px_var(--color-glow)]">
            <Activity className="size-5 text-white" strokeWidth={2.5} />
          </span>
          <span className="text-left leading-none">
            <span className="block text-[15px] font-bold tracking-tight">LiveScore</span>
            <span className="ls-gradient-text block text-[10px] font-semibold uppercase tracking-[0.2em]">
              Demo
            </span>
          </span>
        </button>

        <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Navegação principal">
          {navItems.map((item) => {
            const Icon = navIcons[item.id];
            const selected = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNav(item.id)}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  selected ? "bg-primary/12 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-4", selected && "text-primary")} />
                {item.label}
                {item.id === "live" && liveCount > 0 ? (
                  <span className="rounded-full bg-live/15 px-1.5 text-[10px] font-bold text-live">{liveCount}</span>
                ) : null}
                {selected ? (
                  <span className="ls-brand absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full" />
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <label className="relative hidden md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search.q}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Buscar times..."
              aria-label="Buscar time"
              className="h-10 w-56 rounded-xl border border-border bg-surface-2/80 pl-9 pr-3 text-sm outline-none transition-[width,border-color] placeholder:text-muted-foreground focus:w-72 focus:border-primary/60"
            />
          </label>
          <button
            type="button"
            aria-label="Notificações"
            onClick={() =>
              toast("Notificações", {
                description: "Os alertas de gol ficam para uma próxima versão da demo.",
              })
            }
            className="relative grid size-10 place-items-center rounded-xl border border-border bg-surface-2/80 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Bell className="size-4" />
            {liveCount > 0 ? <span className="ls-live-dot absolute right-2 top-2" /> : null}
          </button>
          <UserMenu />
        </div>
      </div>

      <div className="px-4 pb-3 md:hidden">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search.q}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Buscar times..."
            aria-label="Buscar time"
            className="h-10 w-full rounded-xl border border-border bg-surface-2/80 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
        </label>
      </div>
    </header>
  );
}
