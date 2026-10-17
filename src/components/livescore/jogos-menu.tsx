import { CalendarClock, CheckCircle2, ChevronDown, Star } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { activeJogos, jogosItems, navIcons, type JogosItem } from "@/components/livescore/nav";
import type { LivescoreSearch } from "@/lib/livescore/types";
import { cn } from "@/lib/utils";

const itemIcons: Record<JogosItem, typeof Star> = {
  favoritos: Star,
  ended: CheckCircle2,
  upcoming: CalendarClock,
};

export function JogosMenu({
  search,
  counts,
  active,
  variant,
  onSelect,
}: {
  search: LivescoreSearch;
  counts: Record<JogosItem, number | null>;
  active: boolean;
  variant: "bar" | "bottom";
  onSelect: (id: JogosItem) => void;
}) {
  const current = activeJogos(search);
  const Icon = navIcons.jogos;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-current={active ? "page" : undefined}
        className={
          variant === "bar"
            ? cn(
                "relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors outline-none",
                active ? "bg-primary/12 text-foreground" : "text-muted-foreground hover:text-foreground",
              )
            : cn(
                "relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium outline-none",
                active ? "text-foreground" : "text-muted-foreground",
              )
        }
      >
        {variant === "bar" ? (
          <>
            <Icon className={cn("size-4", active && "text-primary")} />
            Jogos
            <ChevronDown className="size-3.5 opacity-70" />
            {active ? <span className="ls-brand absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full" /> : null}
          </>
        ) : (
          <>
            {active ? <span className="ls-brand absolute inset-x-6 top-0 h-0.5 rounded-full" /> : null}
            <span
              className={cn(
                "relative grid h-7 w-12 place-items-center rounded-full transition-colors",
                active && "bg-primary/15",
              )}
            >
              <Icon className={cn("size-[18px]", active && "text-primary")} />
            </span>
            Jogos
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        side={variant === "bottom" ? "top" : "bottom"}
        sideOffset={variant === "bottom" ? 10 : 14}
        className="w-52 rounded-2xl border-border bg-popover/95 p-1.5 backdrop-blur-xl"
      >
        {jogosItems.map((item) => {
          const ItemIcon = itemIcons[item.id];
          const selected = current === item.id;
          const count = counts[item.id];
          return (
            <DropdownMenuItem
              key={item.id}
              onSelect={() => onSelect(item.id)}
              className={cn(
                "gap-2.5 rounded-xl px-2.5 py-2",
                selected && "bg-primary/15 text-foreground focus:bg-primary/15",
              )}
            >
              <ItemIcon
                className={cn(
                  "size-4",
                  item.id === "favoritos" && "text-[oklch(0.82_0.15_85)]",
                  item.id === "ended" && "text-win",
                  item.id === "upcoming" && "text-primary",
                )}
              />
              <span className="flex-1">{item.label}</span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">{count ?? "–"}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
