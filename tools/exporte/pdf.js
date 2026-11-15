// PDF zu einem Bericht: Seite 1 und „Alle Werte“ hintereinander auf A4, mit Titelzeile oben.
// Aufruf: node pdf.js <seite1.html> <alle-werte.html|-> <ausgabe.pdf> "<Titel>" "<Kunde · Zeitraum>"
const fs = require("fs");
const { chromium } = require("playwright");
const [, , s1, aw, aus, titel, unter] = process.argv;
const roh = fs.readFileSync(s1, "utf8");
const kopf = roh.split("<body")[0];
const koerper = (h) => h.split(/<body[^>]*>/)[1].split("</body>")[0];
const esc = (t) => String(t || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const zusatz = `<style>@page{size:A4;margin:14mm 14mm 16mm}body{padding:0!important;margin:0!important;background:#fff}
.pdfkopf{border-bottom:1px solid #211f1a;padding-bottom:8pt;margin-bottom:14pt}.pdfkopf .m{font:400 9pt Arial,sans-serif;color:#5a564c;letter-spacing:.02em}
.pdfkopf h1{font-family:Newsreader,Georgia,serif;font-weight:300;font-size:22pt;margin:2pt 0 0;color:#22372d}.pdfkopf .u{font:400 10pt Arial,sans-serif;color:#5a564c;margin-top:2pt}
.neu{break-before:page}table,tr,.bereich,li{break-inside:avoid}h2,h3{break-after:avoid}.druckkopf{display:block!important}</style>`;
let html = kopf.replace("</head>", zusatz + "</head>") + `<body><div class="pdfkopf"><div class="m">PPotthoff</div><h1>${esc(titel)}</h1><div class="u">${esc(unter)}</div></div>` + koerper(roh);
if (aw && aw !== "-" && fs.existsSync(aw)) html += `<div class="neu"><div class="pdfkopf"><div class="m">PPotthoff</div><h1>Alle Werte</h1><div class="u">${esc(titel)} · ${esc(unter)}</div></div>${koerper(fs.readFileSync(aw, "utf8"))}</div>`;
html += "</body></html>";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(html, { waitUntil: "load" });
  await p.emulateMedia({ media: "print" });
  await p.pdf({ path: aus, format: "A4", printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: "<span></span>",
    footerTemplate: `<div style="font:8px Arial;color:#5a564c;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>PPotthoff · ${esc(titel)} · Fragen: kontakt@patrickpotthoff.de</span><span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>` });
  await b.close();
  console.log(aus);
})();
