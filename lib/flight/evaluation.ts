import type { ThrowerSide } from "./types.ts";

/**
 * Die Erkennung gegen von Hand markierte Würfe halten.
 *
 * Reine Rechenlogik: Markierungen und erkannte Würfe hinein, Zuordnung und
 * Kennzahlen heraus. Kein Dateizugriff, kein ffmpeg, keine Ausgabe — deshalb
 * liegt sie neben dem Erkennungskern und ist genauso getestet. Das
 * Bewertungsskript (`scripts/bewerten.ts`) ist nur die dünne Schale darum, und
 * eine spätere Browser-Seite könnte dieselbe Funktion aufrufen.
 */

/**
 * Ein von Hand markierter Wurf — eine Zeile aus der Markierungsdatei.
 *
 * Bewusst wenige Felder: Zeitpunkt und Seite sind alles, was von Hand zuverlässig
 * zu erfassen ist. `bounce` und `note` sind freiwillig und bleiben hier ohne
 * Wirkung; `bounce` ist der Platz für die Aufsetzer-Kennzahl, die mit der
 * Aufsetzer-Erkennung dazukommt.
 */
export interface ThrowMark {
  /** Zeitpunkt des Abwurfs in der Aufnahme in Sekunden */
  at: number;
  /** Seite des Werfers, von Hand abgelesen */
  side: ThrowerSide;
  /** Freiwillig: War der Wurf ein Aufsetzer? Wird noch nicht ausgewertet. */
  bounce?: boolean;
  /** Freiwillig: Notiz für den Menschen, zum Beispiel „Ball kurz verdeckt“ */
  note?: string;
}

/**
 * Ein erkannter Wurf, auf das reduziert, was für den Vergleich zählt.
 *
 * Absichtlich nicht `Throw` selbst: Verglichen wird über Zeitpunkt und Seite,
 * und so lässt sich dieselbe Funktion auch gegen eine ältere Auswertungsdatei
 * laufen, in der noch nicht alle Kennzahlen stehen.
 */
export interface DetectedThrow {
  /** Laufende Nummer aus der Auswertung — damit der Wurf im Overlay wiederzufinden ist */
  nr: number;
  /** Zeitpunkt des Abwurfs in Sekunden (`startedAt` eines erkannten Wurfs) */
  at: number;
  side: ThrowerSide;
}

/** Eine Markierung und der erkannte Wurf, der zu ihr gehört. */
export interface ThrowMatch {
  mark: ThrowMark;
  detected: DetectedThrow;
  /** Erkannt minus markiert in Sekunden — negativ heißt: die Erkennung war früher */
  offset: number;
  /** Stimmt die Seite der Erkennung mit der markierten überein? */
  sideCorrect: boolean;
}

/** Das Ergebnis der Zuordnung: was zusammengehört, was fehlt, was zu viel ist. */
export interface ThrowComparison {
  /** Zugeordnete Paare, nach markiertem Zeitpunkt aufsteigend */
  matches: ThrowMatch[];
  /** Markierte Würfe ohne Erkennung — die verpassten */
  missed: ThrowMark[];
  /** Erkannte Würfe ohne Markierung — die Fehlalarme */
  extra: DetectedThrow[];
  /** Das Zeitfenster, mit dem zugeordnet wurde, in Sekunden */
  window: number;
}

/**
 * Standard-Zeitfenster der Zuordnung in Sekunden.
 *
 * Die Begründung liegt zwischen zwei Größen. Nach unten: Von Hand wird auf ein
 * Videobild genau markiert, wenn man sich Mühe gibt — in der Praxis eher auf
 * eine Zehntelsekunde, und der erkannte Abwurfzeitpunkt ist der erste *gesehene*
 * Punkt der Flugbahn und liegt damit systematisch ein paar Bilder nach dem
 * wahren Abwurf. Beides zusammen sind gut zwei Zehntel. Nach oben: Beim 1 gegen
 * 1 liegen zwei Würfe eines Zugs mehrere Sekunden auseinander. Eine halbe
 * Sekunde ist deutlich über der Ungenauigkeit und deutlich unter dem Abstand
 * zweier Würfe — sie verzeiht das Markieren, ohne Nachbarwürfe zu verwechseln.
 */
export const defaultMatchWindow = 0.5;

/** Die Messlatte aus der Spec, gegen die jede Auswertung gehalten wird. */
export const flightBenchmark = {
  /** Mindestens 95 von 100 markierten Würfen müssen erkannt werden */
  recall: 0.95,
  /** Mindestens 98 % der erkannten Würfe müssen der richtigen Seite zugeordnet sein */
  sideAccuracy: 0.98,
  /** Höchstens 1 Fehlalarm je 100 markierter Würfe */
  falseAlarmsPer100: 1,
  // Die vierte Zahl der Messlatte — mindestens 90 % der Aufsetzer erkannt —
  // fehlt hier, solange der Kern keine Aufsetzer meldet. Der Platz dafür ist in
  // `ThrowMark.bounce` schon vorgesehen.
} as const;

/**
 * Ordnet erkannte Würfe den Handmarkierungen zu.
 *
 * Zwei Würfe gehören zusammen, wenn ihre Zeitpunkte höchstens `window` Sekunden
 * auseinanderliegen. Zugeordnet wird von innen nach außen: Das zeitlich engste
 * Paar wird zuerst festgemacht, dann das nächstengste, und jede Markierung wie
 * jeder erkannte Wurf ist danach vergeben. So kann ein einzelner erkannter Wurf
 * nie zwei dicht beieinanderliegende Markierungen gleichzeitig abdecken — genau
 * der Fall, in dem eine naive Zuordnung die Erkennung besser aussehen ließe,
 * als sie ist.
 *
 * Die Seite spielt bei der Zuordnung ausdrücklich keine Rolle: Ein Wurf mit
 * verwechselter Seite ist erkannt, nur eben falsch zugeordnet. Sonst würde
 * derselbe Fehler zweimal zählen — als verpasster Wurf und als Fehlalarm — und
 * die Kennzahlen wären nicht mehr auseinanderzuhalten.
 */
export function compareThrows(
  marks: readonly ThrowMark[],
  detected: readonly DetectedThrow[],
  window: number = defaultMatchWindow,
): ThrowComparison {
  const sortedMarks = [...marks].sort((a, b) => a.at - b.at);
  const sortedDetected = [...detected].sort((a, b) => a.at - b.at || a.nr - b.nr);

  // Alle überhaupt möglichen Paare, das engste zuerst. Bei gleichem Abstand
  // entscheidet die Reihenfolge, damit dasselbe Material immer dasselbe
  // Ergebnis liefert.
  const options: Array<{ markIndex: number; detectedIndex: number; distance: number }> = [];
  sortedMarks.forEach((mark, markIndex) => {
    sortedDetected.forEach((found, detectedIndex) => {
      const distance = Math.abs(found.at - mark.at);
      if (distance <= window) options.push({ markIndex, detectedIndex, distance });
    });
  });
  options.sort(
    (a, b) =>
      a.distance - b.distance || a.markIndex - b.markIndex || a.detectedIndex - b.detectedIndex,
  );

  const takenMarks = new Set<number>();
  const takenDetected = new Set<number>();
  const matches: ThrowMatch[] = [];
  for (const option of options) {
    if (takenMarks.has(option.markIndex) || takenDetected.has(option.detectedIndex)) continue;
    takenMarks.add(option.markIndex);
    takenDetected.add(option.detectedIndex);

    const mark = sortedMarks[option.markIndex];
    const found = sortedDetected[option.detectedIndex];
    matches.push({
      mark,
      detected: found,
      offset: found.at - mark.at,
      sideCorrect: found.side === mark.side,
    });
  }

  matches.sort((a, b) => a.mark.at - b.mark.at);
  return {
    matches,
    missed: sortedMarks.filter((_, index) => !takenMarks.has(index)),
    extra: sortedDetected.filter((_, index) => !takenDetected.has(index)),
    window,
  };
}

/** Eine Kennzahl der Messlatte mit ihrem Sollwert und dem Urteil. */
export interface BenchmarkCheck {
  /** Der gemessene Wert — `null`, wenn er sich nicht bilden lässt (Teilung durch 0) */
  value: number | null;
  /** Der Sollwert aus der Spec */
  target: number;
  /** Bestanden? Ein Wert, der sich nicht bilden lässt, gilt nie als bestanden. */
  passed: boolean;
}

/** Die Kennzahlen einer Aufnahme samt Urteil gegen die Messlatte. */
export interface ThrowScore {
  /** Anzahl der Handmarkierungen */
  marks: number;
  /** Anzahl der erkannten Würfe */
  detections: number;
  /** Zugeordnete Paare */
  matched: number;
  /** Zugeordnete Paare mit richtiger Seite */
  sideCorrect: number;
  /** Markierte Würfe ohne Erkennung */
  missed: number;
  /** Erkannte Würfe ohne Markierung */
  extra: number;

  /** Anteil erkannter Würfe (0–1) */
  recall: BenchmarkCheck;
  /** Anteil richtig zugeordneter Seiten unter den erkannten Würfen (0–1) */
  sideAccuracy: BenchmarkCheck;
  /** Fehlalarme je 100 markierter Würfe */
  falseAlarms: BenchmarkCheck;

  /** Alle drei Kennzahlen bestanden? */
  passed: boolean;
}

/**
 * Rechnet aus der Zuordnung die drei Kennzahlen der Messlatte aus.
 *
 * Fehlt der Nenner — keine Markierung, kein zugeordneter Wurf —, bleibt die
 * Kennzahl `null` statt 0 oder 100 %: Eine Aufnahme ohne Markierungen ist nicht
 * zu 100 % erkannt, sondern gar nicht bewertet. Bestanden ist sie damit auch
 * nicht.
 */
export function rateThrows(comparison: ThrowComparison): ThrowScore {
  const marks = comparison.matches.length + comparison.missed.length;
  const matched = comparison.matches.length;
  const sideCorrect = comparison.matches.filter((match) => match.sideCorrect).length;
  const extra = comparison.extra.length;

  const recall = check(marks > 0 ? matched / marks : null, flightBenchmark.recall, atLeast);
  const sideAccuracy = check(
    matched > 0 ? sideCorrect / matched : null,
    flightBenchmark.sideAccuracy,
    atLeast,
  );
  const falseAlarms = check(
    marks > 0 ? (extra / marks) * 100 : null,
    flightBenchmark.falseAlarmsPer100,
    atMost,
  );

  return {
    marks,
    detections: matched + extra,
    matched,
    sideCorrect,
    missed: comparison.missed.length,
    extra,
    recall,
    sideAccuracy,
    falseAlarms,
    passed: recall.passed && sideAccuracy.passed && falseAlarms.passed,
  };
}

function check(
  value: number | null,
  target: number,
  passes: (value: number, target: number) => boolean,
): BenchmarkCheck {
  return { value, target, passed: value !== null && passes(value, target) };
}

function atLeast(value: number, target: number): boolean {
  return value >= target;
}

function atMost(value: number, target: number): boolean {
  return value <= target;
}
