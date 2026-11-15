-- Kennzahlen je Bericht als Daten (für den Vergleich von Wochen und Monaten im Portal).
-- Sichtbarkeit wie der Bericht selbst (Zeilenregel kunde_lesen: nur freigegeben, nur eigener Kunde).
alter table public.berichte add column kennzahlen jsonb;
alter table public.berichte add constraint kennzahlen_ist_liste check (kennzahlen is null or jsonb_typeof(kennzahlen) = 'array');
comment on column public.berichte.kennzahlen is 'Liste aus {gruppe, name, wert, einheit}; wert ist Zahl oder null';
