/* Kundenportal PPotthoff
   Kundensicht nach G1 bis G4: Übersicht, Berichte, Entscheidungen, Aufgaben, Anliegen, Dateien, Roadmap, Werkzeuge.
   Interner Bereich (nur Team mit Zwei-Faktor): nicht gestaltet, übernimmt portal.css.
   Alle Zugriffsrechte liegen in der Datenbank (Zeilenregeln); die Oberfläche zeigt nur, was die Datenbank herausgibt.
   Teile, die die Migration vom 15.11. brauchen (S.g3), bleiben ohne sie unsichtbar. */
(() => {
  "use strict";
  const C = window.PORTAL;
  const sb = window.supabase.createClient(C.url, C.key, { auth: { persistSession: true, storageKey: "ppotthoff-portal" } });
  const app = document.getElementById("app");
  const S = { user: null, mitglied: null, kunde: null, kunden: [], internKunde: null, g3: false, mehr: { roadmap: 0, werkzeuge: 0 } };
  const KONTAKT = "kontakt@patrickpotthoff.de";

  // ---------- Hilfen ----------
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TZ = { timeZone: "Europe/Berlin" };
  const datum = (d) => (d ? new Date(d).toLocaleDateString("de-DE", { ...TZ, day: "2-digit", month: "2-digit", year: "numeric" }) : "");
  const zeit = (d) => (d ? `${datum(d)}, ${new Date(d).toLocaleTimeString("de-DE", { ...TZ, hour: "numeric", minute: "2-digit" })}` : "");
  const tagMonat = (d) => new Date(d).toLocaleDateString("de-DE", { ...TZ, day: "2-digit", month: "2-digit" }).replace(/\.?$/, ".");
  const groesse = (b) => (b == null ? "" : b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1024 / 1024).toFixed(1).replace(".", ",") + " MB");
  const du = () => (S.mitglied?.anrede || S.kunde?.anrede) === "du";
  const t = (sie, duForm) => (du() ? duForm : sie);
  const vorname = () => (S.mitglied?.anzeigename || "").trim().split(/\s+/)[0] || "";
  const lokal = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* egal */ } },
    weg: (k) => { try { localStorage.removeItem(k); } catch { /* egal */ } },
  };
  const route = () => (location.hash.replace(/^#\/?/, "") || "").split("/");
  const geh = (pfad) => { if (location.hash !== "#/" + pfad) location.hash = "#/" + pfad; else rendern(); };
  const SYM = {
    check: "M379.15-258.31 168.62-468.85l32.61-32.23 177.92 177.93 379-379.39 32.62 32.62-411.62 411.61Z",
    error: "M499.46-298.52q7.77-7.75 7.77-19.46t-7.75-19.48q-7.75-7.77-19.46-7.77t-19.48 7.75q-7.77 7.75-7.77 19.46t7.75 19.48q7.75 7.77 19.46 7.77t19.48-7.75Zm-39.92-133.33h45.38v-249.53h-45.38v249.53ZM480.33-100q-78.95 0-147.89-29.92-68.95-29.92-120.76-81.71-51.81-51.79-81.75-120.78Q100-401.39 100-480.43q0-78.66 29.92-147.87 29.92-69.21 81.71-120.52 51.79-51.31 120.78-81.25Q401.39-860 480.43-860q78.66 0 147.87 29.92 69.21 29.92 120.52 81.21 51.31 51.29 81.25 120.63Q860-558.9 860-480.33q0 78.95-29.92 147.89-29.92 68.95-81.21 120.57-51.29 51.63-120.63 81.75Q558.9-100 480.33-100Zm.17-45.39q139.19 0 236.65-97.76 97.46-97.77 97.46-237.35 0-139.19-97.27-236.65-97.27-97.46-237.34-97.46-139.08 0-236.85 97.27-97.76 97.27-97.76 237.34 0 139.08 97.76 236.85 97.77 97.76 237.35 97.76ZM480-480Z",
    info: "M459.54-290h45.38v-230h-45.38v230Zm39.73-301.56q7.96-7.57 7.96-19.05 0-11.95-7.85-19.9-7.85-7.95-19.36-7.95-11.9 0-19.58 7.95-7.67 7.95-7.67 19.9 0 11.48 7.94 19.05 7.95 7.56 19.27 7.56 11.33 0 19.29-7.56ZM480.33-100q-78.95 0-147.89-29.92-68.95-29.92-120.76-81.71-51.81-51.79-81.75-120.78Q100-401.39 100-480.43q0-78.66 29.92-147.87 29.92-69.21 81.71-120.52 51.79-51.31 120.78-81.25Q401.39-860 480.43-860q78.66 0 147.87 29.92 69.21 29.92 120.52 81.21 51.31 51.29 81.25 120.63Q860-558.9 860-480.33q0 78.95-29.92 147.89-29.92 68.95-81.21 120.57-51.29 51.63-120.63 81.75Q558.9-100 480.33-100Zm.17-45.39q139.19 0 236.65-97.76 97.46-97.77 97.46-237.35 0-139.19-97.27-236.65-97.27-97.46-237.34-97.46-139.08 0-236.85 97.27-97.76 97.27-97.76 237.34 0 139.08 97.76 236.85 97.77 97.76 237.35 97.76ZM480-480Z",
    schedule: "m630.08-295.46 33.84-33.85-159-160.01v-200.22h-45.38v218.85l170.54 175.23ZM480.07-100q-78.22 0-147.4-29.92t-120.99-81.71q-51.81-51.79-81.75-120.94Q100-401.71 100-479.93q0-78.22 29.92-147.4t81.71-120.99q51.79-51.81 120.94-81.75Q401.71-860 479.93-860q78.22 0 147.4 29.92t120.99 81.71q51.81 51.79 81.75 120.94Q860-558.29 860-480.07q0 78.22-29.92 147.4t-81.71 120.99q-51.79 51.81-120.94 81.75Q558.29-100 480.07-100ZM480-480Zm0 334.61q138.08 0 236.35-98.26 98.26-98.27 98.26-236.35 0-138.08-98.26-236.35-98.27-98.26-236.35-98.26-138.08 0-236.35 98.26-98.26 98.27-98.26 236.35 0 138.08 98.26 236.35 98.27 98.26 236.35 98.26Z",
    description: "M329.39-257.31h301.22v-45.38H329.39v45.38Zm0-167.31h301.22V-470H329.39v45.38ZM180-100v-760h405.23L780-665.23V-100H180Zm382.54-544.77v-169.84H225.39v669.22h509.22v-499.38H562.54ZM225.39-814.61v169.84-169.84 669.22-669.22Z",
  };
  const sym = (n) => `<svg class="sym" viewBox="0 -960 960 960" aria-hidden="true"><path d="${SYM[n]}"/></svg>`;
  const LOGO = (h = 26) => `<span class="logo"><img src="assets/logo-quer-negativ.svg" alt="PPotthoff" style="height:${h}px;width:auto;display:block"></span>`;

  // Meldungen: an der Stelle der Handlung, Fokus springt hin, bleibt stehen
  function meldung(el, text, art = "fehler", html = false) {
    if (!el) return;
    const s = art === "fehler" ? "error" : art === "ok" ? "check" : "info";
    el.innerHTML = `<div class="meldung ${art === "fehler" ? "fehler" : art === "ok" ? "ok" : ""}" role="${art === "fehler" ? "alert" : "status"}" tabindex="-1">${sym(s)}<div>${html ? text : `<p>${esc(text)}</p>`}</div></div>`;
    el.firstElementChild.focus();
  }
  // Fehler am Feld: Satz mit Symbol direkt unter dem Feld, verknüpft über aria-describedby, weg beim nächsten Tippen
  function feldFehler(input, text, html = false) {
    const id = "f-" + (input.name || "feld");
    let p = document.getElementById(id);
    if (!p) { p = document.createElement("p"); p.id = id; p.className = "feldfehler"; p.setAttribute("role", "alert"); input.closest("label").after(p); }
    p.innerHTML = `${sym("error")}<span>${html ? text : esc(text)}</span>`;
    input.setAttribute("aria-invalid", "true"); input.setAttribute("aria-describedby", id); input.focus();
    input.addEventListener("input", () => { p.remove(); input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby"); }, { once: true });
  }
  const fehlerSatz = () => `Das hat nicht geklappt. Bitte noch einmal versuchen oder an ${KONTAKT} schreiben.`;
  function fehlerText(e, ctx = "") {
    const m = (e && (e.message || e.error_description || e.msg)) || String(e);
    if (/Invalid login credentials/i.test(m)) return "Mail-Adresse oder Passwort stimmen nicht. Bitte noch einmal versuchen.";
    if (/Invalid TOTP/i.test(m)) return "Der Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben.";
    if (ctx === "code" && /expired|invalid|otp|token/i.test(m)) return "Der Code stimmt nicht oder ist abgelaufen. Bitte unten einen neuen schicken lassen.";
    if (/JWT expired|session/i.test(m)) return t("Ihre Anmeldung ist abgelaufen. Bitte kurz anmelden, Ihr Text bleibt erhalten.", "Deine Anmeldung ist abgelaufen. Bitte kurz anmelden, dein Text bleibt erhalten.");
    if (/rate limit|security purposes|seconds/i.test(m)) return "Zu viele Versuche. Bitte kurz warten und dann noch einmal.";
    return fehlerSatz();
  }
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
  // Frist als Zahl: „bis“ klein, Tag und Monat groß, Jahr nur außerhalb des laufenden Jahres
  function fristParse(f) {
    if (!f) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(f)) return new Date(String(f).slice(0, 10) + "T12:00:00");
    const m = String(f).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})?/);
    if (!m) return null;
    return new Date(m[3] ? +m[3] : new Date().getFullYear(), +m[2] - 1, +m[1], 12);
  }
  function fristHtml(f, mitBis = true) {
    const d = fristParse(f);
    if (!d) return f ? `<span class="frist" style="font-size:var(--t-neben);font-family:var(--sans)">${esc(f)}</span>` : "";
    const jahr = d.getFullYear() !== new Date().getFullYear() ? `<span class="jahr">${d.getFullYear()}</span>` : "";
    return `<span class="frist">${mitBis ? '<span class="bis">bis</span>' : ""}${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${jahr}</span>`;
  }
  // Entwürfe in Formularen bleiben im Browser, bis sie gesendet sind
  function entwurfVerdrahten(root = app) {
    root.querySelectorAll("[data-entwurf]").forEach((f) => {
      const k = "entwurf:" + f.dataset.entwurf;
      const alt = lokal.get(k);
      if (alt && !f.value) f.value = alt;
      f.addEventListener("input", () => (f.value ? lokal.set(k, f.value) : lokal.weg(k)));
    });
  }
  const entwurfWeg = (key) => lokal.weg("entwurf:" + key);

  // „Neu für dich“: seit dem letzten Besuch. Besuch = Anmeldung oder Öffnen nach mindestens einer Stunde Pause.
  const BESUCH = () => "portal-besuch:" + S.user?.id;
  const GESEHEN = () => "portal-gesehen:" + S.user?.id;
  function besuchMerken() {
    let b = {};
    try { b = JSON.parse(lokal.get(BESUCH()) || "{}"); } catch { b = {}; }
    const jetzt = Date.now();
    if (!b.zuletzt) b = { vorher: null, zuletzt: jetzt, erster: true };
    else if (jetzt - b.zuletzt > 3600e3) b = { vorher: b.zuletzt, zuletzt: jetzt, erster: false };
    else b.zuletzt = jetzt;
    lokal.set(BESUCH(), JSON.stringify(b));
    S.besuch = b;
  }
  const gesehen = () => { try { return new Set(JSON.parse(lokal.get(GESEHEN()) || "[]")); } catch { return new Set(); } };
  function alsGesehen(id) { const g = gesehen(); if (g.has(id)) return; g.add(id); lokal.set(GESEHEN(), JSON.stringify([...g].slice(-300))); }
  const istNeu = (zeitpunkt) => !!(S.besuch?.vorher && zeitpunkt && new Date(zeitpunkt).getTime() > S.besuch.vorher);

  // ---------- Rahmen ----------
  const KUNDE_REITER = () => [["", "Übersicht"], ["berichte", "Berichte"], ["entscheidungen", "Entscheidungen"], ["aufgaben", "Aufgaben"], ["anliegen", "Anliegen"], ["dateien", "Dateien"],
    ...(S.mehr.roadmap ? [["roadmap", "Roadmap"]] : []), ...(S.mehr.werkzeuge ? [["werkzeuge", "Werkzeuge"]] : [])];

  function rahmen({ titel, aktiv, buehne, inhalt, zaehler = {}, reiter = null }) {
    const team = S.mitglied?.rolle === "team" && !S.alsKunde;
    const name = team ? "Interner Bereich" : S.kunde?.name || "";
    const tabs = (reiter || KUNDE_REITER()).map(([pfad, text]) => {
      const z = zaehler[pfad] ? `<span class="zahl" aria-label="${zaehler[pfad]} ${team ? "offen" : t("warten auf Sie", "warten auf dich")}">${zaehler[pfad]}</span>` : "";
      return `<li><a href="#/${pfad}" ${aktiv === pfad ? 'aria-current="page"' : ""}>${esc(text)}${z}</a></li>`;
    }).join("");
    app.innerHTML = `<a class="sprung" href="#inhalt">Zum Inhalt</a>${S.alsKunde ? `<div class="ansicht-hinweis" role="note"><div class="wrap"><span>Kundensicht ${esc(S.kunde?.name || "")} · nur ansehen, nichts wird gesendet</span><button type="button" class="text" id="ansicht-ende">Zurück zum internen Bereich</button></div></div>` : ""}
      <header class="kopf"><div class="wrap">${LOGO()}<div class="rechts"><span class="wer"><b>${esc(name)}</b> · Kundenportal</span><a href="#" id="abmelden">Abmelden</a></div></div></header>
      <nav class="reiter" aria-label="Bereiche"><div class="wrap"><ul>${tabs}</ul></div></nav>
      <main id="inhalt" tabindex="-1">${buehne ? `<div class="buehne${buehne.uebersicht ? "" : " seite"}"><div class="wrap">${buehne.html}</div></div>` : ""}
        <div class="unten"><div class="wrap">${inhalt}</div></div></main>
      <footer class="fuss"><div class="wrap"><span>PPotthoff GmbH &amp; Co. KG · Gütersloh</span><a href="#/wer-sieht-was">Wer sieht was?</a><span>Fragen? <a href="mailto:${KONTAKT}">${KONTAKT}</a></span></div></footer>`;
    document.getElementById("abmelden").onclick = (e) => { e.preventDefault(); abmelden(); };
    sprungVerdrahten();
    const ende = document.getElementById("ansicht-ende"); if (ende) ende.onclick = kundensichtBeenden;
    document.title = `${titel} · ${team ? "Interner Bereich" : S.kunde?.name || ""} · Kundenportal`;
    if (!S.stehenBleiben) window.scrollTo(0, 0);
    S.stehenBleiben = false;
    const h = app.querySelector("h1");
    if (h) { h.setAttribute("tabindex", "-1"); if (S.fokusNachWechsel) h.focus({ preventScroll: true }); }
    S.fokusNachWechsel = true;
    entwurfVerdrahten();
  }
  // „Zum Inhalt“ darf die Adresse nicht ändern (Hash-Router): Fokus direkt auf den Inhalt
  function sprungVerdrahten() {
    const a = app.querySelector("a.sprung"); if (!a) return;
    a.onclick = (e) => { e.preventDefault(); const z = document.getElementById("inhalt"); const h = z.querySelector("h1"); (h || z).focus(); (h || z).scrollIntoView({ block: "start" }); };
  }
  // Platzhalter bei jedem Seitenwechsel: Kopf und Reiter stehen sofort
  function laedt(aktiv, reiter) {
    const f = S.fokusNachWechsel;
    rahmen({ titel: "Lädt", aktiv, reiter, zaehler: S.zaehler || {}, buehne: { html: `<div class="laedt"><p class="wort" role="status">${sym("schedule")}Einen Moment</p><div class="linie"></div><div class="balken" style="width:60%;height:28px"></div></div>` },
      inhalt: `<div class="laedt"><div class="balken"></div><div class="balken"></div><div class="balken" style="width:40%"></div></div>` });
    S.fokusNachWechsel = f;
  }
  function buehneSeite({ zurueck, kennung = "", titel, unter = "" }) {
    return { html: `${zurueck ? `<p class="zurueck"><a class="textlink" href="#/${zurueck[0]}">${esc(zurueck[1])}</a></p>` : ""}${kennung ? `<p class="kennung">${kennung}</p>` : ""}<h1>${esc(titel)}</h1>${unter ? `<p class="unterzeile">${unter}</p>` : ""}` };
  }
  const leer = (text) => `<div class="leer">${sym("info")}<p>${esc(text)}</p></div>`;
  function zeile({ href, art = "", titel, unter = "", frist = "", tun = "Öffnen", mitArt = true }) {
    return `<li><a href="${href}">${mitArt ? `<span class="art">${art}</span>` : ""}<span class="titel">${esc(titel)}</span>${unter ? `<span class="unter">${unter}</span>` : ""}${frist || '<span class="frist" aria-hidden="true"></span>'}<span class="tun">${esc(tun)}</span></a></li>`;
  }

  async function abmelden() {
    await sb.auth.signOut();
    S.user = S.mitglied = S.kunde = null;
    location.hash = "";
    anmeldung();
  }

  // ---------- Anmeldung ----------
  // Kunden: Mail-Adresse, dann sechsstelliger Code per Mail. Ein Konto entsteht nur für Adressen auf der Zugangsliste.
  // Team: wahlweise Passwort, danach immer der zweite Faktor. Das Ziel in der Adresse bleibt über die Anmeldung erhalten.
  const SEITE = () => `<section class="seite">${LOGO(32)}<div class="lang"><p class="klein">Kundenportal</p>
      <h1 style="margin-top:8px">Was gerade los ist. An einem Ort.</h1><p>Montagsbrief, Monatsauswertung, Entscheidungen und Dateien von PPotthoff.</p></div>
      <p class="klein lang">Server in Frankfurt am Main · Verbindung verschlüsselt</p></section>`;
  const istMail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
  const hatZiel = () => !!route()[0] && !route()[0].startsWith("intern");
  function anmeldeRahmen(form) {
    document.title = "Anmelden · Kundenportal PPotthoff";
    app.innerHTML = `<a class="sprung" href="#inhalt">Zum Inhalt</a><main id="inhalt" class="anmeldung" tabindex="-1">${SEITE()}<section class="form">${form}</section></main>`;
    sprungVerdrahten();
  }

  function anmeldung(hinweis, vorbelegt = lokal.get("portal-mail") || "", art = "ok") {
    anmeldeRahmen(`${hatZiel() && !hinweis ? `<div class="meldung" role="status">${sym("info")}<p>Bitte kurz anmelden. Danach geht es direkt weiter.</p></div>` : ""}
      <h2>Anmelden</h2><p class="leise">Mail-Adresse eingeben, Code aus der Mail eintippen, fertig. Ein Passwort gibt es nicht.</p>
      <form id="f" novalidate><label class="feld"><span>Mail-Adresse</span><input type="email" name="mail" value="${esc(vorbelegt)}" autocomplete="email" autocapitalize="none" spellcheck="false" required></label>
      <button class="btn" type="submit">Code schicken</button><div id="m"></div></form>
      <p class="fein" style="margin-top:20px">Kein Code angekommen? Bitte im Spam-Ordner nachsehen oder an <a href="mailto:${KONTAKT}">${KONTAKT}</a> schreiben.</p>
      <p><button class="text fein" type="button" id="team">Anmeldung fürs Team</button></p>`);
    const f = document.getElementById("f");
    if (hinweis) meldung(document.getElementById("m"), hinweis, art);
    else (vorbelegt ? f.querySelector("button") : f.mail).focus();
    document.getElementById("team").onclick = () => teamAnmeldung(f.mail.value.trim());
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const m = document.getElementById("m");
      const mail = f.mail.value.trim().toLowerCase();
      f.mail.removeAttribute("aria-invalid");
      if (!istMail(mail)) return feldFehler(f.mail, "Bitte eine gültige Mail-Adresse eingeben.");
      const knopf = f.querySelector("button"); knopf.disabled = true; knopf.textContent = "Wird gesendet";
      const { error } = await sb.auth.signInWithOtp({ email: mail, options: { shouldCreateUser: true } });
      knopf.disabled = false; knopf.textContent = "Code schicken";
      if (error) {
        const msg = error.message || "";
        if (/keinen Zugang|not allowed|Signups not allowed|hook/i.test(msg)) return feldFehler(f.mail, `Für <b>${esc(mail)}</b> gibt es keinen Zugang. Stimmt die Adresse? Sonst bitte an ${KONTAKT} schreiben.`, true);
        if (/gesperrt/i.test(msg)) return meldung(m, `Dieser Zugang ist gesperrt. Bitte an ${KONTAKT} schreiben.`);
        return meldung(m, fehlerText(error));
      }
      lokal.set("portal-mail", mail);
      codeEingabe(mail);
    };
  }

  function codeEingabe(mail, hinweis = "") {
    anmeldeRahmen(`${hatZiel() ? `<div class="meldung" role="status">${sym("info")}<p>Danach geht es direkt weiter.</p></div>` : ""}
      <h2>Code eingeben</h2><p class="leise">Der Code ist unterwegs an <b>${esc(mail)}</b>. Er gilt zehn Minuten. Der Code gilt auch auf einem anderen Gerät.</p>
      <form id="f" novalidate><label class="feld"><span>Code aus der Mail</span><input class="code-feld" type="text" name="code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" required></label>
      <button class="btn" type="submit">Anmelden</button><div id="m"></div></form>
      <div class="knopfzeile"><button class="btn zwei" type="button" id="neu">Neuen Code schicken</button><button class="text" type="button" id="andere">Andere Mail-Adresse</button></div>`);
    const f = document.getElementById("f");
    if (hinweis) meldung(document.getElementById("m"), hinweis, "ok"); else f.code.focus();
    f.code.oninput = () => { f.code.value = f.code.value.replace(/\D/g, "").slice(0, 6); if (f.code.value.length === 6) f.requestSubmit(); };
    document.getElementById("andere").onclick = () => anmeldung(null, "");
    document.getElementById("neu").onclick = async () => {
      const { error } = await sb.auth.signInWithOtp({ email: mail, options: { shouldCreateUser: true } });
      if (error) return meldung(document.getElementById("m"), fehlerText(error));
      codeEingabe(mail, "Ein neuer Code ist unterwegs.");
    };
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const m = document.getElementById("m");
      const code = f.code.value.replace(/\D/g, "");
      if (code.length !== 6) return feldFehler(f.code, "Bitte die sechs Ziffern aus der Mail eingeben.");
      const knopf = f.querySelector("button"); knopf.disabled = true; knopf.textContent = "Wird geprüft";
      const { error } = await sb.auth.verifyOtp({ email: mail, token: code, type: "email" });
      knopf.disabled = false; knopf.textContent = "Anmelden";
      if (error) { f.code.value = ""; return feldFehler(f.code, fehlerText(error, "code")); }
      await start(true);
    };
  }

  function teamAnmeldung(vorbelegt = "") {
    anmeldeRahmen(`<h2>Team</h2><form id="f" novalidate>
        <label class="feld"><span>Mail-Adresse</span><input type="email" name="mail" value="${esc(vorbelegt)}" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
        <label class="feld"><span>Passwort</span><input type="password" name="passwort" autocomplete="current-password" required></label>
        <button class="btn" type="submit">Anmelden</button><div id="m"></div></form>
      <p><button class="text fein" type="button" id="vergessen">Passwort vergessen?</button></p>
      <p><button class="text" type="button" id="zur">Zurück zur Anmeldung mit Code</button></p>`);
    const f = document.getElementById("f");
    (vorbelegt ? f.passwort : f.mail).focus();
    document.getElementById("zur").onclick = () => anmeldung();
    document.getElementById("vergessen").onclick = async () => {
      const m = document.getElementById("m");
      const mail = f.mail.value.trim().toLowerCase();
      if (!istMail(mail)) return feldFehler(f.mail, "Bitte zuerst die Mail-Adresse eingeben.");
      const knopf = document.getElementById("vergessen"); knopf.disabled = true;
      const { error } = await sb.auth.resetPasswordForEmail(mail, { redirectTo: location.origin + location.pathname });
      knopf.disabled = false;
      if (error) return meldung(m, fehlerText(error));
      meldung(m, `Wenn <b>${esc(mail)}</b> zum Team gehört, ist eine Mail mit einem Link unterwegs. Den Link in diesem Browser öffnen, dann ein neues Passwort festlegen.`, "ok");
    };
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const m = document.getElementById("m");
      const mail = f.mail.value.trim().toLowerCase();
      if (!istMail(mail) || !f.passwort.value) return meldung(m, "Bitte Mail-Adresse und Passwort eingeben.");
      const knopf = f.querySelector("button"); knopf.disabled = true; knopf.textContent = "Wird geprüft";
      const { error } = await sb.auth.signInWithPassword({ email: mail, password: f.passwort.value });
      knopf.disabled = false; knopf.textContent = "Anmelden";
      if (error) return meldung(m, fehlerText(error));
      await start(true);
    };
  }

  // Nach dem Link aus der Mail „Passwort vergessen“: erst Code aus der App, dann neues Passwort
  async function passwortNeu() {
    if (S.passwortLaeuft) return;
    S.passwortLaeuft = true;
    const ok = await zweiFaktor();
    if (!ok) { S.recovery = S.passwortLaeuft = false; return; }
    anmeldeRahmen(`<h2>Neues Passwort</h2><p class="leise">Mindestens zwölf Zeichen. Am besten im Passwort-Manager speichern.</p>
      <form id="f" novalidate>
        <label class="feld"><span>Neues Passwort</span><input type="password" name="p1" autocomplete="new-password" minlength="12" required></label>
        <label class="feld"><span>Noch einmal</span><input type="password" name="p2" autocomplete="new-password" minlength="12" required></label>
        <button class="btn" type="submit">Passwort speichern</button><div id="m"></div></form>
      <p><button class="text" type="button" id="zur">Abbrechen</button></p>`);
    const f = document.getElementById("f");
    f.p1.focus();
    document.getElementById("zur").onclick = () => { S.recovery = S.passwortLaeuft = false; abmelden(); };
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const m = document.getElementById("m");
      if (f.p1.value.length < 12) return feldFehler(f.p1, "Bitte mindestens zwölf Zeichen.");
      if (f.p1.value !== f.p2.value) return feldFehler(f.p2, "Die beiden Eingaben sind nicht gleich.");
      const knopf = f.querySelector("button"); knopf.disabled = true; knopf.textContent = "Wird gespeichert";
      const { error } = await sb.auth.updateUser({ password: f.p1.value });
      knopf.disabled = false; knopf.textContent = "Passwort speichern";
      if (error) {
        if (/different from the old|same password/i.test(error.message || "")) return feldFehler(f.p1, "Bitte ein anderes Passwort als bisher wählen.");
        if (/weak|at least|characters/i.test(error.message || "")) return feldFehler(f.p1, "Das Passwort ist zu schwach. Bitte länger oder mit Zahlen und Zeichen.");
        return meldung(m, fehlerText(error));
      }
      S.recovery = S.passwortLaeuft = false;
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
      for (const f of fakt?.all || []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator " + new Date().toISOString().slice(0, 10) });
      if (error) { anmeldung(fehlerText(error), undefined, "fehler"); return false; }
      faktorId = data.id;
      einrichtung = `<p>Der interne Bereich braucht eine Zwei-Faktor-Anmeldung. Code mit einer Authenticator-App scannen (z. B. Bitwarden, 1Password, Google Authenticator), dann den sechsstelligen Code eingeben.</p>
        <div class="qr"><img src="${esc(data.totp.qr_code)}" alt="QR-Code für die Authenticator-App"></div>
        <p class="fein leise">Ohne Kamera: Schlüssel <code>${esc(data.totp.secret)}</code></p>`;
    }
    return new Promise((fertig) => {
      anmeldeRahmen(`<h2>${totp ? "Code aus der App" : "Zwei-Faktor einrichten"}</h2>${einrichtung}
        <form id="f2" novalidate><label class="feld"><span>Code aus der App</span><input class="code-feld" type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
        <button class="btn" type="submit">Bestätigen</button><div id="m2"></div></form><p><button class="text" type="button" id="zur">Abbrechen</button></p>`);
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
    const linkFehler = /error_code=|error_description=/.test(location.hash);
    const { data: { session } } = await sb.auth.getSession();
    if (S.recovery && session) return passwortNeu();
    if (!session) {
      if (linkFehler) { history.replaceState(null, "", location.pathname); return teamAnmeldung(); }
      return anmeldung();
    }
    S.user = session.user;
    const { data: m } = await sb.from("mitglieder").select("rolle,kunde_id,anzeigename,anrede,gesperrt_am,team_bestaetigt_am").eq("user_id", S.user.id).maybeSingle();
    if (!m) { await sb.auth.signOut(); return anmeldung(`Dieser Zugang ist keinem Kunden zugeordnet. Bitte an ${KONTAKT} schreiben.`, undefined, "fehler"); }
    if (m.gesperrt_am) { await sb.auth.signOut(); return anmeldung(`Dieser Zugang ist gesperrt. Bitte an ${KONTAKT} schreiben.`, undefined, "fehler"); }
    if (m.rolle === "team" && !m.team_bestaetigt_am) { await sb.auth.signOut(); return anmeldung("Der Team-Zugang ist noch nicht freigeschaltet. Bitte ein anderes Team-Mitglied fragen.", undefined, "fehler"); }
    S.mitglied = m;
    // Migration vom 15.11. vorhanden? Dann erscheinen die Teile, die sie braucht.
    const probe = await sb.from("dateien").select("sichtbar").limit(1);
    S.g3 = !probe.error;
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
      besuchMerken();
      const [r, w] = await Promise.all([
        sb.from("roadmap").select("id", { count: "exact", head: true }).eq("sichtbar", true).neq("status", "erledigt"),
        sb.from("werkzeuge").select("id", { count: "exact", head: true }),
      ]);
      S.mehr = { roadmap: r.count || 0, werkzeuge: w.count || 0 };
      if (route()[0].startsWith("intern")) location.hash = "#/";
    }
    if (frischAngemeldet) sb.rpc("angemeldet").then(() => {});
    S.fokusNachWechsel = false;
    rendern();
  }

  // ---------- Kundensicht ----------
  // ---------- Kundensicht für das Team (nur ansehen) ----------
  // Das Team sieht in der Datenbank alles. In der Kundensicht filtert kq() deshalb auf den gewählten Kunden
  // und auf das, was der Kunde selbst sehen darf (wie die Zeilenregeln), und sperrt jedes Schreiben.
  const SICHT = { berichte: (q) => q.eq("status", "freigegeben"), entscheidungen: (q) => q.neq("status", "entwurf"),
    dateien: (q) => q.or("sichtbar.eq.true,richtung.eq.vom_kunden"), roadmap: (q) => q.eq("sichtbar", true), werkzeuge: (q) => q.eq("aktiv", true) };
  const NUR_ANSEHEN = { message: "In der Kundensicht kann nichts gesendet werden." };
  const gesperrt = () => { const f = { select: () => f, single: () => f, maybeSingle: () => f, eq: () => f, then: (ok) => ok({ data: null, error: NUR_ANSEHEN }) }; return f; };
  function kq(t) {
    if (!S.alsKunde) return sb.from(t);
    const id = S.kunde.id;
    return { select: (c, o) => { const q = sb.from(t).select(c, o).eq("kunde_id", id); return SICHT[t] ? SICHT[t](q) : q; },
      insert: gesperrt, update: gesperrt, delete: gesperrt, upsert: gesperrt };
  }
  const krpc = (name, args) => S.alsKunde ? gesperrt() : sb.rpc(name, args);
  async function kundensichtStarten() {
    if (!S.internKunde) return;
    S.alsKunde = true; S.kunde = S.internKunde;
    const [r, w] = await Promise.all([kq("roadmap").select("id", { count: "exact", head: true }).neq("status", "erledigt"), kq("werkzeuge").select("id", { count: "exact", head: true })]);
    S.mehr = { roadmap: r.count || 0, werkzeuge: w.count || 0 };
    S.fokusNachWechsel = false; geh("");
  }
  function kundensichtBeenden() { S.alsKunde = false; S.kunde = null; S.fokusNachWechsel = false; geh("intern"); }

  async function zaehlerKunde() {
    const [e, a] = await Promise.all([
      kq("entscheidungen").select("id", { count: "exact", head: true }).eq("status", "offen"),
      kq("aufgaben").select("id", { count: "exact", head: true }).eq("liegt_bei", "kunde").eq("erledigt", false),
    ]);
    S.zaehler = { entscheidungen: e.count || 0, aufgaben: a.count || 0 };
    return S.zaehler;
  }
  const ART = { wochenstand: "Montagsbrief", monatsauswertung: "Monatsauswertung", terminnotiz: "Terminnotiz", listingcheck: "Listing-Check", konzept: "Konzept" };
  const werteName = (r) => (r.art === "listingcheck" ? "Alle Artikel" : "Alle Werte");
  const ANLIEGEN_STATUS = { offen: "Angekommen", in_arbeit: "In Arbeit", erledigt: "Erledigt" };
  const ANTWORT = { ja: "Ja", nein: "Nein", intern: "Kläre ich intern" };
  function zeitraumText(r) {
    if (r.art === "wochenstand" && r.zeitraum_start) {
      const a = new Date(r.zeitraum_start + "T12:00:00"); const b = new Date(a); b.setDate(a.getDate() + 6);
      return `${r.zeitraum} · ${tagMonat(a)} bis ${datum(b)}`;
    }
    return r.zeitraum || "";
  }
  const berichtTitel = (r) => `${ART[r.art] || "Bericht"} ${r.zeitraum}`;
  function montagDieserWoche() { const d = new Date(); const tag = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - tag); return d; }
  function kw(d) { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - n); const j = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - j) / 864e5 + 1) / 7); }
  const sortFrist = (p, q) => { const a = fristParse(p.frist), b = fristParse(q.frist); return a && b ? a - b : a ? -1 : b ? 1 : 0; };

  async function uebersicht() {
    const [z, b, e, a, an, k, d] = await Promise.all([
      zaehlerKunde(),
      kq("berichte").select("id,art,titel,zeitraum,zeitraum_start,zusammenfassung,freigegeben_am").order("zeitraum_start", { ascending: false }).limit(20),
      kq("entscheidungen").select("id,frage,frist,antwort,erstellt").eq("status", "offen").order("erstellt"),
      kq("aufgaben").select("id,titel,frist,aktualisiert").eq("liegt_bei", "kunde").eq("erledigt", false),
      kq("anliegen").select("id,titel,status,aktualisiert").order("aktualisiert", { ascending: false }).limit(30),
      kq("kommentare").select("id,bezug_art,bezug_id,autor_name,autor_rolle,erstellt").eq("autor_rolle", "team").order("erstellt", { ascending: false }).limit(30),
      kq("dateien").select("id,name,notiz,richtung,erstellt").eq("richtung", "von_uns").order("erstellt", { ascending: false }).limit(10),
    ]);
    const alle = b.data || [];
    const brief = alle.find((r) => r.art === "wochenstand");
    const lage = (brief?.zusammenfassung || "").split(/\n+/).map((x) => x.trim()).filter(Boolean).slice(0, 3);
    const erster = S.besuch?.erster;
    // Wartet: offene Entscheidungen (auch „kläre ich intern“) und Aufgaben beim Kunden; mit Frist zuerst, die nächste oben, danach das Älteste
    const wartet = [
      ...(e.data || []).map((x) => ({ frist: x.frist, seit: x.erstellt, html: zeile({ href: `#/entscheidungen/${x.id}`, art: "Entscheidung", titel: x.frage, unter: x.antwort === "intern" ? t("Sie klären das intern", "Du klärst das intern") : "", frist: fristHtml(x.frist), tun: "Entscheiden" }) })),
      ...(a.data || []).map((x) => ({ frist: x.frist, seit: x.aktualisiert, html: zeile({ href: `#/aufgaben/${x.id}`, art: "Aufgabe", titel: x.titel, frist: fristHtml(x.frist), tun: "Öffnen" }) })),
    ].sort((p, q) => sortFrist(p, q) || new Date(p.seit) - new Date(q.seit));
    // Neu seit dem letzten Besuch, ohne Geöffnetes. Beim ersten Besuch: der letzte Montagsbrief und die letzte Terminnotiz.
    const g = gesehen();
    const neu = [];
    const notiz = alle.find((r) => r.art === "terminnotiz");
    for (const r of alle) {
      const zeigen = erster ? (r === brief || r === notiz) : istNeu(r.freigegeben_am);
      if (zeigen && !g.has(r.id)) neu.push({ z: r.freigegeben_am, html: zeile({ href: `#/berichte/${r.id}`, art: ART[r.art], titel: r.zeitraum, tun: "Lesen" }) });
    }
    const anl = Object.fromEntries((an.data || []).map((x) => [x.id, x]));
    const schon = new Set();
    for (const c of k.data || []) {
      if (c.bezug_art !== "anliegen" || !istNeu(c.erstellt) || schon.has(c.bezug_id) || g.has("k:" + c.id) || !anl[c.bezug_id]) continue;
      schon.add(c.bezug_id);
      neu.push({ z: c.erstellt, html: zeile({ href: `#/anliegen/${c.bezug_id}`, art: "Anliegen", titel: anl[c.bezug_id].titel, unter: `${esc((c.autor_name || "").split(" ")[0])} hat geantwortet`, tun: "Öffnen" }) });
    }
    for (const x of d.data || []) if (istNeu(x.erstellt) && !g.has("d:" + x.id)) neu.push({ z: x.erstellt, html: zeile({ href: "#/dateien", art: "Datei", titel: x.notiz || x.name, tun: "Laden" }) });
    neu.sort((p, q) => new Date(q.z) - new Date(p.z));
    // Fehlt der Montagsbrief der letzten Woche (ab Montag 9 Uhr)?
    const montag = montagDieserWoche(); const letzte = new Date(montag); letzte.setDate(montag.getDate() - 7);
    const fehlt = brief && new Date(brief.zeitraum_start + "T12:00:00") < letzte && (Date.now() - montag.getTime() > 9 * 3600e3);
    const hallo = du() ? `Hallo${vorname() ? " " + vorname() : ""}` : `Guten Tag${S.mitglied?.anzeigename ? " " + S.mitglied.anzeigename : ""}`;
    let buehne;
    if (erster || !brief) {
      buehne = `<p class="standzeile">Kundenportal · ${esc(S.kunde.name)}</p><h1>${esc(hallo)}, hier ist ${t("Ihr", "dein")} Kundenportal.</h1>
        <div class="lage"><p>Ab jetzt liegt hier jeden Montag um 9 Uhr der Montagsbrief, einmal im Monat die Monatsauswertung und nach jedem Termin die Terminnotiz.</p>
        <p>Wenn wir eine Entscheidung von ${t("Ihnen", "dir")} brauchen, steht sie oben.</p><p>Fragen und Dateien ${t("können Sie", "kannst du")} hier einstellen. Mail und Termin gehen natürlich weiter.</p></div>
        <p class="nach"><a class="textlink" href="#/wer-sieht-was">Wer sieht was?</a></p>`;
    } else {
      buehne = `<p class="standzeile">Stand ${esc(zeitraumText(brief))}</p><h1>${esc(hallo)}, das ist gerade los.</h1>
        ${fehlt ? `<div class="notiz-gruen" role="status">${sym("info")}<p>Der Montagsbrief für KW ${kw(letzte)} kommt noch. Bis dahin steht hier der Stand aus ${esc(brief.zeitraum)}.</p></div>` : ""}
        ${lage.length ? `<div class="lage">${lage.map((s) => `<p>${esc(s)}</p>`).join("")}</div>` : ""}
        <p class="nach"><a class="textlink" href="#/berichte/${brief.id}">Zum Montagsbrief ${esc(brief.zeitraum)}</a></p>`;
    }
    rahmen({ titel: "Übersicht", aktiv: "", zaehler: z, buehne: { uebersicht: true, html: buehne }, inhalt: `
      <section class="block" aria-labelledby="h-w"><h2 id="h-w">${t("Wartet auf Sie", "Wartet auf dich")}</h2>${wartet.length ? `<ul class="register fristen">${wartet.map((x) => x.html).join("")}</ul>` : leer(t("Diese Woche müssen Sie nichts tun.", "Diese Woche musst du nichts tun."))}</section>
      <section class="block" aria-labelledby="h-n"><h2 id="h-n">${t("Neu für Sie", "Neu für dich")}</h2>${neu.length ? `<ul class="register">${neu.map((x) => x.html).join("")}</ul>` : leer(erster ? "Noch ist nichts da. Neues erscheint hier." : t("Seit Ihrem letzten Besuch ist nichts dazugekommen.", "Seit deinem letzten Besuch ist nichts dazugekommen."))}
        <p class="nach"><a class="textlink" href="#/anliegen/neu">Neues Anliegen stellen</a></p></section>` });
  }

  // ---------- Kommentare (Kunde und Team) ----------
  // Name, Rolle und Zeit setzt die Datenbank aus dem Zugang; die Oberfläche schickt nur den Text.
  async function verlauf(art, id) {
    const { data } = await kq("kommentare").select("id,text,autor_name,autor_rolle,erstellt").eq("bezug_art", art).eq("bezug_id", id).order("erstellt");
    return data || [];
  }
  function komHtml(k) {
    const team = k.autor_rolle === "team";
    const neu = team && S.mitglied?.rolle !== "team" && istNeu(k.erstellt) && !gesehen().has("k:" + k.id);
    return `<div class="kom${team ? " team" : ""}"><p class="wer"><b>${esc(k.autor_name || "")}</b>${team ? " · PPotthoff" : ""} · ${zeit(k.erstellt)}${neu ? ' <span class="marke neu">neu</span>' : ""}</p><p class="text">${esc(k.text)}</p></div>`;
  }
  async function kommentarBlock({ art, id, kundeId, titel = "Kommentare", feld, knopf = "Senden", zwei = false, leerText = "Noch keine Kommentare." }) {
    const liste = await verlauf(art, id);
    const html = liste.map(komHtml).join("");
    if (S.mitglied?.rolle !== "team") liste.forEach((k) => { if (k.autor_rolle === "team") alsGesehen("k:" + k.id); });
    return `<section class="antwort" aria-labelledby="h-k"><h2 id="h-k" class="frei">${esc(titel)}</h2><div class="verlauf" id="verlauf">${html || `<p class="leise neben">${esc(leerText)}</p>`}</div>
      <form id="kf" class="lesespalte" data-art="${art}" data-id="${id}" data-kunde="${kundeId}" novalidate>
        <label class="feld"><span>${esc(feld || t("Ihr Kommentar", "Dein Kommentar"))}</span><textarea name="text" rows="3" maxlength="5000" data-entwurf="kom:${art}:${id}"></textarea></label>
        <button class="btn${zwei ? " zwei" : ""}" type="submit">${esc(knopf)}</button><div class="m"></div></form></section>`;
  }
  function kommentarVerdrahten(nachher) {
    const f = document.getElementById("kf");
    if (!f) return;
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const m = f.querySelector(".m");
      const text = f.text.value.trim();
      if (!text) return feldFehler(f.text, "Bitte einen Text eingeben.");
      const k = f.querySelector("button"); const alt = k.textContent; k.disabled = true; k.textContent = "Wird gesendet";
      const { data, error } = await kq("kommentare").insert({ kunde_id: f.dataset.kunde, bezug_art: f.dataset.art, bezug_id: f.dataset.id, text }).select("id,text,autor_name,autor_rolle,erstellt").single();
      k.disabled = false; k.textContent = alt;
      if (error) return meldung(m, fehlerText(error));
      entwurfWeg(`kom:${f.dataset.art}:${f.dataset.id}`);
      f.text.value = "";
      const v = document.getElementById("verlauf");
      if (v.querySelector("p.leise")) v.innerHTML = "";
      v.insertAdjacentHTML("beforeend", komHtml(data));
      meldung(m, "Gesendet. Wir antworten hier.", "ok");
      if (nachher) nachher(data);
    };
  }

  // ---------- Dateien ----------
  const dateiName = (d) => d.notiz || d.name;
  const BEZUG = { aufgabe: ["aufgaben", "Aufgabe"], anliegen: ["anliegen", "Anliegen"], entscheidung: ["entscheidungen", "Entscheidung"] };
  function dateiHtml(d, { bezug = true, intern = false } = {}) {
    const von = d.richtung === "vom_kunden" ? (intern ? "vom Kunden" : t("von Ihnen", "von dir")) : "von uns";
    const gehoert = bezug && !intern && d.bezug_art && BEZUG[d.bezug_art] ? ` · gehört zu: <a href="#/${BEZUG[d.bezug_art][0]}/${d.bezug_id}">${BEZUG[d.bezug_art][1]}</a>` : "";
    const sicht = intern && S.g3 && d.richtung === "von_uns" ? ` · <span class="marke">${d.sichtbar ? "sichtbar" : "nicht sichtbar"}</span>` : "";
    const frei = intern && S.g3 && d.richtung === "von_uns" && !d.sichtbar ? `<button class="text" type="button" data-sichtbar="${d.id}">Sichtbar machen</button>` : "";
    return `<div class="datei${intern ? " intern" : ""}"><span class="wo">${sym("description")}<span class="n">${esc(dateiName(d))}<span class="u">${von} · ${zeit(d.erstellt)}${d.groesse ? " · " + groesse(d.groesse) : ""}${gehoert}${sicht}</span></span></span>
      <span class="knopfzeile" style="margin:0">${frei}<button class="text" type="button" data-datei="${esc(d.pfad)}" data-name="${esc(d.name)}">Laden</button></span></div>`;
  }
  function dateiKnoepfe() {
    app.querySelectorAll("[data-datei]").forEach((k) => (k.onclick = async () => {
      k.disabled = true;
      try { await herunterladen("dateien", k.dataset.datei, k.dataset.name); } catch (e) { alertLeise(fehlerText(e)); }
      k.disabled = false;
    }));
  }
  function ablageHtml(id, { knopf = "Dateien wählen", notiz = false, senden = true, zwei = false } = {}) {
    return `<div class="ablage" id="${id}"><div class="wahlzeile"><label class="btn zwei" style="cursor:pointer">${esc(knopf)}<input class="datei-eingabe" type="file" multiple></label><span class="neben leise" data-wahl></span></div>
      ${notiz ? `<label class="feld"><span>Wofür ist die Datei? (wenn ${t("Sie mögen", "du magst")})</span><input type="text" name="notiz"></label>` : ""}
      <p class="hinweis">bis 100 MB je Datei · am Laptop auch hierher ziehen</p>${senden ? `<div class="knopfzeile"><button class="btn${zwei ? " zwei" : ""}" type="button" data-hoch>Hochladen</button></div>` : ""}<div class="m"></div></div>`;
  }
  // Lädt alle gewählten Dateien hoch. Scheitert eine, gehen die übrigen weiter.
  async function hochladen(box, kundeId, richtung, bezug) {
    const dateien = box._dateien || [];
    if (S.alsKunde) return { ok: [], fehl: dateien.map((d) => ({ name: d.name, grund: NUR_ANSEHEN.message })) };
    const ordner = richtung === "vom_kunden" ? "vom-kunden" : "von-uns";
    const ok = [], fehl = [];
    for (const d of dateien) {
      if (d.size > 100 * 1024 * 1024) { fehl.push(`<b>${esc(d.name)}</b> ist größer als 100 MB`); continue; }
      const sauber = d.name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120);
      const pfad = `${kundeId}/${ordner}/${Date.now()}-${sauber}`;
      const up = await sb.storage.from("dateien").upload(pfad, d, { contentType: d.type || "application/octet-stream" });
      if (up.error) { fehl.push(`<b>${esc(d.name)}</b> hat nicht geklappt`); continue; }
      const zeile_ = { kunde_id: kundeId, pfad, name: d.name, groesse: d.size, mime: d.type, richtung, notiz: box.querySelector("[name=notiz]")?.value.trim() || null };
      if (S.g3 && bezug) { zeile_.bezug_art = bezug[0]; zeile_.bezug_id = bezug[1]; }
      const ins = await kq("dateien").insert(zeile_);
      if (ins.error) fehl.push(`<b>${esc(d.name)}</b> hat nicht geklappt`); else ok.push(d.name);
    }
    return { ok, fehl };
  }
  function ablageVerdrahten(id, onSenden) {
    const box = document.getElementById(id);
    if (!box) return;
    const input = box.querySelector("input[type=file]");
    const zeige = () => (box.querySelector("[data-wahl]").textContent = (box._dateien || []).map((d) => d.name).join(", "));
    input.onchange = () => { box._dateien = [...input.files]; zeige(); };
    ["dragenter", "dragover"].forEach((e) => box.addEventListener(e, (ev) => { ev.preventDefault(); box.classList.add("ziehen"); }));
    ["dragleave", "drop"].forEach((e) => box.addEventListener(e, (ev) => { ev.preventDefault(); box.classList.remove("ziehen"); }));
    box.addEventListener("drop", (ev) => { box._dateien = [...ev.dataTransfer.files]; zeige(); });
    const k = box.querySelector("[data-hoch]");
    if (k) k.onclick = async () => {
      const m = box.querySelector(".m");
      if (!(box._dateien || []).length) return meldung(m, "Bitte zuerst eine Datei wählen.");
      k.disabled = true; k.textContent = "Wird hochgeladen";
      const r = await onSenden(box);
      k.disabled = false; k.textContent = "Hochladen";
      if (r) dateiErgebnis(m, r);
    };
  }
  function dateiErgebnis(m, { ok, fehl }) {
    const satz = ok.length === 1 ? `<b>${esc(ok[0])}</b> liegt jetzt bei uns.` : ok.length ? `${ok.length} Dateien liegen jetzt bei uns.` : "";
    if (fehl.length) meldung(m, `${ok.length ? `<p><b>Angekommen.</b> ${satz}</p>` : ""}<p>${fehl.join(". ")}. Bitte noch einmal hochladen oder an ${KONTAKT} schreiben.</p>`, "fehler", true);
    else meldung(m, `<p><b>Angekommen.</b> ${satz}</p>`, "ok", true);
  }
  async function dateienAm(art, id) {
    if (!S.g3) return [];
    const { data } = await kq("dateien").select("*").eq("bezug_art", art).eq("bezug_id", id).order("erstellt");
    return data || [];
  }
  function alertLeise(text) {
    const el = document.createElement("div");
    (app.querySelector(".unten .wrap") || app).prepend(el);
    meldung(el, text);
  }

  // ---------- Berichte ----------
  async function berichte() {
    const [z, { data }] = await Promise.all([zaehlerKunde(), kq("berichte").select("id,art,titel,zeitraum,zeitraum_start,freigegeben_am").order("zeitraum_start", { ascending: false })]);
    const gruppe = (art, h) => {
      const liste = (data || []).filter((r) => r.art === art);
      return liste.length ? `<section class="block"><h2>${h}</h2><ul class="register ohne-art">${liste.map((r) => zeile({ href: `#/berichte/${r.id}`, titel: zeitraumText(r), tun: "Lesen", mitArt: false })).join("")}</ul></section>` : "";
    };
    const vergleich = (art, text) => (data || []).filter((r) => r.art === art).length > 1 ? `<p class="nach"><a class="textlink" href="#/vergleich/${art === "wochenstand" ? "woche" : "monat"}">${text}</a></p>` : "";
    const gruppeV = (art, h, text) => { const g = gruppe(art, h); return g ? g.replace(/<\/section>$/, vergleich(art, text) + "</section>") : ""; };
    const inhalt = gruppeV("wochenstand", "Montagsbriefe", "Wochen vergleichen") + gruppeV("monatsauswertung", "Monatsauswertungen", "Monate vergleichen") + gruppe("terminnotiz", "Terminnotizen") + gruppe("listingcheck", "Listing-Checks") + gruppe("konzept", "Konzepte");
    rahmen({ titel: "Berichte", aktiv: "berichte", zaehler: z, buehne: buehneSeite({ titel: "Berichte", unter: t("Alles, was wir Ihnen geschickt haben", "Alles, was wir dir geschickt haben") }),
      inhalt: inhalt || leer("Noch kein Bericht.") });
  }

  // ---------- Vergleich zweier Wochen oder Monate (Kennzahlen aus den Berichten) ----------
  const zahlText = (w, einheit) => {
    if (w == null) return "–";
    const dez = einheit === "%" ? 1 : einheit === "€" && Math.abs(w) < 100 ? 2 : w % 1 !== 0 && Math.abs(w) < 100 ? 1 : 0;
    const t = w.toLocaleString("de-DE", { minimumFractionDigits: dez, maximumFractionDigits: dez });
    return einheit ? `${t} ${einheit}` : t;
  };
  async function vergleich(art, idA, idB) {
    const db = art === "monat" ? "monatsauswertung" : "wochenstand";
    const wort = art === "monat" ? ["Monat", "Monate"] : ["Woche", "Wochen"];
    const [z, res] = await Promise.all([zaehlerKunde(), kq("berichte").select("id,zeitraum,zeitraum_start,kennzahlen").eq("art", db).order("zeitraum_start", { ascending: false })]);
    const liste = (res.data || []).filter((r) => Array.isArray(r.kennzahlen) && r.kennzahlen.length);
    const kopf = buehneSeite({ zurueck: ["berichte", "Alle Berichte"], kennung: "Berichte", titel: `${wort[1]} vergleichen`, unter: `Zwei ${wort[1]} nebeneinander, mit der Veränderung.` });
    if (res.error || liste.length < 2) return rahmen({ titel: `${wort[1]} vergleichen`, aktiv: "berichte", zaehler: z, buehne: kopf, inhalt: leer(`Für einen Vergleich braucht es mindestens zwei ${wort[1]} mit Zahlen.`) });
    const a = liste.find((r) => r.id === idA) || liste[0];
    const b = liste.find((r) => r.id === idB && r.id !== a.id) || liste.find((r) => r.id !== a.id && r.zeitraum_start < a.zeitraum_start) || liste.find((r) => r.id !== a.id);
    const opt = (sel) => liste.map((r) => `<option value="${r.id}"${r.id === sel ? " selected" : ""}>${esc(r.zeitraum)}</option>`).join("");
    const mapB = new Map(b.kennzahlen.map((k) => [k.gruppe + "|" + k.name, k]));
    const gruppen = [];
    for (const k of a.kennzahlen) { if (!gruppen.includes(k.gruppe)) gruppen.push(k.gruppe); }
    for (const k of b.kennzahlen) { if (!gruppen.includes(k.gruppe)) gruppen.push(k.gruppe); }
    const REIHE = ["Gesamt", "Verkauf", "Werbung", "Lager", "Katalog", "Konto", "Marke"];
    const rang = (g) => (REIHE.indexOf(g) + 1) || REIHE.length + 1;
    gruppen.sort((x, y) => rang(x) - rang(y));
    const zeilenVon = (g) => {
      const da = (n) => a.kennzahlen.find((k) => k.gruppe === g && k.name === n)?.wert != null && mapB.get(g + "|" + n)?.wert != null;
      const namen = [...new Set([...a.kennzahlen, ...b.kennzahlen].filter((k) => k.gruppe === g).map((k) => k.name))].filter(da);
      return namen.map((n) => {
        const ka = a.kennzahlen.find((k) => k.gruppe === g && k.name === n), kb = mapB.get(g + "|" + n);
        const e = (ka || kb).einheit || "", wa = ka?.wert ?? null, wb = kb?.wert ?? null;
        let ver = "–";
        if (wa != null && wb != null) {
          if (e === "%") { const d = wa - wb; ver = `${d >= 0 ? "+" : "−"}${Math.abs(d).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Punkte`; }
          else if (wb !== 0) { const p = (wa - wb) / Math.abs(wb) * 100; ver = `${p >= 0 ? "+" : "−"}${Math.abs(p).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`; }
        }
        return `<tr><td>${esc(n)}</td><td class="r" data-k="${esc(a.zeitraum)}">${zahlText(wa, e)}</td><td class="r" data-k="${esc(b.zeitraum)}">${zahlText(wb, e)}</td><td class="r" data-k="Veränderung">${ver}</td></tr>`;
      }).join("");
    };
    const tabellen = gruppen.map((g) => [g, zeilenVon(g)]).filter(([, z]) => z).map(([g, z]) => `<section class="block"><h2>${esc(g)}</h2><div style="overflow-x:auto"><table class="t vergleich"><thead><tr><th>Kennzahl</th><th class="r">${esc(a.zeitraum)}</th><th class="r">${esc(b.zeitraum)}</th><th class="r">Veränderung</th></tr></thead><tbody>${z}</tbody></table></div></section>`).join("");
    rahmen({ titel: `${wort[1]} vergleichen`, aktiv: "berichte", zaehler: z, buehne: kopf,
      inhalt: `<form class="leiste" id="vg"><label class="feld"><span>${wort[0]}</span><select name="a">${opt(a.id)}</select></label><label class="feld"><span>Vergleichen mit</span><select name="b">${opt(b.id)}</select></label></form>
        ${tabellen}<div class="knopfzeile kein-druck"><button class="btn zwei" type="button" id="vg-druck">Drucken oder als PDF speichern</button><button class="btn zwei" type="button" id="vg-excel">Für Excel laden</button></div><p class="quelle">„Veränderung“ bei Anteilen in Prozentpunkten, sonst in Prozent. Es stehen nur Kennzahlen da, die es für beide Zeiträume gibt.</p>` });
    document.getElementById("vg-druck").onclick = () => window.print();
    document.getElementById("vg-excel").onclick = () => {
      const zeilen = [["Gruppe", "Kennzahl", a.zeitraum, b.zeitraum, "Einheit"]];
      for (const g of gruppen) for (const k of a.kennzahlen.filter((x) => x.gruppe === g)) {
        const kb = mapB.get(g + "|" + k.name);
        if (k.wert == null || kb?.wert == null) continue;
        zeilen.push([g, k.name, String(k.wert).replace(".", ","), String(kb.wert).replace(".", ","), k.einheit || ""]);
      }
      const csv = "\ufeff" + zeilen.map((z) => z.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const l = document.createElement("a"); l.href = url; l.download = `Vergleich ${a.zeitraum} und ${b.zeitraum}.csv`; document.body.appendChild(l); l.click(); l.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    const f = document.getElementById("vg");
    f.onchange = () => { S.fokusNachWechsel = false; S.stehenBleiben = true; geh(`vergleich/${art}/${f.a.value}/${f.b.value}`); };
  }

  async function berichtAnzeigen(id, intern = false, werte = false) {
    const { data: r, error } = await kq("berichte").select("*").eq("id", id).maybeSingle();
    const z = intern ? await zaehlerIntern() : await zaehlerKunde();
    const reiter = intern ? INTERN_REITER : null;
    const zurueckPfad = intern ? "intern" : "berichte";
    if (error || !r) {
      return rahmen({ titel: "Bericht nicht gefunden", aktiv: zurueckPfad, reiter, zaehler: z, buehne: buehneSeite({ zurueck: [zurueckPfad, "Alle Berichte"], titel: "Bericht nicht gefunden" }), inhalt: `${leer("Diesen Bericht gibt es nicht.")}<p class="nach"><a class="textlink" href="#/${zurueckPfad}">Alle Berichte</a></p>` });
    }
    if (!intern) alsGesehen(r.id);
    const basis = intern ? "intern/vorschau" : "berichte";
    const pfad = werte && r.werte_pfad ? r.werte_pfad : r.html_pfad;
    const titel = werte ? `${werteName(r)} ${r.zeitraum}` : berichtTitel(r);
    const zurueck = werte ? [`${basis}/${r.id}`, `Zurück zum ${ART[r.art] || "Bericht"}`] : [zurueckPfad, "Alle Berichte"];
    const knoepfe = `<div class="knopfzeile kein-druck">${!werte && S.g3 && r.werte_pfad ? `<a class="btn zwei" href="#/${basis}/${r.id}/werte">${werteName(r)}</a>` : ""}${r.pdf_pfad ? `<button class="btn zwei" type="button" data-pdf="${esc(r.pdf_pfad)}" data-name="${esc(berichtTitel(r))}.pdf">PDF laden</button>` : ""}${r.pptx_pfad ? `<button class="btn zwei" type="button" data-pdf="${esc(r.pptx_pfad)}" data-name="${esc(berichtTitel(r))}.pptx">PowerPoint laden</button>` : ""}${r.xlsx_pfad ? `<button class="btn zwei" type="button" data-pdf="${esc(r.xlsx_pfad)}" data-name="${esc(berichtTitel(r))}.xlsx">Excel laden</button>` : ""}${intern && r.status !== "freigegeben" ? `<button class="btn" type="button" data-frei="${r.id}">Für ${esc(S.internKunde?.name || "den Kunden")} freigeben</button>` : ""}</div>`;
    const komm = !intern && !werte ? await kommentarBlock({ art: "bericht", id: r.id, kundeId: r.kunde_id }) : "";
    rahmen({ titel: werte ? werteName(r) : ART[r.art] || "Bericht", aktiv: zurueckPfad, reiter, zaehler: z,
      buehne: buehneSeite({ zurueck, kennung: `${esc(ART[r.art] || "Bericht")} · ${esc(zeitraumText(r))}${intern ? ` · ${esc(r.status)}` : ""}`, titel }),
      inhalt: `<div class="papier rahmen"><div class="laedt" id="ber-laedt" style="padding:24px"><p class="wort" role="status">${sym("schedule")}${esc(ART[r.art] || "Bericht")} wird geladen</p><div class="linie"></div></div><iframe id="ber" title="${esc(titel)}" sandbox="allow-same-origin" tabindex="-1" hidden></iframe></div>${knoepfe}${komm}` });
    pdfKnoepfe();
    if (intern) freigabeKnoepfe(); else kommentarVerdrahten();
    try {
      const html = await (await laden("berichte", pfad)).text();
      const f = document.getElementById("ber");
      if (!f) return;
      f.onload = () => {
        document.getElementById("ber-laedt")?.remove(); f.hidden = false;
        const passe = () => { try { f.style.height = f.contentDocument.documentElement.scrollHeight + "px"; } catch { /* egal */ } };
        passe(); setTimeout(passe, 300); setTimeout(passe, 1200);
        window.addEventListener("resize", passe);
      };
      f.srcdoc = html;
      if (!intern && !werte) krpc("bericht_geoeffnet", { p_id: r.id }).then(() => {});
    } catch (e) {
      const l = document.getElementById("ber-laedt");
      if (l) meldung(l, `${ART[r.art] || "Der Bericht"} hat nicht geladen. Bitte neu laden oder an ${KONTAKT} schreiben.`);
    }
  }
  function pdfKnoepfe() {
    app.querySelectorAll("[data-pdf]").forEach((k) => (k.onclick = async () => {
      k.disabled = true;
      try { await herunterladen("berichte", k.dataset.pdf, k.dataset.name); } catch (e) { alertLeise(fehlerText(e)); }
      k.disabled = false;
    }));
  }

  // ---------- Entscheidungen ----------
  async function entscheidungen() {
    const [z, { data }] = await Promise.all([zaehlerKunde(), kq("entscheidungen").select("*").order("erstellt", { ascending: false })]);
    const offen = (data || []).filter((d) => d.status === "offen").sort(sortFrist);
    const fertig = (data || []).filter((d) => d.status !== "offen");
    const zeileE = (d) => zeile({ href: `#/entscheidungen/${d.id}`, art: `Entscheidung${d.kategorie ? " · " + esc(d.kategorie) : ""}`, titel: d.frage,
      unter: d.status === "offen" ? (d.antwort === "intern" ? t("Sie klären das intern", "Du klärst das intern") : `Unsere Empfehlung: ${esc(d.empfehlung)}`) : `${t("Ihre", "Deine")} Antwort: ${ANTWORT[d.antwort] || ""} · ${datum(d.beantwortet_am)} · ${d.status === "erledigt" ? "Erledigt" : "Angekommen"}`,
      frist: d.status === "offen" ? fristHtml(d.frist) : "", tun: d.status === "offen" ? "Entscheiden" : "Öffnen" });
    rahmen({ titel: "Entscheidungen", aktiv: "entscheidungen", zaehler: z,
      buehne: buehneSeite({ titel: offen.length ? t("Was wir von Ihnen brauchen", "Was wir von dir brauchen") : "Gerade gibt es nichts zu entscheiden.", unter: offen.length ? `Bei jeder Frage steht unsere Empfehlung. ${t("Ihre", "Deine")} Antwort kommt sofort bei uns an.` : "" }),
      inhalt: `${offen.length ? `<section class="block"><ul class="register fristen">${offen.map(zeileE).join("")}</ul></section>` : ""}
        ${fertig.length ? `<section class="block"><h2>Bereits entschieden</h2><ul class="register">${fertig.map(zeileE).join("")}</ul></section>` : offen.length ? "" : leer("Noch keine Entscheidung.")}` });
  }

  async function entscheidungAnzeigen(id, fokus = null) {
    const [z, { data: d }] = await Promise.all([zaehlerKunde(), kq("entscheidungen").select("*").eq("id", id).maybeSingle()]);
    if (!d) return rahmen({ titel: "Entscheidung", aktiv: "entscheidungen", zaehler: z, buehne: buehneSeite({ zurueck: ["entscheidungen", "Alle Entscheidungen"], titel: "Entscheidung nicht gefunden" }), inhalt: leer("Diese Entscheidung gibt es nicht.") });
    const dateien = await dateienAm("entscheidung", d.id);
    const offen = d.status === "offen";
    const kl = d.status === "offen" ? (d.antwort === "intern" ? " intern" : "") : d.antwort === "ja" ? " ja" : d.antwort === "nein" ? " nein" : "";
    let unten;
    if (d.status === "erledigt") unten = `<div class="meldung ok" role="status">${sym("check")}<p><b>Erledigt.</b> ${t("Ihre", "Deine")} Antwort vom ${datum(d.beantwortet_am)}: ${ANTWORT[d.antwort] || ""}.</p></div>`;
    else if (d.status === "beantwortet") unten = `<div class="meldung ok" role="status" tabindex="-1" id="ent-meldung">${sym("check")}<div><p><b>Angekommen.</b> ${t("Ihre", "Deine")} Antwort: ${ANTWORT[d.antwort] || ""} · ${zeit(d.beantwortet_am)}</p><p class="neben">${t("Falsch gewählt? Schreiben Sie es unten als Frage.", "Falsch gewählt? Schreib es unten als Frage.")}</p></div></div>`;
    else {
      const optionen = ["ja", "nein", ...(S.g3 ? ["intern"] : [])];
      unten = `${d.antwort === "intern" ? `<div class="meldung" role="status" tabindex="-1" id="ent-meldung">${sym("info")}<p>${t("Sie klären das intern. Wenn Sie so weit sind, antworten Sie einfach hier.", "Du klärst das intern. Wenn du so weit bist, antworte einfach hier.")}</p></div>` : ""}
        <form id="ef" novalidate><fieldset><legend>${t("Ihre Antwort", "Deine Antwort")}</legend><div class="wahl" id="wahl" role="radiogroup" aria-describedby="f-wahl"${optionen.length === 2 ? ' style="grid-template-columns:1fr 1fr"' : ""}>
          ${optionen.map((o) => `<label><input type="radio" name="a" value="${o}"> ${ANTWORT[o]}</label>`).join("")}</div><div id="f-wahl"></div></fieldset>
          <label class="feld"><span>${t("Kommentar, wenn Sie mögen", "Kommentar, wenn du magst")}</span><textarea name="k" rows="2" maxlength="5000" data-entwurf="ent:${d.id}"></textarea></label>
          <button class="btn" type="submit">Antwort senden</button><div class="m" id="em"></div></form>`;
    }
    const komm = await kommentarBlock({ art: "entscheidung", id: d.id, kundeId: d.kunde_id, titel: "Fragen zu dieser Entscheidung", feld: t("Ihre Frage", "Deine Frage"), knopf: "Frage senden", zwei: true, leerText: "Noch keine Fragen." });
    rahmen({ titel: "Entscheidung", aktiv: "entscheidungen", zaehler: z,
      buehne: buehneSeite({ zurueck: ["entscheidungen", "Alle Entscheidungen"], kennung: `Entscheidung${d.kategorie ? " · " + esc(d.kategorie) : ""}`, titel: offen ? t("Was wir von Ihnen brauchen", "Was wir von dir brauchen") : "Entscheidung" }),
      inhalt: `<article class="karte${kl}"><span class="art">Entscheidung${d.kategorie ? " · " + esc(d.kategorie) : ""}</span><p class="frage">${esc(d.frage)}</p>
        <p><b>Unsere Empfehlung:</b> ${esc(d.empfehlung)}</p>${d.begruendung ? `<p class="grund">${esc(d.begruendung)}</p>` : ""}${d.wenn_nein ? `<p class="grund leise">Wenn nein: ${esc(d.wenn_nein)}</p>` : ""}
        ${d.frist && offen ? `<p class="termin">${fristHtml(d.frist)}</p>` : ""}
        ${dateien.map((x) => dateiHtml(x, { bezug: false })).join("")}
        ${offen && S.g3 ? `<details class="kein-druck" style="margin-top:16px"><summary class="aufklapp">Datei hochladen</summary>${ablageHtml("ab", { zwei: true })}</details>` : ""}
        <div id="ent-unten">${unten}</div></article>${komm}` });
    dateiKnoepfe(); kommentarVerdrahten();
    ablageVerdrahten("ab", (box) => hochladen(box, d.kunde_id, "vom_kunden", ["entscheidung", d.id]));
    if (fokus) { const el = document.getElementById("ent-meldung"); if (el) { el.scrollIntoView({ block: "center" }); el.focus({ preventScroll: true }); } }
    const f = document.getElementById("ef");
    if (!f) return;
    f.querySelectorAll("input[name=a]").forEach((r) => (r.onchange = () => { document.getElementById("wahl").classList.remove("fehler"); document.getElementById("f-wahl").innerHTML = ""; }));
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const m = document.getElementById("em");
      const a = f.querySelector("input[name=a]:checked")?.value;
      const wahl = document.getElementById("wahl");
      const fw = document.getElementById("f-wahl");
      if (!a) { wahl.classList.add("fehler"); fw.innerHTML = `<p class="feldfehler" role="alert">${sym("error")}<span>Bitte eine Antwort wählen.</span></p>`; f.querySelector("input[name=a]").focus(); return; }
      wahl.classList.remove("fehler"); fw.innerHTML = "";
      const k = f.querySelector("button[type=submit]"); k.disabled = true; k.textContent = "Wird gesendet";
      const { error } = await krpc("entscheidung_beantworten", { p_id: d.id, p_antwort: a, p_kommentar: f.k.value });
      k.disabled = false; k.textContent = "Antwort senden";
      if (error) {
        if (/nicht offen/i.test(error.message || "")) { S.fokusNachWechsel = false; return entscheidungAnzeigen(d.id, true); }
        return meldung(m, t("Das hat nicht geklappt. Ihre Antwort ist noch nicht bei uns. Bitte noch einmal senden.", "Das hat nicht geklappt. Deine Antwort ist noch nicht bei uns. Bitte noch einmal senden."));
      }
      entwurfWeg("ent:" + d.id);
      S.fokusNachWechsel = false; S.stehenBleiben = true;
      await entscheidungAnzeigen(d.id, true);
    };
  }

  // ---------- Aufgaben ----------
  async function aufgaben() {
    const [z, { data }] = await Promise.all([zaehlerKunde(), kq("aufgaben").select("*").eq("erledigt", false)]);
    const beiDir = (data || []).filter((x) => x.liegt_bei === "kunde").sort(sortFrist);
    const beiUns = (data || []).filter((x) => x.liegt_bei === "wir").sort((p, q) => String(p.titel).localeCompare(q.titel, "de"));
    rahmen({ titel: "Aufgaben", aktiv: "aufgaben", zaehler: z, buehne: buehneSeite({ titel: "Aufgaben", unter: "Wer gerade was in der Hand hat" }),
      inhalt: `<section class="block"><h2>${t("Liegt bei Ihnen", "Liegt bei dir")}</h2>${beiDir.length ? `<ul class="register ohne-art fristen">${beiDir.map((x) => zeile({ href: `#/aufgaben/${x.id}`, titel: x.titel, frist: fristHtml(x.frist), mitArt: false })).join("")}</ul>` : leer(t("Gerade liegt nichts bei Ihnen.", "Gerade liegt nichts bei dir."))}</section>
        <section class="block"><h2>Liegt bei uns</h2>${beiUns.length ? `<ul class="register ohne-art">${beiUns.map((x) => zeile({ href: `#/aufgaben/${x.id}`, titel: x.titel, mitArt: false })).join("")}</ul>` : leer("Gerade liegt nichts bei uns.")}
        <p class="nach">Fehlt etwas? <a class="textlink" href="#/anliegen/neu">${t("Stellen Sie es als Anliegen ein.", "Stell es als Anliegen ein.")}</a></p></section>` });
  }

  async function aufgabeAnzeigen(id) {
    const [z, { data: x }] = await Promise.all([zaehlerKunde(), kq("aufgaben").select("*").eq("id", id).maybeSingle()]);
    if (!x || x.erledigt) return rahmen({ titel: "Aufgabe", aktiv: "aufgaben", zaehler: z, buehne: buehneSeite({ zurueck: ["aufgaben", "Alle Aufgaben"], titel: "Diese Aufgabe ist erledigt." }), inhalt: `<p><a class="textlink" href="#/">Zur Übersicht</a></p>` });
    const beiDir = x.liegt_bei === "kunde";
    const dateien = await dateienAm("aufgabe", x.id);
    const komm = await kommentarBlock({ art: "aufgabe", id: x.id, kundeId: x.kunde_id, zwei: true });
    const liste = (arr) => arr.length ? `<h2 class="frei" style="margin-top:24px">${t("Von Ihnen geschickt", "Von dir geschickt")}</h2>${arr.map((d) => dateiHtml(d, { bezug: false })).join("")}` : "";
    rahmen({ titel: "Aufgabe", aktiv: "aufgaben", zaehler: z,
      buehne: buehneSeite({ zurueck: ["aufgaben", "Alle Aufgaben"], kennung: `Aufgabe · ${beiDir ? t("Liegt bei Ihnen", "Liegt bei dir") : "Liegt bei uns"}`, titel: x.titel, unter: x.frist && beiDir ? `bis ${datum(x.frist)}` : "" }),
      inhalt: `<div class="lesespalte">${S.g3 && x.satz ? `<p class="absatz">${esc(x.satz)}</p>` : ""}<div id="dateiliste">${liste(dateien)}</div>
        ${beiDir && S.g3 ? `<h2 class="frei" style="margin-top:32px">Datei schicken</h2>${ablageHtml("ab")}` : ""}</div>${komm}` });
    dateiKnoepfe(); kommentarVerdrahten();
    ablageVerdrahten("ab", async (box) => {
      const r = await hochladen(box, x.kunde_id, "vom_kunden", ["aufgabe", x.id]);
      if (r.ok.length) {
        document.getElementById("dateiliste").innerHTML = liste(await dateienAm("aufgabe", x.id));
        dateiKnoepfe(); box._dateien = []; box.querySelector("[data-wahl]").textContent = "";
      }
      if (r.ok.length && !r.fehl.length) { meldung(box.querySelector(".m"), `<p><b>Angekommen.</b> ${r.ok.length === 1 ? "Die Datei liegt" : `${r.ok.length} Dateien liegen`} jetzt bei uns. Wir prüfen sie und melden uns hier.</p>`, "ok", true); return null; }
      return r;
    });
  }

  // ---------- Anliegen ----------
  async function anliegenSeite() {
    const [z, { data }, { data: komm }] = await Promise.all([zaehlerKunde(), kq("anliegen").select("id,titel,status,erstellt_name,erstellt,aktualisiert").order("aktualisiert", { ascending: false }),
      kq("kommentare").select("bezug_id,autor_name,autor_rolle,erstellt").eq("bezug_art", "anliegen").order("erstellt", { ascending: false }).limit(300)]);
    const letzte = {};
    for (const c of komm || []) if (!letzte[c.bezug_id]) letzte[c.bezug_id] = c;
    const z_ = (x) => {
      const l = letzte[x.id];
      return zeile({ href: `#/anliegen/${x.id}`, art: `<span class="marke">${ANLIEGEN_STATUS[x.status]}</span>`, titel: x.titel,
        unter: `${esc(x.erstellt_name || "")} · ${datum(x.erstellt)}${l && l.autor_rolle === "team" ? ` · ${esc((l.autor_name || "").split(" ")[0])} hat geantwortet` : ""}` });
    };
    const offen = (data || []).filter((x) => x.status !== "erledigt");
    const fertig = (data || []).filter((x) => x.status === "erledigt").slice(0, 30);
    rahmen({ titel: "Anliegen", aktiv: "anliegen", zaehler: z, buehne: buehneSeite({ titel: "Anliegen", unter: t("Was Sie von uns brauchen", "Was du von uns brauchst") }),
      inhalt: `<p class="absatz">Frage oder Auftrag: ${t("Stellen Sie es hier ein", "Stell es hier ein")}. Wir antworten hier. Mail und Termin gehen natürlich weiter.</p>
        <div class="knopfzeile"><a class="btn" href="#/anliegen/neu">Neues Anliegen</a></div>
        <section class="block" style="margin-top:32px"><h2>Laufend</h2>${offen.length ? `<ul class="register">${offen.map(z_).join("")}</ul>` : leer("Gerade läuft kein Anliegen.")}</section>
        ${fertig.length ? `<section class="block"><h2>Erledigt</h2><ul class="register">${fertig.map(z_).join("")}</ul></section>` : ""}` });
  }

  async function anliegenNeu() {
    const z = await zaehlerKunde();
    rahmen({ titel: "Neues Anliegen", aktiv: "anliegen", zaehler: z, buehne: buehneSeite({ zurueck: ["anliegen", "Alle Anliegen"], titel: "Neues Anliegen", unter: "Worum geht es?" }),
      inhalt: `<form id="af" class="lesespalte" novalidate>
        <label class="feld" style="margin-top:0"><span>Betreff</span><input type="text" name="titel" maxlength="200" placeholder="z. B. Amazon schreibt wegen eines Artikels" data-entwurf="anliegen:titel" aria-describedby="f-betreff"></label><div id="f-betreff"></div>
        <label class="feld"><span>Beschreibung</span><textarea name="text" rows="6" maxlength="10000" data-entwurf="anliegen:text"></textarea></label>
        ${S.g3 ? ablageHtml("ab", { knopf: "Datei anhängen", senden: false }) : ""}
        <button class="btn" type="submit">Anliegen senden</button><div class="m" id="am"></div></form>` });
    const f = document.getElementById("af");
    ablageVerdrahten("ab", () => null);
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const titel = f.titel.value.trim();
      const fb = document.getElementById("f-betreff");
      if (!titel) { f.titel.setAttribute("aria-invalid", "true"); fb.innerHTML = `<p class="feldfehler" role="alert">${sym("error")}Bitte einen Betreff eingeben.</p>`; f.titel.focus(); return; }
      f.titel.removeAttribute("aria-invalid"); fb.innerHTML = "";
      const k = f.querySelector("button[type=submit]"); k.disabled = true; k.textContent = "Wird gesendet";
      const { data, error } = await kq("anliegen").insert({ kunde_id: S.kunde.id, titel, text: f.text.value.trim() || null }).select("id").single();
      if (error) { k.disabled = false; k.textContent = "Anliegen senden"; return meldung(document.getElementById("am"), fehlerText(error)); }
      entwurfWeg("anliegen:titel"); entwurfWeg("anliegen:text");
      let dateiFehler = null;
      const box = document.getElementById("ab");
      if (box && (box._dateien || []).length) { const r = await hochladen(box, S.kunde.id, "vom_kunden", ["anliegen", data.id]); if (r.fehl.length) dateiFehler = r; }
      S.nachSenden = { id: data.id, dateiFehler };
      geh("anliegen/" + data.id);
    };
  }

  async function anliegenAnzeigen(id) {
    const [z, { data: x }] = await Promise.all([zaehlerKunde(), kq("anliegen").select("*").eq("id", id).maybeSingle()]);
    if (!x) return rahmen({ titel: "Anliegen", aktiv: "anliegen", zaehler: z, buehne: buehneSeite({ zurueck: ["anliegen", "Alle Anliegen"], titel: "Anliegen nicht gefunden" }), inhalt: leer("Dieses Anliegen gibt es nicht.") });
    const dateien = await dateienAm("anliegen", x.id);
    const komm = await kommentarBlock({ art: "anliegen", id: x.id, kundeId: x.kunde_id, titel: "Antworten" });
    const ns = S.nachSenden?.id === x.id ? S.nachSenden : null; S.nachSenden = null;
    if (ns) S.fokusNachWechsel = false;
    rahmen({ titel: "Anliegen", aktiv: "anliegen", zaehler: z,
      buehne: buehneSeite({ zurueck: ["anliegen", "Alle Anliegen"], kennung: `Anliegen · <b>${ANLIEGEN_STATUS[x.status]}</b>`, titel: x.titel }),
      inhalt: `<div id="gesendet"></div><div class="verlauf"><div class="kom"><p class="wer"><b>${esc(x.erstellt_name || "")}</b>${x.erstellt_rolle === "team" ? " · PPotthoff" : ""} · ${zeit(x.erstellt)}</p>
        ${x.text ? `<p class="text">${esc(x.text)}</p>` : ""}${dateien.map((d) => dateiHtml(d, { bezug: false })).join("")}</div></div>${komm}` });
    dateiKnoepfe(); kommentarVerdrahten();
    if (ns) {
      const g = document.getElementById("gesendet");
      if (ns.dateiFehler) meldung(g, `<p>${t("Ihr", "Dein")} Anliegen ist angekommen. Die Datei hat nicht geklappt. Bitte unter Dateien noch einmal hochladen.</p>`, "fehler", true);
      else meldung(g, t("Ihr Anliegen ist angekommen.", "Dein Anliegen ist angekommen."), "ok");
    }
  }

  // ---------- Dateien ----------
  async function dateienSeite() {
    const [z, { data }] = await Promise.all([zaehlerKunde(), kq("dateien").select("*").order("erstellt", { ascending: false })]);
    rahmen({ titel: "Dateien", aktiv: "dateien", zaehler: z, buehne: buehneSeite({ titel: "Dateien", unter: t("Was Sie uns schicken und was wir Ihnen schicken", "Was du uns schickst und was wir dir schicken") }),
      inhalt: `<p class="absatz">Was ${t("Sie hier hochladen", "du hier hochlädst")}, liegt sofort bei uns.</p>${ablageHtml("ab", { notiz: true })}
        <section class="block" style="margin-top:48px"><h2>Alle Dateien</h2><div id="dateiliste">${data?.length ? data.map((d) => dateiHtml(d)).join("") : leer("Noch keine Dateien.")}</div></section>` });
    (data || []).filter((d) => d.richtung === "von_uns").forEach((d) => alsGesehen("d:" + d.id));
    dateiKnoepfe();
    ablageVerdrahten("ab", async (box) => {
      const r = await hochladen(box, S.kunde.id, "vom_kunden", null);
      if (r.ok.length) {
        const { data: neu } = await kq("dateien").select("*").order("erstellt", { ascending: false });
        document.getElementById("dateiliste").innerHTML = (neu || []).map((d) => dateiHtml(d)).join("");
        dateiKnoepfe(); box._dateien = []; box.querySelector("[data-wahl]").textContent = "";
      }
      return r;
    });
  }

  // ---------- Roadmap, Werkzeuge, Wer sieht was ----------
  const ROADMAP_STATUS = { laeuft: "Läuft", geplant: "Als Nächstes", spaeter: "Später" };
  async function roadmapSeite() {
    const [z, { data }] = await Promise.all([zaehlerKunde(), kq("roadmap").select("*").neq("status", "erledigt").order("reihenfolge").order("titel")]);
    const stand = S.g3 ? (data || []).map((r) => r.stand).filter(Boolean).sort().pop() : null;
    const gruppe = (st) => {
      const arr = (data || []).filter((r) => r.status === st);
      return arr.length ? `<section class="block"><h2>${ROADMAP_STATUS[st]}</h2><ul class="register ohne-art">${arr.map((r) => `<li><div class="zeile"><span class="titel">${esc(r.titel)}</span>${r.beschreibung ? `<span class="unter">${esc(r.beschreibung)}</span>` : ""}${r.zeitraum ? `<span class="frist" style="font-size:var(--t-neben);font-family:var(--sans)">${esc(r.zeitraum)}</span>` : '<span class="frist"></span>'}<span></span></div></li>`).join("")}</ul></section>` : "";
    };
    rahmen({ titel: "Roadmap", aktiv: "roadmap", zaehler: z, buehne: buehneSeite({ titel: "Roadmap", unter: `Was wir gemeinsam vorhaben${stand ? ` · Stand ${datum(stand)}` : ""}` }),
      inhalt: data?.length ? gruppe("laeuft") + gruppe("geplant") + gruppe("spaeter") : leer("Die Roadmap wird gerade aufgebaut.") });
  }
  async function werkzeuge() {
    const [z, { data }] = await Promise.all([zaehlerKunde(), kq("werkzeuge").select("*").order("reihenfolge")]);
    rahmen({ titel: "Werkzeuge", aktiv: "werkzeuge", zaehler: z, buehne: buehneSeite({ titel: "Werkzeuge", unter: "Werkzeuge von PPotthoff" }),
      inhalt: data?.length ? `<ul class="register ohne-art">${data.map((w) => `<li><a href="${esc(w.url)}" target="_blank" rel="noopener noreferrer"><span class="titel">${esc(w.titel)}</span>${w.beschreibung ? `<span class="unter">${esc(w.beschreibung)}</span>` : ""}<span class="frist"></span><span class="tun">Öffnen</span></a></li>`).join("")}</ul>` : leer(`Für ${t("Sie", "dich")} sind noch keine Werkzeuge eingerichtet.`) });
  }
  async function werSiehtWas() {
    const team = S.mitglied?.rolle === "team" && !S.alsKunde;
    const z = team ? {} : await zaehlerKunde();
    const name = team ? "den Kunden" : S.kunde?.name || "";
    rahmen({ titel: "Wer sieht was?", aktiv: "wer-sieht-was", zaehler: z, reiter: team ? INTERN_REITER : null, buehne: buehneSeite({ titel: "Wer sieht was?" }),
      inhalt: `<div class="lesespalte"><p class="absatz">Das Portal läuft auf Servern in Frankfurt am Main. Sehen können es nur die Personen, die wir für ${esc(name)} freigeschaltet haben, und unser Team.</p>
        <p class="absatz">Dateien, die ${t("Sie hochladen", "du hochlädst")}, legen wir zusätzlich in unserer Ablage für ${esc(name)} ab.</p>
        <p class="absatz">Angemeldet wird mit Mail-Adresse und einem Code, der zehn Minuten gilt. Ein Passwort gibt es nicht.</p>
        <p class="neben leise">Fragen dazu? <a href="mailto:${KONTAKT}">${KONTAKT}</a></p></div>` });
  }

  // ---------- Interner Bereich: Hilfen (nicht gestaltet, übernimmt portal.css) ----------
  function rahmenAlt(inhalt, reiter, aktiv, z = {}) { const e = (reiter || []).find(([p]) => p === aktiv); rahmen({ titel: e ? e[1] : "Interner Bereich", aktiv, reiter, zaehler: z, inhalt }); }
  const ROADMAP_STATUS_INTERN = { laeuft: "Läuft", geplant: "Als Nächstes", spaeter: "Später", erledigt: "Erledigt" };
  function berichtZeile(r) {
    const marke = r.status === "freigegeben" ? '<span class="marke gruen">freigegeben</span>' : r.status === "entwurf" ? '<span class="marke">Entwurf</span>' : '<span class="marke rot">zurückgezogen</span>';
    const pdf = r.pdf_pfad ? `<button class="text" data-pdf="${esc(r.pdf_pfad)}" data-name="${esc(r.titel)}.pdf">PDF</button>` : "";
    const frei = r.status === "freigegeben" ? `<button class="text" data-zurueck="${r.id}">Zurückziehen</button>` : `<button class="btn" data-frei="${r.id}">Freigeben</button>`;
    return `<li><div><div class="titel">${esc(r.titel)} ${marke}</div><div class="unter">${ART[r.art] || r.art} · ${esc(zeitraumText(r))}${r.freigegeben_am ? " · freigegeben am " + datum(r.freigegeben_am) : ""}</div></div><div class="aktionen"><a href="#/intern/vorschau/${r.id}">Vorschau</a>${pdf}${frei}</div></li>`;
  }
  function entscheidungsKarte(d) {
    const kl = d.antwort === "ja" ? " ja" : d.antwort === "nein" ? " nein" : d.antwort === "intern" ? " intern" : "";
    let stand;
    if (d.status === "entwurf") stand = d.bericht_id ? "Entwurf, sichtbar nach Freigabe des Berichts" : `Entwurf <button class="btn" data-ent-frei="${d.id}">Für den Kunden freigeben</button>`;
    else if (d.status === "offen") stand = d.antwort === "intern" ? `Kunde klärt intern (${esc(d.beantwortet_von || "")}, ${zeit(d.beantwortet_am)})${d.kommentar ? ` · „${esc(d.kommentar)}“` : ""}` : "offen beim Kunden";
    else stand = `<b>${ANTWORT[d.antwort] || ""}</b>, ${esc(d.beantwortet_von || "")} am ${zeit(d.beantwortet_am)}${d.kommentar ? ` · „${esc(d.kommentar)}“` : ""}${d.status === "erledigt" ? " · übernommen" : ` <button class="text" data-erledigt="${d.id}">Als übernommen markieren</button>`}`;
    return `<article class="karte${kl}" style="margin-top:16px"><span class="art">${esc(d.kategorie || "Entscheidung")}${d.frist ? " · bis " + esc(d.frist) : ""}</span><p class="frage">${esc(d.frage)}</p><p><b>Unsere Empfehlung:</b> ${esc(d.empfehlung)}</p><p class="neben" style="margin-top:12px">${stand}</p></article>`;
  }
  async function anliegenKopf(x) {
    return `<p class="kennung" style="color:var(--ink-soft)">Anliegen · <b style="color:var(--ink)">${ANLIEGEN_STATUS[x.status]}</b></p><h1 style="font-size:var(--t-h1-seite)">${esc(x.titel)}</h1>
      <div class="verlauf"><div class="kom"><p class="wer"><b>${esc(x.erstellt_name || "")}</b> · ${zeit(x.erstellt)}</p><p class="text">${x.text ? esc(x.text) : '<span class="leise">Ohne Beschreibung</span>'}</p></div></div>`;
  }
  function ablageVerdrahtenIntern(id, kundeId, richtung, danach) {
    ablageVerdrahten(id, async (box) => { const r = await hochladen(box, kundeId, richtung, null); if (r.ok.length && !r.fehl.length) { danach(); return null; } return r; });
  }
  // ---------- Interner Bereich ----------
  const INTERN_REITER = [["intern", "Berichte"], ["intern/entscheidungen", "Antworten"], ["intern/anliegen", "Anliegen"], ["intern/dateien", "Dateien"], ["intern/aufgaben", "Aufgaben"], ["intern/roadmap", "Roadmap"], ["intern/werkzeuge", "Werkzeuge"], ["intern/zugaenge", "Zugänge"], ["intern/protokoll", "Protokoll"]];
  function kundenwahl() {
    return `<div class="leiste"><label class="feld"><span class="label">Kunde</span><select id="kw">${S.kunden.map((k) => `<option value="${k.id}" ${k.id === S.internKunde?.id ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select></label></div>`;
  }
  function kundenwahlVerdrahten(neu) {
    const s = document.getElementById("kw");
    if (s) s.onchange = () => { S.internKunde = S.kunden.find((k) => k.id === s.value); lokal.set("intern-kunde", s.value); neu(); };
  }
  async function zaehlerIntern() {
    const [e, a] = await Promise.all([
      sb.from("entscheidungen").select("id", { count: "exact", head: true }).eq("status", "beantwortet"),
      sb.from("anliegen").select("id", { count: "exact", head: true }).eq("status", "offen"),
    ]);
    return { "intern/entscheidungen": e.count || 0, "intern/anliegen": a.count || 0 };
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
    if (!k) return rahmenAlt(`<h1>Noch keine Kunden</h1>`, INTERN_REITER, "intern");
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("berichte").select("*").eq("kunde_id", k.id).order("zeitraum_start", { ascending: false }).order("art")]);
    rahmenAlt(`<div class="label kicker">Interner Bereich</div><h1>Berichte freigeben · ${esc(k.name)}</h1><p class="lead">Neue Berichte kommen als Entwurf. Der Kunde sieht sie erst nach der Freigabe; die Entscheidungen des Berichts werden dann mit geöffnet.</p>
      <div class="leiste" style="margin-top:32px">${kundenwahl()}<button class="btn zwei" type="button" id="als-kunde">Kundensicht von ${esc(k.name)} ansehen</button></div>
      ${data?.length ? `<ul class="liste">${data.map((r) => berichtZeile(r, true)).join("")}</ul>` : `<div class="leer">Für ${esc(k.name)} liegt noch kein Bericht.</div>`}`,
      INTERN_REITER, "intern", z);
    kundenwahlVerdrahten(internBerichte); pdfKnoepfe(); freigabeKnoepfe();
    document.getElementById("als-kunde").onclick = kundensichtStarten;
  }

  async function internEntscheidungen() {
    const k = S.internKunde;
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("entscheidungen").select("*").eq("kunde_id", k.id).order("erstellt", { ascending: false }).order("nr")]);
    const neu = (data || []).filter((d) => d.status === "beantwortet");
    const rest = (data || []).filter((d) => d.status !== "beantwortet");
    rahmenAlt(`<div class="label kicker">Interner Bereich</div><h1>Antworten der Kunden</h1><div style="margin-top:32px">${kundenwahl()}</div>
      ${neu.length ? `<h2>Neu beantwortet</h2><div class="karten">${neu.map((d) => entscheidungsKarte(d, true)).join("")}</div>` : `<div class="leer">Keine neuen Antworten von ${esc(k.name)}.</div>`}
      ${rest.length ? `<section class="abschnitt"><div class="abschnitt-kopf"><h2>Alle übrigen</h2></div><div class="karten">${rest.map((d) => entscheidungsKarte(d, true)).join("")}</div></section>` : ""}`,
      INTERN_REITER, "intern/entscheidungen", z);
    kundenwahlVerdrahten(internEntscheidungen);
    app.querySelectorAll("[data-ent-frei]").forEach((b) => (b.onclick = async () => {
      if (!confirmLeise(b, `${k.name} sieht die Entscheidung danach sofort.`)) return;
      const { error } = await sb.from("entscheidungen").update({ status: "offen" }).eq("id", b.dataset.entFrei);
      if (error) return alertLeise(fehlerText(error));
      internEntscheidungen();
    }));
    app.querySelectorAll("[data-erledigt]").forEach((b) => (b.onclick = async () => {
      const { error } = await sb.from("entscheidungen").update({ status: "erledigt" }).eq("id", b.dataset.erledigt);
      if (error) return alertLeise(fehlerText(error));
      internEntscheidungen();
    }));
  }

  async function internDateien() {
    const k = S.internKunde;
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("dateien").select("*").eq("kunde_id", k.id).order("erstellt", { ascending: false })]);
    rahmenAlt(`<div class="label kicker">Interner Bereich</div><h1>Dateien</h1><div style="margin-top:32px">${kundenwahl()}</div>
      <h2>Für ${esc(k.name)} bereitstellen</h2>${ablageHtml("ab", { notiz: true })}
      <section class="abschnitt"><div class="abschnitt-kopf"><h2>Alle Dateien</h2></div>${data?.length ? `<ul class="liste">${data.map((d) => dateiHtml(d, { intern: true })).join("")}</ul>` : `<div class="leer">Noch keine Dateien.</div>`}</section>`,
      INTERN_REITER, "intern/dateien", z);
    kundenwahlVerdrahten(internDateien);
    ablageVerdrahtenIntern("ab", k.id, "von_uns", internDateien);
    app.querySelectorAll("[data-sichtbar]").forEach((b) => (b.onclick = async () => {
      if (!confirmLeise(b, `${k.name} sieht die Datei danach sofort.`)) return;
      const { error } = await sb.from("dateien").update({ sichtbar: true }).eq("id", b.dataset.sichtbar);
      if (error) return alertLeise(fehlerText(error));
      internDateien();
    }));
    dateiKnoepfe();
  }

  async function internAufgaben() {
    const k = S.internKunde;
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("aufgaben").select("*").eq("kunde_id", k.id).order("frist", { nullsFirst: false })]);
    rahmenAlt(`<div class="label kicker">Interner Bereich</div><h1>Aufgaben in der Kundensicht</h1>
      <p class="lead">Hier erscheinen nur Trello-Karten mit dem Label „Kunde sieht“: Titel, wer sie in der Hand hat, Frist. Gepflegt wird in Trello.</p><div style="margin-top:32px">${kundenwahl()}</div>
      ${data?.length ? `<table class="protokoll"><thead><tr><th>Aufgabe</th><th>Liegt bei</th><th>Frist</th><th>Status</th></tr></thead><tbody>${data.map((x) => `<tr><td>${esc(x.titel)}</td><td>${x.liegt_bei === "kunde" ? "Kunde" : "uns"}</td><td>${datum(x.frist)}</td><td>${x.erledigt ? "erledigt" : "offen"}</td></tr>`).join("")}</tbody></table>` : `<div class="leer">Noch keine Karten mit „Kunde sieht“ für ${esc(k.name)}.</div>`}`,
      INTERN_REITER, "intern/aufgaben", z);
    kundenwahlVerdrahten(internAufgaben);
  }

  async function internWerkzeuge() {
    const k = S.internKunde;
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("werkzeuge").select("*").eq("kunde_id", k.id).order("reihenfolge")]);
    rahmenAlt(`<div class="label kicker">Interner Bereich</div><h1>Werkzeuge</h1><div style="margin-top:32px">${kundenwahl()}</div>
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

  async function internAnliegen() {
    const k = S.internKunde;
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("anliegen").select("*").eq("kunde_id", k.id).order("aktualisiert", { ascending: false })]);
    rahmenAlt(`<div class="label kicker">Interner Bereich</div><h1>Anliegen der Kunden</h1><div style="margin-top:32px">${kundenwahl()}</div>
      ${data?.length ? `<ul class="liste">${data.map((x) => `<li><div><div class="titel"><a href="#/intern/anliegen/${x.id}">${esc(x.titel)}</a><span class="marke${x.status === "offen" ? " rot" : x.status === "erledigt" ? " gruen" : ""}">${esc(ANLIEGEN_STATUS[x.status])}</span></div><div class="unter">${esc(x.erstellt_name || "")} · ${zeit(x.erstellt)} · zuletzt ${zeit(x.aktualisiert)}</div></div></li>`).join("")}</ul>` : `<div class="leer">Keine Anliegen von ${esc(k.name)}.</div>`}`,
      INTERN_REITER, "intern/anliegen", z);
    kundenwahlVerdrahten(internAnliegen);
  }

  async function internAnliegenAnzeigen(id) {
    const [z, { data: x }] = await Promise.all([zaehlerIntern(), sb.from("anliegen").select("*").eq("id", id).maybeSingle()]);
    if (!x) return rahmenAlt(`<a class="zurueck" href="#/intern/anliegen">Alle Anliegen</a><div class="leer">Dieses Anliegen gibt es nicht.</div>`, INTERN_REITER, "intern/anliegen", z);
    const wahl = Object.entries(ANLIEGEN_STATUS).map(([w, n]) => `<option value="${w}" ${w === x.status ? "selected" : ""}>${n}</option>`).join("");
    rahmenAlt(`<a class="zurueck" href="#/intern/anliegen">Alle Anliegen</a>${await anliegenKopf(x)}
      <div class="leiste" style="margin-top:20px"><label class="feld"><span class="label">Status ändern</span><select id="st">${wahl}</select></label></div>
      ${await kommentarBlock({ art: "anliegen", id: x.id, kundeId: x.kunde_id, titel: "Antworten" })}`, INTERN_REITER, "intern/anliegen", z);
    document.getElementById("st").onchange = async (ev) => {
      const { error } = await sb.from("anliegen").update({ status: ev.target.value, aktualisiert: new Date().toISOString() }).eq("id", id);
      if (error) return alertLeise(fehlerText(error));
      internAnliegenAnzeigen(id);
    };
    kommentarVerdrahten(async () => { if (x.status === "offen") { await sb.from("anliegen").update({ status: "in_arbeit", aktualisiert: new Date().toISOString() }).eq("id", id); } });
  }

  async function internRoadmap() {
    const k = S.internKunde;
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("roadmap").select("*").eq("kunde_id", k.id).order("reihenfolge").order("titel")]);
    const wahl = (st) => Object.entries(ROADMAP_STATUS_INTERN).map(([w, n]) => `<option value="${w}" ${w === st ? "selected" : ""}>${n}</option>`).join("");
    rahmenAlt(`<div class="label kicker">Interner Bereich</div><h1>Roadmap</h1>
      <p class="lead">Der Kunde sieht nur Punkte mit „sichtbar“.</p><div style="margin-top:32px">${kundenwahl()}</div>
      ${data?.length ? `<ul class="liste">${data.map((r) => `<li><div><div class="titel">${esc(r.titel)}${r.sichtbar ? '<span class="marke gruen">sichtbar</span>' : '<span class="marke">intern</span>'}</div><div class="unter">${esc(r.beschreibung || "")}${r.zeitraum ? " · " + esc(r.zeitraum) : ""}</div></div>
        <div class="aktionen"><select data-rstatus="${r.id}" style="width:auto;padding:6px 8px;font-size:14px">${wahl(r.status)}</select><button class="text" data-rsicht="${r.id}" data-wert="${r.sichtbar}">${r.sichtbar ? "Ausblenden" : "Sichtbar machen"}</button><button class="text" data-rweg="${r.id}">Löschen</button></div></li>`).join("")}</ul>` : `<div class="leer">Noch keine Roadmap für ${esc(k.name)}.</div>`}
      <section class="abschnitt"><div class="abschnitt-kopf"><h2>Punkt hinzufügen</h2></div>
      <form id="rf" novalidate style="max-width:560px;margin-top:16px"><label class="feld"><span class="label">Titel</span><input type="text" name="titel" required></label>
      <label class="feld"><span class="label">Beschreibung</span><textarea name="beschreibung" rows="2"></textarea></label>
      <label class="feld"><span class="label">Zeitraum (frei, z. B. Q1 2027)</span><input type="text" name="zeitraum"></label>
      <label class="feld"><span class="label">Status</span><select name="status">${wahl("geplant")}</select></label>
      <label class="feld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="sichtbar"> <span style="margin:0">für den Kunden sichtbar</span></label>
      <button class="btn" type="submit">Hinzufügen</button><div class="m"></div></form></section>`,
      INTERN_REITER, "intern/roadmap", z);
    kundenwahlVerdrahten(internRoadmap);
    const f = document.getElementById("rf");
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      if (!f.titel.value.trim()) return meldung(f.querySelector(".m"), "Bitte einen Titel angeben.");
      const { error } = await sb.from("roadmap").insert({ kunde_id: k.id, titel: f.titel.value.trim(), beschreibung: f.beschreibung.value.trim() || null, zeitraum: f.zeitraum.value.trim() || null, status: f.status.value, sichtbar: f.sichtbar.checked, reihenfolge: (data?.length || 0) + 1 });
      if (error) return meldung(f.querySelector(".m"), fehlerText(error));
      internRoadmap();
    };
    app.querySelectorAll("[data-rstatus]").forEach((s2) => (s2.onchange = async () => { await sb.from("roadmap").update({ status: s2.value }).eq("id", s2.dataset.rstatus); internRoadmap(); }));
    app.querySelectorAll("[data-rsicht]").forEach((b) => (b.onclick = async () => { await sb.from("roadmap").update({ sichtbar: b.dataset.wert !== "true" }).eq("id", b.dataset.rsicht); internRoadmap(); }));
    app.querySelectorAll("[data-rweg]").forEach((b) => (b.onclick = async () => {
      if (!confirmLeise(b, "Punkt endgültig löschen?")) return;
      await sb.from("roadmap").delete().eq("id", b.dataset.rweg); internRoadmap();
    }));
  }

  // Zugänge: wer sich anmelden darf (Liste) und wer schon ein Konto hat (Personen)
  async function internZugaenge() {
    const k = S.internKunde;
    const [z, { data: liste }, { data: personen }, { data: team }] = await Promise.all([
      zaehlerIntern(),
      sb.from("zugangsliste").select("*").eq("kunde_id", k.id).order("wert"),
      sb.from("mitglieder").select("user_id,email,anzeigename,anrede,gesperrt_am,letzte_anmeldung").eq("kunde_id", k.id).order("email"),
      sb.from("mitglieder").select("user_id,email,anzeigename,gesperrt_am,team_bestaetigt_am,letzte_anmeldung").eq("rolle", "team").order("email"),
    ]);
    const ich = S.user?.id;
    rahmenAlt(`<div class="label kicker">Interner Bereich</div><h1>Zugänge</h1>
      <p class="lead">Anmelden kann sich nur, wer hier auf der Liste steht: als einzelne Adresse oder über die Firmen-Domain. Freemail-Domains gehen nur als einzelne Adresse.</p>
      <div style="margin-top:32px">${kundenwahl()}</div>
      <section class="abschnitt" style="margin-top:8px"><div class="abschnitt-kopf"><h2>Zugangsliste ${esc(k.name)}</h2></div>
      ${liste?.length ? `<ul class="liste">${liste.map((l) => `<li><div><div class="titel">${esc(l.wert)}<span class="marke">${l.art === "domain" ? "Domain" : "Adresse"}</span></div><div class="unter">${esc(l.anzeigename || "Name aus der Adresse")} · Anrede ${esc(l.anrede || k.anrede || "Sie")}</div></div><div class="aktionen"><button class="text" data-lweg="${l.id}">Entfernen</button></div></li>`).join("")}</ul>` : `<div class="leer">Noch niemand auf der Liste.</div>`}
      <form id="zf" novalidate style="max-width:640px;margin-top:20px">
        <div style="display:grid;grid-template-columns:150px 1fr;gap:12px"><label class="feld"><span class="label">Art</span><select name="art"><option value="adresse">Adresse</option><option value="domain">Domain</option></select></label>
        <label class="feld"><span class="label">Adresse oder Domain</span><input type="text" name="wert" autocapitalize="none" spellcheck="false" placeholder="name@firma.de oder firma.de"></label></div>
        <div style="display:grid;grid-template-columns:1fr 150px;gap:12px"><label class="feld"><span class="label">Name (bei Adresse)</span><input type="text" name="name" placeholder="Vorname Nachname"></label>
        <label class="feld"><span class="label">Anrede</span><select name="anrede"><option value="">wie Kunde</option><option value="du">du</option><option value="Sie">Sie</option></select></label></div>
        <button class="btn" type="submit">Auf die Liste setzen</button><div class="m"></div></form></section>
      <section class="abschnitt"><div class="abschnitt-kopf"><h2>Personen mit Konto</h2></div>
      ${personen?.length ? `<ul class="liste">${personen.map((p) => `<li><div><div class="titel">${esc(p.anzeigename || p.email)}${p.gesperrt_am ? '<span class="marke rot">gesperrt</span>' : ""}</div><div class="unter">${esc(p.email || "")} · ${p.letzte_anmeldung ? "zuletzt angemeldet " + zeit(p.letzte_anmeldung) : "noch nie angemeldet"}</div></div><div class="aktionen"><button class="text" data-sperre="${p.user_id}" data-wert="${p.gesperrt_am ? "1" : ""}">${p.gesperrt_am ? "Entsperren" : "Sperren"}</button></div></li>`).join("")}</ul>` : `<div class="leer">Noch niemand von ${esc(k.name)} hat sich angemeldet.</div>`}</section>
      <section class="abschnitt"><div class="abschnitt-kopf"><h2>Team</h2></div>
      <p class="klein leise" style="margin:8px 0">Ein neues Team-Konto braucht den zweiten Faktor und die Freischaltung durch ein anderes Team-Mitglied.</p>
      <ul class="liste">${(team || []).map((p) => `<li><div><div class="titel">${esc(p.anzeigename || p.email)}${p.team_bestaetigt_am ? '<span class="marke gruen">freigeschaltet</span>' : '<span class="marke">wartet</span>'}${p.gesperrt_am ? '<span class="marke rot">gesperrt</span>' : ""}</div><div class="unter">${esc(p.email || "")} · ${p.letzte_anmeldung ? "zuletzt angemeldet " + zeit(p.letzte_anmeldung) : "noch nie angemeldet"}</div></div><div class="aktionen">${p.user_id === ich ? '<span class="klein leise">Das bist du</span>' : `<button class="text" data-frei-team="${p.user_id}" data-wert="${p.team_bestaetigt_am ? "1" : ""}">${p.team_bestaetigt_am ? "Freischaltung entziehen" : "Freischalten"}</button>`}</div></li>`).join("")}</ul></section>`,
      INTERN_REITER, "intern/zugaenge", z);
    kundenwahlVerdrahten(internZugaenge);
    const f = document.getElementById("zf");
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const m = f.querySelector(".m");
      const wert = f.wert.value.trim().toLowerCase().replace(/^@/, "");
      const art = f.art.value;
      if (art === "adresse" && !istMail(wert)) return meldung(m, "Bitte eine gültige Mail-Adresse eingeben.");
      if (art === "domain" && !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(wert)) return meldung(m, "Bitte nur die Domain eingeben, z. B. firma.de");
      const { error } = await sb.from("zugangsliste").insert({ rolle: "kunde", kunde_id: k.id, art, wert, anzeigename: art === "adresse" ? f.name.value.trim() || null : null, anrede: f.anrede.value || null });
      if (error) return meldung(m, /keine_freemail/.test(error.message) ? "Freemail-Domains gehen nur als einzelne Adresse." : /duplicate|unique/i.test(error.message) ? "Diese Adresse oder Domain steht schon auf der Liste." : fehlerText(error));
      internZugaenge();
    };
    app.querySelectorAll("[data-lweg]").forEach((b) => (b.onclick = async () => {
      if (!confirmLeise(b, "Entfernen sperrt auch die Personen, die nur über diesen Eintrag Zugang hatten.")) return;
      const { error } = await sb.from("zugangsliste").delete().eq("id", b.dataset.lweg);
      if (error) return alertLeise(fehlerText(error));
      internZugaenge();
    }));
    app.querySelectorAll("[data-sperre]").forEach((b) => (b.onclick = async () => {
      const sperren = !b.dataset.wert;
      if (sperren && !confirmLeise(b, "Die Person kommt danach nicht mehr ins Portal.")) return;
      const { error } = await sb.from("mitglieder").update({ gesperrt_am: sperren ? new Date().toISOString() : null }).eq("user_id", b.dataset.sperre);
      if (error) return alertLeise(fehlerText(error));
      internZugaenge();
    }));
    app.querySelectorAll("[data-frei-team]").forEach((b) => (b.onclick = async () => {
      const frei = !b.dataset.wert;
      if (!confirmLeise(b, frei ? "Die Person sieht danach alle Kunden." : "Die Person verliert den Zugang zum internen Bereich.")) return;
      const { error } = await sb.from("mitglieder").update({ team_bestaetigt_am: frei ? new Date().toISOString() : null }).eq("user_id", b.dataset.freiTeam);
      if (error) return alertLeise(fehlerText(error));
      internZugaenge();
    }));
  }

  async function internProtokoll() {
    const k = S.internKunde;
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("protokoll").select("*").eq("kunde_id", k.id).order("zeit", { ascending: false }).limit(200)]);
    const text = { person_gesperrt: "Person gesperrt", person_entsperrt: "Person entsperrt", team_freigeschaltet: "Team freigeschaltet", team_freischaltung_entzogen: "Team-Freischaltung entzogen", anliegen_angelegt: "Anliegen angelegt", kommentar: "Kommentar", anmeldung: "Anmeldung", bericht_geoeffnet: "Bericht geöffnet", bericht_freigegeben: "Bericht freigegeben", bericht_abgelegt: "Bericht als Entwurf abgelegt", entscheidung_beantwortet: "Entscheidung beantwortet", datei_vom_kunden: "Datei hochgeladen (Kunde)", datei_von_uns: "Datei bereitgestellt (wir)" };
    rahmenAlt(`<div class="label kicker">Interner Bereich</div><h1>Protokoll</h1><div style="margin-top:32px">${kundenwahl()}</div>
      ${data?.length ? `<table class="protokoll"><thead><tr><th>Zeit</th><th>Vorgang</th><th>Details</th></tr></thead><tbody>${data.map((p) => `<tr><td>${zeit(p.zeit)}</td><td>${esc(text[p.aktion] || p.aktion)}</td><td>${esc(p.details ? Object.values(p.details).join(" · ") : "")}</td></tr>`).join("")}</tbody></table>` : `<div class="leer">Noch keine Vorgänge.</div>`}`,
      INTERN_REITER, "intern/protokoll", z);
    kundenwahlVerdrahten(internProtokoll);
  }


  // ---------- Router ----------
  async function rendern() {
    if (!S.mitglied) return;
    const [a, b, c, d] = route();
    const team = S.mitglied.rolle === "team";
    try {
      if (team && S.alsKunde && a === "intern") { S.alsKunde = false; S.kunde = null; }
      if (a === "wer-sieht-was") return werSiehtWas();
      if (team && !S.alsKunde) {
        if (a !== "intern") return (location.hash = "#/intern");
        laedt(b && b !== "vorschau" ? "intern/" + b : "intern", INTERN_REITER);
        if (!b) return await internBerichte();
        if (b === "vorschau" && c) return await berichtAnzeigen(c, true, d === "werte");
        if (b === "anliegen" && c) return await internAnliegenAnzeigen(c);
        return await ({ entscheidungen: internEntscheidungen, anliegen: internAnliegen, dateien: internDateien, aufgaben: internAufgaben, roadmap: internRoadmap, werkzeuge: internWerkzeuge, zugaenge: internZugaenge, protokoll: internProtokoll }[b] || internBerichte)();
      }
      laedt(a === "vergleich" ? "berichte" : a || "");
      if (a === "vergleich") return await vergleich(b === "monat" ? "monat" : "woche", c, d);
      if (a === "berichte" && b) return await berichtAnzeigen(b, false, c === "werte");
      if (a === "entscheidungen" && b) return await entscheidungAnzeigen(b);
      if (a === "aufgaben" && b) return await aufgabeAnzeigen(b);
      if (a === "anliegen" && b === "neu") return await anliegenNeu();
      if (a === "anliegen" && b) return await anliegenAnzeigen(b);
      return await ({ "": uebersicht, berichte, entscheidungen, aufgaben, anliegen: anliegenSeite, dateien: dateienSeite, roadmap: roadmapSeite, werkzeuge }[a] || uebersicht)();
    } catch (e) {
      console.error(e);
      alertLeise("Etwas hat nicht geladen. Bitte die Seite neu laden.");
    }
  }

  window.addEventListener("hashchange", rendern);
  sb.auth.onAuthStateChange((ev) => {
    if (ev === "SIGNED_OUT" && S.mitglied) { S.mitglied = null; anmeldung(); }
    if (ev === "PASSWORD_RECOVERY") { S.recovery = true; S.mitglied = null; setTimeout(passwortNeu, 0); }
  });
  start();
})();
