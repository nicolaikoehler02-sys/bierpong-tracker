// Datenformen, wie sie die API als JSON liefert (Datumswerte als ISO-Strings).
import type { BallColor, EventKind, EventSource } from "@/db/schema";

export interface PlayerInfo {
  id: number;
  name: string;
}

export interface SessionInfo {
  id: string;
  planSessionId: string | null;
  startedAt: string;
}

export interface BlockSummary {
  id: string;
  sessionId: string;
  drillId: number;
  playerId: number | null;
  plannedVolume: number | null;
  confirmedVolume: number | null;
  formation: string | null;
  startedAt: string;
  endedAt: string | null;
  cameraSeenAt: string | null;
  hits: number;
  misses: number;
  catches: number;
}

export interface EventInfo {
  id: string;
  kind: EventKind;
  source: EventSource;
  cup: number | null;
  ballColor: BallColor | null;
  confidence: number | null;
  voidedAt: string | null;
  createdAt: string;
}

export interface LiveState {
  serverTime: string;
  players: PlayerInfo[];
  session: SessionInfo | null;
  blocks: BlockSummary[];
  activeBlock: BlockSummary | null;
  events: EventInfo[];
}

export interface ActiveBlockInfo {
  id: string;
  drillId: number;
  playerName: string | null;
  plannedVolume: number | null;
  formation: string | null;
}

export type TapEventKind = "hit" | "miss" | "catch";

export interface NewEventBody {
  blockId: string;
  kind: TapEventKind;
  source: EventSource;
  cup?: number | null;
  ballColor?: BallColor | null;
  confidence?: number | null;
}

export type ActionResult = { ok: true } | { ok: false; error: string };
