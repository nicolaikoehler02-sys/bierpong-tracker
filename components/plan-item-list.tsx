import { AutomationBadge } from "@/components/automation-badge";
import { getDrill } from "@/lib/drills";
import type { PlanItem } from "@/lib/plan";

export function PlanItemList({ items }: { items: PlanItem[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => {
        if (item.kind === "text") {
          return (
            <li key={index} className="text-muted-foreground">
              {item.text}
            </li>
          );
        }
        const drill = getDrill(item.drillId);
        const volume = item.volume ?? drill.defaultVolume;
        return (
          <li key={index} className="flex items-start justify-between gap-2">
            <span>
              <span className="text-muted-foreground">D{drill.id}</span> {drill.short}
              {volume !== null && drill.unit && (
                <span className="text-muted-foreground">
                  {" "}
                  · {volume} {drill.unit}
                </span>
              )}
              {item.note && <span className="block text-xs text-muted-foreground">{item.note}</span>}
            </span>
            <AutomationBadge automation={drill.automation} />
          </li>
        );
      })}
    </ul>
  );
}
