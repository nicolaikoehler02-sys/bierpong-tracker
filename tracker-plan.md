# Bierpong-Tracker — Projektplan

*Stand: 13. September 2026 (v2) · Geek-Projekt parallel zum Trainingsplan (`bierpong-trainingsplan.md`)*

---

## Grundentscheidungen

| Thema | Entscheidung | Warum |
|---|---|---|
| Kamera | **iPhone 15 Pro Max**, senkrecht von oben über den Bechern | Sehr gute Kamera, keine Hardware nötig |
| Plattform | **Web-App im Safari**, keine native App | Native iOS-App braucht einen Mac oder Cloud-Builds + Apple-Developer-Account |
| Erkennung | Direkt im Browser auf dem iPhone, nur Events gehen raus | Schnell, kein Video-Upload, klappt auch mit schlechtem Netz |
| Steuerung/Dashboard | **Zweites Gerät** (Handy des Partners, Tablet oder Laptop) | Das iPhone über den Bechern ist nicht bedienbar |
| Stack | **Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Recharts · Neon Postgres + Drizzle · Vercel** | Derselbe Stack wie Stallbuch — bekannt, Accounts vorhanden |
| Live-Sync | Dashboard fragt alle 1–2 s neue Events ab (Polling) | Neon hat kein Realtime; für ein Trainings-Dashboard reicht das völlig |
| Manuelles Loggen / Filmen | **Nein** | Tracker soll ohne Zusatzaufwand im Training laufen |
| Pi | **Später optional** als zweiter Sensor (z. B. Seitenkamera für Aufsetzer) | Architektur mit Events erlaubt das ohne Umbau |
| Entwicklung | Vollständig per Vibe Coding (Claude Code) | |

### Arbeitsregeln (wie bei Stallbuch)

- Vor **Commit, Push, Deploy, DB-Migration** explizites OK einholen, vorher `git status` zeigen.
- Commit-Messages mit Scope: `feat(camera): …`, `fix(detection): …`.
- Auf Feature-Branches nach jedem abgeschlossenen Schritt committen **und pushen** (nach OK).
- GitHub-/Vercel-Account vor dem ersten Push klären (`gh auth status`).

---

## Browserfrage: Safari oder etwas anderes?

- Auf dem iPhone nutzen **Chrome, Firefox, Edge usw. alle die Safari-Engine (WebKit)**. Kamera-Zugriff und Kamera-Einstellungen sind dort identisch — ein anderer Browser bringt nichts.
- Welche Kamera-Einstellungen Safari freigibt (Belichtung, Fokus, Weißabgleich, Bildrate), wird in **Phase 1 direkt gemessen**: Die Kamera-Seite zeigt an, was das iPhone erlaubt.
- Falls Safari nicht reicht, gibt es drei Ausweichwege:

| Option | Vorteil | Nachteil |
|---|---|---|
| **Software-Ausgleich** (Referenzbild, Helligkeit normalisieren) | Kein Umbau | Grenzen bei stark wechselndem Licht |
| **Native App mit Expo + VisionCamera**, Cloud-Build ohne Mac | Volle Kamerakontrolle, 60–240 fps | Apple Developer Program (99 €/Jahr), langsamere Entwicklungsschleife |
| **Raspberry Pi mit Kameramodul** | Volle Kontrolle, Dauerbetrieb | Hardware kaufen, mehr Bastelei |

**Entschieden am 13.09.2026 nach dem Küchentisch-Test: Safari reicht.** Oranger und weißer Ball werden erkannt (Ball ca. 27 % Füllstand bei 6 % Schwelle, 15 Analysen/s). Safari auf dem iPhone 15 Pro Max erlaubt: Weißabgleich festsetzen, Zoom 0,5–10, Licht, bis 60 fps. Nicht steuerbar: Belichtung, ISO, Fokus.

---

## Option: Seitenkamera am Laptop (Phase 4)

*Idee vom 13.09.2026 · ersetzt die experimentelle Ball-Wurferkennung · Voraussetzung: Phase 2 steht*

Der Laptop am Spielfeldrand zeigt das Dashboard und nutzt zusätzlich eine Kamera mit Blick von der Seite auf den ganzen Tisch.

| | iPhone von oben | Laptop von der Seite |
|---|---|---|
| Welcher Becher getroffen | ✅ | ❌ Becher verdecken sich |
| Wann geworfen wurde | ❌ | ✅ Wurfbewegung |
| Fehlwürfe | ❌ | ✅ Wurf ohne Treffer |
| Wer geworfen hat | nur über Ballfarbe | ✅ linker/rechter Spieler |
| Aufsetzer echt? | ❌ | ✅ Tischkontakt |
| Gefangene Rückroller (Drill 12) | ❌ | ✅ |
| Technik (Ellbogen, Bogen) | ❌ | ✅ Instant Replay |

**Ansatz:** Nicht den Ball im Flug verfolgen (bei 30 fps nur ein Strich), sondern die **Wurfbewegung per Pose-Erkennung** im Browser (z. B. MediaPipe Pose).

**Zusammenführung auf dem Server:**

```
iPhone  →  „Treffer, Becher 3, 14:36:51.2"
Laptop  →  „Wurf, linker Spieler, 14:36:50.4"
Wurf + Treffer innerhalb ~2 s  →  Treffer
Wurf ohne Treffer              →  Fehlwurf
```

**Schwierigkeiten:** gemeinsame Uhr über Serverzeit · Fehlerkennungen (Gesten, Probewürfe, Leute im Bild) · Bildausschnitt: eingebaute Webcam oft zu eng/dunkel, besser externe USB-Weitwinkel-Webcam mit 60 fps · deutlich mehr Aufwand als die Treffererkennung.

**Erster Machbarkeitstest (ein Abend):** Laptop-Seite mit Live-Skelett, die bei jedem erkannten Wurf aufblinkt.

---

## Die Drills: alle 14 als Daten, 5 Drill-Typen als Logik

Alle Drills und der komplette 5-Wochen-Plan werden als **Konfiguration** angelegt. Die App weiß also: „Heute ist W2 S1 → Drill 2 (50), Drill 7 (30), Drill 3 (30)" und startet den nächsten Block mit einem Tap.

Programmiert werden müssen nur **fünf Drill-Typen**:

| Typ | Ablauf | Drills |
|---|---|---|
| **A — Feste Anzahl, ein Werfer** | Treffer erkennt die Kamera, Wurfzahl kommt aus dem Plan | 2, 3, 4, 5, 6, 7, 8, 11, 14 |
| **B — Partner-Runden** | Zwei Ballfarben, Kamera ordnet Treffer dem Spieler zu, erkennt Doppeltreffer | 1, 10 |
| **C — Bis zum Fehlwurf** | Kamera zählt Treffer, Fehlwurf = ein Tap (5 Taps pro Session) | 9 |
| **D — Zähler** | Ein Knopf pro Runde — optional, sonst nicht getrackt | 12 |
| **E — Nicht gemessen** | Nur als Checkliste/Notiz | 13 |

### Drill für Drill

| # | Drill | Typ | Kamera-Automatik | Was gemessen wird / Besonderheit |
|---|---|---|---|---|
| 1 | Same-Cup (Partner) | B | 🟢 mit zwei Ballfarben | Doppeltreffer-Quote, automatischer Vergleich mit p² |
| 2 | Einzelbecher | A | 🟢 | Grundquote p |
| 3 | Mittelbecher | A | 🟢 | Matchball-Quote |
| 4 | Routine | A | 🟡 | Quote ja; Routine-Konsistenz erst mit Wurferkennung (Zeitabstände) |
| 5 | Quiet Eye | A | 🟢 | Quote; Auswertung „Quiet Eye vs. Drill 2" zeigt, ob es etwas bringt |
| 6 | Restbild | A, 3 Abschnitte | 🟢 | Quote pro Formation; Becher je Formation neu antippen |
| 7 | Aufsetzer | A | 🟢 Treffer · 🔴 „wirklich aufgesetzt" | Quote b; Wurfart kommt aus dem Modus |
| 8 | Trickshot | A | 🟢 | Bonuswurf-Quote |
| 9 | Serien | C | 🟢 (1 Tap pro Versuch) | Serienlänge + Hot-Hand-Check gegen Einzelquote |
| 10 | Rollback (Partner) | B + Kettenlogik | 🟡 | Kettenlänge; „Bälle zurück" nach Doppeltreffer |
| 11 | Druck | A + Soundboard | 🟢 | Druckabfall gegen Normalquote; App erzeugt Lärm/Trash Talk |
| 12 | Ball-Aufmerksamkeit | D | — optional | Fangquote nur, wenn jemand tippt |
| 13 | Umstell-Timing | E | 🔴 | Nicht sinnvoll messbar |
| 14 | Fremdbedingungen | A + Tag | 🟡 | Quote pro Bedingung; fremde Bälle → Farbe neu kalibrieren |

**Ergebnis:** 11 von 14 Drills laufen weitgehend automatisch, 3 nur teilweise oder gar nicht.

### Genauigkeit prüfen — ohne manuelles Loggen

- Die App **sagt jeden Treffer an** („Treffer, Becher 7"). Falsche Ansagen fallen sofort auf.
- Ein **großer Korrektur-Knopf** auf dem Dashboard („letzter Treffer falsch") — nur bei Fehlern, nicht pro Wurf.
- Pro erkanntem Treffer wird automatisch ein **Standbild** gespeichert. Nach der Session optional durchwischen.
- Die Anzahl der Korrekturen ist gleichzeitig die Fehlerquote der Erkennung.

### Regeln für den Trainingsbetrieb

- Ball nach Treffer **rausnehmen** (Erkennung zählt „neuer Ball im Becher").
- Kamera **mittig und senkrecht** über den Bechern, sonst verdecken Becherränder die äußeren Becher.
- Becher ausreichend mit Wasser füllen, damit der Ball gut sichtbar schwimmt.
- Ein Treffer zählt erst, wenn der Ball einige Frames stabil im Becher liegt (kein Fehlalarm bei Randabprallern).

---

## Auswertungen

| Seite | Inhalt | Gebraucht bis |
|---|---|---|
| **Übersicht** | Quote pro Spieler und Drill über die Zeit, mit Konfidenzintervall, gegen die Zielwerte aus dem Plan | sobald Daten da sind |
| **Aufsetzer-Entscheidung** | b mit Konfidenzintervall, Formel 2b(1−s) > p mit Regler für s | So 27.09. |
| **Rollenverteilung** | Pro Rolle: „Wahrscheinlichkeit, dass A besser ist als B" | So 04.10. |
| **Becher-Heatmap** | Quote pro Becherposition pro Spieler → bester gemeinsamer Zielbecher (Hebel 1) | W3 |
| **Same-Cup vs. p²** | Liegt die Doppeltreffer-Quote unter p², sind die Zielbecher schlecht gewählt | W3 |
| **Druckabfall** | Drill 11 gegen Normalquote, Ziel max. 5–10 % darunter | W4 |

---

## Phasen

| Phase | Zeitraum | Inhalt | Ergebnis |
|---|---|---|---|
| **0 — Setup** | 14.–15.09. | Next.js-Projekt, Neon-DB + Drizzle-Schema, Vercel-Deploy · Drill-Katalog + 5-Wochen-Plan als Daten | Leere App läuft online mit HTTPS |
| **1 — Kamera-Test** | 15.–20.09. | Kamera-Seite fürs iPhone: Kamera-Fähigkeiten anzeigen, Becher antippen, Referenzbild, Ball-im-Becher-Erkennung mit Live-Overlay und Sprachausgabe | Küchentisch-Test bestanden → **Entscheidung Safari reicht / Ausweichweg** |
| **2 — Verbinden** | 21.–27.09. | Events → Datenbank · Live-Dashboard auf dem zweiten Gerät · Drill-Typen A und C · Korrektur-Knopf + Standbilder · Aufsetzer-Seite | Kamera im echten Training ab W2 |
| **3 — Partner & Analyse** | 28.09.–04.10. | Zwei Ballfarben, Drill-Typ B · Heatmap · Rollen-Seite · Same-Cup vs. p² | Rollenentscheidung nach Zahlen |
| **4 — Extras (optional)** | bis 04.10. | **Seitenkamera am Laptop** (siehe Option unten) · Instant Replay · Druck-Soundboard · Session-Zusammenfassung per Telegram · Wochen-Kommentar per Claude API | Spaß |
| **Freeze** | ab 05.10. | Keine neuen Features, nur noch benutzen und Bugs fixen | Peak- und Taper-Phase ungestört |

**Hinweis:** Die Baseline aus Woche 1 erfasst der Tracker nicht. Echte Daten gibt es frühestens ab W2. Für die Aufsetzer-Entscheidung am 27.09. muss Phase 1 also bis ca. 20.09. stehen, sonst basiert sie auf weniger Daten.

---

## Einkaufsliste / To-dos

- [ ] Stativ mit Galgenarm und Handyhalterung (Kamera ca. 1–1,2 m über den Bechern)
- [ ] Powerbank + langes Ladekabel
- [ ] **Orange** 40-mm-Bälle (zweite Farbe neben weiß, für Partner-Drills)
- [ ] Zweites Gerät fürs Dashboard klären (Partner-Handy, Tablet oder Laptop)
- [ ] Klären: welcher GitHub- und Vercel-Account (`Hestura` oder `nicolaikoehler02-sys`)

---

## Offene Risiken

- **Kamera-Einstellungen im Safari** evtl. zu eingeschränkt → wird in Phase 1 gemessen, Ausweichwege siehe oben.
- **Hitze und Akku** beim iPhone in langen Sessions.
- **Fehlwürfe** werden ohne Seitenkamera nicht einzeln erkannt → Wurffolgen gibt es bis dahin nur bei Drill-Typ C.
- **Aufsetzer erkennen** ist mit einer Kamera von oben nicht möglich → kommt aus dem Drill-Modus.
