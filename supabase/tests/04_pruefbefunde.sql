-- Zusatztests zu den Befunden der unabhängigen Prüfung vom 10.11.2026. Aufruf nach 03: select pruef.lauf2();
CREATE OR REPLACE FUNCTION pruef.lauf2()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  k1 uuid := '11111111-1111-1111-1111-111111111111';
  k2 uuid := '22222222-2222-2222-2222-222222222222';
  a  uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  b  uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  t  uuid := 'cccccccc-0000-0000-0000-000000000001';
  t1 uuid := 'cccccccc-0000-0000-0000-000000000002';
  u6 uuid := 'dddddddd-0000-0000-0000-000000000006';
  u7 uuid := 'dddddddd-0000-0000-0000-000000000007';
begin
  perform pruef.als('Prüfer (Befunde)', null, 'aal1', 'postgres');
  perform set_config('storage.allow_delete_query', 'true', true);

  -- Befund 1: Adressen mit mehreren @, Anführungszeichen, Leerzeichen
  perform pruef.zahl('Hook lehnt Adresse mit zwei @ ab', $q$select 1 where public.hook_vor_nutzer_anlage('{"user":{"email":"x@kunde-b.test@boese.test"}}') ? 'error'$q$, 1);
  perform pruef.zahl('Hook lehnt Adresse mit drei @ ab', $q$select 1 where public.hook_vor_nutzer_anlage('{"user":{"email":"a@kunde-b.test@b@boese.test"}}') ? 'error'$q$, 1);
  perform pruef.zahl('Hook lehnt Adresse in Anführungszeichen ab', $q$select 1 where public.hook_vor_nutzer_anlage('{"user":{"email":"\"a@kunde-b.test@b\"@boese.test"}}') ? 'error'$q$, 1);
  perform pruef.zahl('Hook lehnt Adresse mit Leerzeichen ab', $q$select 1 where public.hook_vor_nutzer_anlage('{"user":{"email":"a b@kunde-b.test"}}') ? 'error'$q$, 1);
  perform pruef.zahl('Hook lässt normale Adresse der Domain weiter zu', $q$select 1 where public.hook_vor_nutzer_anlage('{"user":{"email":"vor.nach+x@kunde-b.test"}}') ? 'error'$q$, 0);
  perform pruef.fehler('Konto mit zwei @ scheitert in der Datenbank', $q$insert into auth.users (instance_id, id, aud, role, email) values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'x@kunde-b.test@boese.test')$q$);
  perform pruef.fehler('Konto mit Anführungszeichen scheitert in der Datenbank', $q$insert into auth.users (instance_id, id, aud, role, email) values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '"a@kunde-b.test@b"@boese.test')$q$);
  perform pruef.fehler('Konto ohne Adresse (anonym) scheitert in der Datenbank', $q$insert into auth.users (instance_id, id, aud, role, is_anonymous) values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', true)$q$);

  -- Befund 2: unbestätigte Adresse
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', u6, 'authenticated', 'authenticated', 'unbestaetigt@kunde-b.test', '', now(), now());
  perform pruef.als('Konto mit unbestätigter Adresse (Kunde B)', u6);
  perform pruef.sieht_nichts('Berichte', 'select 1 from public.berichte');
  perform pruef.sieht_nichts('Kunde', 'select 1 from public.kunden');
  perform pruef.sieht_nichts('Speicher', 'select 1 from storage.objects');
  perform pruef.kein_schreiben('Anliegen anlegen', format('insert into public.anliegen (kunde_id, titel) values (%L, ''x'')', k2));
  perform pruef.fehler('Entscheidung beantworten', $q$select public.entscheidung_beantworten('e2000000-0000-0000-0000-000000000001', 'ja')$q$);
  perform pruef.als('Prüfer (Befunde)', null, 'aal1', 'postgres');
  update auth.users set email_confirmed_at = now() where id = u6;
  perform pruef.als('Dasselbe Konto nach Bestätigung', u6);
  perform pruef.zahl('sieht jetzt den freigegebenen Bericht', 'select 1 from public.berichte', 1);

  -- Befund 7: Mail-Adresse ändern
  perform pruef.als('Prüfer (Befunde)', null, 'aal1', 'postgres');
  perform pruef.fehler('Mail-Adresse eines Zugangs ändern (auf Adresse bei Kunde B)', format('update auth.users set email = ''chef@kunde-b.test'' where id = %L', a));
  perform pruef.fehler('Mail-Adresse eines Zugangs ändern (auf Freemail)', format('update auth.users set email = ''irgendwer@gmail.com'' where id = %L', a));

  -- Befund 9 und weitere Versuche als Kundin
  insert into public.zugangsliste (kunde_id, art, wert, anzeigename) values (k1, 'adresse', 'weg@kunde-a.test', 'Wera Weg');
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', u7, 'authenticated', 'authenticated', 'weg@kunde-a.test', '', now(), now(), now());
  perform pruef.als('Wera (Kunde A, wird später entfernt)', u7);
  perform pruef.gelingt('darf kommentieren', format('insert into public.kommentare (kunde_id, bezug_art, bezug_id, text) values (%L, ''anliegen'', ''a1000000-0000-0000-0000-000000000001'', ''Von Wera'')', k1));
  perform pruef.gelingt('darf Datei eintragen (mit gefälschtem Drive-Vermerk)', format('insert into public.dateien (kunde_id, pfad, name, richtung, drive_kopie_am, groesse) values (%1$L, %1$L || ''/vom-kunden/wera.txt'', ''wera.txt'', ''vom_kunden'', now(), 5)', k1));
  perform pruef.kein_schreiben('Datei: Pfad mit .. in den Ordner von Kunde B', format('insert into public.dateien (kunde_id, pfad, name, richtung) values (%1$L, %1$L || ''/vom-kunden/../../'' || %2$L || ''/von-uns/datei.txt'', ''x'', ''vom_kunden'')', k1, k2));
  perform pruef.kein_schreiben('Datei: Pfad unter von-uns mit Richtung vom_kunden', format('insert into public.dateien (kunde_id, pfad, name, richtung) values (%1$L, %1$L || ''/von-uns/p3fake.pdf'', ''x'', ''vom_kunden'')', k1));
  perform pruef.kein_schreiben('Datei: Pfad mit doppeltem Schrägstrich', format('insert into public.dateien (kunde_id, pfad, name, richtung) values (%1$L, %1$L || ''/vom-kunden//p3.txt'', ''x'', ''vom_kunden'')', k1));
  perform pruef.kein_schreiben('Datei: negative Größe', format('insert into public.dateien (kunde_id, pfad, name, richtung, groesse) values (%1$L, %1$L || ''/vom-kunden/p3neg.txt'', ''x'', ''vom_kunden'', -5)', k1));
  perform pruef.kein_schreiben('Speicher: Pfad mit .. in den Ordner von Kunde B', format('insert into storage.objects (bucket_id, name) values (''dateien'', %1$L || ''/vom-kunden/../../'' || %2$L || ''/vom-kunden/p3angriff.txt'')', k1, k2));
  perform pruef.kein_schreiben('Speicher: Pfad mit doppeltem Schrägstrich', format('insert into storage.objects (bucket_id, name) values (''dateien'', %1$L || ''/vom-kunden//p3.txt'')', k1));
  perform pruef.kein_schreiben('Speicher: fremder Bucket', format('insert into storage.objects (bucket_id, name) values (''gibtsnicht'', %1$L || ''/vom-kunden/p3.txt'')', k1));
  perform pruef.kein_schreiben('eigenes Anliegen zu Kunde B verschieben', format('update public.anliegen set kunde_id = %L where kunde_id = %L', k2, k1));
  perform pruef.kein_schreiben('eigenen Kommentar zu Kunde B verschieben', format('update public.kommentare set kunde_id = %L where kunde_id = %L', k2, k1));
  perform pruef.fehler('Tabelle leeren (truncate)', 'truncate public.anliegen');
  perform pruef.fehler('Konten lesen (auth.users)', 'select 1 from auth.users');
  perform pruef.sieht_nichts('Buckets lesen', 'select 1 from storage.buckets');

  perform pruef.als('Prüfer (Befunde)', null, 'aal1', 'postgres');
  perform pruef.zahl('Drive-Vermerk der Kundin wurde verworfen', $q$select 1 from public.dateien where name = 'wera.txt' and drive_kopie_am is null and hochgeladen_name = 'Wera Weg'$q$, 1);

  -- Befund 8: Listeneintrag entfernen sperrt
  delete from public.zugangsliste where wert = 'weg@kunde-a.test';
  perform pruef.zahl('Adresse von der Liste genommen: Wera ist gesperrt', format('select 1 from public.mitglieder where user_id = %L and gesperrt_am is not null', u7), 1);
  perform pruef.als('Wera (von der Liste genommen)', u7);
  perform pruef.sieht_nichts('Berichte', 'select 1 from public.berichte');
  perform pruef.sieht_nichts('Dateien', 'select 1 from public.dateien');
  perform pruef.als('Prüfer (Befunde)', null, 'aal1', 'postgres');
  delete from public.zugangsliste where wert = 'kunde-b.test';
  perform pruef.zahl('Domain von der Liste genommen: beide Personen von Kunde B gesperrt', format('select 1 from public.mitglieder where user_id in (%L, %L) and gesperrt_am is not null', b, u6), 2);
  perform pruef.zahl('Domain von der Liste genommen: Anna (Kunde A, per Adresse) nicht gesperrt', format('select 1 from public.mitglieder where user_id = %L and gesperrt_am is null', a), 1);
  insert into public.zugangsliste (rolle, kunde_id, art, wert) values ('kunde', k2, 'domain', 'kunde-b.test');
  update public.mitglieder set gesperrt_am = null where user_id = b;

  -- Befund 13: Konto löschen, Spuren bleiben
  perform pruef.gelingt('Konto mit Kommentar und Datei lässt sich löschen', format('delete from auth.users where id = %L', u7));
  perform pruef.zahl('Kommentar bleibt mit Namen stehen', $q$select 1 from public.kommentare where text = 'Von Wera' and autor_name = 'Wera Weg' and autor is null$q$, 1);
  perform pruef.zahl('Datei bleibt mit Namen stehen', $q$select 1 from public.dateien where name = 'wera.txt' and hochgeladen_name = 'Wera Weg' and hochgeladen_von is null$q$, 1);

  -- Befund 5: Team-Kommentare auf Nicht-Freigegebenes
  perform pruef.als('Tina (Team, zweiter Faktor)', t, 'aal2');
  perform pruef.gelingt('kommentiert Bericht im Entwurf', format('insert into public.kommentare (kunde_id, bezug_art, bezug_id, text) values (%L, ''bericht'', ''b1000000-0000-0000-0000-000000000002'', ''intern'')', k1));
  perform pruef.gelingt('kommentiert Entscheidung im Entwurf', format('insert into public.kommentare (kunde_id, bezug_art, bezug_id, text) values (%L, ''entscheidung'', ''e1000000-0000-0000-0000-000000000002'', ''intern'')', k1));
  perform pruef.gelingt('kommentiert unsichtbaren Roadmap-Punkt', format('insert into public.kommentare (kunde_id, bezug_art, bezug_id, text) values (%L, ''roadmap'', ''c1000000-0000-0000-0000-000000000002'', ''intern'')', k1));
  perform pruef.zahl('sieht ihre drei internen Kommentare', $q$select 1 from public.kommentare where text = 'intern'$q$, 3);
  perform pruef.kein_schreiben('kann sich nicht selbst (erneut) freischalten', 'update public.mitglieder set team_bestaetigt_am = to_timestamp(0) where user_id = auth.uid()');
  perform pruef.als('Anna (Kunde A)', a);
  perform pruef.zahl('sieht keinen internen Kommentar', $q$select 1 from public.kommentare where text = 'intern'$q$, 0);
  perform pruef.zahl('sieht weiter den Kommentar am eigenen Anliegen', $q$select 1 from public.kommentare where text = 'Kommentar'$q$, 1);

  -- Befund 6: Berichtspfad auf fremden Ordner
  perform pruef.als('Prüfer (Befunde)', null, 'aal1', 'postgres');
  perform pruef.fehler('Bericht von A mit Pfad in den Ordner von B', format('update public.berichte set pdf_pfad = %L || ''/wochenstand/2026-11-02.html'' where id = ''b1000000-0000-0000-0000-000000000001''', k2));
  perform pruef.fehler('Bericht mit .. im Pfad', format('update public.berichte set pdf_pfad = %1$L || ''/../'' || %2$L || ''/x.pdf'' where id = ''b1000000-0000-0000-0000-000000000001''', k1, k2));

  -- Befund 3: Team ohne Freischaltung, auch mit aal2
  perform pruef.als('Tom (Team, aal2, nicht freigeschaltet)', t1, 'aal2');
  perform pruef.sieht_nichts('Kunden', 'select 1 from public.kunden');
  perform pruef.sieht_nichts('Zugangsliste', 'select 1 from public.zugangsliste');
  perform pruef.sieht_nichts('Speicher', 'select 1 from storage.objects');
  perform pruef.sieht_nichts('andere Mitglieder', 'select 1 from public.mitglieder where user_id is distinct from auth.uid()');
  perform pruef.kein_schreiben('sich selbst freischalten', 'update public.mitglieder set team_bestaetigt_am = to_timestamp(0) where user_id = auth.uid()');
  perform pruef.als('Tina (Team, zweiter Faktor)', t, 'aal2');
  perform pruef.gelingt('schaltet Tom frei', format('update public.mitglieder set team_bestaetigt_am = now() where user_id = %L', t1));
  perform pruef.als('Tom (freigeschaltet, aal2)', t1, 'aal2');
  perform pruef.zahl('sieht beide Kunden', format('select 1 from public.kunden where id in (%L, %L)', k1, k2), 2);
  perform pruef.als('Tom (freigeschaltet, aber nur aal1)', t1, 'aal1');
  perform pruef.sieht_nichts('Kunden', 'select 1 from public.kunden');
  perform pruef.als('Prüfer (Befunde)', null, 'aal1', 'postgres');
  perform pruef.zahl('Freischaltung steht mit Tina als Urheberin im Protokoll', format('select 1 from public.mitglieder m join public.protokoll p on p.objekt = m.user_id::text and p.aktion = ''team_freigeschaltet'' where m.user_id = %L and m.team_bestaetigt_von = %L', t1, t), 1);
  update public.mitglieder set team_bestaetigt_am = null where user_id = t1;
  update public.mitglieder set gesperrt_am = now() where user_id = t;
  perform pruef.als('Tina (Team, gesperrt, aal2)', t, 'aal2');
  perform pruef.sieht_nichts('Kunden', 'select 1 from public.kunden');
  perform pruef.sieht_nichts('Zugangsliste', 'select 1 from public.zugangsliste');
  perform pruef.kein_schreiben('eigene Sperre aufheben', 'update public.mitglieder set gesperrt_am = null where user_id = auth.uid()');
  perform pruef.als('Prüfer (Befunde)', null, 'aal1', 'postgres');
  update public.mitglieder set gesperrt_am = null where user_id = t;

  -- Befund 14: Voreinstellungen
  perform pruef.zahl('Künftige Tabellen: keine Rechte von selbst für Kunden oder Unangemeldete', $q$select 1 from pg_default_acl where defaclrole = 'postgres'::regrole and defaclnamespace = 'public'::regnamespace and defaclobjtype = 'r' and (defaclacl::text like '%authenticated=%' or defaclacl::text like '%anon=%')$q$, 0);
  perform pruef.zahl('Künftige Funktionen: nicht für alle ausführbar', $q$select 1 from pg_default_acl where defaclrole = 'postgres'::regrole and defaclnamespace = 'public'::regnamespace and defaclobjtype = 'f' and (defaclacl::text like '%anon=%' or defaclacl::text like '{=%' or defaclacl::text like '%,=%')$q$, 0);
  perform pruef.zahl('Zeilenregeln auf jeder Tabelle in public und privat an', $q$select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'privat') and c.relkind = 'r' and not c.relrowsecurity$q$, 0);

  -- Aufräumen
  delete from public.kommentare where text in ('intern', 'Von Wera');
  delete from public.dateien where name = 'wera.txt';
  delete from auth.users where id = u6;
  delete from public.protokoll where objekt in (u6::text, u7::text, t::text, t1::text) or user_id in (u6, u7);
end $function$
;

select pruef.lauf2();
select count(*) as gesamt, count(*) filter (where ok) as bestanden, count(*) filter (where not ok) as durchgefallen from pruef.ergebnis;
select wer, name, detail from pruef.ergebnis where not ok order by nr;
