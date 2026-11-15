-- Umbau nach G1 bis G3 (15.11.2026). Kundentrennung bleibt unberührt: alle neuen Felder laufen durch die bestehenden Zeilenregeln.

-- 1. Entscheidungen: dritte Antwort „kläre ich intern“. Die Entscheidung bleibt dann offen und kann später mit Ja oder Nein beantwortet werden.
alter table public.entscheidungen drop constraint entscheidungen_antwort_check,
  add constraint entscheidungen_antwort_check check (antwort in ('ja', 'nein', 'intern'));

create or replace function public.entscheidung_beantworten(p_id uuid, p_antwort text, p_kommentar text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare k uuid := public.meine_kunde_id(); v_name text;
begin
  if k is null then raise exception 'Kein Kundenzugang'; end if;
  if p_antwort is null or p_antwort not in ('ja', 'nein', 'intern') then raise exception 'Antwort muss ja, nein oder intern sein'; end if;
  select w.name into v_name from privat.wer() w;
  update public.entscheidungen
     set antwort = p_antwort, kommentar = nullif(btrim(left(p_kommentar, 5000)), ''), beantwortet_von = v_name,
         beantwortet_von_id = auth.uid(), beantwortet_am = now(),
         status = case when p_antwort = 'intern' then 'offen' else 'beantwortet' end
   where id = p_id and kunde_id = k and status = 'offen';
  if not found then raise exception 'Entscheidung nicht offen oder nicht gefunden'; end if;
  insert into public.protokoll (kunde_id, aktion, objekt, details)
  values (k, 'entscheidung_beantwortet', p_id::text, jsonb_build_object('antwort', p_antwort, 'name', v_name));
end $$;
revoke all on function public.entscheidung_beantworten(uuid, text, text) from public, anon;
grant execute on function public.entscheidung_beantworten(uuid, text, text) to authenticated;

-- 2. Dateien: sichtbar erst nach bewusstem Schritt (Team), Bezug auf Aufgabe, Anliegen oder Entscheidung.
alter table public.dateien
  add column sichtbar boolean not null default false,
  add column bezug_art text check (bezug_art in ('aufgabe', 'anliegen', 'entscheidung')),
  add column bezug_id uuid,
  add constraint bezug_vollstaendig check ((bezug_art is null) = (bezug_id is null));
update public.dateien set sichtbar = true;  -- Bestand war bisher sofort sichtbar

-- Kunden laden immer sichtbar hoch; das Team entscheidet selbst
create or replace function public.bei_autor() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w record;
begin
  if auth.uid() is null then return new; end if;  -- Dienstzugriff (Ablage, Abgleich)
  select * into w from privat.wer();
  if w.name is null then raise exception 'Kein Zugang'; end if;
  if tg_table_name = 'anliegen' then
    new.erstellt_von := auth.uid(); new.erstellt_name := w.name; new.erstellt_rolle := w.rolle;
    new.erstellt := now(); new.aktualisiert := now();
  elsif tg_table_name = 'kommentare' then
    new.autor := auth.uid(); new.autor_name := w.name; new.autor_rolle := w.rolle; new.erstellt := now();
  elsif tg_table_name = 'dateien' then
    new.hochgeladen_von := auth.uid(); new.hochgeladen_name := w.name; new.erstellt := now();
    if w.rolle = 'kunde' then new.drive_kopie_am := null; new.sichtbar := true; end if;
  end if;
  return new;
end $$;

-- Bezug einer Datei muss zum selben Kunden gehören und für den Kunden sichtbar sein
create or replace function public.bei_datei_bezug() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_kunde boolean := auth.uid() is not null and not public.ist_team(); v_ok boolean;
begin
  if new.bezug_art is null then return new; end if;
  v_ok := case new.bezug_art
    when 'anliegen' then exists (select 1 from public.anliegen x where x.id = new.bezug_id and x.kunde_id = new.kunde_id)
    when 'aufgabe' then exists (select 1 from public.aufgaben x where x.id = new.bezug_id and x.kunde_id = new.kunde_id)
    when 'entscheidung' then exists (select 1 from public.entscheidungen x where x.id = new.bezug_id and x.kunde_id = new.kunde_id
                                      and (not v_kunde or x.status <> 'entwurf'))
    else false end;
  if not v_ok then raise exception 'Datei: Bezug nicht gefunden'; end if;
  return new;
end $$;
revoke all on function public.bei_datei_bezug() from public, anon, authenticated;
create trigger bei_datei_bezug before insert or update of bezug_art, bezug_id on public.dateien
  for each row execute function public.bei_datei_bezug();

-- Der Kunde darf Sichtbarkeit und Bezug später nicht ändern (er hat ohnehin kein Update-Recht; zur Sicherheit festgehalten)
drop policy kunde_lesen on public.dateien;
create policy kunde_lesen on public.dateien for select to authenticated
  using (kunde_id = public.meine_kunde_id() and (sichtbar or richtung = 'vom_kunden'));

drop policy kunde_dateien_lesen on storage.objects;
create policy kunde_dateien_lesen on storage.objects for select to authenticated
  using (bucket_id = 'dateien'
    and (storage.foldername(name))[1] = public.meine_kunde_id()::text
    and exists (select 1 from public.dateien d
                where d.pfad = storage.objects.name and d.kunde_id = public.meine_kunde_id()
                  and (d.sichtbar or d.richtung = 'vom_kunden')));

-- 3. Roadmap: Läuft · Als Nächstes (geplant) · Später
alter table public.roadmap drop constraint roadmap_status_check,
  add constraint roadmap_status_check check (status in ('laeuft', 'geplant', 'spaeter', 'erledigt'));
alter table public.roadmap add column stand date not null default current_date;

-- 4. Aufgaben: `titel` trägt den Kundentitel aus Trello (nur Karten mit Kundentitel kommen ins Portal), dazu der eine Satz
alter table public.aufgaben add column satz text check (satz is null or length(satz) <= 500);

-- 5. Berichte: Terminnotiz als eigene Art, zweite Seite „Alle Werte“
alter table public.berichte drop constraint berichte_art_check,
  add constraint berichte_art_check check (art in ('wochenstand', 'monatsauswertung', 'terminnotiz'));
alter table public.berichte add column werte_pfad text,
  add constraint werte_pfad_beim_kunden check (werte_pfad is null or (werte_pfad like kunde_id::text || '/%'
    and werte_pfad !~ '(^|/)\.\.?(/|$)' and position('//' in werte_pfad) = 0));

drop policy kunde_berichte_lesen on storage.objects;
create policy kunde_berichte_lesen on storage.objects for select to authenticated
  using (bucket_id = 'berichte'
    and (storage.foldername(name))[1] = public.meine_kunde_id()::text
    and exists (
      select 1 from public.berichte b
      where b.kunde_id = public.meine_kunde_id() and b.status = 'freigegeben'
        and (b.html_pfad = storage.objects.name or b.pdf_pfad = storage.objects.name or b.werte_pfad = storage.objects.name)));

-- Rechte für neue Spalten folgen den Tabellenrechten; ausdrücklich nachziehen, falls Spaltenrechte vergeben sind
grant select, insert, update, delete on public.dateien, public.roadmap, public.aufgaben, public.berichte, public.entscheidungen to authenticated;
