import { describe, expect, it } from "vitest";
import {
  type DetectedThrow,
  type ThrowMark,
  compareThrows,
  defaultMatchWindow,
  rateThrows,
} from "./evaluation.ts";

/**
 * Drei markierte Würfe, wie sie auch in einer Markierungsdatei stehen könnten:
 * zwei von links, einer von rechts.
 */
const marks: ThrowMark[] = [
  { at: 3.4, side: "links" },
  { at: 5.4, side: "rechts" },
  { at: 16.5, side: "links" },
];

/** Baut einen erkannten Wurf; die Nummer zählt hoch wie in der Auswertung. */
function detected(list: Array<[number, "links" | "rechts"]>): DetectedThrow[] {
  return list.map(([at, side], index) => ({ nr: index + 1, at, side }));
}

describe("compareThrows: Markierungen und erkannte Würfe einander zuordnen", () => {
  it("ordnet alle Würfe zu, wenn die Erkennung vollständig ist", () => {
    // Leicht daneben liegende Zeitpunkte sind der Normalfall: Von Hand markiert
    // wird auf eine Zehntelsekunde genau, erkannt wird der erste gesehene Punkt.
    const comparison = compareThrows(marks, detected([
      [3.46, "links"],
      [5.38, "rechts"],
      [16.62, "links"],
    ]));

    expect(comparison.matches).toHaveLength(3);
    expect(comparison.missed).toEqual([]);
    expect(comparison.extra).toEqual([]);
    expect(comparison.matches.every((match) => match.sideCorrect)).toBe(true);
    expect(comparison.matches[0].offset).toBeCloseTo(0.06, 6);
    expect(comparison.matches[1].offset).toBeCloseTo(-0.02, 6);

    const score = rateThrows(comparison);
    expect(score.recall.value).toBe(1);
    expect(score.sideAccuracy.value).toBe(1);
    expect(score.falseAlarms.value).toBe(0);
    expect(score.passed).toBe(true);
  });

  it("nennt einen verpassten Wurf mit seinem markierten Zeitpunkt", () => {
    const comparison = compareThrows(marks, detected([
      [3.4, "links"],
      [16.5, "links"],
    ]));

    expect(comparison.matches).toHaveLength(2);
    expect(comparison.missed.map((mark) => mark.at)).toEqual([5.4]);
    expect(comparison.extra).toEqual([]);

    const score = rateThrows(comparison);
    expect(score.recall.value).toBeCloseTo(2 / 3, 6);
    expect(score.recall.passed).toBe(false);
    // Was erkannt wurde, stimmt trotzdem — die beiden Kennzahlen sind getrennt.
    expect(score.sideAccuracy.value).toBe(1);
    expect(score.passed).toBe(false);
  });

  it("nennt einen erfundenen Wurf mit seiner Nummer und seinem Zeitpunkt", () => {
    const comparison = compareThrows(marks, detected([
      [3.4, "links"],
      [5.4, "rechts"],
      [9.8, "links"],
      [16.5, "links"],
    ]));

    expect(comparison.matches).toHaveLength(3);
    expect(comparison.missed).toEqual([]);
    expect(comparison.extra).toHaveLength(1);
    expect(comparison.extra[0].at).toBe(9.8);
    expect(comparison.extra[0].nr).toBe(3);

    const score = rateThrows(comparison);
    expect(score.recall.value).toBe(1);
    // Ein Fehlalarm auf drei Markierungen sind rund 33 je 100 Würfe.
    expect(score.falseAlarms.value).toBeCloseTo(100 / 3, 6);
    expect(score.falseAlarms.passed).toBe(false);
    expect(score.passed).toBe(false);
  });

  it("zählt einen Wurf mit verwechselter Seite als erkannt, aber falsch zugeordnet", () => {
    const comparison = compareThrows(marks, detected([
      [3.4, "links"],
      [5.4, "links"],
      [16.5, "links"],
    ]));

    expect(comparison.matches).toHaveLength(3);
    expect(comparison.missed).toEqual([]);
    expect(comparison.extra).toEqual([]);
    expect(comparison.matches[1].sideCorrect).toBe(false);

    const score = rateThrows(comparison);
    // Erkannt ist er — nur eben dem falschen Werfer zugeordnet.
    expect(score.recall.value).toBe(1);
    expect(score.recall.passed).toBe(true);
    expect(score.sideAccuracy.value).toBeCloseTo(2 / 3, 6);
    expect(score.sideAccuracy.passed).toBe(false);
    expect(score.passed).toBe(false);
  });

  it("vergibt einen erkannten Wurf nicht zweimal, wenn zwei Markierungen dicht beieinanderliegen", () => {
    // Beide Markierungen liegen im Fenster desselben erkannten Wurfs. Er darf
    // nur die nähere abdecken; die andere ist verpasst.
    const dicht: ThrowMark[] = [
      { at: 10.0, side: "links" },
      { at: 10.3, side: "rechts" },
    ];
    const comparison = compareThrows(dicht, detected([[10.08, "links"]]));

    expect(comparison.matches).toHaveLength(1);
    expect(comparison.matches[0].mark.at).toBe(10.0);
    expect(comparison.missed.map((mark) => mark.at)).toEqual([10.3]);
    expect(rateThrows(comparison).recall.value).toBe(0.5);
  });

  it("gibt zwei dicht beieinanderliegenden Markierungen je den näheren Wurf", () => {
    const dicht: ThrowMark[] = [
      { at: 10.0, side: "links" },
      { at: 10.3, side: "rechts" },
    ];
    // Beide Erkennungen lägen im Fenster beider Markierungen; entscheidend ist,
    // dass die engsten Paare zuerst festgemacht werden.
    const comparison = compareThrows(dicht, detected([
      [10.05, "links"],
      [10.32, "rechts"],
    ]));

    expect(comparison.matches.map((match) => [match.mark.at, match.detected.at])).toEqual([
      [10.0, 10.05],
      [10.3, 10.32],
    ]);
    expect(comparison.missed).toEqual([]);
    expect(comparison.extra).toEqual([]);
  });

  it("ordnet nichts zu, was außerhalb des Zeitfensters liegt", () => {
    const spaet = detected([[4.1, "links"]]);

    expect(compareThrows([marks[0]], spaet, 0.5).matches).toHaveLength(0);
    expect(compareThrows([marks[0]], spaet, 1).matches).toHaveLength(1);
    // Der Standardwert ist die halbe Sekunde aus der Begründung in evaluation.ts.
    expect(defaultMatchWindow).toBe(0.5);
    expect(compareThrows([marks[0]], spaet).matches).toHaveLength(0);
  });

  it("macht aus einer leeren Markierungsliste lauter Fehlalarme statt einer Bestnote", () => {
    const comparison = compareThrows([], detected([[3.4, "links"]]));

    expect(comparison.matches).toEqual([]);
    expect(comparison.missed).toEqual([]);
    expect(comparison.extra).toHaveLength(1);

    const score = rateThrows(comparison);
    expect(score.marks).toBe(0);
    // Ohne Markierung gibt es keinen Anteil — nicht 100 %, sondern keine Zahl.
    expect(score.recall.value).toBeNull();
    expect(score.sideAccuracy.value).toBeNull();
    expect(score.falseAlarms.value).toBeNull();
    expect(score.passed).toBe(false);
  });

  it("zählt bei leerer Erkennung jede Markierung als verpasst", () => {
    const comparison = compareThrows(marks, []);

    expect(comparison.matches).toEqual([]);
    expect(comparison.missed).toHaveLength(3);
    expect(comparison.extra).toEqual([]);

    const score = rateThrows(comparison);
    expect(score.recall.value).toBe(0);
    expect(score.recall.passed).toBe(false);
    // Keine Zuordnung, also auch kein Anteil richtiger Seiten.
    expect(score.sideAccuracy.value).toBeNull();
    expect(score.falseAlarms.value).toBe(0);
    expect(score.passed).toBe(false);
  });

  it("nimmt Markierungen und Erkennungen in beliebiger Reihenfolge an", () => {
    const unsortiert: ThrowMark[] = [marks[2], marks[0], marks[1]];
    const comparison = compareThrows(unsortiert, detected([
      [16.5, "links"],
      [3.4, "links"],
      [5.4, "rechts"],
    ]));

    expect(comparison.matches.map((match) => match.mark.at)).toEqual([3.4, 5.4, 16.5]);
    expect(rateThrows(comparison).passed).toBe(true);
  });
});

describe("rateThrows: die Messlatte aus der Spec", () => {
  it("besteht bei 95 von 100 erkannten Würfen und scheitert bei 94", () => {
    const hundert: ThrowMark[] = Array.from({ length: 100 }, (_, index) => ({
      at: index * 5,
      side: index % 2 === 0 ? "links" : "rechts",
    }));
    const found = (count: number): DetectedThrow[] =>
      hundert.slice(0, count).map((mark, index) => ({ nr: index + 1, at: mark.at, side: mark.side }));

    expect(rateThrows(compareThrows(hundert, found(95))).recall.passed).toBe(true);
    expect(rateThrows(compareThrows(hundert, found(94))).recall.passed).toBe(false);

    // Ein Fehlalarm auf 100 Würfe ist erlaubt, zwei nicht mehr.
    const einer = [...found(100), { nr: 101, at: 2.5, side: "links" as const }];
    const zwei = [...einer, { nr: 102, at: 7.5, side: "links" as const }];
    expect(rateThrows(compareThrows(hundert, einer)).falseAlarms.passed).toBe(true);
    expect(rateThrows(compareThrows(hundert, zwei)).falseAlarms.passed).toBe(false);
  });
});
