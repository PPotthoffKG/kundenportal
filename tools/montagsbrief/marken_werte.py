"""Zahlen je Marke aus der Datenquelle des Looker-Studio-Berichts (Google Sheet, Blatt „Looker“) fürs Kundenportal.

Aufruf: python3 marken_werte.py <looker.tsv> <monat JJ-MM> <alle-werte.html>
Hängt den Abschnitt „Zahlen je Marke“ vor die Quelle der Seite „Alle Werte“ einer Monatsauswertung.
TSV mit Kopfzeile: Marke Monat organisch werbeumsatz gesamt sitzungen cvr buybox werbeausgaben acos realer_acos cpc ctr gesamt_sc budget
Werte so, wie sie im Sheet stehen (deutsches Zahlenformat). Leere oder fehlerhafte Zellen (#DIV/0!) bleiben leer.
"""
import sys, html

FELDER = "Marke Monat organisch werbeumsatz gesamt sitzungen cvr buybox werbeausgaben acos realer_acos cpc ctr gesamt_sc budget".split()
MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]
NAME = {"PEDIAKID": "Pediakid", "Wachters": "Wachters"}
e = html.escape

def zahl(s):
    s = (s or "").replace("€", "").strip()
    if not s or s.startswith("#"):
        return None
    try:
        return float(s.replace(".", "").replace(",", "."))
    except ValueError:
        return None

def fmt(n, dec=0):
    return f"{n:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")

def eur(n): return "" if n is None else fmt(n) + " €"
def ganz(n): return "" if n is None else fmt(n)
def proz(n, dec=1): return "" if n is None else fmt(n * 100, dec) + " %"
def ct(n): return "" if n is None else fmt(n, 2) + " €"
def monat(m):  # "26-10" -> "Oktober 2026"
    j, mm = m.split("-"); return f"{MONATE[int(mm) - 1]} 20{j}"
def kurz(m):
    j, mm = m.split("-"); return f"{MONATE[int(mm) - 1][:3]} {j}"

def lies(p):
    zeilen = open(p, encoding="utf-8").read().splitlines()[1:]
    daten = []
    for z in zeilen:
        t = z.split("\t")
        if len(t) == 14:  # fehlende leere Zelle vor gesamt_sc
            t = t[:13] + [""] + t[13:] if not t[13] else t + [""]
        t += [""] * (15 - len(t))
        daten.append(dict(zip(FELDER, t)))
    return daten

def balken(reihe):
    """Kleines Säulendiagramm: Umsatz je Monat, unten der Anteil aus Werbung. Grün, kein Messing."""
    werte = [(r["Monat"], zahl(r["gesamt"]) or 0, zahl(r["werbeumsatz"]) or 0) for r in reihe]
    if not werte or max(w[1] for w in werte) <= 0:
        return ""
    hoch, b, l = 120, 20, len(werte)
    breite = l * b
    mx = max(w[1] for w in werte)
    s = [f'<svg viewBox="0 0 {breite} {hoch + 18}" role="img" aria-label="Umsatz je Monat, dunkel der Teil aus Werbung" style="width:100%;max-width:{max(breite, 320)}px;height:auto;display:block;margin:12px 0">']
    for i, (m, g, w) in enumerate(werte):
        hg = g / mx * hoch; hw = min(w, g) / mx * hoch if g > 0 else 0
        x = i * b + 3
        s.append(f'<rect x="{x}" y="{hoch - hg:.1f}" width="{b - 6}" height="{hg:.1f}" fill="#9fb2a6"><title>{e(kurz(m))}: {eur(g)}</title></rect>')
        s.append(f'<rect x="{x}" y="{hoch - hw:.1f}" width="{b - 6}" height="{hw:.1f}" fill="#22372d"/>')
        if i % 3 == 0 or i == l - 1:
            s.append(f'<text x="{x + (b - 6) / 2}" y="{hoch + 13}" font-size="8" text-anchor="middle" fill="#5a564c">{e(kurz(m))}</text>')
    s.append("</svg>")
    return "".join(s)

def abschnitt(daten, ziel):
    vm = None
    marken = list(dict.fromkeys(r["Marke"] for r in daten))
    akt = {r["Marke"]: r for r in daten if r["Monat"] == ziel}
    j, mm = ziel.split("-"); mm = int(mm)
    vor = f"{j}-{mm - 1:02d}" if mm > 1 else f"{int(j) - 1}-12"
    vj = f"{int(j) - 1}-{mm:02d}"
    alt = {(r["Marke"], r["Monat"]): r for r in daten}
    h = [f'<h2>Zahlen je Marke</h2><p class="absatz" style="margin-top:16px">Dieselben Werte wie im Looker-Studio-Bericht, {e(monat(ziel))} mit Vormonat und Vorjahresmonat, darunter der Verlauf je Marke.</p>']
    h.append('<table class="t"><thead><tr><th>Marke</th><th class="r">Umsatz</th><th class="r">Vormonat</th><th class="r">Vorjahr</th><th class="r">Werbung</th><th class="r">Besuche</th><th class="r">Buy Box</th><th class="r">Werbe&shy;kosten</th><th class="r">am Umsatz</th></tr></thead><tbody>')
    for m in marken:
        r = akt.get(m)
        if not r or zahl(r["gesamt"]) is None:
            continue
        pv, pj = alt.get((m, vor)), alt.get((m, vj))
        h.append(f'<tr><td>{e(NAME.get(m, m))}</td><td class="r" data-k="Umsatz">{eur(zahl(r["gesamt"]))}</td><td class="r" data-k="Vormonat">{eur(zahl(pv["gesamt"])) if pv else ""}</td>'
                 f'<td class="r" data-k="Vorjahr">{(eur(zahl(pj["gesamt"])) or "–") if pj else "–"}</td><td class="r" data-k="davon Werbung">{eur(zahl(r["werbeumsatz"]))}</td>'
                 f'<td class="r" data-k="Besuche">{ganz(zahl(r["sitzungen"]))}</td><td class="r" data-k="Buy-Box-Anteil">{proz(zahl(r["buybox"]), 0)}</td>'
                 f'<td class="r" data-k="Werbekosten">{eur(zahl(r["werbeausgaben"]))}</td><td class="r" data-k="Werbekosten am Umsatz">{proz(zahl(r["realer_acos"]))}</td></tr>')
    h.append("</tbody></table>")
    sc = {r["Monat"]: zahl(r["gesamt_sc"]) for r in daten if r["Marke"] == marken[0]}
    if sc.get(ziel):
        h.append(f'<p class="quelle">Umsatz aller Artikel im Konto laut Seller Central, {e(monat(ziel))}: {eur(sc[ziel])}.</p>')
    for m in marken:
        reihe = [r for r in daten if r["Marke"] == m and zahl(r["gesamt"]) is not None and r["Monat"] <= ziel]
        if not reihe:
            continue
        h.append(f'<h3>{e(NAME.get(m, m))}</h3>{balken(reihe)}<p class="quelle" style="margin-top:0">Hell: Umsatz gesamt. Dunkel: Teil aus Werbung.</p>')
        h.append('<div style="overflow-x:auto"><table class="t"><thead><tr><th>Monat</th><th class="r">Umsatz</th><th class="r">Werbung</th><th class="r">Besuche</th><th class="r">Pack. je 100 Besuche</th><th class="r">Buy Box</th><th class="r">Werbe&shy;kosten</th><th class="r">am Werbe&shy;umsatz</th><th class="r">am Umsatz</th><th class="r">je Klick</th><th class="r">Klick&shy;rate</th><th class="r">Budget</th></tr></thead><tbody>')
        for r in reversed(reihe):
            cvr = zahl(r["cvr"])
            h.append(f'<tr><td>{e(kurz(r["Monat"]))}</td><td class="r" data-k="Umsatz">{eur(zahl(r["gesamt"]))}</td><td class="r" data-k="davon Werbung">{eur(zahl(r["werbeumsatz"]))}</td>'
                     f'<td class="r" data-k="Besuche">{ganz(zahl(r["sitzungen"]))}</td><td class="r" data-k="Packungen je 100 Besuche">{"" if cvr is None else fmt(cvr * 100, 1)}</td>'
                     f'<td class="r" data-k="Buy-Box-Anteil">{proz(zahl(r["buybox"]), 0)}</td><td class="r" data-k="Werbekosten">{eur(zahl(r["werbeausgaben"]))}</td>'
                     f'<td class="r" data-k="Werbekosten am Werbeumsatz">{proz(zahl(r["acos"]))}</td><td class="r" data-k="Werbekosten am Umsatz">{proz(zahl(r["realer_acos"]))}</td>'
                     f'<td class="r" data-k="Preis je Klick">{ct(zahl(r["cpc"]))}</td><td class="r" data-k="Klickrate">{proz(zahl(r["ctr"]), 2)}</td><td class="r" data-k="Budget">{eur(zahl(r["budget"]))}</td></tr>')
        h.append("</tbody></table></div>")
    h.append('<p class="quelle">Werbe&shy;kosten „am Werbeumsatz“ und „am Umsatz“: Anteil der Werbekosten am Umsatz aus Werbung bzw. am gesamten Umsatz der Marke.</p>')
    h.append('<p class="quelle">Quelle: Datenblatt des Looker-Studio-Berichts (Seller Central und Werbekonsole, monatlich übertragen). Leere Felder: kein Wert im Datenblatt.</p>')
    return "".join(h)

if __name__ == "__main__":
    tsv, ziel, seite = sys.argv[1:4]
    teil = abschnitt(lies(tsv), ziel)
    s = open(seite, encoding="utf-8").read()
    marke = '<h2>Was in diesem Monat fehlt</h2>'
    s = s.replace(marke, teil + marke, 1) if marke in s else s.replace("</body>", teil + "</body>", 1)
    open(seite, "w", encoding="utf-8").write(s)
    print("Zahlen je Marke eingefügt:", seite)
