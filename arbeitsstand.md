# Bierpong-Tracker — Arbeitsstand

*Zwischenstand: Sonntag, 13. September 2026, abends · zum Weitermachen in einem neuen Chat zuerst diese Datei lesen*

---

## Worum es geht

Geek-Projekt parallel zur Turniervorbereitung (Turnier **Sa 17.10.2026**, Trainingsplan in `bierpong-trainingsplan.md`, Kontext in `uebergabe-bierpong.md`). Ein **iPhone 15 Pro Max** hängt über den Bechern und erkennt Treffer im Browser; ein **Laptop am Spielfeldrand** zeigt Dashboard, Statistik und steuert die Kamera. Gebaut wird komplett per Vibe Coding.

Spieler: **Jakob** und **Nicolai**. Trainiert wird mit Wasser, Trainingsstart **Mo 14.09.2026**.

Der vollständige Projektplan mit Drill-Einordnung und Phasen steht in `tracker-plan.md`.

---

## Wo alles liegt

| | |
|---|---|
| Live-App | https://bierpong-tracker-gules.vercel.app |
| Seiten | `/` Start · `/training` Dashboard + Kamera-Fernbedienung (Laptop) · `/kamera` Kamera (iPhone) · `/statistik` · `/plan` · `/drills` |
| Repo | https://github.com/nicolaikoehler02-sys/bierpong-tracker (**öffentlich**, gewollt wegen Vercel) |
| Lokal | `D:\bierpongtracker` |
| GitHub-Account | `nicolaikoehler02-sys` · Commit-Autor im Repo: `259699756+nicolaikoehler02-sys@users.noreply.github.com` |
| Vercel | Projekt `bierpong-tracker`, Scope `nicola-koehler-s-projects`, Region `fra1`, Auto-Deploy bei Push auf `main` |
| Datenbank | Neon Postgres, Frankfurt (`eu-central-1`), über Vercel-Storage angelegt |
| Lokale Zugangsdaten | `.env.local` (nicht in Git). `vercel env pull` liefert die Neon-Werte **leer** (geschützte Variablen) — `DATABASE_URL` und `DATABASE_URL_UNPOOLED` wurden von Hand eingetragen |

**Stack:** Next.js 16.3 · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Drizzle + Neon · Vercel. Kein Passwortschutz (bewusst entschieden).

---

## Erledigt

| Commit | Inhalt |
|---|---|
| `d3369ea` | Phase 0: Projekt-Setup, Drill-Katalog, 5-Wochen-Plan als Daten, Seiten Start/Plan/Drills |
| `f1f422f` | Initiale Migration, Region `fra1` |
| `ba7da0f` | Phase 1: Kamera-Seite — Becher antippen, Leer-Referenz, Erkennung weißer/oranger Bälle, Ansage |
| `efe3fe1` | Hand-Sperre gegen Fehlalarme beim Rausfischen, Zoom, Licht, Weißabgleich bei Referenz |
| `93c1c60` | Phase 2: Live-Dashboard, Treffer vom iPhone an den Server, Statistik mit 95-%-Bereich, Spieler angelegt |
| `99198f0` | Randerkennung: ganze Becheröffnung, größter Ballfleck statt Pixelsumme, weicher Zähler |
| `59c4fb6` | Timeout für Live-Abfragen (Dashboard hing auf „Lade …“) |
| `3e5ce98` | Phase 2b: Kamera-Fernbedienung vom Laptop, Blöcke als Test markieren |

**Datenbank:** Migrationen `0000`–`0003` eingespielt. Tabellen `players`, `training_sessions`, `drill_blocks`, `events`, `camera_control`. Testdaten vom 13.09. gelöscht — Datenbank ist leer bis auf die zwei Spieler.

### Getestet und bestätigt

- Kamera erkennt orangen und weißen Ball im Becher (Küchentisch, durchsichtige Becher).
- Hand-Sperre funktioniert beim Rausfischen.
- Ende-zu-Ende: iPhone-Treffer kamen im Dashboard an, Korrektur-Knopf, Treffer +1 und Block beenden funktionieren (laut Datenbank).
- Dashboard lädt im Headless-Edge-Test sauber.
- **Kamera-Fernbedienung** (Test 13.09., 16:43–16:45, laut Datenbank): Vorschaubild kam an (ca. 6 KB), Leer-Referenz per Befehl vom Laptop inkl. Weißabgleich, Einstellungen vom Laptop wurden vom iPhone übernommen, 3 Kamera-Treffer bei 19–20 %.
- **Test-Markierung:** Testblock erscheint nicht in `/statistik`.

### Noch offen

- Randerkennung nach dem Fix im echten Training beobachten. Aktuell gespeichert: Schwelle 12 %, Hand-Sperre 15 %, Radius 11 %.
- Alle Testdaten vom 13.09. sind gelöscht — die Datenbank enthält nur die zwei Spieler und den letzten Kamera-Zustand.

---

## Wichtige Entscheidungen

- **Safari reicht** (Küchentisch-Test 13.09.): Weißabgleich festsetzbar, Zoom 0,5–10, Licht, bis 60 fps. Nicht steuerbar: Belichtung, ISO, Fokus. Andere Browser auf dem iPhone nutzen dieselbe Engine.
- **Kein manuelles Loggen, kein Filmen.** Genauigkeit über Ansage, Korrektur-Knopf und (geplant) Standbilder.
- **Kamera sieht nur Treffer, keine Fehlwürfe.** Quote kommt aus der bestätigten Wurfzahl je Block (Drill-Typ A), bei Serien per Fehlwurf-Tap (Typ C).
- **Alle Regler bleiben**, auch wenn Automatik dazukommt.
- **Obsidian-Vault** wird erst später und auf anderem Weg aktualisiert — nicht automatisch hineinschreiben.

---

## Steht an

| Wann | Was |
|---|---|
| **Jetzt** | Kamera-Fernbedienung und Test-Markierung am Tisch testen |
| **ab Mo 14.09.** | Tracker im echten Training nutzen (W1 S1: Einzelbecher, Routine, Mittelbecher). Vor jedem Drill mit neuer Becherposition neu kalibrieren + Leer-Referenz |
| **gebaut 13.09., noch nicht gepusht/getestet** | Treffer-Standbilder (in der Datenbank, ca. 5 KB) · „Treffer prüfen“ im Dashboard · **Aufsetzer-Entscheidung** auf `/statistik` (b mit 95-%-Bereich, 2b(1−s) > p, Regler für s, Wahrscheinlichkeit „lohnt sich“, Vergleich der Spieler) |
| **wenn Zeit zum Aufbauen** | Fotos von Einzelbecher, 10er-Pyramide und Raute über die Fernbedienung · Becherdurchmesser messen · Werferseite im Bild festlegen → dann automatische Becher-Kalibrierung |
| **28.09.–04.10.** | **Phase 3:** automatische Becher-Kalibrierung (Formation einpassen, Becherdurchmesser einstellbar, feste Bechernummern) · Heatmap je Becherposition · Ballfarben je Spieler für Partner-Drills · Rollen-Auswertung · Same-Cup vs. p² |
| **optional** | Seitenkamera am Laptop (Wurferkennung per Pose → Fehlwürfe, Aufsetzer, Werfer) · Instant Replay · Soundboard · Telegram-Zusammenfassung · Wochen-Kommentar per Claude API |
| **ab 05.10.** | **Feature-Freeze** — nur noch benutzen und Bugs fixen |

### Offene Fragen / To-dos

- Welche Becher gibt es beim Turnier (Farbe, Durchmesser)? Nachmessen, sobald sie da sind.
- Wer wirft mit welcher Ballfarbe (für Partner-Drills ab W1 S3)?
- Neon-Passwort zurücksetzen (stand im Chat) und prüfen, ob Vercel die neuen Werte übernimmt; danach `.env.local` anpassen.
- Einkauf: Stativ mit Galgenarm, Powerbank, orange 40-mm-Bälle, ggf. USB-Weitwinkel-Webcam für die Seitenkamera.

---

## Bekannte Einschränkungen

- Kamera starten und erste Sprachansage brauchen einen Tap am iPhone (Safari).
- Belichtung ist nicht sperrbar — Helligkeitsausgleich per Software; stark wechselndes Licht kann stören.
- Aufsetzer „wirklich aufgesetzt“ ist von oben nicht erkennbar — kommt aus dem Drill-Modus.
- Bechernummern entsprechen der Antipp-Reihenfolge, nicht festen Positionen (löst Phase 3).
- Partner-Drills erscheinen in der Statistik bis Phase 3 als „Jakob & Nicolai“.

---

## Arbeitsregeln

- Vor **Commit, Push, Deploy, DB-Migration, Datenbankänderungen** und ENV-Änderungen explizites OK.
- Commit-Messages mit Scope (`feat(camera): …`), nach jedem Schritt pushen (nach OK).
- Keine Secrets in Dateien außer `.env.local`.
- Deutsch, knapp, Pushback erwünscht.
