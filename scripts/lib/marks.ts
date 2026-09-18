/**
 * Die Handmarkierungen einer Aufnahme: eine kleine JSON-Datei je Aufnahme,
 * die — anders als die Aufnahme selbst — ins Repo gehört (siehe ADR 0002).
 *
 * **Warum so wenige Felder?** Diese Datei wird von Hand geschrieben, Wurf für
 * Wurf, hundertmal an einem Abend. Alles, was mehr ist als Zeitpunkt und Seite,
 * kostet bei jedem einzelnen Wurf Zeit und ist eine weitere Gelegenheit für
 * einen Tippfehler. Der Zeitpunkt steht als Dezimalzahl in Sekunden, weil genau
 * das in jedem Videoplayer abzulesen ist; die Seite als `"links"` oder
 * `"rechts"`, weil der Erkennungskern keine Namen kennt und wer wo steht sich
 * von Aufnahme zu Aufnahme ändert.
 *
 * Aufbau:
 *
 * ```json
 * {
 *   "recording": "abend-01.mp4",
 *   "note": "Nicolai links, Jakob rechts",
 *   "throws": [
 *     { "at": 12.4, "side": "links", "bounce": false },
 *     { "at": 15.9, "side": "rechts", "bounce": true },
 *     { "at": 21.2, "side": "links", "note": "Ball kurz verdeckt" }
 *   ]
 * }
 * ```
 *
 * `recording` und `note` sind freiwillig und dienen nur dem Wiederfinden.
 * Freiwillig sind auch `bounce` und `note` am einzelnen Wurf. `bounce` ist die
 * vierte Zahl der Messlatte: Wo es steht, wird die Aufsetzer-Erkennung daran
 * gemessen — `true` für einen Aufsetzer, `false` für einen direkten Wurf. Wo es
 * fehlt, bleibt der Wurf bei dieser Kennzahl außen vor; das ist kein Fehler,
 * kostet aber eine Zeile Messlatte. Wichtig ist, auch die direkten Würfe mit
 * `false` zu markieren: Sonst lässt sich nicht messen, wie oft die Erkennung
 * einen Aufsetzer erfindet, und genau das ist der teurere Fehler.
 *
 * Wer gar nichts drumherum tippen will, darf die Datei auch als bloße Liste
 * schreiben: `[{ "at": 12.4, "side": "links" }, …]`.
 */
import type { ThrowMark, ThrowerSide } from "../../lib/flight/index.ts";
import { readJsonFile } from "./json-datei.ts";

export interface ThrowMarks {
  /** Dateiname der Aufnahme, zu der die Markierungen gehören */
  recording?: string;
  /** Notiz für den Menschen, zum Beispiel wer links und wer rechts stand */
  note?: string;
  /** Die markierten Würfe, nach Zeitpunkt aufsteigend */
  throws: ThrowMark[];
}

/** Liest die Handmarkierungen aus einer JSON-Datei und prüft sie. */
export async function readMarks(file: string): Promise<ThrowMarks> {
  let parsed: unknown;
  try {
    parsed = await readJsonFile(file);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Handmarkierungen nicht lesbar (${file}): ${reason}`);
  }

  // Die bloße Liste ist die Kurzform derselben Datei.
  const raw: Record<string, unknown> = Array.isArray(parsed)
    ? { throws: parsed }
    : typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  const list = raw.throws;
  if (!Array.isArray(list)) {
    throw new Error(
      `Handmarkierungen: "throws" fehlt oder ist keine Liste (${file}). ` +
        `Erwartet wird { "throws": [ { "at": 12.4, "side": "links" }, … ] }.`,
    );
  }

  const marks = list.map((entry, index) => toMark(entry, index, file));
  marks.sort((a, b) => a.at - b.at);

  const result: ThrowMarks = { throws: marks };
  if (raw.recording !== undefined) result.recording = text(raw.recording, "recording", file);
  if (raw.note !== undefined) result.note = text(raw.note, "note", file);
  return result;
}

function toMark(entry: unknown, index: number, file: string): ThrowMark {
  // Beim Markieren zählt der Mensch ab 1 — die Fehlermeldung muss zu der Zeile
  // passen, die er sucht.
  const nr = index + 1;
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new Error(`Handmarkierungen: Wurf ${nr} ist kein Objekt (${file}).`);
  }
  const raw = entry as Record<string, unknown>;

  if (!Number.isFinite(raw.at) || (raw.at as number) < 0) {
    throw new Error(
      `Handmarkierungen: Wurf ${nr} braucht "at" als Sekunden der Aufnahme (${file}).`,
    );
  }
  if (raw.side !== "links" && raw.side !== "rechts") {
    throw new Error(
      `Handmarkierungen: Wurf ${nr} braucht "side" als "links" oder "rechts" (${file}).`,
    );
  }

  const mark: ThrowMark = { at: raw.at as number, side: raw.side as ThrowerSide };
  if (raw.bounce !== undefined) {
    if (typeof raw.bounce !== "boolean") {
      throw new Error(`Handmarkierungen: "bounce" bei Wurf ${nr} muss true oder false sein (${file}).`);
    }
    mark.bounce = raw.bounce;
  }
  if (raw.note !== undefined) mark.note = text(raw.note, `note bei Wurf ${nr}`, file);
  return mark;
}

function text(value: unknown, name: string, file: string): string {
  if (typeof value !== "string") {
    throw new Error(`Handmarkierungen: "${name}" muss Text sein (${file}).`);
  }
  return value;
}
