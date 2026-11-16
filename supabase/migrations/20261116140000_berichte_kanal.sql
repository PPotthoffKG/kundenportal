-- Getrennte Berichte je Kanal (Vendor, Seller) für Kunden mit beiden Kanälen (zuerst Grafik Werkstatt).
-- Kunden mit einem Kanal (Pascoe) lassen kanal leer; für sie ändert sich nichts.
-- Dazu: Wochentag des Montagsbriefs je Kunde (1 = Montag, Standard; 2 = Dienstag für Grafik Werkstatt).

alter table public.berichte
  add column if not exists kanal text check (kanal in ('vendor', 'seller'));
comment on column public.berichte.kanal is 'vendor oder seller; leer, wenn der Kunde nur einen Kanal hat';

-- Ein Bericht je Kunde, Art, Kanal und Zeitraum (leerer Kanal zählt als eigener Wert).
alter table public.berichte drop constraint if exists berichte_kunde_id_art_zeitraum_key;
alter table public.berichte
  add constraint berichte_kunde_art_kanal_zeitraum_key unique nulls not distinct (kunde_id, art, kanal, zeitraum);

alter table public.kunden
  add column if not exists brief_tag smallint not null default 1 check (brief_tag between 1 and 5);
comment on column public.kunden.brief_tag is 'Wochentag, an dem der Montagsbrief im Portal liegt (1 = Montag … 5 = Freitag), jeweils 9 Uhr';
