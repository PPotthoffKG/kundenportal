-- Tests zur Kundentrennung (auch Negativtests). Voraussetzung: 01_pruefwerkzeug.sql und 02_testdaten.sql. Aufruf: select pruef.lauf(); danach pruef.ergebnis auswerten.
CREATE OR REPLACE FUNCTION pruef.lauf()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  k1 uuid := '11111111-1111-1111-1111-111111111111';
  k2 uuid := '22222222-2222-2222-2222-222222222222';
  a  uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  g  uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  b  uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  t  uuid := 'cccccccc-0000-0000-0000-000000000001';
  t1 uuid := 'cccccccc-0000-0000-0000-000000000002';
  x  uuid := 'dddddddd-0000-0000-0000-000000000009';
  tabs text[] := array['berichte','entscheidungen','aufgaben','dateien','werkzeuge','protokoll','anliegen','kommentare','roadmap','zugangsliste','mitglieder'];
  r record; tb text; kf uuid; nf text; s text;
begin
  -- Ausgangszustand herstellen, damit der Lauf wiederholbar ist
  perform pruef.als('Prüfer', null, 'aal1', 'postgres');
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where name like '%/neu.txt' or name like '%angriff%' or name like '%/x.%';
  delete from public.kommentare where autor_name is distinct from 'Seed';
  delete from public.anliegen where erstellt_name is distinct from 'Seed';
  delete from public.dateien where name <> 'datei.txt';
  delete from public.berichte where zeitraum in ('Angriff', 'Eigenbau');
  delete from public.entscheidungen where frage = 'x';
  delete from public.aufgaben where titel = 'x';
  delete from public.werkzeuge where titel = 'x';
  delete from public.roadmap where titel = 'x';
  delete from public.zugangsliste where wert like '%angriff%' or wert in ('kollege@kunde-a.test', 'gmail.com', 'pp.test');
  delete from public.kunden where slug = 'angriff';
  update public.kunden set aktiv = true, name = case id when k1 then 'Testkunde A' else 'Testkunde B' end where id in (k1, k2);
  update public.entscheidungen set status = case when right(id::text, 1) = '1' then 'offen' else 'entwurf' end,
         antwort = null, kommentar = null, beantwortet_von = null, beantwortet_von_id = null, beantwortet_am = null;
  update public.mitglieder set gesperrt_am = null where user_id = b;
  update public.mitglieder set letzte_anmeldung = null;
  delete from public.protokoll where aktion in ('bericht_geoeffnet', 'entscheidung_beantwortet', 'anmeldung', 'gefaelscht')
     or (aktion in ('person_gesperrt', 'person_entsperrt') and objekt = b::text);
  delete from pruef.ergebnis;

  -- TEIL 1: Jede Person gegen jede Tabelle, jeden Bucket und jede Funktion eines fremden Kunden
  for r in select * from (values
      ('Anna (Kunde A)',                  a,          'aal1', 'authenticated', array[k2]),
      ('Anna mit selbst gesetztem aal2',  a,          'aal2', 'authenticated', array[k2]),
      ('Bert (Kunde B)',                  b,          'aal1', 'authenticated', array[k1]),
      ('Gerd (gesperrt, Kunde A)',        g,          'aal1', 'authenticated', array[k1, k2]),
      ('Tom (Team ohne zweiten Faktor)',  t1,         'aal1', 'authenticated', array[k1, k2]),
      ('Konto ohne Zuordnung',            x,          'aal2', 'authenticated', array[k1, k2]),
      ('Nicht angemeldet',                null::uuid, 'aal1', 'anon',          array[k1, k2])
    ) v(wer, uid, aal, rolle, fremd)
  loop
    perform pruef.als(r.wer, r.uid, r.aal, r.rolle);
    foreach kf in array r.fremd loop
      nf := case when kf = k1 then 'A' else 'B' end;
      foreach tb in array tabs loop
        perform pruef.sieht_nichts(tb || ': lesen bei Kunde ' || nf,
          format('select 1 from public.%I where kunde_id = %L', tb, kf)
          || case when tb = 'mitglieder' then ' and user_id is distinct from auth.uid()' else '' end);
        perform pruef.kein_schreiben(tb || ': ändern bei Kunde ' || nf, format('update public.%I set kunde_id = kunde_id where kunde_id = %L', tb, kf));
        perform pruef.kein_schreiben(tb || ': löschen bei Kunde ' || nf, format('delete from public.%I where kunde_id = %L', tb, kf));
      end loop;
      perform pruef.sieht_nichts('kunden: lesen Kunde ' || nf, format('select 1 from public.kunden where id = %L', kf));
      perform pruef.kein_schreiben('kunden: ändern Kunde ' || nf, format('update public.kunden set name = ''gekapert'' where id = %L', kf));
      perform pruef.kein_schreiben('kunden: löschen Kunde ' || nf, format('delete from public.kunden where id = %L', kf));
      foreach s in array array[
        'insert into public.berichte (kunde_id, art, zeitraum, zeitraum_start, titel, status) values (%1$L, ''wochenstand'', ''Angriff'', ''2026-01-01'', ''x'', ''freigegeben'')',
        'insert into public.entscheidungen (kunde_id, frage, empfehlung, status) values (%1$L, ''x'', ''x'', ''offen'')',
        'insert into public.aufgaben (kunde_id, titel, liegt_bei) values (%1$L, ''x'', ''wir'')',
        'insert into public.dateien (kunde_id, pfad, name, richtung) values (%1$L, %1$L || ''/vom-kunden/angriff.txt'', ''x'', ''vom_kunden'')',
        'insert into public.werkzeuge (kunde_id, titel, url) values (%1$L, ''x'', ''https://boese.test'')',
        'insert into public.protokoll (kunde_id, aktion) values (%1$L, ''gefaelscht'')',
        'insert into public.anliegen (kunde_id, titel) values (%1$L, ''x'')',
        'insert into public.kommentare (kunde_id, bezug_art, bezug_id, text) values (%1$L, ''anliegen'', %2$L, ''x'')',
        'insert into public.roadmap (kunde_id, titel, sichtbar) values (%1$L, ''x'', true)',
        'insert into public.zugangsliste (kunde_id, art, wert) values (%1$L, ''adresse'', ''boese@angriff.test'')',
        'insert into public.zugangsliste (kunde_id, art, wert) values (%1$L, ''domain'', ''angriff.test'')',
        'update public.mitglieder set kunde_id = %1$L where user_id = auth.uid()',
        'insert into storage.objects (bucket_id, name) values (''dateien'', %1$L || ''/vom-kunden/angriff.txt'')',
        'insert into storage.objects (bucket_id, name) values (''berichte'', %1$L || ''/angriff.html'')',
        'update storage.objects set name = name where name like %1$L || ''/%%''',
        'delete from storage.objects where name like %1$L || ''/%%'''
      ] loop
        perform pruef.kein_schreiben(split_part(s, '(', 1) || ' bei Kunde ' || nf,
          format(s, kf, (case when kf = k1 then 'a1' else 'a2' end) || '000000-0000-0000-0000-000000000001'));
      end loop;
      perform pruef.sieht_nichts('Speicher: lesen bei Kunde ' || nf, format('select 1 from storage.objects where name like %L', kf || '/%'));
      perform pruef.fehler('Funktion entscheidung_beantworten bei Kunde ' || nf,
        format('select public.entscheidung_beantworten(%L, ''ja'', ''gekapert'')', (case when kf = k1 then 'e1' else 'e2' end) || '000000-0000-0000-0000-000000000001'));
      begin
        execute format('select public.bericht_geoeffnet(%L)', (case when kf = k1 then 'b1' else 'b2' end) || '000000-0000-0000-0000-000000000001');
      exception when others then null; end;
    end loop;
    perform pruef.kein_schreiben('mitglieder: sich selbst zum Team machen', 'update public.mitglieder set rolle = ''team'', kunde_id = null where user_id = auth.uid()');
    perform pruef.kein_schreiben('mitglieder: eigene Sperre aufheben', 'update public.mitglieder set gesperrt_am = null where user_id = auth.uid()');
    perform pruef.kein_schreiben('mitglieder: eigenen Namen ändern', 'update public.mitglieder set anzeigename = ''Patrick Potthoff'' where user_id = auth.uid()');
    perform pruef.kein_schreiben('kunden: neuen Kunden anlegen', 'insert into public.kunden (slug, name) values (''angriff'', ''x'')');
    perform pruef.fehler('Funktion ablage_schluessel_pruefen', 'select public.ablage_schluessel_pruefen(''x'')');
    perform pruef.fehler('Funktion hook_vor_nutzer_anlage', 'select public.hook_vor_nutzer_anlage(''{}''::jsonb)');
    perform pruef.fehler('Schema privat: Tabelle ablage_schluessel', 'select * from privat.ablage_schluessel');
    perform pruef.fehler('Schema privat: Funktion wer', 'select * from privat.wer()');
    perform pruef.fehler('Schema privat: Funktion zugang_finden', 'select privat.zugang_finden(''anna@kunde-a.test'')');
    perform pruef.sieht_nichts('zugangsliste: überhaupt etwas lesen', 'select 1 from public.zugangsliste');
    perform pruef.sieht_nichts('protokoll: überhaupt etwas lesen', 'select 1 from public.protokoll');
  end loop;

  perform pruef.als('Prüfer', null, 'aal1', 'postgres');
  perform pruef.zahl('Nachkontrolle: kein fremder Bericht als geöffnet protokolliert', 'select 1 from public.protokoll where aktion = ''bericht_geoeffnet''', 0);
  perform pruef.zahl('Nachkontrolle: keine Entscheidung beantwortet', 'select 1 from public.entscheidungen where status = ''beantwortet''', 0);
  perform pruef.zahl('Nachkontrolle: Kundennamen unverändert', 'select 1 from public.kunden where name = ''gekapert''', 0);
  perform pruef.zahl('Nachkontrolle: Bestand unverändert (4 Berichte, 4 Entscheidungen, 2 Anliegen, 2 Kommentare, 4 Dateien, 8 Objekte)',
    'select 1 where (select count(*) from public.berichte) = 4 and (select count(*) from public.entscheidungen) = 4 and (select count(*) from public.anliegen) = 2 and (select count(*) from public.kommentare) = 2 and (select count(*) from public.dateien) = 4 and (select count(*) from storage.objects) = 8 and (select count(*) from public.zugangsliste) = 5 and (select count(*) from public.mitglieder) = 5', 1);

  -- TEIL 3: Was Anna beim eigenen Kunden sieht und darf
  perform pruef.als('Anna (Kunde A), eigener Kunde', a);
  perform pruef.zahl('sieht genau ihren Kunden', 'select 1 from public.kunden', 1);
  perform pruef.zahl('sieht nur den freigegebenen Bericht', 'select 1 from public.berichte', 1);
  perform pruef.zahl('sieht nur die offene Entscheidung, nicht den Entwurf', 'select 1 from public.entscheidungen', 1);
  perform pruef.zahl('sieht nur den sichtbaren Roadmap-Punkt', 'select 1 from public.roadmap', 1);
  perform pruef.zahl('sieht ihre Aufgabe', 'select 1 from public.aufgaben', 1);
  perform pruef.zahl('sieht ihr Werkzeug', 'select 1 from public.werkzeuge', 1);
  perform pruef.zahl('sieht ihre zwei Dateien', 'select 1 from public.dateien', 2);
  perform pruef.zahl('sieht ihr Anliegen', 'select 1 from public.anliegen', 1);
  perform pruef.zahl('sieht ihren Kommentar', 'select 1 from public.kommentare', 1);
  perform pruef.zahl('sieht nur sich selbst, nicht Gerd', 'select 1 from public.mitglieder', 1);
  perform pruef.zahl('Speicher: ein freigegebener Bericht und zwei Dateien', 'select 1 from storage.objects', 3);
  foreach s in array array[
    'insert into public.berichte (kunde_id, art, zeitraum, zeitraum_start, titel) values (%1$L, ''wochenstand'', ''Eigenbau'', ''2026-01-01'', ''x'')',
    'update public.berichte set status = ''freigegeben'' where kunde_id = %1$L and status = ''entwurf''',
    'update public.berichte set titel = ''x'' where kunde_id = %1$L',
    'update public.entscheidungen set antwort = ''ja'', status = ''beantwortet'' where kunde_id = %1$L',
    'update public.aufgaben set erledigt = true where kunde_id = %1$L',
    'delete from public.dateien where kunde_id = %1$L',
    'update public.dateien set name = ''x'' where kunde_id = %1$L',
    'update public.anliegen set status = ''erledigt'' where kunde_id = %1$L',
    'delete from public.anliegen where kunde_id = %1$L',
    'update public.kommentare set text = ''umgeschrieben'' where kunde_id = %1$L',
    'delete from public.kommentare where kunde_id = %1$L',
    'insert into public.roadmap (kunde_id, titel, sichtbar) values (%1$L, ''x'', true)',
    'update public.roadmap set sichtbar = true where kunde_id = %1$L',
    'insert into public.werkzeuge (kunde_id, titel, url) values (%1$L, ''x'', ''https://boese.test'')',
    'insert into public.aufgaben (kunde_id, titel, liegt_bei) values (%1$L, ''x'', ''wir'')',
    'insert into public.entscheidungen (kunde_id, frage, empfehlung, status) values (%1$L, ''x'', ''x'', ''offen'')',
    'insert into public.zugangsliste (kunde_id, art, wert) values (%1$L, ''adresse'', ''kollege@kunde-a.test'')',
    'insert into public.protokoll (kunde_id, aktion) values (%1$L, ''gefaelscht'')',
    'update public.kunden set name = ''x'', aktiv = true where id = %1$L',
    'insert into public.dateien (kunde_id, pfad, name, richtung) values (%1$L, %1$L || ''/von-uns/x.txt'', ''x'', ''von_uns'')',
    'insert into public.dateien (kunde_id, pfad, name, richtung) values (%1$L, %2$L || ''/vom-kunden/x.txt'', ''x'', ''vom_kunden'')',
    'insert into public.anliegen (kunde_id, titel, status) values (%1$L, ''x'', ''erledigt'')',
    'insert into storage.objects (bucket_id, name) values (''dateien'', %1$L || ''/von-uns/x.txt'')',
    'insert into storage.objects (bucket_id, name) values (''berichte'', %1$L || ''/x.html'')',
    'update storage.objects set name = name where name like %1$L || ''/%%''',
    'delete from storage.objects where name like %1$L || ''/%%'''
  ] loop
    perform pruef.kein_schreiben('eigener Kunde, verboten: ' || left(s, 70), format(s, k1, k2));
  end loop;
  perform pruef.fehler('Kommentar auf Bericht im Entwurf', format('insert into public.kommentare (kunde_id, bezug_art, bezug_id, text) values (%L, ''bericht'', ''b1000000-0000-0000-0000-000000000002'', ''x'')', k1));
  perform pruef.fehler('Kommentar auf unsichtbaren Roadmap-Punkt', format('insert into public.kommentare (kunde_id, bezug_art, bezug_id, text) values (%L, ''roadmap'', ''c1000000-0000-0000-0000-000000000002'', ''x'')', k1));
  perform pruef.fehler('Kommentar mit eigenem Kunden auf Anliegen von Kunde B', format('insert into public.kommentare (kunde_id, bezug_art, bezug_id, text) values (%L, ''anliegen'', ''a2000000-0000-0000-0000-000000000001'', ''x'')', k1));
  perform pruef.fehler('Kommentar auf Entscheidung im Entwurf', format('insert into public.kommentare (kunde_id, bezug_art, bezug_id, text) values (%L, ''entscheidung'', ''e1000000-0000-0000-0000-000000000002'', ''x'')', k1));
  perform pruef.fehler('Entscheidung im Entwurf beantworten', 'select public.entscheidung_beantworten(''e1000000-0000-0000-0000-000000000002'', ''ja'')');
  perform pruef.fehler('Antwort „vielleicht“', 'select public.entscheidung_beantworten(''e1000000-0000-0000-0000-000000000001'', ''vielleicht'')');
  perform pruef.gelingt('darf Anliegen anlegen', format('insert into public.anliegen (kunde_id, titel, erstellt_name, erstellt_rolle, erstellt_von) values (%L, ''Echtes Anliegen'', ''Patrick Potthoff'', ''team'', %L)', k1, t));
  perform pruef.gelingt('darf kommentieren', format('insert into public.kommentare (kunde_id, bezug_art, bezug_id, text, autor_name, autor_rolle, autor) values (%L, ''anliegen'', ''a1000000-0000-0000-0000-000000000001'', ''Hallo'', ''Patrick Potthoff'', ''team'', %L)', k1, t));
  perform pruef.gelingt('darf Bericht kommentieren', format('insert into public.kommentare (kunde_id, bezug_art, bezug_id, text) values (%L, ''bericht'', ''b1000000-0000-0000-0000-000000000001'', ''Frage zum Bericht'')', k1));
  perform pruef.gelingt('darf Datei eintragen', format('insert into public.dateien (kunde_id, pfad, name, richtung, hochgeladen_name) values (%1$L, %1$L || ''/vom-kunden/neu.txt'', ''neu.txt'', ''vom_kunden'', ''Patrick Potthoff'')', k1));
  perform pruef.gelingt('darf Datei hochladen', format('insert into storage.objects (bucket_id, name) values (''dateien'', %L || ''/vom-kunden/neu.txt'')', k1));
  perform pruef.gelingt('darf offene Entscheidung beantworten', 'select public.entscheidung_beantworten(''e1000000-0000-0000-0000-000000000001'', ''ja'', ''passt'')');
  perform pruef.fehler('zweite Antwort auf dieselbe Entscheidung', 'select public.entscheidung_beantworten(''e1000000-0000-0000-0000-000000000001'', ''nein'')');
  perform pruef.gelingt('Anmeldung wird vermerkt', 'select public.angemeldet()');

  perform pruef.als('Prüfer', null, 'aal1', 'postgres');
  perform pruef.zahl('Anliegen trägt Annas Namen, nicht den gefälschten', format('select 1 from public.anliegen where titel = ''Echtes Anliegen'' and erstellt_name = ''Anna A'' and erstellt_rolle = ''kunde'' and erstellt_von = %L', a), 1);
  perform pruef.zahl('Kommentar trägt Annas Namen, nicht den gefälschten', format('select 1 from public.kommentare where text = ''Hallo'' and autor_name = ''Anna A'' and autor_rolle = ''kunde'' and autor = %L', a), 1);
  perform pruef.zahl('Datei trägt Annas Namen', format('select 1 from public.dateien where name = ''neu.txt'' and hochgeladen_name = ''Anna A'' and hochgeladen_von = %L', a), 1);
  perform pruef.zahl('Antwort trägt Annas Namen', format('select 1 from public.entscheidungen where id = ''e1000000-0000-0000-0000-000000000001'' and beantwortet_von = ''Anna A'' and beantwortet_von_id = %L and antwort = ''ja''', a), 1);
  perform pruef.zahl('Anna: Anmeldung vermerkt', format('select 1 from public.mitglieder where user_id = %L and letzte_anmeldung is not null', a), 1);
  perform pruef.zahl('Gerd (gesperrt): keine Anmeldung vermerkt', format('select 1 from public.mitglieder where user_id = %L and letzte_anmeldung is not null', g), 0);

  -- TEIL 4: Team mit zweitem Faktor, Sperre wirkt sofort
  perform pruef.als('Tina (Team, zweiter Faktor)', t, 'aal2');
  perform pruef.zahl('sieht beide Kunden', format('select 1 from public.kunden where id in (%L, %L)', k1, k2), 2);
  perform pruef.zahl('sieht alle vier Berichte', format('select 1 from public.berichte where kunde_id in (%L, %L)', k1, k2), 4);
  perform pruef.zahl('sieht die Antwort von Anna', 'select 1 from public.entscheidungen where status = ''beantwortet''', 1);
  perform pruef.zahl('sieht die Zugangsliste', 'select 1 from public.zugangsliste', 5);
  perform pruef.gelingt('darf im Namen des Teams kommentieren', format('insert into public.kommentare (kunde_id, bezug_art, bezug_id, text) values (%L, ''anliegen'', ''a1000000-0000-0000-0000-000000000001'', ''Antwort vom Team'')', k1));
  perform pruef.gelingt('sperrt Bert', format('update public.mitglieder set gesperrt_am = now() where user_id = %L', b));
  perform pruef.als('Bert (eben gesperrt, alte Sitzung)', b);
  perform pruef.sieht_nichts('Berichte', 'select 1 from public.berichte');
  perform pruef.sieht_nichts('Kunde', 'select 1 from public.kunden');
  perform pruef.sieht_nichts('Speicher', 'select 1 from storage.objects');
  perform pruef.kein_schreiben('Anliegen anlegen', format('insert into public.anliegen (kunde_id, titel) values (%L, ''x'')', k2));
  perform pruef.fehler('Entscheidung beantworten', 'select public.entscheidung_beantworten(''e2000000-0000-0000-0000-000000000001'', ''ja'')');
  perform pruef.als('Tina (Team, zweiter Faktor)', t, 'aal2');
  perform pruef.gelingt('entsperrt Bert', format('update public.mitglieder set gesperrt_am = null where user_id = %L', b));
  perform pruef.als('Bert (entsperrt)', b);
  perform pruef.zahl('sieht wieder seinen freigegebenen Bericht', 'select 1 from public.berichte', 1);
  perform pruef.als('Prüfer', null, 'aal1', 'postgres');
  perform pruef.zahl('Sperre und Entsperrung stehen im Protokoll', 'select 1 from public.protokoll where aktion in (''person_gesperrt'', ''person_entsperrt'') and objekt = ''bbbbbbbb-0000-0000-0000-000000000001''', 2);
  perform pruef.zahl('Team-Kommentar trägt Tinas Namen und Rolle', 'select 1 from public.kommentare where text = ''Antwort vom Team'' and autor_name = ''Tina Team'' and autor_rolle = ''team''', 1);
  update public.kunden set aktiv = false where id = k2;
  perform pruef.als('Bert (Kunde B inaktiv gesetzt)', b);
  perform pruef.sieht_nichts('Berichte', 'select 1 from public.berichte');
  perform pruef.sieht_nichts('Dateien', 'select 1 from public.dateien');
  perform pruef.als('Prüfer', null, 'aal1', 'postgres');
  update public.kunden set aktiv = true where id = k2;

  -- TEIL 5: Wer bekommt ein Konto
  perform pruef.zahl('Hook lehnt unbekannte Adresse ab', 'select 1 where public.hook_vor_nutzer_anlage(''{"user":{"email":"fremd@irgendwo.test"}}'') ? ''error''', 1);
  perform pruef.zahl('Hook lehnt Subdomain ab', 'select 1 where public.hook_vor_nutzer_anlage(''{"user":{"email":"x@sub.kunde-b.test"}}'') ? ''error''', 1);
  perform pruef.zahl('Hook lehnt angehängte Domain ab', 'select 1 where public.hook_vor_nutzer_anlage(''{"user":{"email":"x@kunde-b.test.boese.test"}}'') ? ''error''', 1);
  perform pruef.zahl('Hook lehnt Kollegen ohne Eintrag ab (Kunde A nur per Adresse)', 'select 1 where public.hook_vor_nutzer_anlage(''{"user":{"email":"kollege@kunde-a.test"}}'') ? ''error''', 1);
  perform pruef.zahl('Hook lehnt leere Adresse ab', 'select 1 where public.hook_vor_nutzer_anlage(''{"user":{}}'') ? ''error''', 1);
  perform pruef.zahl('Hook lässt gelistete Adresse zu, auch groß geschrieben', 'select 1 where public.hook_vor_nutzer_anlage(''{"user":{"email":"ANNA@Kunde-A.test"}}'') ? ''error''', 0);
  perform pruef.zahl('Hook lässt Adresse der gelisteten Domain zu', 'select 1 where public.hook_vor_nutzer_anlage(''{"user":{"email":"neu@kunde-b.test"}}'') ? ''error''', 0);
  perform pruef.zahl('Auth-Dienst darf den Hook aufrufen', 'select 1 where has_function_privilege(''supabase_auth_admin'', ''public.hook_vor_nutzer_anlage(jsonb)'', ''execute'')', 1);
  perform pruef.fehler('Konto ohne Listeneintrag scheitert auch in der Datenbank', 'insert into auth.users (instance_id, id, aud, role, email) values (''00000000-0000-0000-0000-000000000000'', gen_random_uuid(), ''authenticated'', ''authenticated'', ''fremd@irgendwo.test'')');
  perform pruef.fehler('Liste: Freemail als Domain', format('insert into public.zugangsliste (kunde_id, art, wert) values (%L, ''domain'', ''gmail.com'')', k1));
  perform pruef.fehler('Liste: dieselbe Domain für zweiten Kunden', format('insert into public.zugangsliste (kunde_id, art, wert) values (%L, ''domain'', ''kunde-b.test'')', k1));
  perform pruef.fehler('Liste: dieselbe Adresse für zweiten Kunden', format('insert into public.zugangsliste (kunde_id, art, wert) values (%L, ''adresse'', ''anna@kunde-a.test'')', k2));
  perform pruef.fehler('Liste: Team per Domain', 'insert into public.zugangsliste (rolle, art, wert) values (''team'', ''domain'', ''pp.test'')');
  perform pruef.fehler('Liste: Adresse mit Großbuchstaben', format('insert into public.zugangsliste (kunde_id, art, wert) values (%L, ''adresse'', ''Gross@kunde-a.test'')', k1));
end $function$
;

select pruef.lauf();
select count(*) as gesamt, count(*) filter (where ok) as bestanden, count(*) filter (where not ok) as durchgefallen from pruef.ergebnis;
select wer, name, detail from pruef.ergebnis where not ok order by nr;
