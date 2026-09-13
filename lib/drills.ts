// Drill-Katalog aus bierpong-trainingsplan.md (Teil 6) plus Tracker-Einordnung aus tracker-plan.md.

export type DrillType = "A" | "B" | "C" | "D" | "E";

/** Wie weit der Drill ohne Zutun erfasst werden kann. */
export type Automation = "auto" | "teilweise" | "tap" | "nein";

export type Formation =
  | "pyramide-10"
  | "pyramide-6"
  | "raute-4"
  | "pyramide-3"
  | "einzelbecher"
  | "mittelbecher";

export const formationLabels: Record<Formation, string> = {
  "pyramide-10": "10er-Pyramide",
  "pyramide-6": "6er-Pyramide",
  "raute-4": "4er-Raute",
  "pyramide-3": "3er-Pyramide",
  einzelbecher: "Einzelbecher",
  mittelbecher: "Mittelbecher",
};

export function formationLabel(formation: string | null): string | null {
  return formation && formation in formationLabels ? formationLabels[formation as Formation] : null;
}

export type VolumeUnit = "Würfe" | "Runden" | "Versuche";

export interface DrillSection {
  label: string;
  volume: number;
  formation: Formation;
}

export interface Drill {
  id: number;
  name: string;
  /** Kurzname für Listen */
  short: string;
  description: string;
  type: DrillType;
  partner: boolean;
  /** Standardumfang laut Plan; null = läuft im Spiel mit */
  defaultVolume: number | null;
  unit: VolumeUnit | null;
  metric: string;
  formation: Formation | null;
  sections?: DrillSection[];
  automation: Automation;
  trackerNote: string;
}

export const drillTypes: Record<DrillType, { name: string; description: string }> = {
  A: {
    name: "Feste Anzahl",
    description: "Ein Werfer, Kamera zählt Treffer, Wurfzahl kommt aus dem Plan.",
  },
  B: {
    name: "Partner-Runden",
    description: "Zwei Ballfarben, Kamera ordnet Treffer zu und erkennt Doppeltreffer.",
  },
  C: {
    name: "Bis zum Fehlwurf",
    description: "Kamera zählt Treffer, ein Tap beendet den Versuch.",
  },
  D: {
    name: "Zähler",
    description: "Ein Knopf pro Runde, optional.",
  },
  E: {
    name: "Nicht gemessen",
    description: "Nur als Checkliste.",
  },
};

export const drills: Drill[] = [
  {
    id: 1,
    name: "Same-Cup (Partner)",
    short: "Same-Cup",
    description: "Beide nennen denselben Becher und werfen darauf.",
    type: "B",
    partner: true,
    defaultVolume: 20,
    unit: "Runden",
    metric: "Doppeltreffer-Quote",
    formation: "pyramide-10",
    automation: "auto",
    trackerNote: "Mit zwei Ballfarben. Automatischer Vergleich mit p².",
  },
  {
    id: 2,
    name: "Einzelbecher-Präzision",
    short: "Einzelbecher",
    description: "Ein Becher, blockweise.",
    type: "A",
    partner: false,
    defaultVolume: 50,
    unit: "Würfe",
    metric: "Grundquote p",
    formation: "einzelbecher",
    automation: "auto",
    trackerNote: "Ball nach Treffer rausnehmen.",
  },
  {
    id: 3,
    name: "Mittelbecher",
    short: "Mittelbecher",
    description: "Ein Becher zentral, Gentleman's-Position (5.4).",
    type: "A",
    partner: false,
    defaultVolume: 30,
    unit: "Würfe",
    metric: "Matchball-Quote",
    formation: "mittelbecher",
    automation: "auto",
    trackerNote: "",
  },
  {
    id: 4,
    name: "Routine-Einschleifen",
    short: "Routine",
    description: "Identische Vor-Wurf-Routine.",
    type: "A",
    partner: false,
    defaultVolume: 40,
    unit: "Würfe",
    metric: "Konsistenz",
    formation: "pyramide-10",
    automation: "teilweise",
    trackerNote: "Quote ja. Routine-Konsistenz erst mit Wurferkennung.",
  },
  {
    id: 5,
    name: "Quiet Eye",
    short: "Quiet Eye",
    description: "Bewusst 1–2 s den hinteren Becherrand fixieren.",
    type: "A",
    partner: false,
    defaultVolume: 30,
    unit: "Würfe",
    metric: "Fixierdisziplin",
    formation: "einzelbecher",
    automation: "auto",
    trackerNote: "Auswertung: Quote gegen Drill 2.",
  },
  {
    id: 6,
    name: "Restbild",
    short: "Restbild",
    description: "Je 20 Würfe auf 6er-Pyramide, 4er-Raute und 3er-Pyramide.",
    type: "A",
    partner: false,
    defaultVolume: 60,
    unit: "Würfe",
    metric: "Umstell-Formationen",
    formation: null,
    sections: [
      { label: "6er-Pyramide", volume: 20, formation: "pyramide-6" },
      { label: "4er-Raute", volume: 20, formation: "raute-4" },
      { label: "3er-Pyramide", volume: 20, formation: "pyramide-3" },
    ],
    automation: "auto",
    trackerNote: "Becher je Formation neu antippen. Quote pro Formation.",
  },
  {
    id: 7,
    name: "Aufsetzer",
    short: "Aufsetzer",
    description: "Flach, Aufsetzpunkt vor dem vordersten Becher.",
    type: "A",
    partner: false,
    defaultVolume: 30,
    unit: "Würfe",
    metric: "Quote b gegen die 36-%-Schwelle",
    formation: "pyramide-10",
    automation: "auto",
    trackerNote: "Treffer automatisch. Ob wirklich aufgesetzt, sieht die Kamera nicht.",
  },
  {
    id: 8,
    name: "Trickshot",
    short: "Trickshot",
    description: "Der gewählte Shot: hinter dem Rücken oder durch die Beine.",
    type: "A",
    partner: false,
    defaultVolume: 20,
    unit: "Würfe",
    metric: "Bonuswurf-Quote",
    formation: "pyramide-10",
    automation: "auto",
    trackerNote: "",
  },
  {
    id: 9,
    name: "Serien-Drill",
    short: "Serien",
    description: "Wie viele Treffer in Folge ohne Fehlwurf?",
    type: "C",
    partner: false,
    defaultVolume: 5,
    unit: "Versuche",
    metric: "Gentleman's-Fähigkeit",
    formation: "pyramide-10",
    automation: "auto",
    trackerNote: "Ein Tap pro Fehlwurf. Hot-Hand-Check gegen Einzelquote.",
  },
  {
    id: 10,
    name: "Rollback (Partner)",
    short: "Rollback",
    description: "Doppeltreffer + Nachwurf, Kette so lang wie möglich.",
    type: "B",
    partner: true,
    defaultVolume: 10,
    unit: "Runden",
    metric: "Momentum",
    formation: "pyramide-10",
    automation: "teilweise",
    trackerNote: "Kettenlogik „Bälle zurück“ nach Doppeltreffer.",
  },
  {
    id: 11,
    name: "Druck",
    short: "Druck",
    description: "Musik, Trash Talk, Konsequenz bei Fehlwurf.",
    type: "A",
    partner: false,
    defaultVolume: 30,
    unit: "Würfe",
    metric: "Druckresistenz",
    formation: "pyramide-10",
    automation: "auto",
    trackerNote: "Druckabfall gegen Normalquote. Soundboard als Extra.",
  },
  {
    id: 12,
    name: "Ball-Aufmerksamkeit (Partner)",
    short: "Ball-Aufmerksamkeit",
    description: "Partner wirft, zurückrollende Bälle fangen.",
    type: "D",
    partner: true,
    defaultVolume: 15,
    unit: "Runden",
    metric: "Bonuswürfe nicht verschenken",
    formation: null,
    automation: "tap",
    trackerNote: "Nur wenn jemand tippt.",
  },
  {
    id: 13,
    name: "Umstell-Timing (Partner)",
    short: "Umstell-Timing",
    description: "Becher zählen und vor dem Wurf entscheiden.",
    type: "E",
    partner: true,
    defaultVolume: null,
    unit: null,
    metric: "Regel 5.2",
    formation: null,
    automation: "nein",
    trackerNote: "Läuft im Spiel mit.",
  },
  {
    id: 14,
    name: "Fremdbedingungen",
    short: "Fremdbedingungen",
    description: "Nasse Bälle, fremde Bälle, andere Tischhöhe.",
    type: "A",
    partner: false,
    defaultVolume: 20,
    unit: "Würfe",
    metric: "Anpassung",
    formation: "pyramide-10",
    automation: "teilweise",
    trackerNote: "Bedingung auswählen. Fremde Bälle: Farbe neu kalibrieren.",
  },
];

const drillsById = new Map(drills.map((drill) => [drill.id, drill]));

export function getDrill(id: number): Drill {
  const drill = drillsById.get(id);
  if (!drill) throw new Error(`Unbekannter Drill: ${id}`);
  return drill;
}

export interface Target {
  metric: string;
  drillId: number;
  start: string;
  week3: string;
  ready: string;
}

export const targets: Target[] = [
  { metric: "Einzelbecher", drillId: 2, start: "30–40 %", week3: "45–50 %", ready: "55–65 %" },
  { metric: "Same-Cup-Doppeltreffer", drillId: 1, start: "10–15 %", week3: "22 %", ready: "30 %+" },
  { metric: "Mittelbecher", drillId: 3, start: "30–40 %", week3: "50 %", ready: "60 %+" },
  { metric: "Aufsetzer", drillId: 7, start: "10–15 %", week3: "25 %", ready: "36 %" },
  { metric: "Trickshot", drillId: 8, start: "0 %", week3: "12 %", ready: "15–20 %" },
  { metric: "Längste Serie", drillId: 9, start: "1–2", week3: "3", ready: "4+" },
];
