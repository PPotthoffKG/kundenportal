/* Kundenportal PPotthoff
   Kundensicht: Übersicht, Berichte, Entscheidungen, Aufgaben, Anliegen, Dateien, Roadmap, Werkzeuge; Kommentare an Berichten, Aufgaben und Anliegen.
   Interner Bereich (nur Team mit Zwei-Faktor): Freigabe, Antworten, Anliegen, Dateien, Aufgaben, Roadmap, Werkzeuge, Zugänge, Protokoll.
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
  const du = () => (S.mitglied?.anrede || S.kunde?.anrede) === "du";
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
    if (/Invalid login credentials/i.test(m)) return "Mail-Adresse oder Passwort stimmen nicht. Bitte noch einmal versuchen.";
    if (/Invalid TOTP/i.test(m)) return "Der Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben.";
    if (/expired|invalid/i.test(m)) return "Der Code stimmt nicht oder ist abgelaufen. Bitte einen neuen Code anfordern.";
    if (/keinen Zugang|not allowed|Signups not allowed/i.test(m)) return "Für diese Adresse gibt es keinen Zugang. Bitte bei uns melden: kontakt@ppotthoff.io";
    if (/rate limit|security purposes|seconds/i.test(m)) return "Zu viele Versuche. Bitte kurz warten und dann noch einmal.";
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
  // Kunden: Mail-Adresse, dann sechsstelliger Code per Mail. Ein Konto entsteht nur für Adressen auf der Zugangsliste
  // (geprüft in der Datenbank). Team: wahlweise Passwort, danach immer der zweite Faktor.
  const HERO = `<section class="hero">${LOGO}
      <div><div class="label" style="color:var(--green-soft)">Kundenportal</div>
      <h1 style="margin-top:12px">Zahlen.<em>Entscheidungen.</em></h1>
      <p>Montagsbrief, Monatsauswertung, offene Entscheidungen, Aufgaben und Dateien an einem Ort.</p></div>
      <div class="klein" style="color:var(--green-soft)">Gehostet in Frankfurt am Main · Verbindung verschlüsselt</div>
    </section>`;
  const istMail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

  function anmeldung(hinweis, vorbelegt = lokal.get("portal-mail") || "") {
    document.title = "Anmelden · Kundenportal PPotthoff";
    app.innerHTML = `
      <div class="anmeldung">${HERO}
        <section class="form">
          <h2>Anmelden</h2>
          <p class="leise" style="margin:-4px 0 20px">Mail-Adresse eingeben, Code per Mail bekommen, fertig. Kein Passwort.</p>
          <form id="f" novalidate>
            <label class="feld"><span class="label">Mail-Adresse</span><input type="email" name="mail" value="${esc(vorbelegt)}" autocomplete="email" autocapitalize="none" spellcheck="false" required></label>
            <button class="btn" type="submit">Code anfordern</button>
            <div id="m">${hinweis ? `<div class="meldung ok" role="status">${esc(hinweis)}</div>` : ""}</div>
          </form>
          <p class="klein leise" style="margin-top:24px">Kein Code angekommen? Spam-Ordner ansehen oder an <a href="mailto:kontakt@ppotthoff.io">kontakt@ppotthoff.io</a> schreiben.</p>
          <p class="klein" style="margin-top:12px"><button class="text" type="button" id="team">Anmeldung fürs Team mit Passwort</button></p>
        </section>
      </div>`;
    const f = document.getElementById("f");
    (vorbelegt ? f.querySelector("button") : f.mail).focus();
    document.getElementById("team").onclick = () => teamAnmeldung(f.mail.value.trim());
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const m = document.getElementById("m");
      const mail = f.mail.value.trim().toLowerCase();
      if (!istMail(mail)) return meldung(m, "Bitte eine gültige Mail-Adresse eingeben.");
      const knopf = f.querySelector("button"); knopf.disabled = true; knopf.textContent = "Wird gesendet";
      const { error } = await sb.auth.signInWithOtp({ email: mail, options: { shouldCreateUser: true } });
      knopf.disabled = false; knopf.textContent = "Code anfordern";
      if (error) return meldung(m, fehlerText(error));
      lokal.set("portal-mail", mail);
      codeEingabe(mail);
    };
  }

  function codeEingabe(mail) {
    app.innerHTML = `
      <div class="anmeldung">${HERO}
        <section class="form">
          <h2>Code eingeben</h2>
          <p class="leise" style="margin:-4px 0 20px">Der Code ist unterwegs an <b>${esc(mail)}</b>. Er gilt zehn Minuten.</p>
          <form id="f" novalidate>
            <label class="feld"><span class="label">Sechsstelliger Code</span><input type="text" name="code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" required></label>
            <button class="btn" type="submit">Anmelden</button>
            <div id="m"></div>
          </form>
          <p class="klein" style="margin-top:24px"><button class="text" type="button" id="neu">Neuen Code anfordern</button> · <button class="text" type="button" id="andere">Andere Adresse</button></p>
        </section>
      </div>`;
    const f = document.getElementById("f");
    f.code.focus();
    // Code aus der Zwischenablage oder Autofill: bei sechs Ziffern direkt absenden
    f.code.oninput = () => { f.code.value = f.code.value.replace(/\D/g, "").slice(0, 6); if (f.code.value.length === 6) f.requestSubmit(); };
    document.getElementById("andere").onclick = () => anmeldung(null, "");
    document.getElementById("neu").onclick = async () => {
      const m = document.getElementById("m");
      const { error } = await sb.auth.signInWithOtp({ email: mail, options: { shouldCreateUser: true } });
      if (error) return meldung(m, fehlerText(error));
      meldung(m, "Ein neuer Code ist unterwegs.", "ok");
    };
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const m = document.getElementById("m");
      const code = f.code.value.replace(/\D/g, "");
      if (code.length !== 6) return meldung(m, "Bitte die sechs Ziffern aus der Mail eingeben.");
      const knopf = f.querySelector("button"); knopf.disabled = true; knopf.textContent = "Lädt";
      const { error } = await sb.auth.verifyOtp({ email: mail, token: code, type: "email" });
      knopf.disabled = false; knopf.textContent = "Anmelden";
      if (error) { f.code.value = ""; f.code.focus(); return meldung(m, fehlerText(error)); }
      await start(true);
    };
  }

  function teamAnmeldung(vorbelegt = "") {
    app.innerHTML = `
      <div class="anmeldung">${HERO}
        <section class="form">
          <h2>Team</h2>
          <form id="f" novalidate>
            <label class="feld"><span class="label">Mail-Adresse</span><input type="email" name="mail" value="${esc(vorbelegt)}" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
            <label class="feld"><span class="label">Passwort</span><input type="password" name="passwort" autocomplete="current-password" required></label>
            <button class="btn" type="submit">Anmelden</button>
            <div id="m"></div>
          </form>
          <p class="klein" style="margin-top:24px"><button class="text" type="button" id="zur">Zurück zur Anmeldung mit Code</button></p>
        </section>
      </div>`;
    const f = document.getElementById("f");
    (vorbelegt ? f.passwort : f.mail).focus();
    document.getElementById("zur").onclick = () => anmeldung();
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const m = document.getElementById("m");
      const mail = f.mail.value.trim().toLowerCase();
      if (!istMail(mail) || !f.passwort.value) return meldung(m, "Bitte Mail-Adresse und Passwort eingeben.");
      const knopf = f.querySelector("button"); knopf.disabled = true; knopf.textContent = "Lädt";
      const { error } = await sb.auth.signInWithPassword({ email: mail, password: f.passwort.value });
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
    const { data: m } = await sb.from("mitglieder").select("rolle,kunde_id,anzeigename,anrede,gesperrt_am,team_bestaetigt_am").eq("user_id", S.user.id).maybeSingle();
    if (!m) { await sb.auth.signOut(); return anmeldung("Dieser Zugang ist keinem Kunden zugeordnet. Bitte bei uns melden: kontakt@ppotthoff.io"); }
    if (m.gesperrt_am) { await sb.auth.signOut(); return anmeldung("Dieser Zugang ist gesperrt. Bitte bei uns melden: kontakt@ppotthoff.io"); }
    if (m.rolle === "team" && !m.team_bestaetigt_am) { await sb.auth.signOut(); return anmeldung("Der Team-Zugang ist noch nicht freigeschaltet. Bitte ein anderes Team-Mitglied fragen."); }
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
  const KUNDE_REITER = [["", "Übersicht"], ["berichte", "Berichte"], ["entscheidungen", "Entscheidungen"], ["aufgaben", "Aufgaben"], ["anliegen", "Anliegen"], ["dateien", "Dateien"], ["roadmap", "Roadmap"], ["werkzeuge", "Werkzeuge"]];
  const vorname = () => (S.mitglied?.anzeigename || "").trim().split(/\s+/)[0] || "";
  const ANLIEGEN_STATUS = { offen: "Offen", in_arbeit: "In Arbeit", erledigt: "Erledigt" };
  const ROADMAP_STATUS = { laeuft: "Läuft", geplant: "Geplant", erledigt: "Erledigt" };

  // ---------- Kommentare (gleich für Kunde und Team) ----------
  // Name, Rolle und Zeit setzt die Datenbank aus dem Zugang; die Oberfläche schickt nur den Text.
  async function kommentare(art, id, kundeId) {
    const { data } = await sb.from("kommentare").select("id,text,autor_name,autor_rolle,erstellt").eq("bezug_art", art).eq("bezug_id", id).order("erstellt");
    const liste = (data || []).map((k) => `<div class="kom"><div class="wer"><b>${esc(k.autor_name || "")}</b> · ${zeit(k.erstellt)}</div><div class="text">${esc(k.text)}</div></div>`).join("");
    return `<section class="abschnitt" style="margin-top:40px"><div class="abschnitt-kopf"><h2>Kommentare</h2></div>
      <div class="thread">${liste || `<p class="leise klein" style="padding:12px 0">Noch keine Kommentare.</p>`}</div>
      <form id="kf" data-art="${art}" data-id="${id}" data-kunde="${kundeId}" novalidate style="margin-top:20px;max-width:720px">
        <label class="feld"><span class="label">${t("Ihr Kommentar", "Dein Kommentar")}</span><textarea name="text" rows="3" maxlength="5000"></textarea></label>
        <button class="btn" type="submit">Senden</button><div class="m"></div></form></section>`;
  }
  function kommentarVerdrahten(danach) {
    const f = document.getElementById("kf");
    if (!f) return;
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const text = f.text.value.trim();
      if (!text) return meldung(f.querySelector(".m"), "Bitte einen Text eingeben.");
      const k = f.querySelector("button"); k.disabled = true;
      const { error } = await sb.from("kommentare").insert({ kunde_id: f.dataset.kunde, bezug_art: f.dataset.art, bezug_id: f.dataset.id, text });
      if (error) { k.disabled = false; return meldung(f.querySelector(".m"), fehlerText(error)); }
      danach();
    };
  }

  async function zaehlerKunde() {
    const [e, a] = await Promise.all([
      sb.from("entscheidungen").select("id", { count: "exact", head: true }).eq("status", "offen"),
      sb.from("aufgaben").select("id", { count: "exact", head: true }).eq("liegt_bei", "kunde").eq("erledigt", false),
    ]);
    return { entscheidungen: e.count || 0, aufgaben: a.count || 0 };
  }

  async function uebersicht() {
    const [z, b, e, a, an] = await Promise.all([
      zaehlerKunde(),
      sb.from("berichte").select("id,art,titel,zeitraum,zeitraum_start,zusammenfassung,freigegeben_am").order("zeitraum_start", { ascending: false }).limit(12),
      sb.from("entscheidungen").select("id,frage,frist,wenn_nein").eq("status", "offen").order("erstellt").limit(5),
      sb.from("aufgaben").select("id,titel,frist").eq("liegt_bei", "kunde").eq("erledigt", false).order("frist", { nullsFirst: false }).limit(5),
      sb.from("anliegen").select("id,titel,status,aktualisiert").neq("status", "erledigt").order("aktualisiert", { ascending: false }).limit(3),
    ]);
    const alle = b.data || [];
    const woche = alle.find((r) => r.art === "wochenstand");
    const monat = alle.find((r) => r.art === "monatsauswertung");
    // „Was ist los“: die Kurzfassung des neuesten Berichts, ein Satz je Zeile
    const lageQuelle = woche || monat;
    const lage = (lageQuelle?.zusammenfassung || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
    const hallo = vorname() ? `${du() ? "Hallo" : "Guten Tag"} ${esc(vorname())}, das ist gerade los.` : "Das ist gerade los.";
    const kopf = lage.length
      ? `<div class="label">Stand ${esc(lageQuelle.zeitraum)}</div><h1 style="margin-top:10px">${hallo}</h1><div class="lage">${lage.map((x) => `<p>${esc(x)}</p>`).join("")}</div>`
      : `<div class="label">Kundenportal · ${esc(S.kunde.name)}</div><h1 style="margin-top:10px">${hallo}</h1><div class="leer" style="max-width:760px"><span>Der erste Bericht liegt hier, sobald er freigegeben ist.</span></div>`;
    const wartet = [
      ...(e.data || []).map((x) => `<li><div><div class="label">Entscheidung</div><div class="titel">${esc(x.frage)}</div>${x.frist ? `<div class="unter">Frist: ${esc(x.frist)}</div>` : ""}</div><div class="aktionen"><a class="btn" href="#/entscheidungen">Entscheiden</a></div></li>`),
      ...(a.data || []).map((x) => `<li><div><div class="label">Aufgabe</div><div class="titel"><a href="#/aufgaben/${x.id}">${esc(x.titel)}</a></div><div class="unter">${x.frist ? "bis " + datum(x.frist) : t("Liegt bei Ihnen", "Liegt bei dir")}</div></div></li>`),
    ].join("");
    const neu = [
      woche ? `<li><div><div class="label">Montagsbrief</div><div class="titel">${esc(woche.zeitraum)}</div><div class="unter">freigegeben am ${datum(woche.freigegeben_am)}</div></div><div class="aktionen"><a class="btn zwei" href="#/berichte/${woche.id}">Lesen</a></div></li>` : "",
      monat ? `<li><div><div class="label">Monatsauswertung</div><div class="titel">${esc(monat.zeitraum)}</div><div class="unter">Im Browser und als PDF</div></div><div class="aktionen"><a class="btn zwei" href="#/berichte/${monat.id}">Lesen</a></div></li>` : "",
      ...(an.data || []).map((x) => `<li><div><div class="label">Anliegen · ${esc(ANLIEGEN_STATUS[x.status])}</div><div class="titel"><a href="#/anliegen/${x.id}">${esc(x.titel)}</a></div><div class="unter">zuletzt ${zeit(x.aktualisiert)}</div></div></li>`),
      `<li><div><div class="label">Anliegen</div><div class="titel">Etwas loswerden</div><div class="unter">Frage oder Auftrag direkt hier einstellen</div></div><div class="aktionen"><a class="btn" href="#/anliegen/neu">Neues Anliegen</a></div></li>`,
    ].join("");
    rahmen(`${kopf}
      <div class="zwei-spalten abschnitt" style="margin-top:48px">
        <section><div class="abschnitt-kopf"><h2>${t("Wartet auf Sie", "Wartet auf dich")}</h2></div>${wartet ? `<ul class="liste">${wartet}</ul>` : `<div class="leer">Gerade wartet nichts auf ${t("Sie", "dich")}.</div>`}</section>
        <section><div class="abschnitt-kopf"><h2>Neu für ${t("Sie", "dich")}</h2></div><ul class="liste">${neu}</ul></section>
      </div>`,
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
      <div class="bericht-rahmen"><iframe id="ber" title="${esc(r.titel)}" sandbox="allow-same-origin"></iframe></div>
      ${await kommentare("bericht", r.id, r.kunde_id)}`, reiter, intern ? "intern" : "berichte");
    kommentarVerdrahten(() => berichtAnzeigen(id, intern));
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
      rechts = `<div class="antwort"><div class="label">${t("Ihre Entscheidung", "Deine Entscheidung")}</div>
        <form data-ent="${d.id}" novalidate style="margin-top:8px">
          <fieldset style="border:0"><legend class="sr">Ja oder Nein</legend><div class="janein">
            <label><input type="radio" name="a" value="ja"> Ja</label><label><input type="radio" name="a" value="nein"> Nein</label></div></fieldset>
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
      const k = f.querySelector("button"); k.disabled = true; k.textContent = "Wird gesendet";
      const { error } = await sb.rpc("entscheidung_beantworten", { p_id: f.dataset.ent, p_antwort: a, p_kommentar: f.k.value });
      if (error) { k.disabled = false; k.textContent = "Entscheidung senden"; return meldung(m, fehlerText(error)); }
      entscheidungen();
    }));
  }

  async function aufgaben() {
    const [z, { data }] = await Promise.all([zaehlerKunde(), sb.from("aufgaben").select("*").order("frist", { nullsFirst: false })]);
    const liste = (arr) => arr.length ? `<ul class="liste">${arr.map((x) => `<li><div><div class="titel"><a href="#/aufgaben/${x.id}">${esc(x.titel)}</a></div><div class="unter">${x.frist ? "bis " + datum(x.frist) : "ohne Frist"}</div></div></li>`).join("")}</ul>` : `<div class="leer">Nichts offen.</div>`;
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

  async function aufgabeAnzeigen(id) {
    const [z, { data: x }] = await Promise.all([zaehlerKunde(), sb.from("aufgaben").select("*").eq("id", id).maybeSingle()]);
    if (!x) return rahmen(`<a class="zurueck" href="#/aufgaben">Alle Aufgaben</a><div class="leer">Diese Aufgabe gibt es nicht.</div>`, KUNDE_REITER, "aufgaben", z);
    rahmen(`<a class="zurueck" href="#/aufgaben">Alle Aufgaben</a>
      <div class="label kicker">Aufgabe · ${x.erledigt ? "erledigt" : x.liegt_bei === "kunde" ? t("liegt bei Ihnen", "liegt bei dir") : "liegt bei uns"}</div>
      <h1 style="font-size:clamp(28px,3.4vw,38px)">${esc(x.titel)}</h1>${x.frist ? `<p class="leise" style="margin-top:8px">bis ${datum(x.frist)}</p>` : ""}
      ${await kommentare("aufgabe", x.id, x.kunde_id)}`, KUNDE_REITER, "aufgaben", z);
    kommentarVerdrahten(() => aufgabeAnzeigen(id));
  }

  // ---------- Anliegen ----------
  async function anliegenSeite() {
    const [z, { data }] = await Promise.all([zaehlerKunde(), sb.from("anliegen").select("id,titel,status,erstellt_name,erstellt,aktualisiert").order("aktualisiert", { ascending: false })]);
    const zeile = (x) => `<li><div><div class="titel"><a href="#/anliegen/${x.id}">${esc(x.titel)}</a><span class="marke${x.status === "erledigt" ? " gruen" : ""}">${esc(ANLIEGEN_STATUS[x.status])}</span></div><div class="unter">${esc(x.erstellt_name || "")} · ${zeit(x.erstellt)}</div></div></li>`;
    const offen = (data || []).filter((x) => x.status !== "erledigt");
    const fertig = (data || []).filter((x) => x.status === "erledigt");
    rahmen(`<div class="label kicker">Anliegen</div><h1>Fragen und Aufträge</h1>
      <p class="lead">${t("Stellen Sie hier ein, was Sie von uns brauchen.", "Stell hier ein, was du von uns brauchst.")} Wir antworten im Anliegen, alles bleibt an einem Ort.</p>
      <p style="margin-top:24px"><a class="btn" href="#/anliegen/neu">Neues Anliegen</a></p>
      <section class="abschnitt" style="margin-top:48px"><div class="abschnitt-kopf"><h2>Offen</h2></div>${offen.length ? `<ul class="liste">${offen.map(zeile).join("")}</ul>` : `<div class="leer">Nichts offen.</div>`}</section>
      ${fertig.length ? `<section class="abschnitt"><div class="abschnitt-kopf"><h2>Erledigt</h2></div><ul class="liste">${fertig.slice(0, 30).map(zeile).join("")}</ul></section>` : ""}`,
      KUNDE_REITER, "anliegen", z);
  }

  async function anliegenNeu() {
    const z = await zaehlerKunde();
    rahmen(`<a class="zurueck" href="#/anliegen">Alle Anliegen</a><div class="label kicker">Neues Anliegen</div><h1>Worum geht es?</h1>
      <form id="af" novalidate style="max-width:720px;margin-top:32px">
        <label class="feld"><span class="label">Betreff</span><input type="text" name="titel" maxlength="200" required placeholder="z. B. Black Friday Week: machen wir mit?"></label>
        <label class="feld"><span class="label">Beschreibung</span><textarea name="text" rows="6" maxlength="10000"></textarea></label>
        <p class="klein leise" style="margin:-4px 0 16px">Dateien ${t("können Sie", "kannst du")} danach unter Dateien hochladen.</p>
        <button class="btn" type="submit">Anliegen senden</button><div class="m"></div></form>`, KUNDE_REITER, "anliegen", z);
    const f = document.getElementById("af");
    f.titel.focus();
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const titel = f.titel.value.trim();
      if (!titel) return meldung(f.querySelector(".m"), "Bitte einen Betreff eingeben.");
      const k = f.querySelector("button"); k.disabled = true; k.textContent = "Wird gesendet";
      const { data, error } = await sb.from("anliegen").insert({ kunde_id: S.kunde.id, titel, text: f.text.value.trim() || null }).select("id").single();
      if (error) { k.disabled = false; k.textContent = "Anliegen senden"; return meldung(f.querySelector(".m"), fehlerText(error)); }
      geh("anliegen/" + data.id);
    };
  }

  async function anliegenKopf(x) {
    return `<div class="label kicker">Anliegen</div><h1 style="font-size:clamp(28px,3.4vw,38px)">${esc(x.titel)}</h1>
      <div class="status">${esc(ANLIEGEN_STATUS[x.status])}</div>
      <div class="kom" style="border-top:1px solid var(--ink);margin-top:22px"><div class="wer"><b>${esc(x.erstellt_name || "")}</b> · ${zeit(x.erstellt)}</div><div class="text">${x.text ? esc(x.text) : '<span class="leise">Ohne Beschreibung</span>'}</div></div>`;
  }

  async function anliegenAnzeigen(id) {
    const [z, { data: x }] = await Promise.all([zaehlerKunde(), sb.from("anliegen").select("*").eq("id", id).maybeSingle()]);
    if (!x) return rahmen(`<a class="zurueck" href="#/anliegen">Alle Anliegen</a><div class="leer">Dieses Anliegen gibt es nicht.</div>`, KUNDE_REITER, "anliegen", z);
    rahmen(`<a class="zurueck" href="#/anliegen">Alle Anliegen</a>${await anliegenKopf(x)}${await kommentare("anliegen", x.id, x.kunde_id)}`, KUNDE_REITER, "anliegen", z);
    kommentarVerdrahten(() => anliegenAnzeigen(id));
  }

  // ---------- Roadmap ----------
  async function roadmapSeite() {
    const [z, { data }] = await Promise.all([zaehlerKunde(), sb.from("roadmap").select("*").order("reihenfolge").order("titel")]);
    const gruppe = (st) => {
      const arr = (data || []).filter((r) => r.status === st);
      return arr.length ? `<section class="abschnitt" style="margin-top:40px"><div class="abschnitt-kopf"><h2>${ROADMAP_STATUS[st]}</h2></div><ul class="liste">${arr.map((r) => `<li><div><div class="titel">${esc(r.titel)}</div>${r.beschreibung ? `<div class="unter" style="margin-top:4px">${esc(r.beschreibung)}</div>` : ""}</div><div class="aktionen leise klein">${esc(r.zeitraum || "")}</div></li>`).join("")}</ul></section>` : "";
    };
    rahmen(`<div class="label kicker">Roadmap</div><h1>Was wir gemeinsam vorhaben</h1>
      ${data?.length ? gruppe("laeuft") + gruppe("geplant") + gruppe("erledigt") : `<div class="leer" style="margin-top:32px">Die Roadmap wird gerade aufgebaut.</div>`}`,
      KUNDE_REITER, "roadmap", z);
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

  async function internAnliegen() {
    const k = S.internKunde;
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("anliegen").select("*").eq("kunde_id", k.id).order("aktualisiert", { ascending: false })]);
    rahmen(`<div class="label kicker">Interner Bereich</div><h1>Anliegen der Kunden</h1><div style="margin-top:32px">${kundenwahl()}</div>
      ${data?.length ? `<ul class="liste">${data.map((x) => `<li><div><div class="titel"><a href="#/intern/anliegen/${x.id}">${esc(x.titel)}</a><span class="marke${x.status === "offen" ? " rot" : x.status === "erledigt" ? " gruen" : ""}">${esc(ANLIEGEN_STATUS[x.status])}</span></div><div class="unter">${esc(x.erstellt_name || "")} · ${zeit(x.erstellt)} · zuletzt ${zeit(x.aktualisiert)}</div></div></li>`).join("")}</ul>` : `<div class="leer">Keine Anliegen von ${esc(k.name)}.</div>`}`,
      INTERN_REITER, "intern/anliegen", z);
    kundenwahlVerdrahten(internAnliegen);
  }

  async function internAnliegenAnzeigen(id) {
    const [z, { data: x }] = await Promise.all([zaehlerIntern(), sb.from("anliegen").select("*").eq("id", id).maybeSingle()]);
    if (!x) return rahmen(`<a class="zurueck" href="#/intern/anliegen">Alle Anliegen</a><div class="leer">Dieses Anliegen gibt es nicht.</div>`, INTERN_REITER, "intern/anliegen", z);
    const wahl = Object.entries(ANLIEGEN_STATUS).map(([w, n]) => `<option value="${w}" ${w === x.status ? "selected" : ""}>${n}</option>`).join("");
    rahmen(`<a class="zurueck" href="#/intern/anliegen">Alle Anliegen</a>${await anliegenKopf(x)}
      <div class="leiste" style="margin-top:20px"><label class="feld"><span class="label">Status ändern</span><select id="st">${wahl}</select></label></div>
      ${await kommentare("anliegen", x.id, x.kunde_id)}`, INTERN_REITER, "intern/anliegen", z);
    document.getElementById("st").onchange = async (ev) => {
      const { error } = await sb.from("anliegen").update({ status: ev.target.value, aktualisiert: new Date().toISOString() }).eq("id", id);
      if (error) return alertLeise(fehlerText(error));
      internAnliegenAnzeigen(id);
    };
    kommentarVerdrahten(() => internAnliegenAnzeigen(id));
  }

  async function internRoadmap() {
    const k = S.internKunde;
    const [z, { data }] = await Promise.all([zaehlerIntern(), sb.from("roadmap").select("*").eq("kunde_id", k.id).order("reihenfolge").order("titel")]);
    const wahl = (st) => Object.entries(ROADMAP_STATUS).map(([w, n]) => `<option value="${w}" ${w === st ? "selected" : ""}>${n}</option>`).join("");
    rahmen(`<div class="label kicker">Interner Bereich</div><h1>Roadmap</h1>
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
    rahmen(`<div class="label kicker">Interner Bereich</div><h1>Zugänge</h1>
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
        if (b === "anliegen" && c) return internAnliegenAnzeigen(c);
        return ({ entscheidungen: internEntscheidungen, anliegen: internAnliegen, dateien: internDateien, aufgaben: internAufgaben, roadmap: internRoadmap, werkzeuge: internWerkzeuge, zugaenge: internZugaenge, protokoll: internProtokoll }[b] || internBerichte)();
      }
      document.title = `${S.kunde.name} · Kundenportal PPotthoff`;
      if (a === "berichte" && b) return berichtAnzeigen(b);
      if (a === "aufgaben" && b) return aufgabeAnzeigen(b);
      if (a === "anliegen" && b === "neu") return anliegenNeu();
      if (a === "anliegen" && b) return anliegenAnzeigen(b);
      return ({ "": uebersicht, berichte, entscheidungen, aufgaben, anliegen: anliegenSeite, dateien: dateienSeite, roadmap: roadmapSeite, werkzeuge }[a] || uebersicht)();
    } catch (e) {
      alertLeise("Etwas hat nicht geladen: " + fehlerText(e));
    }
  }

  window.addEventListener("hashchange", rendern);
  sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT" && S.mitglied) { S.mitglied = null; anmeldung(); } });
  start();
})();
