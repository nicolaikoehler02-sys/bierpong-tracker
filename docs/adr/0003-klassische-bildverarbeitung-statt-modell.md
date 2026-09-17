# Klassische Bildverarbeitung in TypeScript statt trainiertem Modell

Für das Erkennen der Flugbahn stand ein trainiertes Modell zur Debatte. Wir nehmen stattdessen klassische Bildverarbeitung in TypeScript: Hintergrund lernen, Ball-Kandidaten je Bild finden, Kandidaten über mehrere Bilder zu einer Flugbahn verketten. Ein Ball ist rund, hell und das einzige schnell fliegende Objekt im Bild — dafür braucht es kein Modell, und TypeScript läuft ohne Bruch sowohl im Auswertungsskript als auch später live im Browser.

## Verworfene Alternativen

- **Fertiges Objektmodell (YOLO o. ä.):** erkennt kleine, bewegungsunscharfe Bälle schlecht und ist im Browser zu langsam.
- **Eigenes Modell trainieren:** verlangt hunderte von Hand markierte Bilder und Nachtraining bei verändertem Licht — für ein Problem, das die klassische Bewegungserkennung gut löst.
- **Python mit OpenCV:** die besseren Werkzeuge, aber der Algorithmus müsste für den Live-Betrieb übersetzt werden, und beim Übersetzen entsteht ein anderer Algorithmus, der neu eingestellt werden muss.

## Abbruchkriterium

Reißt die Erkennung am ersten Testmaterial die Messlatte (95 % der Würfe erkannt, 98 % richtige Richtung, höchstens 1 Fehlalarm pro 100 Würfe, 90 % der Aufsetzer) und hebt sie sich in zwei Anläufen nicht darüber, wird der Modell-Weg neu bewertet.

Ein fertiges **Körpermodell** für die spätere Technikanalyse (Arm, Ellbogen, Bewegungskonsistenz) ist davon nicht berührt: Es braucht kein eigenes Training und kommt zusätzlich dazu.
