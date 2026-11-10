-- Nachbesserungen aus der unabhängigen Prüfung vom 10.11.2026

-- Befund 1: nur schlichte Adressen mit genau einem @; sonst kein Treffer
create or replace function privat.zugang_finden(p_mail text) returns public.zugangsliste
language sql stable security definer set search_path = '' as $$
  select z.* from public.zugangsliste z
  where lower(btrim(p_mail)) ~ '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'
    and ((z.art = 'adresse' and z.wert = lower(btrim(p_mail)))
      or (z.art = 'domain' and z.wert = split_part(lower(btrim(p_mail)), '@', 2)))
  order by (z.art = 'adresse') desc
  limit 1
$$;

-- Befund 3: Team-Rechte erst nach Freischaltung durch ein anderes Team-Mitglied
alter table public.mitglieder
  add column team_bestaetigt_am timestamptz,
  add column team_bestaetigt_von uuid references auth.users(id) on delete set null;

create or replace function public.bei_sperre() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.team_bestaetigt_am is distinct from old.team_bestaetigt_am then
    if auth.uid() is not null and auth.uid() = new.user_id then
      raise exception 'Die eigene Freischaltung ist nicht möglich';
    end if;
    new.team_bestaetigt_von := case when new.team_bestaetigt_am is null then null else auth.uid() end;
    insert into public.protokoll (kunde_id, aktion, objekt)
    values (null, case when new.team_bestaetigt_am is null then 'team_freischaltung_entzogen' else 'team_freigeschaltet' end, new.user_id::text);
  end if;
  if new.gesperrt_am is distinct from old.gesperrt_am then
    new.gesperrt_von := case when new.gesperrt_am is null then null else auth.uid() end;
    insert into public.protokoll (kunde_id, aktion, objekt)
    values (new.kunde_id, case when new.gesperrt_am is null then 'person_entsperrt' else 'person_gesperrt' end, new.user_id::text);
  end if;
  return new;
end $$;

-- Bestehende Team-Konten: freigeschaltet ist, wer den zweiten Faktor schon eingerichtet hat
update public.mitglieder m set team_bestaetigt_am = now()
where m.rolle = 'team' and exists (select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.status = 'verified');

-- Befund 2 und 3: bestätigte Adresse und Freischaltung in den Kernfunktionen
create or replace function public.meine_kunde_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.kunde_id
  from public.mitglieder m
  join public.kunden k on k.id = m.kunde_id
  join auth.users u on u.id = m.user_id
  where m.user_id = auth.uid() and m.rolle = 'kunde' and m.gesperrt_am is null and k.aktiv
    and u.email_confirmed_at is not null
$$;

create or replace function public.ist_team() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.mitglieder m join auth.users u on u.id = m.user_id
                 where m.user_id = auth.uid() and m.rolle = 'team' and m.gesperrt_am is null
                   and m.team_bestaetigt_am is not null and u.email_confirmed_at is not null)
     and coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
$$;

-- Befund 7: Mail-Adresse eines Zugangs ist fest
create or replace function public.bei_mail_aenderung() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) is distinct from lower(old.email) then
    raise exception 'Die Mail-Adresse eines Zugangs kann nicht geändert werden';
  end if;
  return new;
end $$;
revoke all on function public.bei_mail_aenderung() from public, anon, authenticated;
create trigger bei_mail_aenderung before update of email on auth.users for each row execute function public.bei_mail_aenderung();

-- Befund 8: entfernter Listeneintrag sperrt die Personen, die nur über ihn hereinkamen
create or replace function public.bei_listeneintrag_entfernt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.mitglieder m set gesperrt_am = now()
  where m.gesperrt_am is null and m.rolle = old.rolle and m.kunde_id is not distinct from old.kunde_id
    and ((old.art = 'adresse' and m.email = old.wert)
      or (old.art = 'domain' and split_part(m.email, '@', 2) = old.wert
          and not exists (select 1 from public.zugangsliste z where z.art = 'adresse' and z.wert = m.email)));
  return old;
end $$;
revoke all on function public.bei_listeneintrag_entfernt() from public, anon, authenticated;
create trigger bei_listeneintrag_entfernt after delete on public.zugangsliste for each row execute function public.bei_listeneintrag_entfernt();

-- Befund 5: Kunde liest Kommentare nur zu dem, was er selbst sehen darf
-- (die Unterabfragen laufen unter den Zeilenregeln der jeweiligen Tabelle)
drop policy kunde_lesen on public.kommentare;
create policy kunde_lesen on public.kommentare for select to authenticated using (
  kunde_id = public.meine_kunde_id() and case bezug_art
    when 'anliegen' then exists (select 1 from public.anliegen x where x.id = bezug_id)
    when 'aufgabe' then exists (select 1 from public.aufgaben x where x.id = bezug_id)
    when 'datei' then exists (select 1 from public.dateien x where x.id = bezug_id)
    when 'bericht' then exists (select 1 from public.berichte x where x.id = bezug_id)
    when 'entscheidung' then exists (select 1 from public.entscheidungen x where x.id = bezug_id)
    when 'roadmap' then exists (select 1 from public.roadmap x where x.id = bezug_id)
    else false end);

-- Befund 6: Berichtspfade liegen immer im Ordner des Kunden
alter table public.berichte add constraint pfade_beim_kunden check (
  (html_pfad is null or (html_pfad like kunde_id::text || '/%' and html_pfad !~ '(^|/)\.\.?(/|$)' and position('//' in html_pfad) = 0))
  and (pdf_pfad is null or (pdf_pfad like kunde_id::text || '/%' and pdf_pfad !~ '(^|/)\.\.?(/|$)' and position('//' in pdf_pfad) = 0)));
drop policy kunde_berichte_lesen on storage.objects;
create policy kunde_berichte_lesen on storage.objects for select to authenticated
  using (bucket_id = 'berichte'
    and (storage.foldername(name))[1] = public.meine_kunde_id()::text
    and exists (
      select 1 from public.berichte b
      where b.kunde_id = public.meine_kunde_id() and b.status = 'freigegeben'
        and (b.html_pfad = storage.objects.name or b.pdf_pfad = storage.objects.name)));

-- Befund 9: Dateipfade ohne Tricks, Kunde nur unter vom-kunden, Nebenfelder nicht vom Kunden
alter table public.dateien
  add constraint pfad_beim_kunden check (pfad like kunde_id::text || '/%' and pfad !~ '(^|/)\.\.?(/|$)' and position('//' in pfad) = 0),
  add constraint groesse_nicht_negativ check (groesse is null or groesse >= 0);
drop policy kunde_hochladen on public.dateien;
create policy kunde_hochladen on public.dateien for insert to authenticated
  with check (kunde_id = public.meine_kunde_id() and richtung = 'vom_kunden'
              and pfad like public.meine_kunde_id()::text || '/vom-kunden/%');
drop policy kunde_dateien_hochladen on storage.objects;
create policy kunde_dateien_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'dateien'
              and (storage.foldername(name))[1] = public.meine_kunde_id()::text
              and (storage.foldername(name))[2] = 'vom-kunden'
              and name !~ '(^|/)\.\.?(/|$)' and position('//' in name) = 0);

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
    if w.rolle = 'kunde' then new.drive_kopie_am := null; end if;
  end if;
  return new;
end $$;

-- Befund 13: Konto löschen scheitert nicht an alten Verweisen
alter table public.dateien drop constraint dateien_hochgeladen_von_fkey,
  add constraint dateien_hochgeladen_von_fkey foreign key (hochgeladen_von) references auth.users(id) on delete set null;
alter table public.berichte drop constraint berichte_freigegeben_von_fkey,
  add constraint berichte_freigegeben_von_fkey foreign key (freigegeben_von) references auth.users(id) on delete set null;

-- Befund 14: künftige Tabellen bekommen keine Rechte von selbst
alter default privileges in schema public revoke all on tables from authenticated;
