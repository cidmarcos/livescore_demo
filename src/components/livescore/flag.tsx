import { useId, useState } from "react";

import { cn } from "@/lib/utils";

function countryCode(value: string | null | undefined) {
  const code = value?.trim().toLowerCase() ?? "";
  return /^[a-z]{2}$/.test(code) ? code : null;
}

export function Flag({
  code,
  className,
  fallback = null,
}: {
  code: string | null | undefined;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const normalized = countryCode(code);
  if (!normalized) return <GlobeFlag {...(className ? { className } : {})} />;
  if (failed) return <>{fallback ?? <GlobeFlag {...(className ? { className } : {})} />}</>;

  return (
    <span
      title={normalized.toUpperCase()}
      className={cn(
        "inline-flex h-3.5 w-5 shrink-0 overflow-hidden rounded-[4px] shadow-sm ring-1 ring-black/25",
        className,
      )}
    >
      <img
        src={`https://flagcdn.com/w40/${normalized}.png`}
        alt=""
        className="size-full object-cover"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function GlobeFlag({ className }: { className?: string }) {
  const clip = `globe-${useId().replace(/:/g, "")}`;
  return (
    <span
      title="Internacional"
      className={cn(
        "inline-flex h-3.5 w-5 shrink-0 overflow-hidden rounded-[4px] bg-[#071a33] shadow-sm ring-1 ring-black/25",
        className,
      )}
    >
      <svg viewBox="0 0 40 28" className="size-full" aria-hidden="true">
        <defs>
          <clipPath id={clip}>
            <circle cx="20" cy="14" r="12" />
          </clipPath>
        </defs>
        <circle cx="20" cy="14" r="12" fill="#1b6fd4" />
        <g clipPath={`url(#${clip})`} fill="#4ade80">
          <ellipse cx="13.6" cy="12.5" rx="3.1" ry="6.4" transform="rotate(-14 13.6 12.5)" />
          <ellipse cx="16.4" cy="20.2" rx="1.7" ry="2.5" />
          <ellipse cx="23.2" cy="9.2" rx="4.2" ry="2.3" />
          <ellipse cx="24.6" cy="15.6" rx="2.5" ry="4.4" />
          <ellipse cx="28.4" cy="20.8" rx="1.8" ry="1.15" />
        </g>
        <g clipPath={`url(#${clip})`} fill="none" stroke="#d7ecff" strokeWidth="0.55" opacity="0.7">
          <ellipse cx="20" cy="14" rx="12" ry="4" />
          <path d="M20 2v24M8 14h24" />
        </g>
        <circle cx="20" cy="14" r="12" fill="none" stroke="#d5ebff" strokeWidth="0.8" />
      </svg>
    </span>
  );
}
