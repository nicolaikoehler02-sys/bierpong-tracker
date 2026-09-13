// 5-Wochen-Plan aus bierpong-trainingsplan.md (Teil 7).

export const TOURNAMENT_DATE = "2026-10-17";

export type PlanItem =
  | { kind: "drill"; drillId: number; volume?: number; note?: string }
  | { kind: "text"; text: string };

export interface PlanSession {
  /** z. B. "w2-s1" */
  id: string;
  label: string;
  /** Nur in Woche 5 fest terminiert */
  date?: string;
  partner: boolean;
  items: PlanItem[];
}

export interface PlanWeek {
  week: number;
  title: string;
  start: string;
  end: string;
  goal: string;
  sessions: PlanSession[];
}

const drill = (drillId: number, volume?: number, note?: string): PlanItem => ({
  kind: "drill",
  drillId,
  volume,
  note,
});
const text = (value: string): PlanItem => ({ kind: "text", text: value });

export const weeks: PlanWeek[] = [
  {
    week: 1,
    title: "Fundament + Same-Cup-Umstellung",
    start: "2026-09-14",
    end: "2026-09-20",
    goal: "Routine sitzt. Einzelbecher ≥ 35–40 %. Same-Cup-Prinzip ist Gewohnheit.",
    sessions: [
      {
        id: "w1-s1",
        label: "S1",
        partner: false,
        items: [text("Aufwärmen"), drill(2, 50), drill(4, 40), drill(3, 30), text("Baseline notieren")],
      },
      {
        id: "w1-s2",
        label: "S2",
        partner: false,
        items: [drill(5, 30), drill(2, 50), drill(8, 20, "Trickshot festlegen")],
      },
      {
        id: "w1-s3",
        label: "S3",
        partner: true,
        items: [drill(1, 20), drill(12, 15), drill(3, 30)],
      },
      {
        id: "w1-s4",
        label: "S4",
        partner: false,
        items: [drill(2, 50), drill(3, 30), text("Technikkontrolle von der Seite")],
      },
    ],
  },
  {
    week: 2,
    title: "Präzision + Aufsetzer-Test",
    start: "2026-09-21",
    end: "2026-09-27",
    goal: "Einzelbecher ≥ 45 %. Am Wochenende: Aufsetzer behalten (> ~30 %) oder reduzieren.",
    sessions: [
      { id: "w2-s1", label: "S1", partner: false, items: [drill(2, 50), drill(7, 30), drill(3, 30)] },
      { id: "w2-s2", label: "S2", partner: false, items: [drill(5, 30), drill(7, 30), drill(8, 20)] },
      { id: "w2-s3", label: "S3", partner: true, items: [drill(1, 20), drill(10, 10), drill(12, 15)] },
      { id: "w2-s4", label: "S4", partner: false, items: [drill(2, 40), drill(3, 30), drill(8, 20)] },
    ],
  },
  {
    week: 3,
    title: "Formationen, Serien, Rollen",
    start: "2026-09-28",
    end: "2026-10-04",
    goal: "Umstell-Kommunikation ohne Diskussion. Einzelbecher ≥ 50 %, Same-Cup ≥ 22 %. Rollen nach Zahlen festlegen.",
    sessions: [
      { id: "w3-s1", label: "S1", partner: false, items: [drill(6, 60), drill(3, 30)] },
      { id: "w3-s2", label: "S2", partner: false, items: [drill(9, 5), drill(6, 60), drill(3, 30)] },
      {
        id: "w3-s3",
        label: "S3",
        partner: true,
        items: [drill(1, 20), drill(13), text("Übungsspiele mit vollem Regelwerk")],
      },
      {
        id: "w3-s4",
        label: "S4",
        partner: true,
        items: [text("Vollständige Spiele"), text("3er-Pyramide / Verlängerung üben"), drill(9, 5)],
      },
    ],
  },
  {
    week: 4,
    title: "Druck und Turniersimulation (Peak)",
    start: "2026-10-05",
    end: "2026-10-11",
    goal: "Druckquote maximal 5–10 % unter der Normalquote. Höchstes Wochenvolumen.",
    sessions: [
      { id: "w4-s1", label: "S1", partner: false, items: [drill(11, 30), drill(9, 5), drill(3, 30)] },
      { id: "w4-s2", label: "S2", partner: false, items: [drill(6, 60), drill(11, 30), drill(1, 20)] },
      {
        id: "w4-s3",
        label: "S3",
        partner: true,
        items: [text("Vollspiele mit Lärm und Zuschauern"), text("Gentleman's Wurf und Verlängerung durchspielen")],
      },
      {
        id: "w4-s4",
        label: "S4",
        partner: true,
        items: [text("Turniertag light: 5–6 Spiele hintereinander"), drill(14, 20)],
      },
    ],
  },
  {
    week: 5,
    title: "Taper",
    start: "2026-10-12",
    end: "2026-10-16",
    goal: "Volumen auf 40–50 %, Qualität hoch. Frisch ankommen.",
    sessions: [
      {
        id: "w5-mo",
        label: "Mo",
        date: "2026-10-12",
        partner: false,
        items: [drill(2, 30), drill(5), drill(3, 30)],
      },
      {
        id: "w5-mi",
        label: "Mi",
        date: "2026-10-14",
        partner: true,
        items: [drill(1), text("Kurze Gentleman's-Simulation"), drill(3)],
      },
      {
        id: "w5-do",
        label: "Do",
        date: "2026-10-15",
        partner: false,
        items: [text("30–40 lockere Würfe, nur Routine")],
      },
      {
        id: "w5-fr",
        label: "Fr",
        date: "2026-10-16",
        partner: false,
        items: [text("15 Minuten lockeres Einwerfen. Früh schlafen.")],
      },
    ],
  },
];

export function weekForDate(isoDate: string): PlanWeek | undefined {
  return weeks.find((week) => week.start <= isoDate && isoDate <= week.end);
}

export function nextWeekAfter(isoDate: string): PlanWeek | undefined {
  return weeks.find((week) => week.start > isoDate);
}
