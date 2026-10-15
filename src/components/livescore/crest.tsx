import { useState } from "react";

import { logoUrl } from "@/lib/livescore/api";
import { cn } from "@/lib/utils";

export function Crest({
  imageId,
  name,
  className,
}: {
  imageId: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  if (!imageId || failed) {
    return (
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[oklch(0.45_0.12_290)] to-[oklch(0.32_0.08_265)] text-[9px] font-bold text-white ring-1 ring-white/10",
          className,
        )}
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={logoUrl(imageId)}
      alt=""
      className={cn("size-7 shrink-0 object-contain", className)}
      onError={() => setFailed(true)}
    />
  );
}
