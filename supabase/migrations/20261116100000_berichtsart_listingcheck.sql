-- Neue Berichtsart „Listing-Check“: Bestandsaufnahme aller Produktseiten eines Kontos
alter table public.berichte drop constraint if exists berichte_art_check;
alter table public.berichte
  add constraint berichte_art_check check (art in ('wochenstand', 'monatsauswertung', 'terminnotiz', 'listingcheck'));
