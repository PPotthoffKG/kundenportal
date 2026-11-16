// Kundenportal PPotthoff – Ablage für Bauskripte und Abruf-Agent.
// Legt Berichte (HTML + PDF) und ihre Entscheidungen als Entwurf ab.
// Schutz: eigener Ablage-Schlüssel im Header „x-ablage-schluessel“ (nur Hash in der Datenbank).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

function antwort(status: number, daten: unknown) {
  return new Response(JSON.stringify(daten), { status, headers: { "Content-Type": "application/json" } });
}

function b64zuBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return antwort(405, { fehler: "Nur POST" });
  const schluessel = req.headers.get("x-ablage-schluessel") ?? "";
  const { data: wer } = await db.rpc("ablage_schluessel_pruefen", { p_schluessel: schluessel });
  if (!wer) return antwort(401, { fehler: "Ablage-Schlüssel ungültig" });

  let e: any;
  try { e = await req.json(); } catch { return antwort(400, { fehler: "JSON erwartet" }); }

  // Nur Kennzahlen nachtragen (Status und Dateien bleiben unverändert)
  if (e.aktion === "kennzahlen") {
    if (!e.kunde_slug || !e.art || !e.zeitraum || !Array.isArray(e.kennzahlen)) return antwort(400, { fehler: "kunde_slug, art, zeitraum und kennzahlen (Liste) nötig" });
    const { data: k } = await db.from("kunden").select("id").eq("slug", e.kunde_slug).maybeSingle();
    if (!k) return antwort(404, { fehler: "Kunde unbekannt" });
    const { data: b, error: fk } = await db.from("berichte").update({ kennzahlen: e.kennzahlen }).eq("kunde_id", k.id).eq("art", e.art).eq("zeitraum", e.zeitraum).select("id,status");
    if (fk) return antwort(500, { fehler: "Kennzahlen: " + fk.message });
    if (!b?.length) return antwort(404, { fehler: "Bericht nicht gefunden" });
    await db.from("protokoll").insert({ kunde_id: k.id, aktion: "kennzahlen_nachgetragen", objekt: b[0].id, details: { von: wer, zeitraum: e.zeitraum } });
    return antwort(200, { ok: true, bericht_id: b[0].id, status: b[0].status });
  }
  // PDF, PowerPoint und Excel an einen bestehenden Bericht hängen (Status bleibt)
  if (e.aktion === "exporte") {
    if (!e.kunde_slug || !e.art || !e.zeitraum) return antwort(400, { fehler: "kunde_slug, art und zeitraum nötig" });
    const { data: k } = await db.from("kunden").select("id").eq("slug", e.kunde_slug).maybeSingle();
    if (!k) return antwort(404, { fehler: "Kunde unbekannt" });
    const { data: b } = await db.from("berichte").select("id,html_pfad,status").eq("kunde_id", k.id).eq("art", e.art).eq("zeitraum", e.zeitraum).maybeSingle();
    if (!b) return antwort(404, { fehler: "Bericht nicht gefunden" });
    const basis = b.html_pfad.replace(/\.html$/, "");
    const typen: Record<string, [string, string, string]> = {
      pdf_base64: ["pdf", "application/pdf", "pdf_pfad"],
      pptx_base64: ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx_pfad"],
      xlsx_base64: ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx_pfad"],
    };
    const neu: Record<string, string> = {};
    for (const [feld, [endung, mime, spalte]] of Object.entries(typen)) {
      if (!e[feld]) continue;
      const up = await db.storage.from("berichte").upload(`${basis}.${endung}`, b64zuBytes(e[feld]), { contentType: mime, upsert: true });
      if (up.error) return antwort(500, { fehler: `${endung}-Ablage: ` + up.error.message });
      neu[spalte] = `${basis}.${endung}`;
    }
    if (!Object.keys(neu).length) return antwort(400, { fehler: "keine Datei mitgegeben" });
    const { error: fu } = await db.from("berichte").update(neu).eq("id", b.id);
    if (fu) return antwort(500, { fehler: "Exporte: " + fu.message });
    await db.from("protokoll").insert({ kunde_id: k.id, aktion: "exporte_abgelegt", objekt: b.id, details: { von: wer, zeitraum: e.zeitraum, dateien: Object.keys(neu) } });
    return antwort(200, { ok: true, bericht_id: b.id, status: b.status, ...neu });
  }
  if (e.aktion !== "bericht") return antwort(400, { fehler: "Unbekannte Aktion" });
  for (const f of ["kunde_slug", "art", "zeitraum", "zeitraum_start", "titel", "html"]) {
    if (!e[f]) return antwort(400, { fehler: `Feld fehlt: ${f}` });
  }

  // Art und Datum gehen in den Speicherpfad: nur feste Werte zulassen
  if (!["wochenstand", "monatsauswertung", "terminnotiz", "listingcheck", "konzept"].includes(e.art)) return antwort(400, { fehler: "Art unbekannt" });
  if (typeof e.zeitraum_start !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.zeitraum_start)) {
    return antwort(400, { fehler: "zeitraum_start muss JJJJ-MM-TT sein" });
  }

  const { data: kunde } = await db.from("kunden").select("id").eq("slug", e.kunde_slug).maybeSingle();
  if (!kunde) return antwort(404, { fehler: "Kunde unbekannt" });

  // Ein Bericht belegt seinen Pfad über Art und Startdatum. Gibt es dort schon einen Bericht
  // mit anderem Zeitraum-Text, wird nichts überschrieben.
  const { data: alle, error: fa } = await db.from("berichte").select("id,status,zeitraum")
    .eq("kunde_id", kunde.id).eq("art", e.art).or(`zeitraum.eq.${JSON.stringify(e.zeitraum)},zeitraum_start.eq.${e.zeitraum_start}`);
  if (fa) return antwort(500, { fehler: "Bericht suchen: " + fa.message });
  if ((alle ?? []).some((b) => b.zeitraum !== e.zeitraum)) {
    return antwort(409, { fehler: "Zu diesem Startdatum gibt es schon einen Bericht mit anderem Zeitraum" });
  }
  const alt = (alle ?? [])[0];
  if (alt?.status === "freigegeben") {
    if (!e.ueberschreiben) {
      return antwort(409, { fehler: "Bericht ist schon freigegeben; mit ueberschreiben=true neu als Entwurf ablegen" });
    }
    // Erst zurück auf Entwurf, dann die Datei tauschen: der Kunde sieht nie ungeprüften Inhalt
    const { error: fz } = await db.from("berichte").update({ status: "entwurf", freigegeben_am: null, freigegeben_von: null }).eq("id", alt.id);
    if (fz) return antwort(500, { fehler: "Bericht zurücknehmen: " + fz.message });
  }

  const basis = `${kunde.id}/${e.art}/${e.zeitraum_start}`;
  const html = new TextEncoder().encode(e.html);
  const up1 = await db.storage.from("berichte").upload(`${basis}.html`, html, { contentType: "text/html; charset=utf-8", upsert: true });
  if (up1.error) return antwort(500, { fehler: "HTML-Ablage: " + up1.error.message });
  let pdfPfad: string | null = null;
  if (e.pdf_base64) {
    const up2 = await db.storage.from("berichte").upload(`${basis}.pdf`, b64zuBytes(e.pdf_base64), { contentType: "application/pdf", upsert: true });
    if (up2.error) return antwort(500, { fehler: "PDF-Ablage: " + up2.error.message });
    pdfPfad = `${basis}.pdf`;
  }
  // Seite 2 „Alle Werte“ (Weg 1): eigene Datei neben Seite 1
  let wertePfad: string | null = null;
  if (e.html_werte) {
    const up3 = await db.storage.from("berichte").upload(`${basis}-alle-werte.html`, new TextEncoder().encode(e.html_werte), { contentType: "text/html; charset=utf-8", upsert: true });
    if (up3.error) return antwort(500, { fehler: "Alle-Werte-Ablage: " + up3.error.message });
    wertePfad = `${basis}-alle-werte.html`;
  }

  const zeile = {
    kunde_id: kunde.id, art: e.art, zeitraum: e.zeitraum, zeitraum_start: e.zeitraum_start, titel: e.titel,
    zusammenfassung: e.zusammenfassung ?? null, html_pfad: `${basis}.html`, pdf_pfad: pdfPfad, werte_pfad: wertePfad,
    ...(Array.isArray(e.kennzahlen) ? { kennzahlen: e.kennzahlen } : {}),
    status: "entwurf", freigegeben_am: null, freigegeben_von: null,
  };
  const { data: bericht, error: fb } = await db.from("berichte")
    .upsert(zeile, { onConflict: "kunde_id,art,zeitraum" }).select("id").single();
  if (fb) return antwort(500, { fehler: "Bericht: " + fb.message });

  // Entscheidungen dieses Berichts ersetzen, solange sie Entwurf sind
  await db.from("entscheidungen").delete().eq("bericht_id", bericht.id).eq("status", "entwurf");
  const ents = (e.entscheidungen ?? []).map((d: any, i: number) => ({
    kunde_id: kunde.id, bericht_id: bericht.id, nr: i + 1, kategorie: d.kategorie ?? null, frage: d.frage,
    empfehlung: d.text, begruendung: d.grund ?? null, wenn_nein: d.wenn_nein ?? null, frist: d.frist ?? null, status: "entwurf",
  }));
  if (ents.length) {
    const { error: fe } = await db.from("entscheidungen").insert(ents);
    if (fe) return antwort(500, { fehler: "Entscheidungen: " + fe.message });
  }
  await db.from("protokoll").insert({ kunde_id: kunde.id, aktion: "bericht_abgelegt", objekt: bericht.id, details: { von: wer, zeitraum: e.zeitraum } });
  return antwort(200, { ok: true, bericht_id: bericht.id, entscheidungen: ents.length, status: "entwurf" });
});
