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

  if (e.aktion !== "bericht") return antwort(400, { fehler: "Unbekannte Aktion" });
  for (const f of ["kunde_slug", "art", "zeitraum", "zeitraum_start", "titel", "html"]) {
    if (!e[f]) return antwort(400, { fehler: `Feld fehlt: ${f}` });
  }

  const { data: kunde } = await db.from("kunden").select("id").eq("slug", e.kunde_slug).maybeSingle();
  if (!kunde) return antwort(404, { fehler: "Kunde unbekannt" });

  const { data: alt } = await db.from("berichte").select("id,status")
    .eq("kunde_id", kunde.id).eq("art", e.art).eq("zeitraum", e.zeitraum).maybeSingle();
  if (alt?.status === "freigegeben" && !e.ueberschreiben) {
    return antwort(409, { fehler: "Bericht ist schon freigegeben; mit ueberschreiben=true neu als Entwurf ablegen" });
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

  const zeile = {
    kunde_id: kunde.id, art: e.art, zeitraum: e.zeitraum, zeitraum_start: e.zeitraum_start, titel: e.titel,
    zusammenfassung: e.zusammenfassung ?? null, html_pfad: `${basis}.html`, pdf_pfad: pdfPfad,
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
