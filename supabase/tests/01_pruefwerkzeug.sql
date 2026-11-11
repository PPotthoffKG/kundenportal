-- Prüfwerkzeug für die Tests zur Kundentrennung. Nur auf einem Branch ausführen, nie auf der Live-Datenbank.
create schema if not exists pruef;
create table if not exists pruef.ergebnis (nr int generated always as identity, wer text, name text, ok boolean, detail text);
grant usage on schema pruef to authenticated, anon;
grant insert, select on pruef.ergebnis to authenticated, anon;

CREATE OR REPLACE FUNCTION pruef.als(p_wer text, p_user uuid, p_aal text DEFAULT 'aal1'::text, p_rolle text DEFAULT 'authenticated'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  perform set_config('role', 'none', true);
  perform set_config('pruef.wer', p_wer, true);
  perform set_config('request.jwt.claims', case when p_user is null then '' else json_build_object('sub', p_user, 'role', p_rolle, 'aal', p_aal)::text end, true);
  if p_rolle <> 'postgres' then perform set_config('role', p_rolle, true); end if;
end $function$
;

CREATE OR REPLACE FUNCTION pruef.merke(p_name text, p_ok boolean, p_detail text)
 RETURNS void
 LANGUAGE sql
AS $function$
  insert into pruef.ergebnis (wer, name, ok, detail) values (current_setting('pruef.wer', true), p_name, p_ok, p_detail) $function$
;

CREATE OR REPLACE FUNCTION pruef.abgelehnt(p_state text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select p_state in ('42501', 'P0001', '23514', '23505') $function$
;

CREATE OR REPLACE FUNCTION pruef.zahl(p_name text, p_sql text, p_soll bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare n bigint;
begin
  begin execute 'select count(*) from (' || p_sql || ') q' into n;
  exception when others then perform pruef.merke(p_name, false, 'Fehler: ' || sqlerrm); return; end;
  perform pruef.merke(p_name, n = p_soll, n || ' Zeilen, erwartet ' || p_soll);
end $function$
;

CREATE OR REPLACE FUNCTION pruef.sieht_nichts(p_name text, p_sql text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare n bigint;
begin
  begin execute 'select count(*) from (' || p_sql || ') q' into n;
  exception when others then perform pruef.merke(p_name, pruef.abgelehnt(sqlstate), 'verweigert [' || sqlstate || ']: ' || sqlerrm); return; end;
  perform pruef.merke(p_name, n = 0, n || ' Zeilen sichtbar');
end $function$
;

CREATE OR REPLACE FUNCTION pruef.kein_schreiben(p_name text, p_sql text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare n bigint;
begin
  begin execute p_sql; get diagnostics n = row_count;
  exception when others then perform pruef.merke(p_name, pruef.abgelehnt(sqlstate), 'verweigert [' || sqlstate || ']: ' || sqlerrm); return; end;
  perform pruef.merke(p_name, n = 0, n || ' Zeilen geändert');
end $function$
;

CREATE OR REPLACE FUNCTION pruef.fehler(p_name text, p_sql text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  begin execute p_sql;
  exception when others then perform pruef.merke(p_name, pruef.abgelehnt(sqlstate), 'verweigert [' || sqlstate || ']: ' || sqlerrm); return; end;
  perform pruef.merke(p_name, false, 'lief ohne Fehler durch');
end $function$
;

CREATE OR REPLACE FUNCTION pruef.gelingt(p_name text, p_sql text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare n bigint;
begin
  begin execute p_sql; get diagnostics n = row_count;
  exception when others then perform pruef.merke(p_name, false, 'Fehler: ' || sqlerrm); return; end;
  perform pruef.merke(p_name, n >= 1, n || ' Zeilen');
end $function$
;
