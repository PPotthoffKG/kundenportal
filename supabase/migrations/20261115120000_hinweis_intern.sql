-- Interne Hinweis-Mail an Patrick: Antwort auf Entscheidung, neues Anliegen, Kommentar eines Kunden.
-- Die Datenbank ruft nur die Funktion „hinweis“ mit Art und ID auf. Was verschickt wird, entscheidet die Funktion
-- nach eigenem Lesen des Eintrags (nur Kunden, nur frisch, jeder Anlass einmal). Kunden bekommen keine Mail.
create table public.hinweise_gesendet (schluessel text primary key, am timestamptz not null default now());
alter table public.hinweise_gesendet enable row level security;
revoke all on public.hinweise_gesendet from anon, authenticated;

create or replace function privat.hinweis_rufen() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_art text := tg_argv[0];
begin
  -- je Art getrennt prüfen: PL/pgSQL wertet „and“ nicht sicher von links aus, fremde Spalten würden scheitern
  if v_art = 'entscheidung' then
    if new.antwort is null or (new.antwort is not distinct from old.antwort and new.beantwortet_am is not distinct from old.beantwortet_am) then return new; end if;
  elsif v_art = 'anliegen' then
    if new.erstellt_rolle is distinct from 'kunde' then return new; end if;
  elsif v_art = 'kommentar' then
    if new.autor_rolle is distinct from 'kunde' then return new; end if;
  else
    return new;
  end if;
  perform net.http_post(
    url := 'https://arzhbbpzoqwhyykewsat.supabase.co/functions/v1/hinweis',
    body := jsonb_build_object('art', v_art, 'id', new.id),
    headers := '{"Content-Type":"application/json"}'::jsonb);
  return new;
exception when others then
  return new;  -- ein Hinweis darf nie die Antwort des Kunden aufhalten
end $$;
revoke all on function privat.hinweis_rufen() from public, anon, authenticated;

create trigger hinweis_entscheidung after update of antwort, beantwortet_am on public.entscheidungen
  for each row execute function privat.hinweis_rufen('entscheidung');
create trigger hinweis_anliegen after insert on public.anliegen
  for each row execute function privat.hinweis_rufen('anliegen');
create trigger hinweis_kommentar after insert on public.kommentare
  for each row execute function privat.hinweis_rufen('kommentar');
