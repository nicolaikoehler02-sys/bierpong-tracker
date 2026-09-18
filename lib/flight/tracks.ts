import type { FlightSettings } from "./settings.ts";
import type { BallCandidate, FlightPoint, FrameResult } from "./types.ts";

/**
 * Eine Kette von Kandidaten über aufeinanderfolgende Bilder.
 *
 * Eine Bahn ist noch kein Wurf: Ob aus ihr einer wird, entscheidet erst die
 * Prüfung in `throws.ts`. Auch ein zurückrollender Ball und ein Schatten, der
 * zufällig zweimal hintereinander auffällt, werden hier zu einer Bahn.
 */
export interface FlightTrack {
  /** Die gesehenen Punkte, nach Bildnummer aufsteigend */
  points: FlightPoint[];
}

/** Eine Bahn, an die noch angeknüpft werden kann. */
interface OpenTrack {
  points: FlightPoint[];
  /** Zuletzt gemessene Geschwindigkeit in Bildpunkten je Bild */
  vx: number;
  vy: number;
  /** Erst ab dem zweiten Punkt gibt es eine Geschwindigkeit */
  hasVelocity: boolean;
  /** So viele Bilder in Folge ohne passenden Kandidaten */
  missing: number;
}

/** Ein möglicher Anschluss eines Kandidaten an eine offene Bahn. */
interface Match {
  track: number;
  candidate: number;
  /** Abstand zur Vorhersage in Bildpunkten — kleiner ist besser */
  cost: number;
}

/**
 * Verkettet die Ball-Kandidaten aufeinanderfolgender Bilder zu Flugbahnen.
 *
 * Je Bild wird für jede offene Bahn vorhergesagt, wo der Ball als Nächstes
 * sein müsste: letzte Stelle plus letzte bekannte Geschwindigkeit. Passt ein
 * Kandidat nah genug an diese Vorhersage, wird er angehängt.
 *
 * Genau das löst die Zweideutigkeit aus dem Kandidatenschritt: Springt ein Ball
 * weiter als seine eigene Breite, können in einem Bild mehrere Stellen
 * auffallen — aber nur eine davon setzt die bisherige Bewegung fort. Beim
 * ersten Anschluss gibt es noch keine Geschwindigkeit; dort gilt stattdessen
 * ein großzügiger Umkreis (`maxStartJump`).
 *
 * **Eine fallende Bahn bekommt eine zweite Vorhersage.** Setzt der Ball auf der
 * Tischplatte auf, kehrt sich seine senkrechte Bewegung um, und die gerade
 * Fortschreibung schießt um das Doppelte der Fallgeschwindigkeit unter ihm
 * hindurch — die Bahn würde ausgerechnet an der interessanten Stelle reißen und
 * ein Aufsetzer in zwei zu kurze Bruchstücke zerfallen. Für fallende Bahnen
 * wird deshalb zusätzlich die an der Waagerechten gespiegelte Vorhersage
 * geprüft (`maxBouncePredictionDistance`). Wo der Tisch liegt, muss dafür
 * niemand wissen: Angeknüpft wird nur, was auch wirklich ein Kandidat ist.
 *
 * Zuordnungen werden nach Abstand vergeben, der beste zuerst; jede Bahn und
 * jeder Kandidat kommen dabei höchstens einmal vor. Kandidaten, die zu keiner
 * Bahn passen, beginnen eine neue. Eine Bahn darf `maxMissingFrames` Bilder
 * ohne Kandidat überbrücken — ein Ball verschwindet kurz vor dunklem
 * Hintergrund oder hinter einem Becher —, danach endet sie.
 *
 * Während der Lernphase und bei verändertem Gesamtbild fehlt die
 * Vergleichsgrundlage. Dort endet jede offene Bahn, statt über die Lücke hinweg
 * zwei Flüge zusammenzuziehen.
 */
export function buildTracks(
  results: readonly FrameResult[],
  settings: FlightSettings,
): FlightTrack[] {
  const maxMissing = Math.max(0, Math.round(settings.maxMissingFrames));
  const finished: FlightTrack[] = [];
  let open: OpenTrack[] = [];

  for (const result of results) {
    if (result.learning || result.sceneChanged) {
      for (const track of open) finished.push({ points: track.points });
      open = [];
      continue;
    }

    const matched = assign(open, result, settings);

    // Bahnen ohne Anschluss dürfen eine kurze Lücke überbrücken.
    const surviving: OpenTrack[] = [];
    open.forEach((track, index) => {
      if (matched.tracks.has(index)) {
        surviving.push(track);
        return;
      }
      track.missing++;
      if (track.missing <= maxMissing) surviving.push(track);
      else finished.push({ points: track.points });
    });
    open = surviving;

    // Jeder übrig gebliebene Kandidat beginnt eine eigene Bahn.
    result.candidates.forEach((candidate, index) => {
      if (matched.candidates.has(index)) return;
      open.push({
        points: [toPoint(result, candidate)],
        vx: 0,
        vy: 0,
        hasVelocity: false,
        missing: 0,
      });
    });
  }

  for (const track of open) finished.push({ points: track.points });
  finished.sort((a, b) => a.points[0].index - b.points[0].index);
  return finished;
}

/**
 * Hängt die passenden Kandidaten eines Bildes an die offenen Bahnen und meldet,
 * welche Bahnen und welche Kandidaten dabei vergeben wurden.
 */
function assign(
  open: readonly OpenTrack[],
  result: FrameResult,
  settings: FlightSettings,
): { tracks: Set<number>; candidates: Set<number> } {
  const possible: Match[] = [];

  open.forEach((track, t) => {
    const last = track.points[track.points.length - 1];
    // Über eine Lücke hinweg wächst sowohl die Vorhersage als auch ihre
    // Unsicherheit mit der Zahl der übersprungenen Bilder.
    const gap = result.index - last.index;
    const predictedX = last.x + track.vx * gap;
    const predictedY = last.y + track.vy * gap;
    const reach =
      (track.hasVelocity ? settings.maxPredictionDistance : settings.maxStartJump) * gap;

    // Ein fallender Ball kann in diesem Bild aufgesetzt haben. Dann steht er
    // nicht unter der Vorhersage, sondern ungefähr genauso weit darüber.
    const falling = track.hasVelocity && track.vy > 0;
    const bouncedY = last.y - track.vy * gap;
    const bounceReach = settings.maxBouncePredictionDistance * gap;

    result.candidates.forEach((candidate, c) => {
      const dx = candidate.x - predictedX;
      const dy = candidate.y - predictedY;
      const straight = Math.sqrt(dx * dx + dy * dy);
      let cost = straight <= reach ? straight : Number.POSITIVE_INFINITY;

      if (falling) {
        const bouncedDy = candidate.y - bouncedY;
        const bounced = Math.sqrt(dx * dx + bouncedDy * bouncedDy);
        // Die gerade Vorhersage behält den Vortritt: Passt sie besser, bleibt
        // es bei ihrem Abstand, und die Bahn wird ganz normal fortgesetzt.
        if (bounced <= bounceReach && bounced < cost) cost = bounced;
      }

      if (Number.isFinite(cost)) possible.push({ track: t, candidate: c, cost });
    });
  });

  possible.sort((a, b) => a.cost - b.cost);

  const tracks = new Set<number>();
  const candidates = new Set<number>();
  for (const match of possible) {
    if (tracks.has(match.track) || candidates.has(match.candidate)) continue;
    tracks.add(match.track);
    candidates.add(match.candidate);
    append(open[match.track], result, result.candidates[match.candidate]);
  }

  return { tracks, candidates };
}

/** Verlängert eine Bahn um einen Punkt und frischt ihre Geschwindigkeit auf. */
function append(track: OpenTrack, result: FrameResult, candidate: BallCandidate): void {
  const last = track.points[track.points.length - 1];
  const point = toPoint(result, candidate);
  const gap = Math.max(1, point.index - last.index);
  track.vx = (point.x - last.x) / gap;
  track.vy = (point.y - last.y) / gap;
  track.hasVelocity = true;
  track.missing = 0;
  track.points.push(point);
}

function toPoint(result: FrameResult, candidate: BallCandidate): FlightPoint {
  return { index: result.index, at: result.at, x: candidate.x, y: candidate.y };
}
