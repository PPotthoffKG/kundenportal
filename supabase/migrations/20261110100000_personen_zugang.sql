-- Kundenportal PPotthoff: Zugänge je Person, Zugangsliste, Sperre, Anliegen, Kommentare, Roadmap
-- Grundsatz bleibt: jede Regel hängt an meine_kunde_id() bzw. ist_team().

-- 1. Mitglieder werden Personen ------------------------------------------------
alter table public.mitglieder
  add column email text,
  add column anrede text not null default 'Sie' check (anrede in ('Sie','du')),
  add column gesperrt_am timestamptz,
  add column gesperrt_von uuid references auth.users(id) on delete set null,
  add column letzte_anmeldung timestamptz;

-- 2. Zugangsliste: wer darf ein Konto bekommen ---------------------------------
create table public.zugangsliste (
  id uuid primary key default gen_random_uuid(),
  rolle text not null default 'kunde' check (rolle in ('kunde','team')),
  kunde_id uuid references public.kunden(id) on delete cascade,
  art text not null check (art in ('adresse','domain')),
  wert text not null unique,
  anzeigename text,
  anrede text check (anrede in ('Sie','du')),
  angelegt_von uuid default auth.uid() references auth.users(id) on delete set null,
  erstellt timestamptz not null default now(),
  constraint wert_klein check (wert = lower(btrim(wert))),
  constraint wert_form check (
    (art = 'adresse' and wert ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
    or (art = 'domain' and wert ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$')),
  constraint rolle_passt check (
    (rolle = 'kunde' and kunde_id is not null)
    or (rolle = 'team' and kunde_id is null and art = 'adresse')),
  -- Freemail nie als ganze Domain, nur als einzelne Adresse
  constraint keine_freemail_domain check (art <> 'domain' or wert not in (
    'gmail.com','googlemail.com','gmx.de','gmx.net','gmx.at','gmx.ch','web.de','outlook.com','outlook.de',
    'hotmail.com','hotmail.de','live.com','live.de','msn.com','yahoo.com','yahoo.de','icloud.com','me.com',
    'mac.com','t-online.de','freenet.de','aol.com','mail.de','posteo.de','mailbox.org','proton.me',
    'protonmail.com','arcor.de','online.de','1und1.de','vodafone.de','kabelmail.de','unitybox.de'))
);
create index on public.zugangsliste (kunde_id);
alter table public.zugangsliste enable row level security;
create policy team_alles on public.zugangsliste for all to authenticated using (public.ist_team()) with check (public.ist_team());

-- Adresse schlägt Domain. Liegt in „privat“, von außen nicht aufrufbar.
create or replace function privat.zugang_finden(p_mail text) returns public.zugangsliste
language sql stable security definer set search_path = '' as $$
  select z.* from public.zugangsliste z
  where (z.art = 'adresse' and z.wert = lower(btrim(p_mail)))
     or (z.art = 'domain' and z.wert = split_part(lower(btrim(p_mail)), '@', 2))
  order by (z.art = 'adresse') desc
  limit 1
$$;
revoke all on function privat.zugang_finden(text) from public, anon, authenticated;

-- Auth-Hook „Before User Created“: kein Listeneintrag, kein Konto.
create or replace function public.hook_vor_nutzer_anlage(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_mail text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if v_mail = '' or position('@' in v_mail) = 0 or (privat.zugang_finden(v_mail)).id is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403,
      'message', 'Für diese Adresse gibt es keinen Zugang. Bitte melde dich bei uns.'));
  end if;
  return '{}'::jsonb;
end $$;
revoke all on function public.hook_vor_nutzer_anlage(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_vor_nutzer_anlage(jsonb) to supabase_auth_admin;

-- Zweite Sicherung in der Datenbank: neues Konto bekommt seine Zuordnung nur aus der Liste.
create or replace function public.bei_neuem_nutzer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare z public.zugangsliste;
begin
  if exists (select 1 from public.mitglieder m where m.user_id = new.id) then return new; end if;
  z := privat.zugang_finden(new.email);
  if z.id is null then raise exception 'Kein Zugang für diese Adresse'; end if;
  insert into public.mitglieder (user_id, kunde_id, rolle, anzeigename, anrede, email)
  values (new.id, z.kunde_id, z.rolle,
          coalesce(nullif(btrim(z.anzeigename), ''), split_part(new.email, '@', 1)),
          coalesce(z.anrede, (select k.anrede from public.kunden k where k.id = z.kunde_id), 'Sie'),
          lower(new.email));
  insert into public.protokoll (user_id, kunde_id, aktion, details)
  values (new.id, z.kunde_id, 'person_angelegt', jsonb_build_object('email', lower(new.email), 'ueber', z.art));
  return new;
end $$;
revoke all on function public.bei_neuem_nutzer() from public, anon, authenticated;
create trigger bei_neuem_nutzer after insert on auth.users for each row execute function public.bei_neuem_nutzer();

-- 3. Kernfunktionen: Sperre und inaktiver Kunde greifen in jeder Regel ----------
create or replace function public.meine_kunde_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.kunde_id from public.mitglieder m join public.kunden k on k.id = m.kunde_id
  where m.user_id = auth.uid() and m.rolle = 'kunde' and m.gesperrt_am is null and k.aktiv
$$;

create or replace function public.ist_team() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.mitglieder m
                 where m.user_id = auth.uid() and m.rolle = 'team' and m.gesperrt_am is null)
     and coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
$$;

-- Name und Rolle der handelnden Person, nie aus der Eingabe des Browsers
create or replace function privat.wer() returns table (name text, rolle text)
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(m.anzeigename), ''), 'Unbekannt'), m.rolle
  from public.mitglieder m where m.user_id = auth.uid() and m.gesperrt_am is null
$$;
revoke all on function privat.wer() from public, anon, authenticated;

-- Sperre protokollieren
create or replace function public.bei_sperre() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.gesperrt_am is distinct from old.gesperrt_am then
    new.gesperrt_von := case when new.gesperrt_am is null then null else auth.uid() end;
    insert into public.protokoll (kunde_id, aktion, objekt)
    values (new.kunde_id, case when new.gesperrt_am is null then 'person_entsperrt' else 'person_gesperrt' end, new.user_id::text);
  end if;
  return new;
end $$;
revoke all on function public.bei_sperre() from public, anon, authenticated;
create trigger bei_sperre before update on public.mitglieder for each row execute function public.bei_sperre();

-- 4. Anliegen -------------------------------------------------------------------
create table public.anliegen (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunden(id) on delete cascade,
  titel text not null check (length(btrim(titel)) between 1 and 200),
  text text check (text is null or length(text) <= 10000),
  status text not null default 'offen' check (status in ('offen','in_arbeit','erledigt')),
  erstellt_von uuid references auth.users(id) on delete set null,
  erstellt_name text,
  erstellt_rolle text,
  erstellt timestamptz not null default now(),
  aktualisiert timestamptz not null default now()
);
create index on public.anliegen (kunde_id, erstellt desc);
alter table public.anliegen enable row level security;
create policy team_alles on public.anliegen for all to authenticated using (public.ist_team()) with check (public.ist_team());
create policy kunde_lesen on public.anliegen for select to authenticated using (kunde_id = public.meine_kunde_id());
create policy kunde_anlegen on public.anliegen for insert to authenticated
  with check (kunde_id = public.meine_kunde_id() and status = 'offen');

-- 5. Roadmap --------------------------------------------------------------------
create table public.roadmap (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunden(id) on delete cascade,
  titel text not null,
  beschreibung text,
  zeitraum text,
  status text not null default 'geplant' check (status in ('geplant','laeuft','erledigt')),
  reihenfolge int not null default 0,
  sichtbar boolean not null default false
);
create index on public.roadmap (kunde_id, reihenfolge);
alter table public.roadmap enable row level security;
create policy team_alles on public.roadmap for all to authenticated using (public.ist_team()) with check (public.ist_team());
create policy kunde_lesen on public.roadmap for select to authenticated using (kunde_id = public.meine_kunde_id() and sichtbar);

-- 6. Kommentare (wie in Trello: Name und Datum, nicht änderbar) -------------------
create table public.kommentare (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.kunden(id) on delete cascade,
  bezug_art text not null check (bezug_art in ('anliegen','aufgabe','bericht','entscheidung','datei','roadmap')),
  bezug_id uuid not null,
  text text not null check (length(btrim(text)) between 1 and 5000),
  autor uuid references auth.users(id) on delete set null,
  autor_name text,
  autor_rolle text,
  erstellt timestamptz not null default now()
);
create index on public.kommentare (kunde_id, bezug_art, bezug_id, erstellt);
alter table public.kommentare enable row level security;
create policy team_alles on public.kommentare for all to authenticated using (public.ist_team()) with check (public.ist_team());
create policy kunde_lesen on public.kommentare for select to authenticated using (kunde_id = public.meine_kunde_id());
create policy kunde_schreiben on public.kommentare for insert to authenticated with check (kunde_id = public.meine_kunde_id());

-- Autor setzen (Anliegen, Kommentare, Dateien). Der Browser kann Name und Autor nicht vorgeben.
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
  end if;
  return new;
end $$;
revoke all on function public.bei_autor() from public, anon, authenticated;

alter table public.dateien add column hochgeladen_name text;
create trigger bei_autor before insert on public.anliegen for each row execute function public.bei_autor();
create trigger bei_autor before insert on public.kommentare for each row execute function public.bei_autor();
create trigger bei_autor before insert on public.dateien for each row execute function public.bei_autor();

-- Kommentar nur zu einem Objekt desselben Kunden; Kunde nur zu dem, was er sehen darf.
create or replace function public.bei_kommentar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_kunde boolean := auth.uid() is not null and not public.ist_team();
        v_ok boolean;
begin
  v_ok := case new.bezug_art
    when 'anliegen' then exists (select 1 from public.anliegen x where x.id = new.bezug_id and x.kunde_id = new.kunde_id)
    when 'aufgabe' then exists (select 1 from public.aufgaben x where x.id = new.bezug_id and x.kunde_id = new.kunde_id)
    when 'datei' then exists (select 1 from public.dateien x where x.id = new.bezug_id and x.kunde_id = new.kunde_id)
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
revoke all on function public.bei_kommentar() from public, anon, authenticated;
create trigger bei_kommentar before insert on public.kommentare for each row execute function public.bei_kommentar();

-- 7. Entscheidung beantworten: Name kommt aus dem Konto ---------------------------
alter table public.entscheidungen add column beantwortet_von_id uuid references auth.users(id) on delete set null;
drop function public.entscheidung_beantworten(uuid, text, text, text);
create function public.entscheidung_beantworten(p_id uuid, p_antwort text, p_kommentar text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare k uuid := public.meine_kunde_id(); v_name text;
begin
  if k is null then raise exception 'Kein Kundenzugang'; end if;
  if p_antwort is null or p_antwort not in ('ja','nein') then raise exception 'Antwort muss ja oder nein sein'; end if;
  select w.name into v_name from privat.wer() w;
  update public.entscheidungen
     set antwort = p_antwort, kommentar = nullif(btrim(left(p_kommentar, 5000)), ''), beantwortet_von = v_name,
         beantwortet_von_id = auth.uid(), beantwortet_am = now(), status = 'beantwortet'
   where id = p_id and kunde_id = k and status = 'offen';
  if not found then raise exception 'Entscheidung nicht offen oder nicht gefunden'; end if;
  insert into public.protokoll (kunde_id, aktion, objekt, details)
  values (k, 'entscheidung_beantwortet', p_id::text, jsonb_build_object('antwort', p_antwort, 'name', v_name));
end $$;
revoke all on function public.entscheidung_beantworten(uuid, text, text) from public, anon;
grant execute on function public.entscheidung_beantworten(uuid, text, text) to authenticated;

-- Anmeldung protokollieren und merken
create or replace function public.angemeldet() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.mitglieder set letzte_anmeldung = now() where user_id = auth.uid() and gesperrt_am is null;
  if found then
    insert into public.protokoll (kunde_id, aktion) values (public.meine_kunde_id(), 'anmeldung');
  end if;
end $$;

-- 8. Rechte härten ---------------------------------------------------------------
alter table privat.ablage_schluessel enable row level security;  -- ohne Regel: nur Dienstzugriff

revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
