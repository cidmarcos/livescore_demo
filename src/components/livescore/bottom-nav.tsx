import { activeNav, navItems, type NavId } from "@/components/livescore/nav";
import { navIcons } from "@/components/livescore/top-bar";
import type { LivescoreSearch } from "@/lib/livescore/types";
import { cn } from "@/lib/utils";

export function BottomNav({
  search,
  liveCount,
  onNav,
}: {
  search: LivescoreSearch;
  liveCount: number;
  onNav: (id: NavId) => void;
}) {
  const active = activeNav(search);

  return (
    <nav
      aria-label="Navegação"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4">
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
                "relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                selected ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {selected ? <span className="ls-brand absolute inset-x-6 top-0 h-0.5 rounded-full" /> : null}
              <span
                className={cn(
                  "relative grid h-7 w-12 place-items-center rounded-full transition-colors",
                  selected && "bg-primary/15",
                )}
              >
                <Icon className={cn("size-[18px]", selected && "text-primary")} />
                {item.id === "live" && liveCount > 0 ? (
                  <span className="absolute -right-0.5 -top-1 rounded-full bg-live px-1 text-[9px] font-bold leading-4 text-white">
                    {liveCount}
                  </span>
                ) : null}
              </span>
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
