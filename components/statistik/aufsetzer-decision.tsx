"use client";

import { useState } from "react";
import { RangeInput } from "@/components/range-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type Counts, formatPercent, probabilityAbove, probabilityGreater, wilson } from "@/lib/stats";

/** Plan-Regel Ende Woche 2: über ~30 % bleibt der Aufsetzer voll im Programm. */
const PLAN_KEEP_THRESHOLD = 0.3;
/** Annahme für p, solange es noch keine Einzelbecher-Daten gibt. */
const ASSUMED_P = 0.5;
/** Ab dieser Wahrscheinlichkeit gilt eine Aussage als belastbar. */
const CONFIDENT = 0.9;

export interface DecisionPlayer {
  name: string;
  /** Drill 7 */
  bounce: Counts | null;
  /** Drill 2 */
  normal: Counts | null;
}

export function AufsetzerDecision({ players }: { players: DecisionPlayer[] }) {
  const [defense, setDefense] = useState(0.3);
  const withBounce = players.filter((player) => player.bounce);
  const comparison =
    withBounce.length === 2 ? probabilityGreater(withBounce[0].bounce!, withBounce[1].bounce!) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aufsetzer-Entscheidung</CardTitle>
        <CardDescription>
          Entscheidung Ende Woche 2 (27.09.). Der Aufsetzer lohnt sich, wenn 2b(1−s) &gt; p · b = Aufsetzerquote
          (Drill 7), p = normale Quote (Drill 2), s = Abwehr des Gegners.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RangeInput
          label="Abwehr des Gegners (s)"
          value={defense}
          min={0}
          max={0.6}
          step={0.05}
          format={(value) =>
            `${formatPercent(value)}${value >= 0.3 ? " · aufmerksam" : value <= 0.1 ? " · unaufmerksam" : ""}`
          }
          onChange={setDefense}
        />
        <ul className="space-y-4">
          {players.map((player) => (
            <PlayerDecision key={player.name} player={player} defense={defense} />
          ))}
        </ul>
        {comparison !== null && (
          <p className="text-sm">
            Bessere Aufsetzerquote:{" "}
            <span className="font-medium">{comparison >= 0.5 ? withBounce[0].name : withBounce[1].name}</span> mit{" "}
            {formatPercent(Math.max(comparison, 1 - comparison))} Wahrscheinlichkeit.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Wahrscheinlichkeiten mit gleichverteiltem Vorwissen (Beta-Verteilung). Die Unsicherheit von p ist nicht
          eingerechnet.
        </p>
      </CardContent>
    </Card>
  );
}

function PlayerDecision({ player, defense }: { player: DecisionPlayer; defense: number }) {
  const p = player.normal ? player.normal.successes / player.normal.trials : ASSUMED_P;
  const threshold = Math.min(1, p / (2 * (1 - defense)));

  if (!player.bounce) {
    return (
      <li className="text-sm">
        <span className="font-medium">{player.name}</span>
        <span className="text-muted-foreground"> · noch keine Aufsetzer-Blöcke (Drill 7)</span>
      </li>
    );
  }

  const estimate = wilson(player.bounce.successes, player.bounce.trials)!;
  const probability = probabilityAbove(player.bounce, threshold);
  const verdict =
    probability >= CONFIDENT
      ? { label: "Lohnt sich", className: "bg-emerald-500/15 text-emerald-400" }
      : probability <= 1 - CONFIDENT
        ? { label: "Lohnt sich nicht", className: "bg-destructive/15 text-destructive" }
        : { label: "Noch unklar", className: "bg-amber-500/15 text-amber-400" };

  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{player.name}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${verdict.className}`}>{verdict.label}</span>
      </div>
      <p className="text-sm tabular-nums">
        b = <span className="font-semibold">{formatPercent(estimate.p)}</span>{" "}
        <span className="text-muted-foreground">
          ({formatPercent(estimate.low)}–{formatPercent(estimate.high)}, {player.bounce.successes}/
          {player.bounce.trials})
        </span>{" "}
        · nötig ab {formatPercent(threshold)}{" "}
        <span className="text-muted-foreground">
          bei p = {formatPercent(p)}
          {player.normal ? "" : " (angenommen)"}
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        Wahrscheinlichkeit, dass sich der Aufsetzer lohnt: {formatPercent(probability)} · Plan-Regel (über 30 %):{" "}
        {estimate.p > PLAN_KEEP_THRESHOLD ? "behalten" : "reduzieren"}
      </p>
    </li>
  );
}
