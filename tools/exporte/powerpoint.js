// PowerPoint zu einem Bericht aus dem Modell (modell.py). Design PPotthoff: Grün, Creme, Tinte; Messing nur im Logo.
// Aufruf: node powerpoint.js <modell.json> <ausgabe.pptx>
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const [, , ein, aus] = process.argv;
const m = JSON.parse(fs.readFileSync(ein, "utf8"));
const LOGO = "image/png;base64," + fs.readFileSync(path.join(__dirname, "logo-negativ.png")).toString("base64");
const G = "22372D", CREME = "F5F0E6", TINTE = "211F1A", LEISE = "5A564C", ROT = "9A3B22", HELL = "9FB2A6", RAND = "DDD5C4", WEISS = "FFFFFF";
const KOPF = "Georgia", TEXT = "Arial";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pres.author = "PPotthoff"; pres.company = "PPotthoff GmbH &amp; Co. KG"; pres.title = m.titel;
pres.theme = { headFontFace: KOPF, bodyFontFace: TEXT };
const fuss = `PPotthoff · ${m.titel}${m.kunde ? " · " + m.kunde : ""}`;
pres.defineSlideMaster({ title: "Inhalt", background: { color: WEISS },
  objects: [{ text: { text: fuss, options: { x: 0.6, y: 7.0, w: 9, h: 0.3, fontFace: TEXT, fontSize: 9, color: LEISE, margin: 0 } } }],
  slideNumber: { x: 12.2, y: 7.0, w: 0.6, h: 0.3, fontFace: TEXT, fontSize: 9, color: LEISE, align: "right" } });
pres.defineSlideMaster({ title: "Titel", background: { color: G }, objects: [] });

const titel = (s, t, unter) => {
  s.addText(t, { x: 0.6, y: 0.4, w: 12.1, h: 0.8, fontFace: KOPF, fontSize: 30, color: G, margin: 0, isTextBox: true });
  if (unter) s.addText(unter, { x: 0.6, y: 1.15, w: 12.1, h: 0.35, fontFace: TEXT, fontSize: 12, color: LEISE, margin: 0, isTextBox: true });
};
const ampelFarbe = (a) => a === "Handeln" ? ROT : a === "Im Ziel" ? HELL : a === "Beobachten" ? WEISS : null;
const ampel = (s, a, x, y) => {
  if (!a) return;
  const f = ampelFarbe(a);
  s.addShape(pres.shapes.RECTANGLE, { x, y: y + 0.05, w: 0.16, h: 0.16, fill: { color: f || WEISS }, line: { color: a === "Handeln" ? ROT : a === "Im Ziel" ? G : TINTE, width: a === "Beobachten" ? 2.5 : 1 } });
  s.addText(a, { x: x + 0.24, y, w: 1.8, h: 0.26, fontFace: TEXT, fontSize: 11, bold: a === "Handeln", color: a === "Handeln" ? ROT : a === "Ohne Zielwert" || a === "ruht" ? LEISE : TINTE, margin: 0, isTextBox: true });
};

// 1 Titel
{
  const s = pres.addSlide({ masterName: "Titel" });
  s.addImage({ data: LOGO, x: 0.6, y: 0.5, h: 0.45, w: 0.45 * 616 / 120 });
  s.addText(m.titel, { x: 0.6, y: 2.6, w: 12, h: 1.2, fontFace: KOPF, fontSize: 44, color: CREME, margin: 0, isTextBox: true });
  s.addText([m.kunde, m.zeitraum].filter(Boolean).join(" · "), { x: 0.6, y: 3.8, w: 12, h: 0.5, fontFace: TEXT, fontSize: 16, color: HELL, margin: 0, isTextBox: true });
  if (m.quelle) s.addText(m.quelle, { x: 0.6, y: 6.5, w: 12, h: 0.5, fontFace: TEXT, fontSize: 10, color: HELL, margin: 0, isTextBox: true });
}

const tabelleFolien = (ueberschrift, kopf, zeilen, opt = {}) => {
  const proFolie = opt.proFolie || 12;
  for (let i = 0; i < zeilen.length; i += proFolie) {
    const s = pres.addSlide({ masterName: "Inhalt" });
    titel(s, ueberschrift + (zeilen.length > proFolie ? ` (${Math.floor(i / proFolie) + 1}/${Math.ceil(zeilen.length / proFolie)})` : ""), opt.unter);
    const rows = [kopf.map((k, j) => ({ text: k, options: { bold: true, color: WEISS, fill: { color: G }, align: j && opt.rechts !== false ? "right" : "left" } }))];
    for (const z of zeilen.slice(i, i + proFolie)) rows.push(z.map((w, j) => ({ text: String(w ?? ""), options: { align: j && opt.rechts !== false ? "right" : "left", color: TINTE } })));
    const breite = 12.1;
    s.addTable(rows, { x: 0.6, y: 1.7, w: breite, colW: opt.colW || kopf.map((_, j) => j === 0 ? breite * 0.34 : breite * 0.66 / (kopf.length - 1)),
      fontFace: TEXT, fontSize: opt.fontSize || (kopf.length > 8 ? 10 : 12), border: { type: "solid", pt: 0.5, color: RAND }, valign: "middle", margin: 0.05 });
  }
};

for (const a of m.seite1) {
  if (a.absaetze.length && !a.bereiche.length && !a.tabellen.length) {
    // Das Wichtigste / Terminnotiz-Abschnitt
    const s = pres.addSlide({ masterName: "Inhalt" });
    titel(s, a.titel);
    const lang = a.absaetze.join(" ").length > 500;
    s.addText(a.absaetze.map((p, i) => ({ text: p, options: { breakLine: i < a.absaetze.length - 1, paraSpaceAfter: 14, bullet: a.absaetze.length > 3 ? true : false } })),
      { x: 0.6, y: 1.7, w: 9.6, h: 5.0, fontFace: lang ? TEXT : KOPF, fontSize: lang ? 16 : 22, color: TINTE, valign: "top", margin: 0, isTextBox: true });
  }
  if (a.bereiche.length) {
    const handeln = a.bereiche.some((b) => b.schritt);
    const proFolie = 4;
    for (let i = 0; i < a.bereiche.length; i += proFolie) {
      const s = pres.addSlide({ masterName: "Inhalt" });
      titel(s, a.titel);
      a.bereiche.slice(i, i + proFolie).forEach((b, k) => {
        const x = 0.6 + (k % 2) * 6.15, y = 1.7 + Math.floor(k / 2) * 2.6;
        s.addShape(pres.shapes.RECTANGLE, { x, y, w: 5.95, h: 2.4, fill: { color: k % 3 === 0 ? CREME : CREME }, line: { color: RAND, width: 0.75 } });
        s.addText(b.name, { x: x + 0.25, y: y + 0.2, w: 3.6, h: 0.35, fontFace: TEXT, fontSize: 14, bold: true, color: TINTE, margin: 0, isTextBox: true });
        ampel(s, b.ampel, x + 3.9, y + 0.24);
        s.addText(b.satz, { x: x + 0.25, y: y + 0.65, w: 5.45, h: handeln && b.schritt ? 1.0 : 1.55, fontFace: TEXT, fontSize: 12, color: TINTE, valign: "top", margin: 0, isTextBox: true, fit: "shrink" });
        if (b.schritt) s.addText([{ text: "Nächster Schritt: ", options: { bold: true } }, { text: b.schritt }], { x: x + 0.25, y: y + 1.7, w: 5.45, h: 0.6, fontFace: TEXT, fontSize: 11, color: LEISE, valign: "top", margin: 0, isTextBox: true });
      });
    }
  }
  for (const t of a.tabellen) tabelleFolien(t.titel === a.titel ? a.titel : t.titel, t.kopf, t.zeilen, { fontSize: 11, proFolie: 9 });
}

// Alle Werte
for (const a of m.alle) {
  if (a.werte.length) {
    tabelleFolien(a.titel, ["Kennzahl", "Ampel", "Wert", "Vergleich"], a.werte.map((w) => [w.name, w.ampel, w.wert, w.vergleich]),
      { proFolie: 7, rechts: false, fontSize: 10, colW: [3.4, 1.4, 1.8, 5.5], unter: "Alle Werte" });
  }
  if (a.absaetze.length && !a.werte.length && !a.tabellen.length) {
    const s = pres.addSlide({ masterName: "Inhalt" }); titel(s, a.titel);
    s.addText(a.absaetze.map((p, i) => ({ text: p, options: { bullet: true, breakLine: i < a.absaetze.length - 1, paraSpaceAfter: 8 } })), { x: 0.6, y: 1.7, w: 12, h: 5, fontFace: TEXT, fontSize: 14, color: TINTE, valign: "top", margin: 0, isTextBox: true });
  }
  for (const t of a.tabellen) {
    const verlauf = t.kopf[0] === "Monat" && t.kopf.includes("Umsatz");
    if (verlauf) {
      // Diagramm: Umsatz je Monat, Teil aus Werbung (ältester Monat links)
      const z = [...t.zeilen].reverse();
      const num = (s) => { const v = parseFloat(String(s).replace(/[^\d,−-]/g, "").replace(/\./g, "").replace(",", ".").replace("−", "-")); return isNaN(v) ? 0 : v; };
      const iU = t.kopf.indexOf("Umsatz"), iW = t.kopf.indexOf("Werbung");
      const s = pres.addSlide({ masterName: "Inhalt" });
      titel(s, t.titel, "Umsatz je Monat, dunkel der Teil aus Werbung");
      s.addChart(pres.charts.BAR, [
        { name: "aus Werbung", labels: z.map((r) => r[0]), values: z.map((r) => iW >= 0 ? num(r[iW]) : 0) },
        { name: "übriger Umsatz", labels: z.map((r) => r[0]), values: z.map((r) => Math.max(0, num(r[iU]) - (iW >= 0 ? num(r[iW]) : 0))) },
      ], { x: 0.6, y: 1.7, w: 12.1, h: 5.0, barDir: "col", barGrouping: "stacked", chartColors: [G, HELL], showLegend: true, legendPos: "b", legendFontFace: "+mn-lt", legendFontSize: 10,
        catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", catAxisLabelFontSize: 9, valAxisLabelFontSize: 9, catAxisLabelColor: LEISE, valAxisLabelColor: LEISE,
        valAxisLabelFormatCode: '#,##0 "€"', valGridLine: { color: "E6E0D2", size: 0.5 }, catGridLine: { style: "none" } });
    }
    tabelleFolien(t.titel, t.kopf, t.zeilen, { proFolie: 12, unter: verlauf ? "Werte je Monat" : "" });
  }
}

pres.writeFile({ fileName: aus }).then((f) => console.log(f));
