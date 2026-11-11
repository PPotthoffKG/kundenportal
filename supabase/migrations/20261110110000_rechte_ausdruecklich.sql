-- Rechte ausdrücklich vergeben, statt sich auf Voreinstellungen des Projekts zu verlassen.
-- (Auf dem Branch fehlten die Tabellenrechte für angemeldete Nutzer und den Dienstzugriff.)
-- Was eine Person sieht und darf, entscheiden weiterhin allein die Zeilenregeln.
grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on
  public.kunden, public.mitglieder, public.berichte, public.entscheidungen, public.aufgaben, public.dateien,
  public.werkzeuge, public.anliegen, public.kommentare, public.roadmap, public.zugangsliste
  to authenticated;
grant select on public.protokoll to authenticated;
revoke insert, update, delete on public.protokoll from authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

grant execute on function public.meine_kunde_id() to authenticated, service_role;
grant execute on function public.ist_team() to authenticated, service_role;
grant execute on function public.angemeldet() to authenticated;
grant execute on function public.bericht_geoeffnet(uuid) to authenticated;
grant execute on function public.entscheidung_beantworten(uuid, text, text) to authenticated;
grant execute on function public.ablage_schluessel_pruefen(text) to service_role;
revoke execute on function public.angemeldet() from public, anon;
revoke execute on function public.bericht_geoeffnet(uuid) from public, anon;
revoke execute on function public.meine_kunde_id() from public, anon;
revoke execute on function public.ist_team() from public, anon;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
