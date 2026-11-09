/* Kundenportal PPotthoff
   Kundensicht: Übersicht, Berichte, Entscheidungen, Aufgaben, Dateien, Werkzeuge.
   Interner Bereich (nur Team mit Zwei-Faktor): Freigabe, Antworten, Dateien, Werkzeuge, Protokoll.
   Alle Zugriffsrechte liegen in der Datenbank (Zeilenregeln); die Oberfläche zeigt nur, was die Datenbank herausgibt. */
(() => {
  "use strict";
  const C = window.PORTAL;
  const sb = window.supabase.createClient(C.url, C.key, { auth: { persistSession: true, storageKey: "ppotthoff-portal" } });
  const app = document.getElementById("app");
  const S = { user: null, mitglied: null, kunde: null, kunden: [], aal: null, internKunde: null };

  // ---------- Hilfen ----------
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const datum = (d) => (d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
  const zeit = (d) => (d ? new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  const groesse = (b) => (b == null ? "" : b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1024 / 1024).toFixed(1).replace(".", ",") + " MB");
  const du = () => S.kunde?.anrede === "du";
  const t = (sie, duForm) => (du() ? duForm : sie);
  const lokal = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* egal */ } },
  };
  const route = () => (location.hash.replace(/^#\/?/, "") || "").split("/");
  const geh = (pfad) => { if (location.hash !== "#/" + pfad) location.hash = "#/" + pfad; else rendern(); };
  const meldung = (el, text, art = "fehler") => { el.innerHTML = `<div class="meldung ${art}" role="${art === "fehler" ? "alert" : "status"}">${esc(text)}</div>`; };
  const fehlerText = (e) => {
    const m = (e && (e.message || e.error_description || e.msg)) || String(e);
    if (/Invalid login credentials/i.test(m)) return "Kennung oder Passwort stimmen nicht. Bitte noch einmal versuchen.";
    if (/Invalid TOTP|invalid.*code/i.test(m)) return "Der Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben.";
    return m;
  };
  async function laden(b, pfad) {
    const { data, error } = await sb.storage.from(b).download(pfad);
    if (error) throw error;
    return data;
  }
  async function herunterladen(b, pfad, name) {
    const blob = await laden(b, pfad);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const LOGO = `<img src="assets/logo-quer-negativ.svg" alt="PPotthoff">`;

  // ---------- Rahmen ----------
  function rahmen(inhalt, reiter, aktiv, zaehler = {}) {
    const name = S.mitglied?.rolle === "team" ? "Interner Bereich" : S.kunde?.name || "";
    const tabs = reiter.map(([pfad, text]) => {
      const z = zaehler[pfad] ? `<span class="zahl" aria-label="${zaehler[pfad]} offen">${zaehler[pfad]}</span>` : "";
      return `<a href="#/${pfad}" ${aktiv === pfad ? 'aria-current="page"' : ""}>${esc(text)}${z}</a>`;
    }).join("");
    app.innerHTML = `
      <header class="kopf"><div class="wrap">${LOGO}<div class="rechts"><span class="kunde"><b>${esc(name)}</b> · Kundenportal</span><button class="text" id="abmelden">Abmelden</button></div></div></header>
      <nav class="reiter" aria-label="Bereiche"><div class="wrap">${tabs}</div></nav>
      <main id="haupt"><div class="wrap">${inhalt}</div></main>
      <footer class="fuss"><div class="wrap"><span>PPotthoff GmbH &amp; Co. KG · Gütersloh</span><span>Fragen? <a href="mailto:kontakt@ppotthoff.io">kontakt@ppotthoff.io</a></span></div></footer>`;
    document.getElementById("abmelden").onclick = abmelden;
    window.scrollTo(0, 0);
  }

  async function abmelden() {
    await sb.auth.signOut();
    S.user = S.mitglied = S.kunde = null;
    location.hash = "";
    anmeldung();
  }

  // ---------- Anmeldung ----------
  function anmeldung(hinweis) {
    document.title = "Anmelden · Kundenportal PPotthoff";
    app.innerHTML = `
      <div class="anmeldung">
        <section class="hero">${LOGO}
          <div><div class="label" style="color:var(--green-soft)">Kundenportal</div>
          <h1 style="margin-top:12px">Ihre Zahlen.<em>Ihre Entscheidungen.</em></h1>
          <p>Wochenstand, Monatsauswertung, offene Entscheidungen und Dateien an einem Ort.</p></div>
          <div class="klein" style="color:var(--green-soft)">Gehostet in Frankfurt am Main · Verbindung verschlüsselt</div>
        </section>
        <section class="form">
          <h2>Anmelden</h2>
          <form id="f" novalidate>
            <label class="feld"><span class="label">Kundenkennung (Team: E-Mail-Adresse)</span><input type="text" name="kennung" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
            <label class="feld"><span class="label">Passwort</span><input type="password" name="passwort" autocomplete="current-password" required></label>
            <button class="btn" type="submit">Anmelden</button>
            <div id="m">${hinweis ? `<div class="meldung ok" role="status">${esc(hinweis)}</div>` : ""}</div>
          </form>
          <p class="klein leise" style="margin-top:24px">Kennung oder Passwort vergessen? Schreiben Sie an <a href="mailto:kontakt@ppotthoff.io">kontakt@ppotthoff.io</a>, wir setzen den Zugang neu.</p>
        </section>
      </div>`;
    const f = document.getElementById("f");
    f.kennung.focus();
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const m = document.getElementById("m");
      const kennung = f.kennung.value.trim().toLowerCase();
      if (!kennung || !f.passwort.value) return meldung(m, "Bitte Kennung und Passwort eingeben.");
      const email = kennung.includes("@") ? kennung : `${kennung}@${C.kundenDomain}`;
      const knopf = f.querySelector("button"); knopf.disabled = true; knopf.textContent = "Lädt";
      const { error } = await sb.auth.signInWithPassword({ email, password: f.passwort.value });
      knopf.disabled = false; knopf.textContent = "Anmelden";
      if (error) return meldung(m, fehlerText(error));
      await start(true);
    };
  }

  // Zwei-Faktor für das Team
  async function zweiFaktor() {
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.currentLevel === "aal2") return true;
    const { data: fakt } = await sb.auth.mfa.listFactors();
    const totp = (fakt?.totp || []).find((f) => f.status === "verified");
    let faktorId, einrichtung = "";
    if (totp) {
      faktorId = totp.id;
    } else {
      // Unfertige Faktoren aufräumen, dann neu einrichten
      for (const f of fakt?.all || []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator " + new Date().toISOString().slice(0, 10) });
      if (error) { anmeldung(); meldung(document.getElementById("m"), fehlerText(error)); return false; }
      faktorId = data.id;
      einrichtung = `<p>Der interne Bereich braucht eine Zwei-Faktor-Anmeldung. Scannen Sie den Code mit einer Authenticator-App (z. B. Bitwarden, 1Password, Google Authenticator) und geben Sie dann den sechsstelligen Code ein.</p>
        <div class="qr"><img src="${esc(data.totp.qr_code)}" alt="QR-Code für die Authenticator-App"></div>
        <p class="klein leise">Ohne Kamera: Schlüssel <code>${esc(data.totp.secret)}</code></p>`;
    }
    return new Promise((fertig) => {
      app.innerHTML = `<div class="anmeldung"><section class="hero">${LOGO}<div><div class="label" style="color:var(--green-soft)">Interner Bereich</div><h1 style="margin-top:12px">Zweiter Schritt.</h1></div><div></div></section>
        <section class="form"><h2>${totp ? "Code eingeben" : "Zwei-Faktor einrichten"}</h2>${einrichtung}
        <form id="f2" novalidate><label class="feld"><span class="label">Code aus der App</span><input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
        <button class="btn" type="submit">Bestätigen</button> <button class="text" type="button" id="zur">Abbrechen</button><div id="m2"></div></form></section></div>`;
      const f = document.getElementById("f2");
      f.code.focus();
      document.getElementById("zur").onclick = () => { abmelden(); fertig(false); };
      f.onsubmit = async (ev) => {
        ev.preventDefault();
        const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: faktorId, code: f.code.value.replace(/\s/g, "") });
        if (error) return meldung(document.getElementById("m2"), fehlerText(error));
        fertig(true);
      };
    });
  }

  async function start(frischAngemeldet = false) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return anmeldung();
    S.user = session.user;
    const { data: m } = await sb.from("mitglieder").select("rolle,kunde_id,anzeigename").eq("user_id", S.user.id).maybeSingle();
    if (!m) { await sb.auth.signOut(); return anmeldung("Dieser Zugang ist keinem Kunden zugeordnet. Bitte melden Sie sich bei uns."); }
    S.mitglied = m;
    if (m.rolle === "team") {
      const ok = await zweiFaktor();
      if (!ok) return;
      const { data: kunden } = await sb.from("kunden").select("*").order("name");
      S.kunden = kunden || [];
      S.internKunde = S.kunden.find((k) => k.id === lokal.get("intern-kunde")) || S.kunden[0] || null;
      if (!route()[0].startsWith("intern")) location.hash = "#/intern";
    } else {
      const { data: k } = await sb.from("kunden").select("*").eq("id", m.kunde_id).single();
      S.kunde = k;
      if (route()[0].startsWith("intern")) location.hash = "#/";
    }
    if (frischAngemeldet) sb.rpc("angemeldet").then(() => {});
    rendern();
  }

  // ---------- Kundensicht ----------
  const KUNDE_REITER = [["", "Übersicht"], ["berichte", "Berichte"], ["entscheidungen", "Entscheidungen"], ["aufgaben", "Aufgaben"], ["dateien", "Dateien"], ["werkzeuge", "Werkzeuge"]];

  async function zaehlerKunde() {
    const [e, a] = await Promise.all([
      sb.from("entscheidungen").select("id", { count: "exact", head: true }).eq("status", "offen"),
      sb.from("aufgaben").select("id", { count: "exact", head: true }).eq("liegt_bei", "kunde").eq("erledigt", false),
    ]);
    return { entscheidungen: e.count || 0, aufgaben: a.count || 0 };
  }

  async function uebersicht() {
    const [z, b, e, a] = await Promise.all([
      zaehlerKunde(),
      sb.from("berichte").select("id,art,titel,zeitraum,zusammenfassung,freigegeben_am").order("zeitraum_start", { ascending: false }).order("freigegeben_am", { ascending: false }).limit(4),
      sb.from("entscheidungen").select("id,frage,frist").eq("status", "offen").order("erstellt").limit(5),
      sb.from("aufgaben").select("titel,frist").eq("liegt_bei", "kunde").eq("erledigt", false).order("frist", { nullsFirst: false }).limit(5),
    ]);
    const neu = b.data?.[0];
    const kopf = neu
      ? `<div class="label kicker">Neu · ${esc(neu.titel)}</div><h1>${esc(S.kunde.name)}</h1>${neu.zusammenfassung ? `<p class="lead">${esc(neu.zusammenfassung)}</p>` : ""}<p style="margin-top:24px"><a class="btn" href="#/berichte/${neu.id}">${esc(neu.titel)} lesen</a></p>`
      : `<div class="label kicker">Kundenportal</div><h1>${esc(S.kunde.name)}</h1><div class="leer"><span>Der erste Bericht liegt hier, sobald er freigegeben ist.</span></div>`;
    const ents = (e.data || []).map((x) => `<li><div><div class="titel">${esc(x.frage)}</div>${x.frist ? `<div class="unter">Frist: ${esc(x.frist)}</div>` : ""}</div><div class="aktionen"><a href="#/entscheidungen">Entscheiden</a></div></li>`).join("");
    const aufg = (a.data || []).map((x) => `<li><div><div class="titel">${esc(x.titel)}</div>${x.frist ? `<div class="unter">bis ${datum(x.frist)}</div>` : ""}</div></li>`).join("");
    rahmen(`${kopf}
      <div class="raster">
        <div><div class="label">Offene Entscheidungen</div><div class="wert">${z.entscheidungen}</div><div class="klein leise">${z.entscheidungen ? t("warten auf Ihre Antwort", "warten auf deine Antwort") : "Gerade gibt es nichts zu entscheiden."}</div></div>
        <div><div class="label">${t("Liegt bei Ihnen", "Liegt bei dir")}</div><div class="wert">${z.aufgaben}</div><div class="klein leise">offene Aufgaben</div></div>
        <div><div class="label">Letzter Bericht</div><div class="wert" style="font-size:28px;margin-top:14px">${neu ? esc(neu.zeitraum) : "–"}</div><div class="klein leise">${neu ? "freigegeben am " + datum(neu.freigegeben_am) : ""}</div></div>
      </div>
      ${ents ? `<section class="abschnitt"><div class="abschnitt-kopf"><h2>Zu entscheiden</h2><a href="#/entscheidungen">Alle Entscheidungen</a></div><ul class="liste">${ents}</ul></section>` : ""}
      ${aufg ? `<section class="abschnitt"><div class="abschnitt-kopf"><h2>${t("Liegt bei Ihnen", "Liegt bei dir")}</h2><a href="#/aufgaben">Alle Aufgaben</a></div><ul class="liste">${aufg}</ul></section>` : ""}`,
      KUNDE_REITER, "", z);
  }

  function berichtZeile(r, intern = false) {
    const art = r.art === "monatsauswertung" ? "Monatsauswertung" : "Wochenstand";
    const marke = intern ? (r.status === "freigegeben" ? `<span class="marke gruen">freigegeben</span>` : r.status === "entwurf" ? `<span class="marke">Entwurf</span>` : `<span class="marke rot">zurückgezogen</span>`) : "";
    const pdf = r.pdf_pfad ? `<button class="text" data-pdf="${esc(r.pdf_pfad)}" data-name="${esc(r.titel)}.pdf">PDF</button>` : "";
    const lesen = `<a href="#/${intern ? "intern/vorschau" : "berichte"}/${r.id}">${intern ? "Vorschau" : "Lesen"}</a>`;
    const frei = intern ? (r.status === "freigegeben"
      ? `<button class="text" data-zurueck="${r.id}">Zurückziehen</button>`
      : `<button class="btn" data-frei="${r.id}">Freigeben</button>`) : "";
    return `<li><div><div class="titel">${esc(r.titel)}${marke}</div><div class="unter">${art} · ${esc(r.zeitraum)}${r.freigegeben_am ? " · freigegeben am " + datum(r.freigegeben_am) : ""}</div></div><div class="aktionen">${lesen}${pdf}${frei}</div></li>`;
  }
  function pdfKnoepfe() {
    app.querySelectorAll("[data-pdf]").forEach((k) => (k.onclick = async () => {
      k.disabled = true;
      try { await herunterladen("berichte", k.dataset.pdf, k.dataset.name); } catch (e) { alertLeise(fehlerText(e)); }
      k.disabled = false;
    }));
  }
  function alertLeise(text) {
    const m = document.createElement("div");
    m.className = "meldung fehler"; m.setAttribute("role", "alert"); m.textContent = text;
    document.getElementById("haupt")?.querySelector(".wrap")?.prepend(m);
  }

  async function berichte() {
    const [z, { data }] = await Promise.all([zaehlerKunde(),
      sb.from("berichte").select("id,art,titel,zeitraum,pdf_pfad,freigegeben_am").order("zeitraum_start", { ascending: false })]);
    const monat = (data || []).filter((r) => r.art === "monatsauswertung");
    const woche = (data || []).filter((r) => r.art === "wochenstand");
    const block = (titel, liste) => `<section class="abschnitt" style="margin-top:40px"><div class="abschnitt-kopf"><h2>${titel}</h2></div>${liste.length ? `<ul class="liste">${liste.map((r) => berichtZeile(r)).join("")}</ul>` : `<div class="leer">Noch keine ${titel} freigegeben.</div>`}</section>`;
    rahmen(`<div class="label kicker">Archiv</div><h1>Berichte</h1>${block("Monatsauswertungen", monat)}${block("Wochenstände", woche)}`, KUNDE_REITER, "berichte", z);
    pdfKnoepfe();
  }

  async function berichtAnzeigen(id, intern = false) {
    const { data: r, error } = await sb.from("berichte").select("*").eq("id", id).maybeSingle();
    const zurueck = intern ? "intern" : "berichte";
    const reiter = intern ? INTERN_REITER : KUNDE_REITER;
    if (error || !r) { rahmen(`<a class="zurueck" href="#/${zurueck}">Zurück</a><div class="leer">Diesen Bericht gibt es nicht oder er ist nicht freigegeben.</div>`, reiter, zurueck); return; }
    const pdf = r.pdf_pfad ? `<button class="btn zwei" data-pdf="${esc(r.pdf_pfad)}" data-name="${esc(r.titel)}.pdf">Als PDF laden</button>` : "";
    const frei = intern && r.status !== "freigegeben" ? `<button class="btn" data-frei="${r.id}">Für den Kunden freigeben</button>` : "";
    rahmen(`<a class="zurueck" href="#/${zurueck}">Zurück zur Übersicht</a>
      <div class="abschnitt-kopf" style="border:0"><div><div class="label kicker">${r.art === "monatsauswertung" ? "Monatsauswertung" : "Wochenstand"}${intern ? " · " + esc(r.status) : ""}</div><h1>${esc(r.zeitraum)}</h1></div><div class="aktionen" style="display:flex;gap:12px;flex-wrap:wrap">${frei}${pdf}</div></div>
      <div class="bericht-rahmen"><iframe id="ber" title="${esc(r.titel)}" sandbox="allow-same-origin"></iframe></div>`, reiter, intern ? "intern" : "berichte");
    pdfKnoepfe();
    if (intern) freigabeKnoepfe();
    try {
      const html = await (await laden("berichte", r.html_pfad)).text();
      const f = document.getElementById("ber");
      f.onload = () => {
        const passe = () => { try { f.style.height = f.contentDocument.documentElement.scrollHeight + "px"; } catch { /* egal */ } };
        passe(); setTimeout(passe, 300); setTimeout(passe, 1200);
        window.addEventListener("resize", passe);
      };
      f.srcdoc = html;
      if (!intern) sb.rpc("bericht_geoeffnet", { p_id: r.id }).then(() => {});
    } catch (e) { alertLeise("Der Bericht konnte nicht geladen werden: " + fehlerText(e)); }
  }

  function entscheidungsKarte(d, intern = false) {
    const kl = d.antwort === "ja" ? " ja" : d.antwort === "nein" ? " nein" : "";
    const kopf = `<div class="num">${String(d.nr || "").padStart(2, "0")}</div>
      <div><div class="label">${esc(d.kategorie || "Entscheidung")}</div><div class="frage">${esc(d.frage)}</div>
      <div class="empf"><b>Empfehlung:</b> ${esc(d.empfehlung)}</div>${d.begruendung ? `<div style="margin-top:6px">${esc(d.begruendung)}</div>` : ""}
      ${d.wenn_nein ? `<div class="neben">Wenn nein: ${esc(d.wenn_nein)}</div>` : ""}${d.frist ? `<div class="neben">Frist: ${esc(d.frist)}</div>` : ""}</div>`;
    let rechts;
    if (d.status === "beantwortet" || d.status === "erledigt") {
      rechts = `<div class="ergebnis"><div class="label">${t("Ihre Entscheidung", "Deine Entscheidung")}</div><p style="margin-top:8px"><b>${d.antwort === "ja" ? "Ja" : "Nein"}</b>, ${esc(d.beantwortet_von || "")} am ${zeit(d.beantwortet_am)}</p>${d.kommentar ? `<p class="neben">„${esc(d.kommentar)}“</p>` : ""}${d.status === "erledigt" ? `<p class="neben">Von uns übernommen.</p>` : intern ? `<p style="margin-top:12px"><button class="text" data-erledigt="${d.id}">Als übernommen markieren</button></p>` : `<p class="neben">Bei uns angekommen.</p>`}</div>`;
    } else if (intern) {
      rechts = `<div class="ergebnis"><div class="label">Status</div><p style="margin-top:8px">${d.status === "entwurf" ? "Entwurf, sichtbar nach Freigabe des Berichts" : "offen beim Kunden"}</p></div>`;
    } else {
      const name = esc(lokal.get("portal-name") || "");
      rechts = `<div class="antwort"><div class="label">${t("Ihre Entscheidung", "Deine Entscheidung")}</div>
        <form data-ent="${d.id}" novalidate style="margin-top:8px">
          <fieldset style="border:0"><legend class="sr">Ja oder Nein</legend><div class="janein">
            <label><input type="radio" name="a" value="ja"> Ja</label><label><input type="radio" name="a" value="nein"> Nein</label></div></fieldset>
          <label class="feld" style="margin:0"><span class="label">Name</span><input type="text" name="name" value="${name}" autocomplete="name" required></label>
          <label class="feld" style="margin:0"><span class="label">Kommentar (optional)</span><textarea name="k" rows="2"></textarea></label>
          <button class="btn" type="submit">Entscheidung senden</button><div class="m"></div></form></div>`;
    }
    return `<article class="karte${kl}">${kopf}${rechts}</article>`;
  }

  async function entscheidungen() {
    const [z, { data }] = await Promise.all([zaehlerKunde(), sb.from("entscheidungen").select("*").order("erstellt", { ascending: false }).order("nr")]);
    const offen = (data || []).filter((d) => d.status === "offen");
    const fertig = (data || []).filter((d) => d.status !== "offen");
    rahmen(`<div class="label kicker">Entscheidungen</div><h1>${offen.length ? t("Was wir von Ihnen brauchen", "Was wir von dir brauchen") : "Gerade gibt es nichts zu entscheiden."}</h1>
      ${offen.length ? `<p class="lead">Jede Entscheidung hat unsere Empfehlung als Satz. ${t("Ihre Antwort", "Deine Antwort")} kommt sofort bei uns an.</p><div class="karten">${offen.map((d) => entscheidungsKarte(d)).join("")}</div>` : ""}
      ${fertig.length ? `<section class="abschnitt"><div class="abschnitt-kopf"><h2>Bereits entschieden</h2></div><div class="karten">${fertig.map((d) => entscheidungsKarte(d)).join("")}</div></section>` : ""}`,
      KUNDE_REITER, "entscheidungen", z);
    app.querySelectorAll("form[data-ent]").forEach((f) => (f.onsubmit = async (ev) => {
      ev.preventDefault();
      const m = f.querySelector(".m");
      const a = f.querySelector("input[name=a]:checked")?.value;
      if (!a) return meldung(m, "Bitte Ja oder Nein wählen.");
      if (!f.name.value.trim()) return meldung(m, "Bitte den Namen angeben, damit wir wissen, wer entschieden hat.");
      const k = f.querySelector("button"); k.disabled = true; k.textContent = "Wird gesendet";
      const { error } = await sb.rpc("entscheidung_beantworten", { p_id: f.dataset.ent, p_antwort: a, p_name: f.name.value.trim(), p_kommentar: f.k.value });
      if (error) { k.disabled = false; k.textContent = "Entscheidung senden"; return meldung(m, fehlerText(error)); }
      lokal.set("portal-name", f.name.value.trim());
      entscheidungen();
    }));
  }

  async function aufgaben() {
    const [z, { data }] = await Promise.all([zaehlerKunde(), sb.from("aufgaben").select("*").order("frist", { nullsFirst: false })]);
    const liste = (arr) => arr.length ? `<ul class="liste">${arr.map((x) => `<li><div><div class="titel">${esc(x.titel)}</div><div class="unter">${x.frist ? "bis " + datum(x.frist) : "ohne Frist"}</div></div></li>`).join("")}</ul>` : `<div class="leer">Nichts offen.</div>`;
    const offen = (data || []).filter((x) => !x.erledigt);
    const erledigt = (data || []).filter((x) => x.erledigt).slice(0, 20);
    rahmen(`<div class="label kicker">Aufgaben</div><h1>Wer gerade was in der Hand hat</h1>
      <div class="zwei-spalten abschnitt" style="margin-top:40px">
        <section><div class="abschnitt-kopf"><h2>${t("Liegt bei Ihnen", "Liegt bei dir")}</h2></div>${liste(offen.filter((x) => x.liegt_bei === "kunde"))}</section>
        <section><div class="abschnitt-kopf"><h2>Liegt bei uns</h2></div>${liste(offen.filter((x) => x.liegt_bei === "wir"))}</section>
      </div>
      ${erledigt.length ? `<section class="abschnitt"><div class="abschnitt-kopf"><h2>Zuletzt erledigt</h2></div><ul class="liste">${erledigt.map((x) => `<li><div><div class="titel leise">${esc(x.titel)}</div></div></li>`).join("")}</ul></section>` : ""}`,
      KUNDE_REITER, "aufgaben", z);
  }

  function dateiZeile(d, intern) {
    const von = d.richtung === "vom_kunden" ? (intern ? "vom Kunden" : t("von Ihnen", "von dir")) : "von uns";
    return `<li><div><div class="titel">${esc(d.name)}</div><div class="unter">${von} · ${zeit(d.erstellt)}${d.groesse ? " · " + groesse(d.groesse) : ""}${d.notiz ? " · " + esc(d.notiz) : ""}</div></div><div class="aktionen"><button class="text" data-datei="${esc(d.pfad)}" data-name="${esc(d.name)}">Laden</button></div></li>`;
  }
  function ablageForm(id) {
    return `<form id="${id}" class="ablage" novalidate><label class="btn zwei" style="cursor:pointer">Dateien wählen<input type="file" name="d" multiple class="sr"></label>
      <span class="klein leise" data-wahl>oder hierher ziehen (bis 100 MB je Datei)</span>
      <input type="text" name="notiz" placeholder="Notiz (optional), z. B. wofür die Datei ist" style="flex:1;min-width:220px">
      <button class="btn" type="submit">Hochladen</button><div class="m" style="flex-basis:100%"></div></form>`;
  }
  function ablageVerdrahten(id, kundeId, richtung, danach) {
    const f = document.getElementById(id);
    let dateien = [];
    const zeige = () => (f.querySelector("[data-wahl]").textContent = dateien.length ? dateien.map((d) => d.name).join(", ") : "oder hierher ziehen (bis 100 MB je Datei)");
    f.d.onchange = () => { dateien = [...f.d.files]; zeige(); };
    ["dragenter", "dragover"].forEach((e) => f.addEventListener(e, (ev) => { ev.preventDefault(); f.classList.add("ziehen"); }));
    ["dragleave", "drop"].forEach((e) => f.addEventListener(e, (ev) => { ev.preventDefault(); f.classList.remove("ziehen"); }));
    f.addEventListener("drop", (ev) => { dateien = [...ev.dataTransfer.files]; zeige(); });
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const m = f.querySelector(".m");
      if (!dateien.length) return meldung(m, "Bitte zuerst eine Datei wählen.");
      const k = f.querySelector("button[type=submit]"); k.disabled = true;
      const ordner = richtung === "vom_kunden" ? "vom-kunden" : "von-uns";
      try {
        for (const d of dateien) {
          if (d.size > 100 * 1024 * 1024) throw new Error(`${d.name} ist größer als 100 MB.`);
          k.textContent = "Lädt " + d.name;
          const sauber = d.name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120);
          const pfad = `${kundeId}/${ordner}/${Date.now()}-${sauber}`;
          const up = await sb.storage.from("dateien").upload(pfad, d, { contentType: d.type || "application/octet-stream" });
          if (up.error) throw up.error;
          const ins = await sb.from("dateien").insert({ kunde_id: kundeId, pfad, name: d.name, groesse: d.size, mime: d.type, richtung, notiz: f.notiz.value.trim() || null });
          if (ins.error) throw ins.error;
        }
        danach();
      } catch (e) { k.disabled = false; k.textContent = "Hochladen"; meldung(m, fehlerText(e)); }
    };
  }
  function dateiKnoepfe() {
    app.querySelectorAll("[data-datei]").forEach((k) => (k.onclick = async () => {
      k.disabled = true;
      try { await herunterladen("dateien", k.dataset.datei, k.dataset.name); } catch (e) { alertLeise(fehlerText(e)); }
      k.disabled = false;
    }));
  }

  async function dateienSeite() {
    const [z, { data }] = await Promise.all([zaehlerKunde(), sb.from("dateien").select("*").order("erstellt", { ascending: false })]);
    rahmen(`<div class="label kicker">Dateien</div><h1>Austausch in beide Richtungen</h1>
      <p class="lead">Datenblätter, Bilder, Freigaben: was ${t("Sie hier hochladen", "du hier hochlädst")}, liegt sofort bei uns.</p>
      ${ablageForm("ab")}
      <section class="abschnitt"><div class="abschnitt-kopf"><h2>Alle Dateien</h2></div>${data?.length ? `<ul class="liste">${data.map((d) => dateiZeile(d, false)).join("")}</ul>` : `<div class="leer">Noch keine Dateien.</div>`}</section>`,
      KUNDE_REITER, "dateien", z);
    ablageVerdrahten("ab", S.kunde.id, "vom_kunden", dateienSeite);
    dateiKnoepfe();
  }

  async function werkzeuge() {
    const [z, { data }] = await Promise.all([zaehlerKunde(), sb.from("werkzeuge").select("*").order("reihenfolge")]);
    rahmen(`<div class="label kicker">Werkzeuge</div><h1>Werkzeuge von PPotthoff</h1>
      ${data?.length ? `<ul class="liste" style="margin-top:32px">${data.map((w) => `<li><div><div class="titel">${esc(w.titel)}</div>${w.beschreibung ? `<div class="unter">${esc(w.beschreibung)}</div>` : ""}</div><div class="aktionen"><a class="btn zwei" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">Öffnen</a></div></li>`).join("")}</ul>`
        : `<div class="leer">Für ${t("Sie", "dich")} sind noch keine Werkzeuge eingerichtet.</div>`}`,
      KUNDE_REITER, "werkzeuge", z);
  }

  // ---------- Interner Bereich ----------
  const INTERN_REITER = [["intern", "Berichte"], ["intern/entscheidungen", "Antworten"], ["intern/dateien", "Dateien"], ["intern/aufgaben", "Aufgaben"], ["intern/werkzeuge", "Werkzeuge"], ["intern/protokoll", "Protokoll"]];
  function kundenwahl() {
    return `<div class="leiste"><label class="feld"><span class="label">Kunde</span><select id="kw">${S.kunden.map((k) => `<option value="${k.id}" ${k.id === S.internKunde?.id ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select></label></div>`;
  }
  function kundenwahlVerdrahten(neu) {
    const s = document.getElementById("kw");
    if (s) s.onchange = () => { S.internKunde = S.kunden.find((k) => k.id === s.value); lokal.set("intern-kunde", s.value); neu(); };
  }
  async function zaehlerIntern() {
    const { count } = await sb.from("entscheidungen").select("id", { count: "exact", head: true }).eq("status", "beantwortet");
    return { "intern/entscheidungen": count || 0 };
  }
  function freigabeKnoepfe() {
    app.querySelectorAll("[data-frei]").forEach((k) => (k.onclick = async () => {
      if (!confirmLeise(k, "Wirklich freigeben? Der Kunde sieht den Bericht danach sofort.")) return;
      const { error } = await sb.from("berichte").update({ status: "freigegeben" }).eq("id", k.dataset.frei);
      if (error) return alertLeise(fehlerText(error));
      rendern();
    }));
    app.querySelectorAll("[data-zurueck]").forEach((k) => (k.onclick = async () => {
      if (!confirmLeise(k, "Wirklich zurückziehen? Der Kunde sieht den Bericht dann nicht mehr.")) return;
      const { error } = await sb.from("berichte").update({ status: "zurueckgezogen" }).eq("id", k.dataset.zurueck);
      if (error) return alertLeise(fehlerText(error));
      rendern();
    }));
  }
  // Zweistufige Bestätigung ohne Browser-Dialog: erster Klick fragt, zweiter Klick führt aus
  function confirmLeise(knopf, frage) {
    if (knopf.dataset.sicher === "1") return true;
    knopf.dataset.sicher = "1";
    const alt = knopf.textContent;
    knopf.textContent = "Ja, wirklich";
    knopf.title = frage;
    const hinweis = document.createElement("span");
    hinweis.className = "klein leise"; hinweis.textContent = frage;
    knopf.parentElement.appendChild(hinweis);
    setTimeout(() => { knopf.dataset.sicher = ""; knopf.textContent = alt; hinweis.remove(); }, 6000);
    return false;
  }

  async function internBerichte() {
    const k = S.internKunde;
    if (!k) return rahmen(`<h1>Noch keine Kunden</h1>`, INTERN_REITER, "intern");
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("berichte").select("*").eq("kunde_id", k.id).order("zeitraum_start", { ascending: false }).order("art")]);
    rahmen(`<div class="label kicker">Interner Bereich</div><h1>Berichte freigeben</h1><p class="lead">Neue Berichte kommen als Entwurf. Der Kunde sieht sie erst nach der Freigabe; die Entscheidungen des Berichts werden dann mit geöffnet.</p>
      <div style="margin-top:32px">${kundenwahl()}</div>
      ${data?.length ? `<ul class="liste">${data.map((r) => berichtZeile(r, true)).join("")}</ul>` : `<div class="leer">Für ${esc(k.name)} liegt noch kein Bericht.</div>`}`,
      INTERN_REITER, "intern", z);
    kundenwahlVerdrahten(internBerichte); pdfKnoepfe(); freigabeKnoepfe();
  }

  async function internEntscheidungen() {
    const k = S.internKunde;
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("entscheidungen").select("*").eq("kunde_id", k.id).order("erstellt", { ascending: false }).order("nr")]);
    const neu = (data || []).filter((d) => d.status === "beantwortet");
    const rest = (data || []).filter((d) => d.status !== "beantwortet");
    rahmen(`<div class="label kicker">Interner Bereich</div><h1>Antworten der Kunden</h1><div style="margin-top:32px">${kundenwahl()}</div>
      ${neu.length ? `<h2>Neu beantwortet</h2><div class="karten">${neu.map((d) => entscheidungsKarte(d, true)).join("")}</div>` : `<div class="leer">Keine neuen Antworten von ${esc(k.name)}.</div>`}
      ${rest.length ? `<section class="abschnitt"><div class="abschnitt-kopf"><h2>Alle übrigen</h2></div><div class="karten">${rest.map((d) => entscheidungsKarte(d, true)).join("")}</div></section>` : ""}`,
      INTERN_REITER, "intern/entscheidungen", z);
    kundenwahlVerdrahten(internEntscheidungen);
    app.querySelectorAll("[data-erledigt]").forEach((b) => (b.onclick = async () => {
      const { error } = await sb.from("entscheidungen").update({ status: "erledigt" }).eq("id", b.dataset.erledigt);
      if (error) return alertLeise(fehlerText(error));
      internEntscheidungen();
    }));
  }

  async function internDateien() {
    const k = S.internKunde;
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("dateien").select("*").eq("kunde_id", k.id).order("erstellt", { ascending: false })]);
    rahmen(`<div class="label kicker">Interner Bereich</div><h1>Dateien</h1><div style="margin-top:32px">${kundenwahl()}</div>
      <h2>Für ${esc(k.name)} bereitstellen</h2>${ablageForm("ab")}
      <section class="abschnitt"><div class="abschnitt-kopf"><h2>Alle Dateien</h2></div>${data?.length ? `<ul class="liste">${data.map((d) => dateiZeile(d, true)).join("")}</ul>` : `<div class="leer">Noch keine Dateien.</div>`}</section>`,
      INTERN_REITER, "intern/dateien", z);
    kundenwahlVerdrahten(internDateien);
    ablageVerdrahten("ab", k.id, "von_uns", internDateien);
    dateiKnoepfe();
  }

  async function internAufgaben() {
    const k = S.internKunde;
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("aufgaben").select("*").eq("kunde_id", k.id).order("frist", { nullsFirst: false })]);
    rahmen(`<div class="label kicker">Interner Bereich</div><h1>Aufgaben in der Kundensicht</h1>
      <p class="lead">Hier erscheinen nur Trello-Karten mit dem Label „Kunde sieht“: Titel, wer sie in der Hand hat, Frist. Gepflegt wird in Trello.</p><div style="margin-top:32px">${kundenwahl()}</div>
      ${data?.length ? `<table class="protokoll"><thead><tr><th>Aufgabe</th><th>Liegt bei</th><th>Frist</th><th>Status</th></tr></thead><tbody>${data.map((x) => `<tr><td>${esc(x.titel)}</td><td>${x.liegt_bei === "kunde" ? "Kunde" : "uns"}</td><td>${datum(x.frist)}</td><td>${x.erledigt ? "erledigt" : "offen"}</td></tr>`).join("")}</tbody></table>` : `<div class="leer">Noch keine Karten mit „Kunde sieht“ für ${esc(k.name)}.</div>`}`,
      INTERN_REITER, "intern/aufgaben", z);
    kundenwahlVerdrahten(internAufgaben);
  }

  async function internWerkzeuge() {
    const k = S.internKunde;
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("werkzeuge").select("*").eq("kunde_id", k.id).order("reihenfolge")]);
    rahmen(`<div class="label kicker">Interner Bereich</div><h1>Werkzeuge</h1><div style="margin-top:32px">${kundenwahl()}</div>
      ${data?.length ? `<ul class="liste">${data.map((w) => `<li><div><div class="titel">${esc(w.titel)}${w.aktiv ? "" : '<span class="marke">aus</span>'}</div><div class="unter">${esc(w.beschreibung || "")}</div></div><div class="aktionen"><button class="text" data-umschalten="${w.id}" data-aktiv="${w.aktiv}">${w.aktiv ? "Ausblenden" : "Einblenden"}</button></div></li>`).join("")}</ul>` : `<div class="leer">Noch keine Werkzeuge für ${esc(k.name)}.</div>`}
      <section class="abschnitt"><div class="abschnitt-kopf"><h2>Werkzeug hinzufügen</h2></div>
      <form id="wf" novalidate style="max-width:560px;margin-top:16px"><label class="feld"><span class="label">Name</span><input type="text" name="titel" required></label>
      <label class="feld"><span class="label">Beschreibung</span><input type="text" name="beschreibung"></label>
      <label class="feld"><span class="label">Link (https)</span><input type="text" name="url" required placeholder="https://"></label>
      <button class="btn" type="submit">Hinzufügen</button><div class="m"></div></form></section>`,
      INTERN_REITER, "intern/werkzeuge", z);
    kundenwahlVerdrahten(internWerkzeuge);
    const f = document.getElementById("wf");
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      if (!f.titel.value.trim() || !/^https:\/\//.test(f.url.value.trim())) return meldung(f.querySelector(".m"), "Bitte Name und einen Link mit https:// angeben.");
      const { error } = await sb.from("werkzeuge").insert({ kunde_id: k.id, titel: f.titel.value.trim(), beschreibung: f.beschreibung.value.trim() || null, url: f.url.value.trim(), reihenfolge: (data?.length || 0) + 1 });
      if (error) return meldung(f.querySelector(".m"), fehlerText(error));
      internWerkzeuge();
    };
    app.querySelectorAll("[data-umschalten]").forEach((b) => (b.onclick = async () => {
      await sb.from("werkzeuge").update({ aktiv: b.dataset.aktiv !== "true" }).eq("id", b.dataset.umschalten);
      internWerkzeuge();
    }));
  }

  async function internProtokoll() {
    const k = S.internKunde;
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("protokoll").select("*").eq("kunde_id", k.id).order("zeit", { ascending: false }).limit(200)]);
    const text = { anmeldung: "Anmeldung", bericht_geoeffnet: "Bericht geöffnet", bericht_freigegeben: "Bericht freigegeben", bericht_abgelegt: "Bericht als Entwurf abgelegt", entscheidung_beantwortet: "Entscheidung beantwortet", datei_vom_kunden: "Datei hochgeladen (Kunde)", datei_von_uns: "Datei bereitgestellt (wir)" };
    rahmen(`<div class="label kicker">Interner Bereich</div><h1>Protokoll</h1><div style="margin-top:32px">${kundenwahl()}</div>
      ${data?.length ? `<table class="protokoll"><thead><tr><th>Zeit</th><th>Vorgang</th><th>Details</th></tr></thead><tbody>${data.map((p) => `<tr><td>${zeit(p.zeit)}</td><td>${esc(text[p.aktion] || p.aktion)}</td><td>${esc(p.details ? Object.values(p.details).join(" · ") : "")}</td></tr>`).join("")}</tbody></table>` : `<div class="leer">Noch keine Vorgänge.</div>`}`,
      INTERN_REITER, "intern/protokoll", z);
    kundenwahlVerdrahten(internProtokoll);
  }

  // ---------- Router ----------
  async function rendern() {
    if (!S.mitglied) return;
    const [a, b, c] = route();
    try {
      if (S.mitglied.rolle === "team") {
        document.title = "Interner Bereich · Kundenportal PPotthoff";
        if (a !== "intern") return (location.hash = "#/intern");
        if (!b) return internBerichte();
        if (b === "vorschau") return berichtAnzeigen(c, true);
        return ({ entscheidungen: internEntscheidungen, dateien: internDateien, aufgaben: internAufgaben, werkzeuge: internWerkzeuge, protokoll: internProtokoll }[b] || internBerichte)();
      }
      document.title = `${S.kunde.name} · Kundenportal PPotthoff`;
      if (a === "berichte" && b) return berichtAnzeigen(b);
      return ({ "": uebersicht, berichte, entscheidungen, aufgaben, dateien: dateienSeite, werkzeuge }[a] || uebersicht)();
    } catch (e) {
      alertLeise("Etwas hat nicht geladen: " + fehlerText(e));
    }
  }

  window.addEventListener("hashchange", rendern);
  sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT" && S.mitglied) { S.mitglied = null; anmeldung(); } });
  start();
})();
