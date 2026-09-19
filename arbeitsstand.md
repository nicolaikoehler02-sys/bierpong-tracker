# Bierpong-Tracker — Arbeitsstand

*Stand: Freitag, 18. September 2026 · beim Weitermachen zuerst diese Datei lesen*

---

## Wo das Projekt steht

Das Projekt wurde am 17./18.09. **neu ausgerichtet**. Der ursprüngliche Zweck (Trainingsplan messbar machen) hat sich in der Praxis nicht gehalten: In Woche 1 wurde nicht nach Plan trainiert und kein einziger Wurf erfasst. Gespielt wird **1 gegen 1, zwei Würfe pro Zug, sonst Regelwerk 2025**.

Neue Richtung: **Analyse einzelner Würfe aus Kameraaufnahmen** — Flugbahn, Bogenhöhe, Tempo, Aufsetzer. Der bestehende Drill-Teil bleibt nutzbar, wird aber nicht weiterentwickelt.

**Verbindliche Dokumente, in dieser Reihenfolge:**

| Datei | Inhalt |
|---|---|
| `CONTEXT.md` | Glossar. Verbindliche Begriffe für Code, Issues und Gespräche. |
| `docs/adr/0001-drill-teil-eingefroren.md` | Warum am Drill-Teil nichts mehr wächst |
| `docs/adr/0002-analyse-zuerst-offline.md` | Warum gegen Aufnahmen entwickelt wird statt live |
| `docs/adr/0003-klassische-bildverarbeitung-statt-modell.md` | Warum kein KI-Modell, mit Abbruchkriterium |
| GitHub Issue #1 | Die Spec: Wurfanalyse aus der Seitenkamera |
| `docs/agents/` | Wo Issues liegen, wie Domain-Dokumente gelesen werden |
| `tracker-plan.md` | **Veraltet.** Beschreibt die alte, drill-zentrierte Richtung. |

---

## Entscheidungen aus dem Interview (17./18.09.)

- **Zweck:** technisches Projekt mit Nutzen fürs Spiel. Das Turnier am 17.10. ist **keine Deadline** mehr.
- **Turnierhilfe** beschränkt sich auf vier gezielte Messungen mit dem bestehenden Drill-Modus: je 50 Würfe Einzelbecher und je 30 Aufsetzer pro Werfer. Dafür wird nichts gebaut.
- **Hauptquelle** sind Spiele, nicht Drills.
- **Umfang der Analyse:** Ereignisse und Flugbahn. Körpermodell (fertiges Modell, kein eigenes Training) kommt später.
- **Weg:** erst offline an Aufnahmen, live als Ziel. Gemeinsamer Kern für Skript und Browser.
- **Technik:** TypeScript, klassische Bildverarbeitung. Abbruchkriterium in ADR 0003.
- **Aufbau:** fester Raum, Holzwand als Hintergrund, iPhone an der Decke, **MacBook seitlich** (älteres Modell, vermutlich 720p). Positionen abkleben.
- **Messlatte:** 95 % der Würfe erkannt, 98 % richtige Zuordnung, höchstens 1 Fehlalarm pro 100 Würfe, 90 % der Aufsetzer.
- **Ablage:** gleiches Repo, neuer Ordner. Aufnahmen über Dropbox unter `/Bierpong/Aufnahmen`, nicht im Repo.
- **Arbeitsweise:** ein Subagent pro Ticket, entlang der Abhängigkeiten. Kein Commit und kein Push ohne Freigabe.

---

## Tickets (GitHub) — Meilenstein 1 fertig

Alle sieben Tickets sind umgesetzt, jeweils von einem eigenen Subagenten, danach von Hand gegengeprüft.

| Issue | Ticket | Commit |
|---|---|---|
| #2 | Gerüst: Video hinein, Overlay und Tabelle heraus | `e55c151` |
| #3 | Hintergrund lernen und Ball-Kandidaten finden | `fff9ca1` |
| #4 | Kandidaten zu Flugbahnen verketten, Würfe erkennen | `c30b541` |
| #6 | Kalibrierung, Bogenhöhe und Tempo | `8969e45` |
| #5 | Bewertungsskript gegen Handmarkierungen | `a3d034d` |
| #7 | Aufsetzer erkennen | `28859e5` |
| #8 | Seite in der App zum Selberauswerten | `d525279` |

**Wichtig:** Bewiesen ist das alles bisher nur an einer **künstlichen** Aufnahme (`npm run testvideo`), die vier Würfe und einen Aufsetzer enthält. Mit echtem Material ist noch nichts geprüft.

## Befehle der Wurfanalyse

```bash
npm run testvideo                                    # künstliche Aufnahme erzeugen
npm run analyse -- <video> [--kalibrierung <datei>]  # Overlay-Video, CSV, JSON
npm run bewerten -- handmarkierungen/<name>.json     # Messlatte gegen Handmarkierungen
npm run test                                         # 84 Tests
```

Seite zum Selberauswerten: `/auswertung`. Läuft im Browser ohne Upload, braucht aber etwa das Fünffache der Videolänge — die schweren Durchläufe macht das Skript.

---

## Erster Lauf mit echtem Material (18.09.2026)

Aufnahmen liegen **lokal** unter `D:\bierpongtracker\vids\` (nicht im Repo, nicht in Dropbox, ca. 2 GB inklusive der 45-Sekunden-Stücke unter `vids\stuecke\`): `Yellow.mov`, `white.mov`, `aufsetzer.mov`. Aufgenommen mit der MacBook-Webcam, 1280×720, Holzhütte, Biertisch **220 cm**, allein geworfen (Jakob möchte nicht gefilmt werden).

**Ergebnis der Erkennung über alle 12 Minuten: 33 Würfe gefunden.**

| Aufnahme | Länge | effektive Bildrate | gefundene Würfe |
|---|---|---|---|
| `Yellow.mov` | 6,5 Min | **16,9/s** | 16 |
| `white.mov` | 4,2 Min | **20,5/s** | 11 |
| `aufsetzer.mov` | 1,6 Min | **29,6/s** | 6 |

**Befunde:**

1. **QuickTime nimmt mit schwankender Bildrate auf.** Bei wenig Licht senkt die Webcam sie auf 17 statt 30 Bilder pro Sekunde. `ffprobe` meldet in `r_frame_rate` trotzdem 30 — die Wahrheit steht in `avg_frame_rate`. Das Skript rechnet mit dem gemeldeten Wert.
2. **Alle gefundenen Würfe sind Bruchstücke:** Scheitelhöhe 0–1 px, Dauer stets 0,29 s, Weite 170–210 px. Erkannt wird nur das flache Ende der Bahn, nicht der Bogen.
3. **Sehr viel Rauschen:** 3000–7000 Kandidaten je 45 Sekunden, überwiegend Hände und Arme.
4. **Der Ball verlässt teilweise das Bild** — die Kamera zeigt zu viel Wand und Decke, zu wenig Flugraum.
5. **Vermutete Ursachenkette:** wenig Licht → niedrige Bildrate und lange Belichtung → Ball als verschmierter Streifen → Bahn zerfällt → Prüfung „mindestens 5 Punkte" verwirft sie.
6. **Das Auswertungsskript lädt alle Bilder in den Speicher.** Deshalb wurde in 45-Sekunden-Stücke zerlegt. Für längere Aufnahmen müsste es die Bilder einzeln durchreichen (`FlightRun` in `lib/flight/run.ts` kann das bereits, das Skript nutzt es noch nicht).

**Offen und als Nächstes:** Es fehlen **Handmarkierungen** für mindestens ein 45-Sekunden-Stück, sonst bleibt „zu wenige erkannt" eine Schätzung statt einer Zahl. Alternativ genügt vorerst die grobe Angabe, wie viele Würfe tatsächlich geworfen wurden.

## Offene Punkte

- **Der eigentliche Test steht aus:** Sobald das echte Material da ist, Würfe von Hand markieren, `npm run analyse` und `npm run bewerten` laufen lassen und die vier Zahlen der Messlatte ansehen. Erst dann ist klar, ob das Verfahren trägt. Alle Schwellen in `lib/flight/settings.ts` sind bis dahin **geraten** und am echten Material nachzuziehen — besonders die Aufsetzer-Schwellen.
- **Bekannte Grenze:** Bei 30 Bildern pro Sekunde ist ein flacher Aufsetzer nicht sicher von einem flachen direkten Wurf zu unterscheiden. Im Zweifel entscheidet die Erkennung auf „direkt“, weil ein erfundener Aufsetzer der teurere Fehler ist.
- **Testmaterial:** Aufnahme am 18.09. mittags. Etwa 100 Würfe, mindestens 20 Aufsetzer, **beide Ballfarben** (orange könnte vor der Holzwand zu wenig Kontrast haben), 10 Sekunden leerer Tisch am Anfang jedes Clips, dazu ein iPhone-Vergleichsclip in 1080p/60 und ein Foto der Kameraposition.
- **Offene Frage, die das Material beantwortet:** Reicht die 720p-Webcam des MacBooks, oder muss ein zweites Gerät gekauft werden?
- **Handmarkierungen** der Würfe entstehen nach der Aufnahme und sind Voraussetzung für Ticket #5.
- **Neon-Passwort** stand am 13.09. im Chat und sollte zurückgesetzt werden.
- `tracker-plan.md` bei Gelegenheit als veraltet kennzeichnen oder einkürzen.

---

## Der eingefrorene Teil (unverändert nutzbar)

Live unter https://bierpong-tracker-gules.vercel.app · Repo `nicolaikoehler02-sys/bierpong-tracker` (öffentlich) · Neon Postgres in Frankfurt · Vercel-Scope `nicola-koehler-s-projects`, Region `fra1`.

Seiten: `/training` (Dashboard und Kamera-Fernbedienung), `/kamera` (iPhone), `/statistik`, `/plan`, `/drills`. Datenbank enthält nur die zwei Werfer, keine Messdaten.

**Bekannter offener Fehler:** Nach dem Aufnehmen einer neuen Leer-Referenz meldete die Deckenkamera bei allen Bechern „Hand". Der Fix (`de02df2`) ist live, wurde am iPhone aber nie geprüft. Ebenso ungeklärt: ein schwarzes Vorschaubild bei laufender Seite.

---

## Arbeitsregeln

- Vor **Commit, Push, Deploy, DB-Migration** und ENV-Änderungen explizites OK.
- Commit-Messages mit Scope (`feat(flight): …`), nach jedem Schritt pushen (nach OK).
- Keine Secrets in Dateien außer `.env.local`.
- Begriffe aus `CONTEXT.md` benutzen. Deutsch, knapp, Pushback erwünscht.
