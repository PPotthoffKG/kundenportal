-- pg_net war auf live nicht aktiv; ohne sie lief der Trigger für die Hinweis-Mail ins Leere.
create extension if not exists pg_net with schema extensions;
