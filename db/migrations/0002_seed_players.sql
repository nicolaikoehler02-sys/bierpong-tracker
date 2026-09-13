-- Spieler für das Training anlegen (idempotent).
INSERT INTO "players" ("name") VALUES ('Jakob'), ('Nicolai') ON CONFLICT ("name") DO NOTHING;
