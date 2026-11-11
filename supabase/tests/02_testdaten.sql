-- Testdaten für die Tests zur Kundentrennung: zwei erfundene Kunden, fünf erfundene Personen.
-- Nur auf einem Branch ausführen, nie auf der Live-Datenbank.
insert into public.kunden (id, slug, name, anrede) values
  ('11111111-1111-1111-1111-111111111111', 'testkunde-a', 'Testkunde A', 'du'),
  ('22222222-2222-2222-2222-222222222222', 'testkunde-b', 'Testkunde B', 'Sie');

-- Kunde A nur per Adresse, Kunde B per Domain, Team per Adresse
insert into public.zugangsliste (rolle, kunde_id, art, wert, anzeigename, anrede) values
  ('kunde', '11111111-1111-1111-1111-111111111111', 'adresse', 'anna@kunde-a.test', 'Anna A', 'du'),
  ('kunde', '11111111-1111-1111-1111-111111111111', 'adresse', 'gerd@kunde-a.test', 'Gerd Gesperrt', null),
  ('kunde', '22222222-2222-2222-2222-222222222222', 'domain', 'kunde-b.test', null, null),
  ('team', null, 'adresse', 'team@pp.test', 'Tina Team', null),
  ('team', null, 'adresse', 'team1@pp.test', 'Tom Einfaktor', null);

-- Konten. Die Zuordnung in public.mitglieder entsteht über den Trigger bei_neuem_nutzer.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'anna@kunde-a.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'gerd@kunde-a.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'Bert@Kunde-B.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'team@pp.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'team1@pp.test', '', now(), now(), now());
update public.mitglieder set gesperrt_am = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
-- Tina ist freigeschaltetes Team-Mitglied, Tom nicht
update public.mitglieder set team_bestaetigt_am = now() where user_id = 'cccccccc-0000-0000-0000-000000000001';

-- Je Kunde: ein freigegebener Bericht und ein Entwurf
insert into public.berichte (id, kunde_id, art, zeitraum, zeitraum_start, titel, html_pfad, status)
select (b || n || '000000-0000-0000-0000-00000000000' || s)::uuid, k, a, z, d, 'Bericht', k || '/' || a || '/' || d || '.html', st
from (values ('11111111-1111-1111-1111-111111111111'::uuid, '1'), ('22222222-2222-2222-2222-222222222222'::uuid, '2')) kk(k, n),
     (values ('b', '1', 'monatsauswertung', 'Oktober 2026', date '2026-10-01', 'freigegeben'),
             ('b', '2', 'wochenstand', 'KW 45', date '2026-11-02', 'entwurf')) x(b, s, a, z, d, st);
-- Je Kunde: eine offene Entscheidung und ein Entwurf
insert into public.entscheidungen (id, kunde_id, bericht_id, frage, empfehlung, status)
select ('e' || n || '000000-0000-0000-0000-00000000000' || s)::uuid, k, ('b' || n || '000000-0000-0000-0000-00000000000' || s)::uuid, 'Frage', 'Empfehlung', st
from (values ('11111111-1111-1111-1111-111111111111'::uuid, '1'), ('22222222-2222-2222-2222-222222222222'::uuid, '2')) kk(k, n),
     (values ('1', 'offen'), ('2', 'entwurf')) x(s, st);
-- Je Kunde: ein sichtbarer und ein unsichtbarer Roadmap-Punkt
insert into public.roadmap (id, kunde_id, titel, sichtbar)
select ('c' || n || '000000-0000-0000-0000-00000000000' || s)::uuid, k, 'Vorhaben', si
from (values ('11111111-1111-1111-1111-111111111111'::uuid, '1'), ('22222222-2222-2222-2222-222222222222'::uuid, '2')) kk(k, n),
     (values ('1', true), ('2', false)) x(s, si);
insert into public.anliegen (id, kunde_id, titel, erstellt_name)
select ('a' || n || '000000-0000-0000-0000-000000000001')::uuid, k, 'Anliegen', 'Seed'
from (values ('11111111-1111-1111-1111-111111111111'::uuid, '1'), ('22222222-2222-2222-2222-222222222222'::uuid, '2')) kk(k, n);
insert into public.kommentare (kunde_id, bezug_art, bezug_id, text, autor_name)
select k, 'anliegen', ('a' || n || '000000-0000-0000-0000-000000000001')::uuid, 'Kommentar', 'Seed'
from (values ('11111111-1111-1111-1111-111111111111'::uuid, '1'), ('22222222-2222-2222-2222-222222222222'::uuid, '2')) kk(k, n);
insert into public.aufgaben (kunde_id, titel, liegt_bei)
select k, 'Aufgabe', 'kunde' from (values ('11111111-1111-1111-1111-111111111111'::uuid), ('22222222-2222-2222-2222-222222222222'::uuid)) kk(k);
insert into public.werkzeuge (kunde_id, titel, url)
select k, 'Werkzeug', 'https://example.test' from (values ('11111111-1111-1111-1111-111111111111'::uuid), ('22222222-2222-2222-2222-222222222222'::uuid)) kk(k);
insert into public.dateien (kunde_id, pfad, name, richtung)
select k, k || '/' || r || '/datei.txt', 'datei.txt', replace(r, '-', '_')
from (values ('11111111-1111-1111-1111-111111111111'::uuid), ('22222222-2222-2222-2222-222222222222'::uuid)) kk(k), (values ('vom-kunden'), ('von-uns')) x(r);
insert into storage.objects (bucket_id, name)
select 'dateien', pfad from public.dateien where kunde_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
union all select 'berichte', html_pfad from public.berichte where kunde_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
