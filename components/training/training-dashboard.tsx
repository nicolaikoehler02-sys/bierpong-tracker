"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  addTapEvent,
  endBlock,
  endSession,
  setBlockTest,
  startBlock,
  startSession,
  voidLastHit,
  voidLastTap,
} from "@/app/training/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { berlinToday, formatRange } from "@/lib/dates";
import { type Drill, drills, formationLabel, getDrill } from "@/lib/drills";
import type { ActionResult, BlockSummary, EventInfo, LiveState, PlayerInfo } from "@/lib/live-types";
import { type PlanSession, nextWeekAfter, weekForDate, weeks } from "@/lib/plan";
import { formatPercent, longestStreak } from "@/lib/stats";

const POLL_MS = 1500;
const FETCH_TIMEOUT_MS = 8000;
const CAMERA_TIMEOUT_MS = 25_000;
const timeFormat = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const clockFormat = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const inputClass = "h-8 rounded-lg border border-input bg-background px-2 text-sm";

const planSessions = new Map(
  weeks.flatMap((week) => week.sessions.map((session) => [session.id, { week: week.week, session }] as const)),
);
const measurableDrills = drills.filter((drill) => drill.type !== "E");

type Run = (action: () => Promise<ActionResult>) => void;

function planLabel(planSessionId: string | null): string {
  if (!planSessionId) return "Freies Training";
  const entry = planSessions.get(planSessionId);
  return entry ? `Woche ${entry.week} · ${entry.session.label}` : planSessionId;
}

function playerLabel(players: PlayerInfo[], playerId: number | null): string {
  if (playerId === null) return players.map((player) => player.name).join(" & ");
  return players.find((player) => player.id === playerId)?.name ?? "Unbekannt";
}

function blockSummary(block: BlockSummary, drill: Drill): string {
  if (drill.type === "C") return `${block.hits} Treffer · ${block.misses} Versuche`;
  if (drill.type === "D") {
    const rounds = block.catches + block.misses;
    return rounds ? `${block.catches}/${rounds} gefangen · ${formatPercent(block.catches / rounds)}` : "keine Runden";
  }
  const volume = block.confirmedVolume ?? block.plannedVolume;
  return volume ? `${block.hits}/${volume} · ${formatPercent(Math.min(block.hits, volume) / volume)}` : `${block.hits} Treffer`;
}

function eventLabel(event: EventInfo): string {
  switch (event.kind) {
    case "hit": {
      const cup = event.cup !== null ? ` Becher ${event.cup + 1}` : "";
      const color = event.ballColor === "orange" ? " · orange" : "";
      return `Treffer${cup}${color}`;
    }
    case "miss":
      return "Fehlwurf";
    case "catch":
      return "Gefangen";
    default:
      return event.kind;
  }
}

export function TrainingDashboard() {
  const [state, setState] = useState<LiveState | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [lastPlayerId, setLastPlayerId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    // Ohne Timeout bliebe das Dashboard bei einer hängenden Anfrage für immer auf „Lade …“.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch("/api/live", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setState((await response.json()) as LiveState);
      setConnectionError(false);
    } catch {
      setConnectionError(true);
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      await refresh();
      if (!cancelled) timer = setTimeout(loop, POLL_MS);
    };
    void loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  const run: Run = (action) => {
    setActionError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setActionError(result.error);
      await refresh();
    });
  };

  if (!state) {
    return (
      <p className="text-sm text-muted-foreground">{connectionError ? "Keine Verbindung zum Server." : "Lade …"}</p>
    );
  }

  return (
    <div className="space-y-4">
      {connectionError && <p className="text-sm text-destructive">Keine Verbindung zum Server, versuche es weiter …</p>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
      {state.session ? (
        <SessionView
          state={state}
          pending={pending}
          run={run}
          lastPlayerId={lastPlayerId}
          onPlayerUsed={setLastPlayerId}
        />
      ) : (
        <SessionStarter disabled={pending} onStart={(planSessionId) => run(() => startSession(planSessionId))} />
      )}
    </div>
  );
}

function SessionStarter({ disabled, onStart }: { disabled: boolean; onStart: (planSessionId: string | null) => void }) {
  const [suggestedWeek] = useState(() => {
    const today = berlinToday();
    return weekForDate(today) ?? nextWeekAfter(today) ?? weeks[weeks.length - 1];
  });
  const [selected, setSelected] = useState(suggestedWeek.sessions[0].id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Einheit starten</CardTitle>
        <CardDescription>
          Woche {suggestedWeek.week} · {formatRange(suggestedWeek.start, suggestedWeek.end)} · {suggestedWeek.title}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <select value={selected} onChange={(event) => setSelected(event.target.value)} className={`${inputClass} w-full`}>
          {weeks.map((week) => (
            <optgroup key={week.week} label={`Woche ${week.week} · ${formatRange(week.start, week.end)}`}>
              {week.sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  Woche {week.week} · {session.label}
                  {session.partner ? " · Partner" : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" disabled={disabled} onClick={() => onStart(selected)}>
            Einheit starten
          </Button>
          <Button size="lg" variant="outline" disabled={disabled} onClick={() => onStart(null)}>
            Freies Training
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionView({
  state,
  pending,
  run,
  lastPlayerId,
  onPlayerUsed,
}: {
  state: LiveState;
  pending: boolean;
  run: Run;
  lastPlayerId: number | null;
  onPlayerUsed: (playerId: number | null) => void;
}) {
  const session = state.session!;
  const plan = session.planSessionId ? planSessions.get(session.planSessionId)?.session : undefined;
  const finished = state.blocks.filter((block) => block.endedAt);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const start = (input: { drillId: number; playerId: number | null; plannedVolume: number | null; formation: string | null }) => {
    if (input.playerId !== null) onPlayerUsed(input.playerId);
    run(() => startBlock({ sessionId: session.id, ...input }));
  };

  return (
    <>
      <Card size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>{planLabel(session.planSessionId)}</CardTitle>
              <CardDescription>
                Seit {clockFormat.format(new Date(session.startedAt))} · {finished.length}{" "}
                {finished.length === 1 ? "Block" : "Blöcke"} fertig
              </CardDescription>
            </div>
            {confirmEnd ? (
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" disabled={pending} onClick={() => run(() => endSession(session.id))}>
                  Wirklich beenden
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmEnd(false)}>
                  Abbrechen
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirmEnd(true)}>
                Einheit beenden
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {state.activeBlock && (
        <ActiveBlockPanel
          key={state.activeBlock.id}
          block={state.activeBlock}
          events={state.events}
          players={state.players}
          serverTime={state.serverTime}
          pending={pending}
          run={run}
        />
      )}

      {plan && (
        <PlanItems
          plan={plan}
          blocks={state.blocks}
          players={state.players}
          canStart={!state.activeBlock}
          pending={pending}
          lastPlayerId={lastPlayerId}
          onStart={start}
        />
      )}

      <FreeDrillPicker
        title={plan ? "Anderer Drill" : "Drill starten"}
        players={state.players}
        canStart={!state.activeBlock}
        pending={pending}
        lastPlayerId={lastPlayerId}
        onStart={start}
      />

      {finished.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Fertige Blöcke</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {[...finished].reverse().map((block) => {
                const drill = getDrill(block.drillId);
                const formation = drill.sections ? formationLabel(block.formation) : null;
                return (
                  <li
                    key={block.id}
                    className={`flex flex-wrap items-center justify-between gap-x-3 ${block.isTest ? "opacity-60" : ""}`}
                  >
                    <span>
                      <span className="text-muted-foreground">D{drill.id}</span> {drill.short}
                      {formation && ` · ${formation}`} · {playerLabel(state.players, block.playerId)}
                      {block.isTest && (
                        <span className="ml-2 rounded bg-destructive/15 px-1.5 text-xs text-destructive">Test</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums text-muted-foreground">{blockSummary(block, drill)}</span>
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => run(() => setBlockTest(block.id, !block.isTest))}
                      >
                        {block.isTest ? "Kein Test" : "Test"}
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function ActiveBlockPanel({
  block,
  events,
  players,
  serverTime,
  pending,
  run,
}: {
  block: BlockSummary;
  events: EventInfo[];
  players: PlayerInfo[];
  serverTime: string;
  pending: boolean;
  run: Run;
}) {
  const drill = getDrill(block.drillId);
  const [confirming, setConfirming] = useState(false);
  const [confirmValue, setConfirmValue] = useState(0);

  const cameraConnected =
    block.cameraSeenAt !== null &&
    new Date(serverTime).getTime() - new Date(block.cameraSeenAt).getTime() < CAMERA_TIMEOUT_MS;
  const validKinds = events.filter((event) => !event.voidedAt).map((event) => event.kind);
  const lastMiss = validKinds.lastIndexOf("miss");
  const currentStreak = validKinds.slice(lastMiss + 1).filter((kind) => kind === "hit").length;
  const defaultConfirm =
    drill.type === "C"
      ? block.misses
      : drill.type === "D"
        ? block.catches + block.misses
        : (block.plannedVolume ?? block.hits);
  const formation = drill.sections ? formationLabel(block.formation) : null;

  return (
    <Card className="ring-2 ring-emerald-500/40">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">
              <span className="text-muted-foreground">D{drill.id}</span> {drill.name}
            </CardTitle>
            <CardDescription>
              {playerLabel(players, block.playerId)}
              {formation && ` · ${formation}`} · seit {clockFormat.format(new Date(block.startedAt))}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {drill.type !== "D" && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  cameraConnected ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                }`}
              >
                {cameraConnected ? "iPhone verbunden" : "iPhone nicht verbunden"}
              </span>
            )}
            <Button
              size="xs"
              variant={block.isTest ? "destructive" : "ghost"}
              disabled={pending}
              onClick={() => run(() => setBlockTest(block.id, !block.isTest))}
            >
              {block.isTest ? "Test ✓" : "Als Test markieren"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <BlockNumbers block={block} drill={drill} currentStreak={currentStreak} bestStreak={longestStreak(validKinds)} />

        <div className="flex flex-wrap gap-2">
          {drill.type === "D" ? (
            <>
              <Button size="lg" disabled={pending} onClick={() => run(() => addTapEvent(block.id, "catch"))}>
                Gefangen
              </Button>
              <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => addTapEvent(block.id, "miss"))}>
                Nicht gefangen
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => run(() => voidLastTap(block.id))}>
                Rückgängig
              </Button>
            </>
          ) : (
            <>
              {drill.type === "C" && (
                <Button size="lg" variant="destructive" disabled={pending} onClick={() => run(() => addTapEvent(block.id, "miss"))}>
                  Fehlwurf
                </Button>
              )}
              <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => addTapEvent(block.id, "hit"))}>
                Treffer +1
              </Button>
              <Button variant="ghost" disabled={pending || block.hits === 0} onClick={() => run(() => voidLastHit(block.id))}>
                Letzten Treffer löschen
              </Button>
              {drill.type === "C" && (
                <Button variant="ghost" disabled={pending || block.misses === 0} onClick={() => run(() => voidLastTap(block.id))}>
                  Letzten Tap rückgängig
                </Button>
              )}
            </>
          )}
        </div>

        {confirming ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-3">
            <label className="flex items-center gap-2 text-sm">
              {drill.type === "C" ? "Versuche" : drill.unit === "Runden" ? "Runden" : "Würfe"}
              <input
                type="number"
                min={0}
                value={confirmValue}
                onChange={(event) => setConfirmValue(Number(event.target.value))}
                className={`${inputClass} w-20`}
              />
            </label>
            <Button disabled={pending} onClick={() => run(() => endBlock(block.id, confirmValue))}>
              Block speichern
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Abbrechen
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              setConfirmValue(defaultConfirm);
              setConfirming(true);
            }}
          >
            Block beenden
          </Button>
        )}

        {events.length > 0 && (
          <ul className="space-y-1 border-t pt-3 text-sm tabular-nums">
            {[...events]
              .reverse()
              .slice(0, 8)
              .map((event) => (
                <li
                  key={event.id}
                  className={`flex justify-between gap-2 ${event.voidedAt ? "text-muted-foreground line-through" : ""}`}
                >
                  <span>{eventLabel(event)}</span>
                  <span className="text-muted-foreground">
                    {event.source === "camera" ? "Kamera" : "Tap"} · {timeFormat.format(new Date(event.createdAt))}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BlockNumbers({
  block,
  drill,
  currentStreak,
  bestStreak,
}: {
  block: BlockSummary;
  drill: Drill;
  currentStreak: number;
  bestStreak: number;
}) {
  if (drill.type === "C") {
    return (
      <div className="grid grid-cols-3 gap-3">
        <BigNumber value={currentStreak} label="aktuelle Serie" />
        <BigNumber value={bestStreak} label="beste Serie" />
        <BigNumber value={`${block.misses}/${block.plannedVolume ?? "–"}`} label="Versuche" />
      </div>
    );
  }
  if (drill.type === "D") {
    const rounds = block.catches + block.misses;
    return (
      <div className="grid grid-cols-2 gap-3">
        <BigNumber value={`${block.catches}/${rounds}`} label="gefangen" />
        <BigNumber value={rounds ? formatPercent(block.catches / rounds) : "–"} label="Quote" />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <BigNumber value={block.hits} label={`Treffer${block.plannedVolume ? ` von ${block.plannedVolume}` : ""}`} />
      <BigNumber
        value={block.plannedVolume ? formatPercent(Math.min(block.hits, block.plannedVolume) / block.plannedVolume) : "–"}
        label="Quote bei vollem Soll"
      />
    </div>
  );
}

function BigNumber({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <div className="text-4xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function PlanItems({
  plan,
  blocks,
  players,
  canStart,
  pending,
  lastPlayerId,
  onStart,
}: {
  plan: PlanSession;
  blocks: BlockSummary[];
  players: PlayerInfo[];
  canStart: boolean;
  pending: boolean;
  lastPlayerId: number | null;
  onStart: StartHandler;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Plan für diese Einheit</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {plan.items.map((item, index) => {
            if (item.kind === "text") {
              return (
                <li key={index} className="text-sm text-muted-foreground">
                  {item.text}
                </li>
              );
            }
            const drill = getDrill(item.drillId);
            const done = blocks.filter((block) => block.drillId === drill.id && block.endedAt && !block.isTest);
            return (
              <li key={index} className="space-y-1.5 border-t pt-3 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap justify-between gap-x-3 text-sm">
                  <span className="font-medium">
                    <span className="text-muted-foreground">D{drill.id}</span> {drill.name}
                    {item.note && <span className="font-normal text-muted-foreground"> · {item.note}</span>}
                  </span>
                  {done.length > 0 && (
                    <span className="tabular-nums text-emerald-400">
                      ✓ {done.map((block) => blockSummary(block, drill)).join(" · ")}
                    </span>
                  )}
                </div>
                {canStart && (
                  <BlockStarter
                    drill={drill}
                    volume={item.volume ?? null}
                    players={players}
                    defaultPlayerId={lastPlayerId}
                    disabled={pending}
                    onStart={onStart}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function FreeDrillPicker({
  title,
  players,
  canStart,
  pending,
  lastPlayerId,
  onStart,
}: {
  title: string;
  players: PlayerInfo[];
  canStart: boolean;
  pending: boolean;
  lastPlayerId: number | null;
  onStart: StartHandler;
}) {
  const [drillId, setDrillId] = useState(measurableDrills[0].id);
  if (!canStart) return null;
  const drill = getDrill(drillId);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <select value={drillId} onChange={(event) => setDrillId(Number(event.target.value))} className={`${inputClass} w-full`}>
          {measurableDrills.map((option) => (
            <option key={option.id} value={option.id}>
              D{option.id} · {option.name}
            </option>
          ))}
        </select>
        <BlockStarter
          key={drill.id}
          drill={drill}
          volume={null}
          players={players}
          defaultPlayerId={lastPlayerId}
          disabled={pending}
          onStart={onStart}
        />
      </CardContent>
    </Card>
  );
}

type StartHandler = (input: {
  drillId: number;
  playerId: number | null;
  plannedVolume: number | null;
  formation: string | null;
}) => void;

function BlockStarter({
  drill,
  volume,
  players,
  defaultPlayerId,
  disabled,
  onStart,
}: {
  drill: Drill;
  volume: number | null;
  players: PlayerInfo[];
  defaultPlayerId: number | null;
  disabled: boolean;
  onStart: StartHandler;
}) {
  const [playerId, setPlayerId] = useState<number | null>(defaultPlayerId ?? players[0]?.id ?? null);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [plannedVolume, setPlannedVolume] = useState(
    drill.sections ? drill.sections[0].volume : (volume ?? drill.defaultVolume ?? 0),
  );

  if (drill.type === "E") {
    return <p className="text-xs text-muted-foreground">Läuft im Spiel mit, wird nicht gemessen.</p>;
  }
  if (!drill.partner && players.length === 0) {
    return <p className="text-xs text-destructive">Keine Spieler in der Datenbank.</p>;
  }

  const section = drill.sections?.[sectionIndex];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!drill.partner && (
        <div className="flex gap-1">
          {players.map((player) => (
            <Button
              key={player.id}
              size="sm"
              variant={playerId === player.id ? "default" : "outline"}
              onClick={() => setPlayerId(player.id)}
            >
              {player.name}
            </Button>
          ))}
        </div>
      )}
      {drill.sections && (
        <div className="flex flex-wrap gap-1">
          {drill.sections.map((option, index) => (
            <Button
              key={option.formation}
              size="sm"
              variant={index === sectionIndex ? "default" : "outline"}
              onClick={() => {
                setSectionIndex(index);
                setPlannedVolume(option.volume);
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="number"
          min={1}
          value={plannedVolume}
          onChange={(event) => setPlannedVolume(Number(event.target.value))}
          className={`${inputClass} w-16`}
        />
        <span className="text-muted-foreground">{drill.unit}</span>
      </label>
      <Button
        size="sm"
        disabled={disabled || (!drill.partner && playerId === null)}
        onClick={() =>
          onStart({
            drillId: drill.id,
            playerId: drill.partner ? null : playerId,
            plannedVolume: plannedVolume > 0 ? plannedVolume : null,
            formation: section?.formation ?? drill.formation,
          })
        }
      >
        Start
      </Button>
    </div>
  );
}
