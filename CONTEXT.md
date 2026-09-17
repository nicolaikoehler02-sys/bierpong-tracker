# Bierpong-Tracker

Kamera-gestützte Erfassung und Analyse von Bierpong-Würfen. Dieses Dokument ist ausschließlich ein Glossar: Es legt fest, welches Wort für welchen Begriff benutzt wird — in Code, Issues, Specs und Gesprächen.

## Spielgeschehen

**Wurf**:
Ein einzelner Ballwurf eines Werfers auf die gegnerischen Becher.
_Vermeide_: Schuss, Versuch, Throw

**Werfer**:
Die Person, die einen Wurf ausführt. Bei uns Jakob oder Nicolai.
_Vermeide_: Spieler (mehrdeutig: Person vs. Partei), Nutzer

**Treffer**:
Ein Wurf, bei dem der Ball in einem Becher liegen bleibt.
_Vermeide_: Punkt, Score, Hit

**Fehlwurf**:
Ein Wurf, der in keinem Becher landet.
_Vermeide_: Miss, Daneben, Fehlschuss

**Aufsetzer**:
Ein Wurf, der vor dem Becher auf der Tischplatte aufkommt und erst dann im Becher landet. Bringt nach Regelwerk den getroffenen Becher plus einen frei gewählten.
_Vermeide_: Bounce, Abpraller

**Becher**:
Ein einzelner Becher im Aufbau des Gegners. Wird über seine Position in der Formation benannt, nicht über die Reihenfolge der Kalibrierung.
_Vermeide_: Cup, Glas

**Formation**:
Die Anordnung der noch stehenden Becher: 10er-Pyramide, 6er-Pyramide, 4er-Raute, 3er-Pyramide, Einzelbecher, Mittelbecher.
_Vermeide_: Aufbau, Muster, Layout

**Umstellen**:
Das regelkonforme Neuanordnen der eigenen Becher in eine andere Formation, zweimal pro Team und Spiel.
_Vermeide_: Umbauen, Rearrange

**Serie**:
Mehrere Treffer eines Werfers hintereinander ohne Fehlwurf dazwischen.
_Vermeide_: Streak, Lauf

## Ablauf

**Spiel**:
Eine Partie nach Regelwerk 2025, bei uns 1 gegen 1 mit zwei Würfen pro Zug, bis eine Seite keine Becher mehr hat.
_Vermeide_: Match, Runde, Game

**Zug**:
Die zusammenhängenden Würfe eines Werfers, bevor der Gegner wirft. Bei uns zwei Würfe.
_Vermeide_: Runde, Turn

**Drill**:
Eine Übungsform aus dem Trainingsplan mit festem Umfang und einer Messgröße, zum Beispiel Einzelbecher-Präzision.
_Vermeide_: Übung, Exercise

**Drill-Block**:
Die einmalige Durchführung eines Drills durch einen Werfer, mit bestätigter Wurfzahl.
_Vermeide_: Set, Durchgang

**Einheit**:
Ein Trainingstermin, der mehrere Drill-Blöcke oder Spiele enthält.
_Vermeide_: Session, Training

## Erfassung

**Deckenkamera**:
Die Kamera senkrecht über den Bechern. Beantwortet, in welchem Becher ein Ball liegt.
_Vermeide_: Hauptkamera, Top-Kamera

**Seitenkamera**:
Die Kamera seitlich neben dem Tisch mit Blick auf die ganze Tischlänge. Beantwortet, wann und von wem geworfen wurde und wie der Ball geflogen ist.
_Vermeide_: Zweitkamera, Side-Cam

**Flugbahn**:
Der Weg des Balls vom Abwurf bis zum Aufkommen, mit Abwurfpunkt, Bogenhöhe, Geschwindigkeit und Auftreffwinkel.
_Vermeide_: Trajektorie, Kurve, Trajectory

**Ereignis**:
Eine einzelne erfasste Tatsache mit Zeitpunkt, zum Beispiel ein Treffer der Deckenkamera oder ein Wurf der Seitenkamera.
_Vermeide_: Event-Log-Eintrag, Datensatz

**Aufnahme**:
Ein aufgezeichnetes Video einer Einheit, das später ausgewertet wird, statt live analysiert zu werden.
_Vermeide_: Clip, Mitschnitt, Recording

**Leer-Referenz**:
Das Bild der leeren, kalibrierten Becher, gegen das die Deckenkamera jedes spätere Bild vergleicht.
_Vermeide_: Baseline, Referenzbild, Hintergrundbild
