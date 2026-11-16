-- Neue Berichtsart „Konzept“: Konzepte und Entwürfe zur Abstimmung (Seite 1 Konzept, Seite 2 „Entwürfe“)
alter table public.berichte drop constraint if exists berichte_art_check;
alter table public.berichte
  add constraint berichte_art_check check (art in ('wochenstand', 'monatsauswertung', 'terminnotiz', 'listingcheck', 'konzept'));
