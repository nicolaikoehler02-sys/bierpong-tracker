@AGENTS.md

# Bierpong-Tracker

Kamera-basierter Trefferquoten-Tracker für die Bierpong-Turniervorbereitung (Turnier: Sa 17.10.2026).
**Aktueller Stand zuerst:** `arbeitsstand.md` · Projektplan: `tracker-plan.md` · Trainingsplan: `bierpong-trainingsplan.md` · Kontext: `uebergabe-bierpong.md`.

## Stack

Next.js 16 (App Router, ohne `src/`) · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui (base-nova) · Neon Postgres + Drizzle · Vercel.

- `lib/drills.ts` — Drill-Katalog, Drill-Typen, Zielwerte
- `lib/plan.ts` — 5-Wochen-Plan als Daten
- `db/schema.ts` — Datenbankschema, `db/index.ts` — lazy DB-Client (`getDb()`)
- `lib/detection/` — Erkennung der Deckenkamera (Treffer im Becher)
- `lib/flight/` — Erkennungskern der Seitenkamera (Wurfanalyse), `scripts/` — Auswertung von Aufnahmen

## Regeln

- UI-Texte auf Deutsch, korrekte Umlaute.
- Kamera-Seite muss auf iPhone-Safari laufen (HTTPS, `playsinline`, keine Chrome-only-APIs ohne Fallback).
- Vor **Commit, Push, Deploy, DB-Migration** und ENV-Änderungen explizites OK einholen; vorher `git status` zeigen.
- Commit-Messages mit Scope: `feat(camera): …`, `fix(detection): …`.
- Auf Feature-Branches nach jedem abgeschlossenen Schritt committen und pushen (nach OK).
- GitHub-Account: `nicolaikoehler02-sys` (privat) — vor Push `gh auth status` prüfen.
- Keine Secrets in Dateien außer `.env.local`.

## Agent skills

### Issue tracker

Issues und Specs liegen als GitHub Issues in `nicolaikoehler02-sys/bierpong-tracker` (über die `gh` CLI). Siehe `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` und `docs/adr/` im Wurzelverzeichnis. Siehe `docs/agents/domain.md`.

## Befehle

```bash
npm run dev          # lokal
npm run build        # Build prüfen
npm run lint
npm run test         # vitest (Erkennungskern)

npm run testvideo                 # künstliche Aufnahme nach analyse/testvideo/
npm run analyse -- <videodatei>   # Aufnahme auswerten: Overlay-Video, CSV, JSON
npm run analyse -- <videodatei> --kalibrierung <datei.json>   # mit Maßstab: cm und m/s statt Bildpunkten
npm run db:generate  # Migration aus Schema erzeugen
npm run db:migrate   # Migration anwenden (nur nach OK)
```
