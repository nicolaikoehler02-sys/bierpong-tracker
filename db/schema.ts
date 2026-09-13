import { integer, pgTable, real, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

export type BallColor = "weiss" | "orange";
export type EventKind = "hit" | "miss" | "attempt_end" | "catch" | "correction";
export type EventSource = "camera" | "tap";

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  ballColor: text("ball_color").$type<BallColor>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Eine Trainingseinheit, optional einer Session aus dem Plan zugeordnet (z. B. "w2-s1"). */
export const trainingSessions = pgTable("training_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  planSessionId: text("plan_session_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  note: text("note"),
});

/** Ein Drill-Block innerhalb einer Einheit. */
export const drillBlocks = pgTable("drill_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => trainingSessions.id, { onDelete: "cascade" }),
  drillId: integer("drill_id").notNull(),
  /** null bei Partner-Drills */
  playerId: integer("player_id").references(() => players.id),
  plannedVolume: integer("planned_volume"),
  /** Vom Werfer bestätigte Anzahl am Ende des Blocks */
  confirmedVolume: integer("confirmed_volume"),
  formation: text("formation"),
  /** Drill 14: z. B. "nasse Bälle" */
  condition: text("condition"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

/** Ein einzelnes Ereignis: Treffer, Fehlwurf-Tap, Korrektur … */
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  blockId: uuid("block_id")
    .notNull()
    .references(() => drillBlocks.id, { onDelete: "cascade" }),
  kind: text("kind").$type<EventKind>().notNull(),
  source: text("source").$type<EventSource>().notNull(),
  /** Becherposition in der kalibrierten Formation */
  cup: integer("cup"),
  playerId: integer("player_id").references(() => players.id),
  ballColor: text("ball_color").$type<BallColor>(),
  confidence: real("confidence"),
  snapshotUrl: text("snapshot_url"),
  /** Bei kind = "correction": das korrigierte Ereignis */
  correctsEventId: uuid("corrects_event_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
