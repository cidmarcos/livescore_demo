import { Bell, LogOut, Moon, Settings, Sparkles, User } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const items = [
  { label: "Meu perfil", icon: User },
  { label: "Preferências", icon: Settings },
  { label: "Notificações", icon: Bell },
];

function demoNotice(label: string) {
  toast(label, {
    description: "Este é um projeto de demonstração. Não há contas nem dados salvos.",
  });
}

export function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu do usuário"
        className="flex items-center gap-2 rounded-full border border-border bg-surface-2 py-1 pl-1 pr-1 transition-colors hover:border-primary/50 md:pr-3"
      >
        <span className="ls-brand grid size-8 place-items-center rounded-full text-xs font-bold text-white">
          V
        </span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-xs font-semibold">Visitante</span>
          <span className="block text-[10px] text-muted-foreground">Plano Demo</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-64 rounded-2xl border-border bg-popover/95 p-2 backdrop-blur-xl"
      >
        <DropdownMenuLabel className="flex items-center gap-3 p-2">
          <span className="ls-brand grid size-10 place-items-center rounded-full text-sm font-bold text-white">
            V
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">Visitante</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              visitante@livescore.demo
            </span>
          </span>
        </DropdownMenuLabel>
        <div className="mx-2 mb-2 flex items-center justify-between rounded-xl bg-primary/12 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-primary">
            <Sparkles className="size-3.5" />
            Plano Demo
          </span>
          <span className="text-muted-foreground">Gratuito</span>
        </div>
        <DropdownMenuSeparator />
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            onSelect={() => demoNotice(item.label)}
            className="gap-3 rounded-lg px-2 py-2"
          >
            <item.icon className="size-4 text-muted-foreground" />
            {item.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => demoNotice("Tema")} className="gap-3 rounded-lg px-2 py-2">
          <Moon className="size-4 text-muted-foreground" />
          Tema escuro
          <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground">
            Ativo
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => demoNotice("Sair")}
          className="gap-3 rounded-lg px-2 py-2 text-loss focus:text-loss"
        >
          <LogOut className="size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
