// Kundenportal PPotthoff – interner Hinweis an Patrick per Mail.
// Anlass: Antwort auf eine Entscheidung, neues Anliegen, Kommentar eines Kunden.
// Aufruf aus der Datenbank (Trigger über pg_net) mit { art, id }. Kein Geheimnis im Aufruf:
// Die Funktion liest den Eintrag selbst, schickt nur für frische Einträge von Kunden und jeden Eintrag höchstens einmal.
// Versand über Resend; ohne RESEND_API_KEY wird nichts verschickt.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const AN = "kontakt@patrickpotthoff.de";
const VON = "Kundenportal PPotthoff <portal@ppotthoff.io>";
const PORTAL = "https://portal.ppotthoff.io/#/intern";
const ok = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });
const esc = (t: string) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const frisch = (z: string | null) => !!z && Date.now() - new Date(z).getTime() < 15 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok({ fehler: "Nur POST" }, 405);
  let e: any; try { e = await req.json(); } catch { return ok({ fehler: "JSON erwartet" }, 400); }
  if (!["entscheidung", "anliegen", "kommentar"].includes(e.art) || !/^[0-9a-f-]{36}$/.test(e.id ?? "")) return ok({ fehler: "art oder id fehlt" }, 400);

  let kundeId = "", betreff = "", zeilen: string[] = [], link = PORTAL, zeit: string | null = null, schluessel = `${e.art}:${e.id}`;
  if (e.art === "entscheidung") {
    const { data: d } = await db.from("entscheidungen").select("kunde_id,frage,antwort,kommentar,beantwortet_von,beantwortet_am").eq("id", e.id).maybeSingle();
    if (!d || !d.antwort) return ok({ uebersprungen: "keine Antwort" });
    kundeId = d.kunde_id; zeit = d.beantwortet_am; schluessel += `:${d.antwort}:${d.beantwortet_am}`;
    const w = { ja: "Ja", nein: "Nein", intern: "Kläre ich intern" }[d.antwort as string] ?? d.antwort;
    betreff = `Antwort: ${w} · ${d.frage}`;
    zeilen = [`${d.beantwortet_von ?? "Der Kunde"} hat geantwortet: <b>${esc(w)}</b>`, `Frage: ${esc(d.frage)}`, d.kommentar ? `Kommentar: ${esc(d.kommentar)}` : ""];
    link = `${PORTAL}/entscheidungen`;
  } else if (e.art === "anliegen") {
    const { data: x } = await db.from("anliegen").select("kunde_id,titel,text,erstellt_name,erstellt_rolle,erstellt").eq("id", e.id).maybeSingle();
    if (!x || x.erstellt_rolle !== "kunde") return ok({ uebersprungen: "nicht vom Kunden" });
    kundeId = x.kunde_id; zeit = x.erstellt;
    betreff = `Neues Anliegen: ${x.titel}`;
    zeilen = [`${esc(x.erstellt_name ?? "Der Kunde")} hat ein Anliegen gestellt.`, `<b>${esc(x.titel)}</b>`, x.text ? esc(x.text) : ""];
    link = `${PORTAL}/anliegen/${e.id}`;
  } else {
    const { data: k } = await db.from("kommentare").select("kunde_id,bezug_art,bezug_id,text,autor_name,autor_rolle,erstellt").eq("id", e.id).maybeSingle();
    if (!k || k.autor_rolle !== "kunde") return ok({ uebersprungen: "nicht vom Kunden" });
    kundeId = k.kunde_id; zeit = k.erstellt;
    const wo = { anliegen: "einem Anliegen", aufgabe: "einer Aufgabe", bericht: "einem Bericht", entscheidung: "einer Entscheidung", datei: "einer Datei", roadmap: "der Roadmap" }[k.bezug_art as string] ?? "einem Eintrag";
    betreff = `Kommentar zu ${wo}`;
    zeilen = [`${esc(k.autor_name ?? "Der Kunde")} hat einen Kommentar zu ${wo} geschrieben:`, esc(k.text)];
    link = k.bezug_art === "anliegen" ? `${PORTAL}/anliegen/${k.bezug_id}` : PORTAL;
  }
  if (!frisch(zeit)) return ok({ uebersprungen: "nicht frisch" });

  // Jeden Anlass nur einmal
  const { error: dup } = await db.from("hinweise_gesendet").insert({ schluessel });
  if (dup) return ok({ uebersprungen: "schon gesendet" });

  const { data: kunde } = await db.from("kunden").select("name").eq("id", kundeId).maybeSingle();
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return ok({ uebersprungen: "RESEND_API_KEY fehlt" });
  const html = `<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:12pt;line-height:1.5;color:#000">` +
    [`<b>${esc(kunde?.name ?? "")}</b>`, ...zeilen.filter(Boolean), `<a href="${link}" style="color:#000">Im Portal öffnen</a>`].map((z) => `<p style="margin:0 0 12pt">${z}</p>`).join("") + `</div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: VON, to: [AN], subject: `${kunde?.name ?? "Kunde"} · ${betreff}`.slice(0, 200), html }),
  });
  if (!r.ok) { await db.from("hinweise_gesendet").delete().eq("schluessel", schluessel); return ok({ fehler: "Resend " + r.status }, 502); }
  return ok({ gesendet: true });
});
