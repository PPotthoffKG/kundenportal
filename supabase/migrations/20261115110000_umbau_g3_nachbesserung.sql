-- Nachbesserung aus der unabhängigen Prüfung vom 15.11.2026 (Befunde 1 bis 4)

-- Befund 1: Richtung muss zum Pfad passen. Sonst könnte eine Team-Datei als „vom Kunden“ ohne Freigabe sichtbar werden.
alter table public.dateien add constraint richtung_passt_zum_pfad
  check ((richtung = 'vom_kunden') = (pfad like kunde_id::text || '/vom-kunden/%'));

-- Befund 2: Kunde kommentiert nur Dateien, die er sehen darf
create or replace function public.bei_kommentar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_kunde boolean := auth.uid() is not null and not public.ist_team();
        v_ok boolean;
begin
  v_ok := case new.bezug_art
    when 'anliegen' then exists (select 1 from public.anliegen x where x.id = new.bezug_id and x.kunde_id = new.kunde_id)
    when 'aufgabe' then exists (select 1 from public.aufgaben x where x.id = new.bezug_id and x.kunde_id = new.kunde_id)
    when 'datei' then exists (select 1 from public.dateien x where x.id = new.bezug_id and x.kunde_id = new.kunde_id
                               and (not v_kunde or x.sichtbar or x.richtung = 'vom_kunden'))
    when 'bericht' then exists (select 1 from public.berichte x where x.id = new.bezug_id and x.kunde_id = new.kunde_id
                                 and (not v_kunde or x.status = 'freigegeben'))
    when 'entscheidung' then exists (select 1 from public.entscheidungen x where x.id = new.bezug_id and x.kunde_id = new.kunde_id
                                      and (not v_kunde or x.status <> 'entwurf'))
    when 'roadmap' then exists (select 1 from public.roadmap x where x.id = new.bezug_id and x.kunde_id = new.kunde_id
                                 and (not v_kunde or x.sichtbar))
    else false end;
  if not v_ok then raise exception 'Kommentar: Bezug nicht gefunden'; end if;
  return new;
end $$;

-- Befund 3: Kommentar zu „intern“ geht nicht verloren (ohne neuen Kommentar bleibt der alte), und das Protokoll hält ihn fest
create or replace function public.entscheidung_beantworten(p_id uuid, p_antwort text, p_kommentar text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare k uuid := public.meine_kunde_id(); v_name text; v_kom text := nullif(btrim(left(p_kommentar, 5000)), '');
begin
  if k is null then raise exception 'Kein Kundenzugang'; end if;
  if p_antwort is null or p_antwort not in ('ja', 'nein', 'intern') then raise exception 'Antwort muss ja, nein oder intern sein'; end if;
  select w.name into v_name from privat.wer() w;
  update public.entscheidungen
     set antwort = p_antwort, kommentar = coalesce(v_kom, kommentar), beantwortet_von = v_name,
         beantwortet_von_id = auth.uid(), beantwortet_am = now(),
         status = case when p_antwort = 'intern' then 'offen' else 'beantwortet' end
   where id = p_id and kunde_id = k and status = 'offen';
  if not found then raise exception 'Entscheidung nicht offen oder nicht gefunden'; end if;
  insert into public.protokoll (kunde_id, aktion, objekt, details)
  values (k, 'entscheidung_beantwortet', p_id::text, jsonb_build_object('antwort', p_antwort, 'name', v_name, 'kommentar', v_kom));
end $$;
revoke all on function public.entscheidung_beantworten(uuid, text, text) from public, anon;
grant execute on function public.entscheidung_beantworten(uuid, text, text) to authenticated;

-- Befund 4: Bezug auch prüfen, wenn sich der Kunde einer Datei ändert; Freigabe einer Datei protokollieren
drop trigger bei_datei_bezug on public.dateien;
create trigger bei_datei_bezug before insert or update of bezug_art, bezug_id, kunde_id on public.dateien
  for each row execute function public.bei_datei_bezug();

alter table public.dateien add column sichtbar_am timestamptz, add column sichtbar_von uuid references auth.users(id) on delete set null;
create or replace function public.bei_datei_sichtbar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sichtbar is distinct from old.sichtbar then
    new.sichtbar_am := case when new.sichtbar then now() end;
    new.sichtbar_von := case when new.sichtbar then auth.uid() end;
    insert into public.protokoll (kunde_id, aktion, objekt, details)
    values (new.kunde_id, case when new.sichtbar then 'datei_sichtbar' else 'datei_verborgen' end, new.id::text, jsonb_build_object('name', new.name));
  end if;
  return new;
end $$;
revoke all on function public.bei_datei_sichtbar() from public, anon, authenticated;
create trigger bei_datei_sichtbar before update of sichtbar on public.dateien
  for each row execute function public.bei_datei_sichtbar();
