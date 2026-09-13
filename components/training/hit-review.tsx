"use client";

import { useCallback, useEffect, useState } from "react";
import { setEventVoided } from "@/app/training/actions";
import { Button } from "@/components/ui/button";
import type { ActionResult, EventInfo } from "@/lib/live-types";

const RELOAD_MS = 3000;
const timeFormat = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Alle Treffer eines Blocks mit Standbild; falsche Treffer lassen sich verwerfen oder zurückholen. */
export function HitReview({
  blockId,
  pending,
  run,
}: {
  blockId: string;
  pending: boolean;
  run: (action: () => Promise<ActionResult>) => void;
}) {
  const [events, setEvents] = useState<EventInfo[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/blocks/${blockId}/events`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setEvents(((await response.json()) as { events: EventInfo[] }).events);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [blockId]);

  // Beim aktiven Block kommen laufend neue Treffer dazu.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      await load();
      if (!cancelled) timer = setTimeout(loop, RELOAD_MS);
    };
    void loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load]);

  function toggle(event: EventInfo) {
    run(() => setEventVoided(event.id, !event.voidedAt));
    setTimeout(() => void load(), 800);
  }

  if (!events) {
    return (
      <p className="text-sm text-muted-foreground">
        {loadError ? "Treffer konnten nicht geladen werden." : "Lade Treffer …"}
      </p>
    );
  }

  const hits = events.filter((event) => event.kind === "hit");
  if (!hits.length) return <p className="text-sm text-muted-foreground">Keine Treffer in diesem Block.</p>;

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {hits.map((event) => (
        <div
          key={event.id}
          className={`space-y-1 rounded-lg p-1 ring-1 ring-foreground/10 ${event.voidedAt ? "opacity-40" : ""}`}
        >
          {event.hasSnapshot ? (
            // eslint-disable-next-line @next/next/no-img-element -- kleines JPEG aus der eigenen API
            <img
              src={`/api/events/${event.id}/snapshot`}
              alt={event.cup !== null ? `Treffer in Becher ${event.cup + 1}` : "Treffer"}
              loading="lazy"
              className="aspect-square w-full rounded object-cover"
            />
          ) : (
            <div className="flex aspect-square items-center justify-center rounded bg-muted text-xs text-muted-foreground">
              {event.source === "tap" ? "per Tap" : "kein Bild"}
            </div>
          )}
          <div className="px-0.5 text-xs tabular-nums text-muted-foreground">
            {event.cup !== null ? `Becher ${event.cup + 1}` : "–"} · {timeFormat.format(new Date(event.createdAt))}
          </div>
          <Button
            size="xs"
            variant={event.voidedAt ? "outline" : "ghost"}
            className="w-full"
            disabled={pending}
            onClick={() => toggle(event)}
          >
            {event.voidedAt ? "Zurückholen" : "Verwerfen"}
          </Button>
        </div>
      ))}
    </div>
  );
}
