import type { Automation } from "@/lib/drills";

const styles: Record<Automation, { label: string; className: string }> = {
  auto: { label: "automatisch", className: "bg-emerald-500/15 text-emerald-400" },
  teilweise: { label: "teilweise", className: "bg-amber-500/15 text-amber-400" },
  tap: { label: "per Tap", className: "bg-sky-500/15 text-sky-400" },
  nein: { label: "nicht gemessen", className: "bg-muted text-muted-foreground" },
};

export function AutomationBadge({ automation }: { automation: Automation }) {
  const style = styles[automation];
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap ${style.className}`}
    >
      {style.label}
    </span>
  );
}
