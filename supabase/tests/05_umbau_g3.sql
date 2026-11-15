-- Tests zum Umbau G3 (15.11.2026). Aufruf nach 04: select pruef.lauf3();
CREATE OR REPLACE FUNCTION pruef.lauf3()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  k1 uuid := '11111111-1111-1111-1111-111111111111';
  k2 uuid := '22222222-2222-2222-2222-222222222222';
  a  uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  b  uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  t  uuid := 'cccccccc-0000-0000-0000-000000000001';
  e_a uuid := 'e1000000-0000-0000-0000-000000000001';
  e_a_entwurf uuid := 'e1000000-0000-0000-0000-000000000002';
  e_b uuid := 'e2000000-0000-0000-0000-000000000001';
  auf_a uuid; auf_b uuid; d_versteckt uuid := gen_random_uuid();
  -- Unabhängige Prüfung 15.11.2026
  e_a3 uuid := 'e1000000-0000-0000-0000-000000000003';
  an_b uuid := 'a2000000-0000-0000-0000-000000000001';
  d_versteckt2 uuid := gen_random_uuid(); d_richtung uuid := gen_random_uuid();
begin
  perform pruef.als('Prüfer (Umbau G3)', null, 'aal1', 'postgres');
  perform set_config('storage.allow_delete_query', 'true', true);
  update public.entscheidungen set status = 'offen', antwort = null where id in (e_a, e_b);
  select id into auf_a from public.aufgaben where kunde_id = k1 limit 1;
  select id into auf_b from public.aufgaben where kunde_id = k2 limit 1;
  -- Team-Datei bei Kunde A, noch nicht sichtbar, mit Speicherobjekt
  insert into public.dateien (id, kunde_id, pfad, name, richtung, sichtbar) values (d_versteckt, k1, k1 || '/von-uns/versteckt.pdf', 'versteckt.pdf', 'von_uns', false);
  insert into storage.objects (bucket_id, name) values ('dateien', k1 || '/von-uns/versteckt.pdf') on conflict do nothing;
  -- Bericht mit zweiter Seite
  update public.berichte set werte_pfad = k1 || '/monatsauswertung/2026-10-01-werte.html' where id = 'b1000000-0000-0000-0000-000000000001';
  insert into storage.objects (bucket_id, name) values ('berichte', k1 || '/monatsauswertung/2026-10-01-werte.html') on conflict do nothing;
  update public.berichte set werte_pfad = k2 || '/monatsauswertung/2026-10-01-werte.html' where id = 'b2000000-0000-0000-0000-000000000001';
  insert into storage.objects (bucket_id, name) values ('berichte', k2 || '/monatsauswertung/2026-10-01-werte.html') on conflict do nothing;

  -- Anna (Kunde A)
  perform pruef.als('Anna (Kunde A)', a);
  perform pruef.sieht_nichts('Datei vom Team, noch nicht sichtbar', format('select 1 from public.dateien where id = %L', d_versteckt));
  perform pruef.sieht_nichts('Speicherobjekt der nicht sichtbaren Datei', format('select 1 from storage.objects where name = %L', k1 || '/von-uns/versteckt.pdf'));
  perform pruef.zahl('sieht die zweite Seite ihres freigegebenen Berichts', format('select 1 from storage.objects where name = %L', k1 || '/monatsauswertung/2026-10-01-werte.html'), 1);
  perform pruef.sieht_nichts('zweite Seite des Berichts von Kunde B', format('select 1 from storage.objects where name = %L', k2 || '/monatsauswertung/2026-10-01-werte.html'));
  perform pruef.fehler('Antwort „vielleicht“ wird abgelehnt', format('select public.entscheidung_beantworten(%L, ''vielleicht'')', e_a));
  perform pruef.gelingt('antwortet „kläre ich intern“', format('select public.entscheidung_beantworten(%L, ''intern'', ''frage den Chef'')', e_a));
  perform pruef.zahl('Entscheidung bleibt offen mit Antwort intern', format('select 1 from public.entscheidungen where id = %L and status = ''offen'' and antwort = ''intern''', e_a), 1);
  perform pruef.gelingt('antwortet danach Ja', format('select public.entscheidung_beantworten(%L, ''ja'')', e_a));
  perform pruef.zahl('Entscheidung ist jetzt beantwortet', format('select 1 from public.entscheidungen where id = %L and status = ''beantwortet'' and antwort = ''ja''', e_a), 1);
  perform pruef.fehler('beantwortet Entscheidung von Kunde B mit intern', format('select public.entscheidung_beantworten(%L, ''intern'')', e_b));
  perform pruef.gelingt('lädt Datei mit Bezug auf eigene Aufgabe hoch (versucht sichtbar=false)', format('insert into public.dateien (kunde_id, pfad, name, richtung, sichtbar, bezug_art, bezug_id) values (%1$L, %1$L || ''/vom-kunden/g3.pdf'', ''g3.pdf'', ''vom_kunden'', false, ''aufgabe'', %2$L)', k1, auf_a));
  perform pruef.zahl('eigene Datei ist trotzdem sichtbar und gehört zur Aufgabe', format('select 1 from public.dateien where pfad = %L and sichtbar and bezug_id = %L', k1 || '/vom-kunden/g3.pdf', auf_a), 1);
  perform pruef.kein_schreiben('Datei mit Bezug auf Aufgabe von Kunde B', format('insert into public.dateien (kunde_id, pfad, name, richtung, bezug_art, bezug_id) values (%1$L, %1$L || ''/vom-kunden/g3b.pdf'', ''x'', ''vom_kunden'', ''aufgabe'', %2$L)', k1, auf_b));
  perform pruef.kein_schreiben('Datei mit Bezug auf Entscheidung im Entwurf', format('insert into public.dateien (kunde_id, pfad, name, richtung, bezug_art, bezug_id) values (%1$L, %1$L || ''/vom-kunden/g3c.pdf'', ''x'', ''vom_kunden'', ''entscheidung'', %2$L)', k1, e_a_entwurf));
  perform pruef.kein_schreiben('Datei mit halbem Bezug', format('insert into public.dateien (kunde_id, pfad, name, richtung, bezug_art) values (%1$L, %1$L || ''/vom-kunden/g3d.pdf'', ''x'', ''vom_kunden'', ''aufgabe'')', k1));
  perform pruef.kein_schreiben('Team-Datei sichtbar machen', format('update public.dateien set sichtbar = true where id = %L', d_versteckt));
  perform pruef.kein_schreiben('Roadmap-Punkt anlegen', format('insert into public.roadmap (kunde_id, titel, status, sichtbar) values (%L, ''x'', ''spaeter'', true)', k1));

  -- Bert (Kunde B) sieht nichts von Kunde A, auch keine Bezüge
  perform pruef.als('Bert (Kunde B)', b);
  perform pruef.sieht_nichts('Dateien von Kunde A', format('select 1 from public.dateien where kunde_id = %L', k1));
  perform pruef.sieht_nichts('Speicher von Kunde A', format('select 1 from storage.objects where name like %L', k1 || '/%'));

  -- Team
  perform pruef.als('Tina (Team, zwei Faktoren)', t, 'aal2');
  perform pruef.zahl('sieht die nicht sichtbare Datei', format('select 1 from public.dateien where id = %L', d_versteckt), 1);
  perform pruef.gelingt('macht die Datei sichtbar', format('update public.dateien set sichtbar = true where id = %L', d_versteckt));
  perform pruef.gelingt('legt Roadmap-Punkt „Später“ an', format('insert into public.roadmap (kunde_id, titel, status, sichtbar) values (%L, ''Planung 2027'', ''spaeter'', true)', k1));
  perform pruef.gelingt('legt Terminnotiz als Entwurf an', format('insert into public.berichte (kunde_id, art, zeitraum, zeitraum_start, titel, html_pfad, status) values (%1$L, ''terminnotiz'', ''13.11.2026'', ''2026-11-13'', ''Terminnotiz'', %1$L || ''/terminnotiz/2026-11-13.html'', ''entwurf'')', k1));
  perform pruef.kein_schreiben('Bericht mit zweiter Seite im Ordner eines anderen Kunden', format('update public.berichte set werte_pfad = %L where id = ''b1000000-0000-0000-0000-000000000001''', k2 || '/x.html'));
  perform pruef.gelingt('setzt den Satz an einer Aufgabe', format('update public.aufgaben set satz = ''Bitte als PDF.'' where id = %L', auf_a));

  -- Anna sieht die Datei jetzt
  perform pruef.als('Anna (Kunde A), nach Freigabe der Datei', a);
  perform pruef.zahl('sieht die freigegebene Team-Datei', format('select 1 from public.dateien where id = %L', d_versteckt), 1);
  perform pruef.zahl('kann sie aus dem Speicher laden', format('select 1 from storage.objects where name = %L', k1 || '/von-uns/versteckt.pdf'), 1);
  perform pruef.sieht_nichts('Terminnotiz im Entwurf', 'select 1 from public.berichte where art = ''terminnotiz''');

  -- Unabhängige Prüfung 15.11.2026: weitere Wege zu nicht sichtbaren Dateien, Entwürfen und fremden Entscheidungen
  perform pruef.als('Prüfer (Prüfung 15.11.)', null, 'aal1', 'postgres');
  insert into public.dateien (id, kunde_id, pfad, name, richtung, sichtbar) values (d_versteckt2, k1, k1 || '/von-uns/versteckt2.pdf', 'versteckt2.pdf', 'von_uns', false);
  insert into storage.objects (bucket_id, name) values ('dateien', k1 || '/von-uns/versteckt2.pdf') on conflict do nothing;
  insert into storage.objects (bucket_id, name) values ('dateien', k1 || '/von-uns/richtung.pdf') on conflict do nothing;
  update public.berichte set werte_pfad = k1 || '/wochenstand/2026-11-02-werte.html' where id = 'b1000000-0000-0000-0000-000000000002';
  insert into storage.objects (bucket_id, name) values ('berichte', k1 || '/wochenstand/2026-11-02-werte.html') on conflict do nothing;
  insert into public.entscheidungen (id, kunde_id, frage, empfehlung, status) values (e_a3, k1, 'Frage G3', 'Empfehlung', 'offen') on conflict (id) do update set status = 'offen', antwort = null;
  perform pruef.fehler('zweite Seite mit .. im Pfad', format('update public.berichte set werte_pfad = %1$L || ''/../'' || %2$L || ''/x.html'' where id = ''b1000000-0000-0000-0000-000000000001''', k1, k2));

  perform pruef.als('Tina (Team), Prüfung 15.11.', t, 'aal2');
  perform pruef.gelingt('kommentiert die nicht sichtbare Datei', format('insert into public.kommentare (kunde_id, bezug_art, bezug_id, text) values (%L, ''datei'', %L, ''intern zur Datei'')', k1, d_versteckt2));
  -- Team legt eine Datei im Ordner von-uns an, aber mit Richtung vom_kunden und ohne Freigabe (z. B. Fehler in der Ablage).
  -- Ob die Datenbank das ablehnt oder nur verbirgt, ist offen; geprüft wird unten, dass Anna sie nicht sieht.
  begin
    insert into public.dateien (id, kunde_id, pfad, name, richtung, sichtbar) values (d_richtung, k1, k1 || '/von-uns/richtung.pdf', 'richtung.pdf', 'vom_kunden', false);
  exception when others then null; end;
  perform pruef.kein_schreiben('Datei bei Kunde A mit Bezug auf Aufgabe von Kunde B', format('insert into public.dateien (kunde_id, pfad, name, richtung, bezug_art, bezug_id) values (%1$L, %1$L || ''/von-uns/g3t.pdf'', ''x'', ''von_uns'', ''aufgabe'', %2$L)', k1, auf_b));
  perform pruef.fehler('Team ohne Kundenzugang antwortet „intern“', format('select public.entscheidung_beantworten(%L, ''intern'')', e_a3));

  perform pruef.als('Anna (Kunde A), Prüfung 15.11.', a);
  perform pruef.sieht_nichts('Team-Kommentar an nicht sichtbarer Datei', format('select 1 from public.kommentare where bezug_art = ''datei'' and bezug_id = %L', d_versteckt2));
  perform pruef.fehler('kommentiert die nicht sichtbare Team-Datei', format('insert into public.kommentare (kunde_id, bezug_art, bezug_id, text) values (%L, ''datei'', %L, ''x'')', k1, d_versteckt2));
  perform pruef.sieht_nichts('Team-Datei mit Richtung vom_kunden ohne Freigabe', format('select 1 from public.dateien where id = %L', d_richtung));
  perform pruef.sieht_nichts('Speicherobjekt der Team-Datei mit Richtung vom_kunden', format('select 1 from storage.objects where name = %L', k1 || '/von-uns/richtung.pdf'));
  perform pruef.sieht_nichts('zweite Seite eines Berichts im Entwurf', format('select 1 from storage.objects where name = %L', k1 || '/wochenstand/2026-11-02-werte.html'));
  perform pruef.kein_schreiben('Bezug der eigenen Datei entfernen', format('update public.dateien set bezug_art = null, bezug_id = null where pfad = %L', k1 || '/vom-kunden/g3.pdf'));
  perform pruef.kein_schreiben('Bezug der eigenen Datei auf Aufgabe von Kunde B umhängen', format('update public.dateien set bezug_id = %L where pfad = %L', auf_b, k1 || '/vom-kunden/g3.pdf'));
  perform pruef.kein_schreiben('eigene Datei unsichtbar machen', format('update public.dateien set sichtbar = false where pfad = %L', k1 || '/vom-kunden/g3.pdf'));
  perform pruef.kein_schreiben('Datei mit Bezug auf Anliegen von Kunde B', format('insert into public.dateien (kunde_id, pfad, name, richtung, bezug_art, bezug_id) values (%1$L, %1$L || ''/vom-kunden/g3e.pdf'', ''x'', ''vom_kunden'', ''anliegen'', %2$L)', k1, an_b));
  perform pruef.kein_schreiben('Datei mit Bezug auf Entscheidung von Kunde B', format('insert into public.dateien (kunde_id, pfad, name, richtung, bezug_art, bezug_id) values (%1$L, %1$L || ''/vom-kunden/g3f.pdf'', ''x'', ''vom_kunden'', ''entscheidung'', %2$L)', k1, e_b));
  perform pruef.kein_schreiben('Datei mit Bezug auf nicht vorhandene Aufgabe', format('insert into public.dateien (kunde_id, pfad, name, richtung, bezug_art, bezug_id) values (%1$L, %1$L || ''/vom-kunden/g3g.pdf'', ''x'', ''vom_kunden'', ''aufgabe'', gen_random_uuid())', k1));
  perform pruef.fehler('antwortet „intern“ auf Entscheidung im Entwurf', format('select public.entscheidung_beantworten(%L, ''intern'')', e_a_entwurf));
  perform pruef.gelingt('antwortet „intern“', format('select public.entscheidung_beantworten(%L, ''intern'')', e_a3));
  perform pruef.gelingt('antwortet ein zweites Mal „intern“', format('select public.entscheidung_beantworten(%L, ''intern'', ''noch offen'')', e_a3));

  perform pruef.als('Bert (Kunde B), Prüfung 15.11.', b);
  perform pruef.fehler('beantwortet Entscheidung von Kunde A nach „intern“ mit Ja', format('select public.entscheidung_beantworten(%L, ''ja'')', e_a3));
  perform pruef.sieht_nichts('Entscheidung von Kunde A nach „intern“', format('select 1 from public.entscheidungen where id = %L', e_a3));

  perform pruef.als('Prüfer (Prüfung 15.11.)', null, 'aal1', 'postgres');
  perform pruef.zahl('Entscheidung nach zweimal „intern“ weiter offen, von Anna', format('select 1 from public.entscheidungen where id = %L and status = ''offen'' and antwort = ''intern'' and beantwortet_von_id = %L', e_a3, a), 1);

  -- Aufräumen, damit 03 bis 05 erneut laufen können (03 prüft den Bestand an Berichten und Speicherobjekten)
  delete from storage.objects where name in (k1 || '/von-uns/versteckt.pdf', k1 || '/von-uns/versteckt2.pdf', k1 || '/von-uns/richtung.pdf',
    k1 || '/monatsauswertung/2026-10-01-werte.html', k2 || '/monatsauswertung/2026-10-01-werte.html', k1 || '/wochenstand/2026-11-02-werte.html');
  delete from public.kommentare where bezug_art = 'datei' and bezug_id in (d_versteckt, d_versteckt2, d_richtung);
  delete from public.dateien where id in (d_versteckt, d_versteckt2, d_richtung) or pfad like '%/vom-kunden/g3%' or pfad like '%/von-uns/g3%';
  delete from public.berichte where art = 'terminnotiz' and kunde_id = k1;
  update public.berichte set werte_pfad = null where kunde_id in (k1, k2);
  delete from public.entscheidungen where id = e_a3;
  delete from public.roadmap where titel = 'Planung 2027';
  update public.aufgaben set satz = null where kunde_id in (k1, k2);
end $function$;

select pruef.lauf3();
select count(*) as gesamt, count(*) filter (where ok) as bestanden, count(*) filter (where not ok) as durchgefallen from pruef.ergebnis;
select wer, name, detail from pruef.ergebnis where not ok order by nr;
