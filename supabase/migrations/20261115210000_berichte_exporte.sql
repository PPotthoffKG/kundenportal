-- PowerPoint und Excel zu jedem Bericht (Patrick 15.11.: Paul soll jede Auswertung als PDF, PowerPoint und Excel laden können)
alter table public.berichte add column pptx_pfad text, add column xlsx_pfad text;
alter table public.berichte add constraint exporte_beim_kunden check (
  (pptx_pfad is null or pptx_pfad like kunde_id::text || '/%') and (xlsx_pfad is null or xlsx_pfad like kunde_id::text || '/%'));
drop policy kunde_berichte_lesen on storage.objects;
create policy kunde_berichte_lesen on storage.objects for select to authenticated using (
  bucket_id = 'berichte' and (storage.foldername(name))[1] = (public.meine_kunde_id())::text
  and exists (select 1 from public.berichte b where b.kunde_id = public.meine_kunde_id() and b.status = 'freigegeben'
              and (b.html_pfad = objects.name or b.pdf_pfad = objects.name or b.werte_pfad = objects.name
                   or b.pptx_pfad = objects.name or b.xlsx_pfad = objects.name)));
