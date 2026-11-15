"""Montagsbrief fürs Kundenportal (G4 „Der Rahmen für Berichte“).

Aufruf: python3 wochenstand_portal.py <daten.json> <ausgabeordner> [Kundenname]

Schreibt in den Ausgabeordner:
  seite1.html          Das Wichtigste der Woche, Zum Handeln, die übrigen Bereiche
  alle-werte.html      alle Werte und Tabellen nach Bereichen
  zusammenfassung.txt  höchstens drei Sätze, ein Satz je Zeile (Übersicht im Portal)

Beide Seiten ohne JavaScript, ohne <details>, ohne Kopf, Logo, Kacheln und Fußzeile:
Titel, Zeitraum und Rahmen stellt das Portal. Der Bericht steht dort per srcdoc in einem
iframe ohne Zugriff auf portal.css. Darum ist das CSS (Abschrift aus portal.css, Abschnitt
„Papier“, .bereich, .werte, .ampel, table.t, .quelle, .druckkopf) eingebettet, die
Schriften als data-URL.

Optionale Felder in den Daten:
  vorlaeufig: true                         -> Hinweis, dass die Sonntagswerte vorläufig sind
  zusammenfassung.saetze: [..]             -> fertige Sätze für oben (sonst die ersten drei aus .gesamt)
  zusammenfassung.schritte: {Bereich: ..}  -> nächster Schritt je Bereich unter „Zum Handeln“
  werbung_ruht: true                       -> Werbung ruht (sonst erkannt an Ausgaben 0)
"""
import os, re, sys, json, html

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import theme as T

e = html.escape

# ---------------------------------------------------------------- Wörter
# Wörterliste (G4): Begriffe aus Seller Central und Werbekonsole, die im Kundentext ersetzt
# werden. Reihenfolge zählt (längere Begriffe zuerst).
WOERTER = [
    (r"Bewertung der Verkäuferleistung", "Kontozustand"),
    (r"Bestellungen \(Bestellposten\)", "Bestellungen"),
    (r"Conversion \(Einheiten pro Sitzung\)", "Verkaufte Packungen je 100 Besuche"),
    (r"[Dd]ie Conversion liegt bei ([\d.,]+) ?%", r"auf 100 Besuche kamen \1 verkaufte Packungen"),
    (r"\bConversion\b", "verkaufte Packungen je 100 Besuche"),
    (r"\bTACoS\b", "Werbekosten am Umsatz"),
    (r"\bACoS\b", "Werbekosten am Werbeumsatz"),
    (r",?\s*\bROAS\b:? ?[\d.,]+", ""),
    (r"\bCTR\b", "Klickrate"),
    (r"\bCPC\b", "Kosten je Klick"),
    (r"\bSitzungen\b", "Besuche"),
    (r"\bSitzung\b", "Besuch"),
    (r"\bEinheiten\b", "Packungen"),
    (r"\bEinheit\b", "Packung"),
    (r"\bEinh\.", "Packungen"),
    (r"\bSKUs\b", "Artikel"),
    (r"\bSKU\b", "Artikel"),
    (r"\s*\(LBI\)", ""),
    (r"\bN/A\b", "nicht angezeigt"),
    (r"„Füllen Sie (\d+) Artikel noch heute auf“", r"Amazon empfiehlt, \1 Artikel sofort aufzufüllen"),
]
# Kennzahlen, die im Kundentext nicht erscheinen.
WEGLASSEN = {"ROAS"}
# Amazons Hochrechnungen zu gefährdeten oder entgangenen Verkäufen stehen nie im Kundentext.
VERBOTEN = re.compile(r"gefährdet|entgangen", re.I)


def wort(s):
    s = "" if s is None else str(s)
    for a, b in WOERTER:
        s = re.sub(a, b, s)
    return s


def ohne_hochrechnung(s):
    """Entfernt Satzteile, die gefährdete oder entgangene Verkäufe samt Beträgen nennen."""
    if not s or not VERBOTEN.search(s):
        return s
    ende = "." if s.rstrip().endswith(".") else ""
    s = re.sub(r"\s*\([^()]*\)", lambda m: "" if VERBOTEN.search(m.group(0)) else m.group(0), s)
    for trenn in (". ", " · ", "; ", ", "):
        teile = s.split(trenn)
        s = trenn.join(t for t in teile if not VERBOTEN.search(t))
    if VERBOTEN.search(s):
        return ""
    s = s.strip(" ;,·.")
    return s + ende if s else ""


def txt(s):
    return ohne_hochrechnung(wort(s)).strip()


# ---------------------------------------------------------------- Daten
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
if len(ARGS) < 2:
    sys.exit(__doc__)
SRC, OUTD = ARGS[0], ARGS[1]
D = json.load(open(SRC, encoding="utf-8"))
KUNDE = ARGS[2] if len(ARGS) > 2 else D.get("konto", "")
MELDUNGEN = []

BEREICHE = ["Konto", "Katalog", "Verkauf", "Werbung", "Lager", "Marke", "Zahlungen", "Fristen"]
TITEL = {"Konto": "Konto", "Verkauf": "Verkauf und Besuche", "Werbung": "Werbung", "Lager": "Lager und Versand durch Amazon",
         "Katalog": "Katalog und Angebote", "Marke": "Marke und Markt", "Zahlungen": "Zahlungen und Gebühren", "Fristen": "Fristen"}
RANG = {"r": 3, "y": 2, "g": 1, "": 0}
WORT = {"r": "Handeln", "y": "Beobachten", "g": "Im Ziel", "": "Ohne Zielwert"}

KZ = [k for k in (D.get("kennzahlen") or []) if isinstance(k, dict) and k.get("name") not in WEGLASSEN]
for k in KZ:
    if k.get("ampel") not in RANG:
        k["ampel"] = ""
alle_b = BEREICHE + [b for b in dict.fromkeys(k.get("bereich") for k in KZ) if b and b not in BEREICHE]
GRUPPEN = {b: [k for k in KZ if k.get("bereich") == b] for b in alle_b}
schlimmste = lambda ks: max((k["ampel"] for k in ks), key=lambda a: RANG[a], default="")
ZF = D.get("zusammenfassung") or {}
SCHRITTE = ZF.get("schritte") or D.get("naechster_schritt") or {}
W = D.get("woche") or {}

dat = lambda iso: f"{iso[8:10]}.{iso[5:7]}.{iso[0:4]}" if iso and len(iso) >= 10 else (iso or "")
num = lambda x: x if isinstance(x, (int, float)) and not isinstance(x, bool) else None
eur = lambda x: (T.fmt(x, 0 if abs(x) >= 100 else 2) + " €") if num(x) is not None else e(str(x or ""))
pct = lambda x: (T.fmt(x, 1) + " %") if num(x) is not None else e(str(x or ""))
ganz = lambda x: T.fmt(x) if num(x) is not None else e(str(x or ""))


def zahl_de(s):
    """„4.993,78 €“ -> 4993.78; None, wenn keine Zahl darin steht."""
    m = re.search(r"-?[\d.]*\d(,\d+)?", str(s or ""))
    return float(m.group(0).replace(".", "").replace(",", ".")) if m else None


def werbung_ruht():
    if D.get("werbung_ruht") is True:
        return True
    aus = next((k for k in GRUPPEN.get("Werbung", []) if k.get("name", "").lower().startswith("ausgaben")), None)
    return aus is not None and zahl_de(aus.get("wert")) == 0


RUHT = werbung_ruht()


def stufe(b):
    """Ampel eines Bereichs; Werbung, die ruht, hat keine Ampel."""
    return "" if (b == "Werbung" and RUHT) else schlimmste(GRUPPEN.get(b) or [])


def ampel(a, wort_=None):
    return f'<span class="ampel {a or "n"}">{e(wort_ or WORT[a])}</span>'


def bereich_ampel(b):
    return ampel("", "ruht") if (b == "Werbung" and RUHT) else ampel(stufe(b))


def saetze():
    s = ZF.get("saetze") or ZF.get("gesamt") or []
    out = [x for x in (txt(x) for x in s) if x]
    return out[:3]


def kurzname(k):
    n = k.get("kachel_name") if k.get("leit") and k.get("kachel_name") else k.get("name")
    return re.sub(r"\s*\([^()]*\)", "", txt(n)).strip()


def beginnt_mit_grund(satz, rote):
    """Grob: nennt der erste Satzteil eine rote Kennzahl (Wert, Namenswort oder Zahl aus dem Vergleich)?"""
    teile = re.split(r"[,;:]\s|\.\s", satz)
    erst = teile[0]
    if len(erst.split()) <= 2 and not re.search(r"\d", erst) and len(teile) > 1:
        erst += " " + teile[1]  # „Amazon empfiehlt, 37 Artikel …“
    erst_l = erst.lower()
    for k in rote:
        w = txt(k.get("wert"))
        if w and w in erst:
            return True
        for t in re.findall(r"[a-zäöüß]{5,}", re.sub(r"\([^()]*\)", "", txt(k.get("name"))).lower()):
            if t in erst_l:
                return True
        for z in re.findall(r"\d[\d.,]*\d", txt(k.get("vergleich"))):
            if re.search(r"(?<![\d.,])" + re.escape(z) + r"(?![\d,]|\.\d)", erst):
                return True
    return False


def bereich_satz(b):
    s = ZF.get(b)
    if isinstance(s, list):
        s = " ".join(s)
    s = txt(s or "")
    ks = GRUPPEN.get(b) or []
    if not s:
        lead = next((k for k in ks if k.get("leit")), ks[0] if ks else None)
        s = f'{kurzname(lead)}: {txt(lead.get("wert"))}.' if lead else ""
    if stufe(b) == "r" and s:
        rote = [k for k in ks if k["ampel"] == "r"]
        if not beginnt_mit_grund(s, rote):
            k = next((k for k in rote if k.get("leit")), rote[0])
            neu = f'{kurzname(k)}: {txt(k.get("wert"))}. {s}'
            MELDUNGEN.append(f"Satzregel {b}: Grund für Rot nach vorn gezogen -> „{neu}“")
            s = neu
    return s


# ---------------------------------------------------------------- Bausteine
def vergleich(k):
    v = txt(k.get("vergleich"))
    ziel = txt(k.get("ziel"))
    zusatz = ""
    if k["ampel"] and not ziel:
        zusatz = "Schwelle: unser Vorschlag"
    elif ziel and not ziel.lower().startswith("kein"):
        zusatz = f"Grenze laut Amazon: {ziel}"
    return " · ".join(x for x in (v, zusatz) if x)


def wert_text(k):
    w = txt(k.get("wert"))
    if (k.get("name") or "").startswith("Conversion"):
        w = re.sub(r"\s*%$", "", w)  # Packungen je 100 Besuche, ohne Prozentzeichen
    return w


def werte_liste(zeilen):
    """zeilen: [(name, ampel_html, wert, vergleich)]"""
    li = ""
    for n, a, w, v in zeilen:
        lang = " lang" if len(w) > 16 else ""
        li += (f'<li><span class="n">{e(n)}{a}</span><span class="w{lang}">{e(w)}</span>'
               f'{f"<span class=v>{e(v)}</span>" if v else ""}</li>')
    return f'<ul class="werte">{li}</ul>' if li else ""


def werte(ks, b):
    z = []
    for k in ks:
        a = k["ampel"]
        if b == "Werbung" and RUHT:
            a = ""
        z.append((txt(k.get("name")), ampel(a) if a else "", wert_text(k), vergleich(k)))
    return werte_liste(z)


def tabelle(titel, kopf, zeilen, note=""):
    """kopf: [(Spalte, Klasse)]; zeilen: [{"zellen": [html], "cls": ""}]. Am Handy Blöcke mit „Spalte: Wert“."""
    th = "".join(f'<th class="{c}" scope="col">{e(h)}</th>' for h, c in kopf)
    body = ""
    for z in zeilen:
        tds = "".join(f'<td class="{c}" data-k="{e(h)}">{v}</td>' for (h, c), v in zip(kopf, z["zellen"]))
        cls = f' class="{z["cls"]}"' if z.get("cls") else ""
        body += f"<tr{cls}>{tds}</tr>"
    n = f'<p class="note">{e(note)}</p>' if note else ""
    return f'<h3>{e(titel)}</h3><table class="t"><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>{n}'


def artikel(x):
    asin = f'<span class="asin">{e(str(x.get("asin", "")))}</span>' if x.get("asin") else ""
    return f'{e(txt(x.get("titel")))}{asin}'


def tab_artikel():
    a = D.get("artikel_top") or []
    if not a:
        return ""
    z = [{"zellen": [artikel(x), eur(x.get("umsatz")), ganz(x.get("einheiten")), ganz(x.get("sitzungen", x.get("besuche"))),
                     pct(x.get("buybox"))]} for x in a]
    return tabelle("Top 10 Artikel nach Umsatz", [("Artikel", ""), ("Umsatz", "r"), ("Packungen", "r"), ("Besuche", "r"), ("Buy Box", "r")], z,
                   "Buy Box: Anteil der Besuche, in denen euer Angebot vorne stand.")


def bewegung():
    out = ""
    for key, titel in (("gewinner", "Mehr Umsatz als in der Vorwoche"), ("verlierer", "Weniger Umsatz als in der Vorwoche")):
        xs = D.get(key) or []
        if not xs:
            continue
        z = []
        for x in xs:
            u, p = num(x.get("umsatz")) or 0, num(x.get("vorwoche")) or 0
            d = u - p
            z.append((txt(x.get("titel")), "", ("+" if d >= 0 else "−") + eur(abs(d)), f"Vorwoche {eur(p)} · diese Woche {eur(u)}"))
        out += f"<h3>{titel}</h3>" + werte_liste(z)
    return out


def tab_reichweite():
    r = D.get("reichweite") or []
    if not r:
        return ""
    def reicht(w):
        return (T.fmt(w, 1) + " Wochen") if num(w) is not None else e(str(w or ""))
    z = [{"zellen": [artikel(x), ganz(x.get("bestand")), ganz(x.get("einheiten_woche")), reicht(x.get("wochen"))],
          "cls": "knapp" if num(x.get("wochen")) is not None and x["wochen"] < 2 else ""} for x in r]
    return tabelle("Reichweite der Top-Artikel", [("Artikel", ""), ("Bestand", "r"), ("Verkauft je Woche", "r"), ("Reicht für", "r")], z,
                   "Gerechnet: Bestand geteilt durch die verkauften Packungen der Woche. Hervorgehoben: reicht weniger als zwei Wochen (unser Vorschlag).")


def tab_suche():
    s = D.get("suchbegriffe") or []
    if not s:
        return ""
    z = [{"zellen": [e(txt(x.get("begriff"))), ganz(x.get("volumen")), pct(x.get("impr_anteil")), pct(x.get("klick_anteil")),
                     pct(x.get("kauf_anteil"))]} for x in s]
    return tabelle("Suchbegriffe: euer Anteil", [("Suchbegriff", ""), ("Suchanfragen", "r"), ("Anteil Anzeigen", "r"), ("Anteil Klicks", "r"),
                                                 ("Anteil Käufe", "r")], z,
                   "Anteil: wie viel von allen Einblendungen, Klicks und Käufen zu diesem Suchbegriff auf eure Artikel fiel.")


def liste(titel, xs):
    xs = [x for x in (txt(x) for x in xs) if x]
    return f'<h3>{titel}</h3><ul class="punkte">{"".join(f"<li>{e(x)}</li>" for x in xs)}</ul>' if xs else ""


ZUSATZ = {"Verkauf": [tab_artikel, bewegung], "Lager": [tab_reichweite], "Marke": [tab_suche]}

# ---------------------------------------------------------------- Stil
# Abschrift aus portal.css (G4): :root, Grundregeln, Papier, .bereich, .werte, .ampel, table.t, .quelle, .druckkopf.
CSS = T.FONTS + """
:root{--surface:#f5f0e6;--surface-2:#ede6d6;--paper:#fff;--ink:#211f1a;--ink-soft:#5a564c;
--green:#22372d;--green-2:#2c4538;--on-green:#f5f0e6;--green-soft:#9fb2a6;--rule:#ddd5c4;--critical:#9a3b22;
--serif:'Newsreader',Georgia,serif;--sans:'Schibsted Grotesk',Arial,sans-serif;
--t-fein:13px;--t-neben:15px;--t-text:17px;--t-h3:20px;--t-lage:23px;--t-zahl:24px;--t-h2:30px;
--s1:4px;--s2:8px;--s3:12px;--s4:16px;--s6:24px;--s8:32px;--s12:48px;--lesebreite:640px}
@media (max-width:700px){:root{--t-lage:18.5px;--t-zahl:21px;--t-h2:25px}}
*{box-sizing:border-box;margin:0;padding:0;border-radius:0}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fff;padding:32px;color:var(--ink);font:400 var(--t-text)/1.55 var(--sans);-webkit-font-smoothing:antialiased;overflow-wrap:break-word}
b,strong{font-weight:600}
h2{font:400 var(--t-zahl)/1.15 var(--serif);padding-bottom:var(--s3);border-bottom:1px solid var(--ink);margin-top:var(--s8)}
h2:first-child{margin-top:0}
h3{font:600 var(--t-neben)/1.35 var(--sans);margin:var(--s6) 0 var(--s2)}
.lage{max-width:var(--lesebreite);margin-top:var(--s4)}
.lage p{font:300 var(--t-lage)/1.42 var(--serif);margin-bottom:var(--s3)}
.lage b{font-weight:400}
.bereich{padding:var(--s4) 0;border-bottom:1px solid var(--rule);display:grid;grid-template-columns:220px minmax(0,1fr);column-gap:var(--s6)}
.bereich .kopfz{display:flex;flex-direction:column;gap:var(--s1);font-weight:600}
.bereich .schritt{font-size:var(--t-neben);margin-top:var(--s1)}
.werte{list-style:none}
.werte li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0 var(--s6);align-items:baseline;border-bottom:1px solid var(--rule);padding:var(--s3) 0}
.werte .n{display:flex;flex-wrap:wrap;gap:var(--s1) var(--s3);align-items:center;font-weight:600;font-size:var(--t-neben);min-width:0}
.werte .w{font:400 var(--t-zahl)/1.15 var(--serif);text-align:right;white-space:nowrap}
.werte .w.lang{font:600 var(--t-neben)/1.3 var(--sans);white-space:normal;max-width:240px}
.werte .v{grid-column:1/-1;font-size:var(--t-fein);color:var(--ink-soft);overflow-wrap:anywhere}
.ampel{display:inline-flex;align-items:center;gap:var(--s2);font-size:var(--t-neben);font-weight:600;white-space:nowrap}
.ampel::before{content:"";width:12px;height:12px;flex:none;border:1px solid var(--ink-soft)}
.ampel.r{color:var(--critical)} .ampel.r::before{background:var(--critical);border-color:var(--critical)}
.ampel.y::before{background:var(--paper);border:3px solid var(--ink)}
.ampel.g::before{background:var(--green-soft);border-color:var(--green)}
.ampel.n{font-weight:400;color:var(--ink-soft)}
table.t{border-collapse:collapse;width:100%;font-size:var(--t-neben)}
table.t th{text-align:left;font-weight:400;font-size:var(--t-fein);color:var(--ink-soft);padding:0 var(--s3) var(--s2) 0;border-bottom:1px solid var(--ink);white-space:nowrap}
table.t td{padding:var(--s2) var(--s3) var(--s2) 0;border-bottom:1px solid var(--rule);vertical-align:top}
table.t .r{text-align:right;white-space:nowrap} table.t td.r{font-variant-numeric:tabular-nums}
table.t tr.knapp td:last-child{color:var(--critical);font-weight:600}
.asin{display:block;font-size:var(--t-fein);color:var(--ink-soft);font-weight:400}
.note{font-size:var(--t-fein);color:var(--ink-soft);margin-top:var(--s2);max-width:var(--lesebreite)}
.punkte{padding-left:18px;font-size:var(--t-neben);max-width:var(--lesebreite)} .punkte li{margin:var(--s1) 0}
.quelle{font-size:var(--t-fein);color:var(--ink-soft);margin-top:var(--s6);max-width:var(--lesebreite)}
.quelle+.quelle{margin-top:var(--s1)}
.druckkopf{display:none}
@media (max-width:860px){.bereich{grid-template-columns:1fr;row-gap:var(--s1)}}
@media (max-width:700px){
 body{padding:16px}
 .lage p{margin-bottom:var(--s2)}
 .bereich{padding:var(--s3) 0}
 .bereich .kopfz{flex-direction:row;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:0 var(--s3)}
 table.t thead{display:none}
 table.t,table.t tbody,table.t tr,table.t td{display:block;width:100%}
 table.t tr{border-bottom:1px solid var(--rule);padding:var(--s2) 0}
 table.t td{border:0;padding:1px 0;text-align:left!important;white-space:normal}
 table.t td.r{font-variant-numeric:normal}
 table.t td::before{content:attr(data-k) ": ";color:var(--ink-soft)}
 table.t td:first-child::before{content:""} table.t td:first-child{font-weight:600}
 .werte .w.lang{max-width:160px}
}
@media print{
 body{background:#fff;font-size:11pt;padding:0}
 .bereich,.werte li,table.t tr{break-inside:avoid} h2,h3{break-after:avoid}
 .druckkopf{display:block;font-size:9pt;color:var(--ink-soft);margin-top:14pt;border-top:1px solid var(--rule);padding-top:6pt}
}"""


def seite(titel, inhalt):
    return (f'<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{e(titel)}</title><style>{CSS}</style></head><body>{inhalt}</body></html>')


def quelle():
    q = (f'Quelle: Seller Central {D.get("marktplatz", "DE")}, Konto {D.get("konto", KUNDE)}'
         + (f', abgerufen am {dat(D.get("abgerufen", ""))}' if D.get("abgerufen") else "")
         + ". Vergleich mit Vorwoche und Vorjahreswoche.")
    out = f'<p class="quelle">{e(q)}</p>'
    if D.get("vorlaeufig"):
        out += '<p class="quelle">Die Werte vom Sonntag sind noch vorläufig.</p>'
    return out


def druckkopf(zusatz=""):
    stand = dat(D.get("abgerufen", ""))
    return (f'<p class="druckkopf">PPotthoff · Montagsbrief {e(W.get("kw", ""))}{e(zusatz)} · {e(KUNDE)}'
            f'{f" · Stand {e(stand)}" if stand else ""} · Fragen: kontakt@patrickpotthoff.de</p>')


# ---------------------------------------------------------------- Seite 1
def seite1():
    s = saetze()
    teil = "<h2>Das Wichtigste der Woche</h2>"
    teil += f'<div class="lage">{"".join(f"<p>{e(x)}</p>" for x in s) or "<p>Für diese Woche liegt noch keine Zusammenfassung vor.</p>"}</div>'
    da = [b for b in alle_b if GRUPPEN[b] or txt(ZF.get(b) if not isinstance(ZF.get(b), list) else " ".join(ZF.get(b)))]
    rot = [b for b in da if stufe(b) == "r"]
    rest = sorted([b for b in da if b not in rot], key=lambda b: (-RANG[stufe(b)], b == "Werbung" and RUHT, alle_b.index(b)))
    if rot:
        teil += "<h2>Zum Handeln</h2>"
        for b in rot:
            schritt = txt(SCHRITTE.get(b, ""))
            n = f'<p class="schritt">Nächster Schritt: {e(schritt)}</p>' if schritt else ""
            teil += (f'<section class="bereich"><div class="kopfz">{e(TITEL.get(b, b))}{bereich_ampel(b)}</div>'
                     f'<div><p>{e(bereich_satz(b))}</p>{n}</div></section>')
    if rest:
        teil += f'<h2>{"Die übrigen Bereiche" if rot else "Die Bereiche"}</h2>'
        for b in rest:
            teil += (f'<section class="bereich"><div class="kopfz">{e(TITEL.get(b, b))}{bereich_ampel(b)}</div>'
                     f'<div><p>{e(bereich_satz(b))}</p></div></section>')
    teil += quelle() + druckkopf()
    return seite(f'Montagsbrief {W.get("kw", "")} · {KUNDE}', teil)


# ---------------------------------------------------------------- Alle Werte
def alle_werte():
    teil = ""
    hb = D.get("hinweise_bereich") or {}
    for b in alle_b:
        ks = GRUPPEN[b]
        zus = "".join(f() for f in ZUSATZ.get(b, []))
        auf = liste("Aufgefallen", hb.get(b) or [])
        if b == "Fristen":
            auf += liste("Hinweise von Amazon", D.get("hinweise") or [])
        if not ks and not zus and not auf:
            continue
        reihe = sorted(ks, key=lambda k: (-RANG[k["ampel"]], not k.get("leit"), ks.index(k)))
        teil += f"<h2>{e(TITEL.get(b, b))}</h2>{werte(reihe, b)}{zus}{auf}"
    l = [x for x in (D.get("luecken") or []) if isinstance(x, dict)]
    if l:
        teil += ("<h2>Was diese Woche fehlt</h2><ul class=\"punkte\">"
                 + "".join(f'<li><b>{e(txt(x.get("was")))}</b>: {e(txt(x.get("warum")))}</li>' for x in l) + "</ul>")
    teil += quelle()
    teil += '<p class="quelle">Wo Amazon keinen Grenzwert nennt, ist die Schwelle der Ampel unser Vorschlag.</p>'
    teil += druckkopf(" · Alle Werte")
    return seite(f'Alle Werte {W.get("kw", "")} · {KUNDE}', teil)


# ---------------------------------------------------------------- Ausgabe
os.makedirs(OUTD, exist_ok=True)
s1, aw = seite1(), alle_werte()
for name, inhalt in (("seite1.html", s1), ("alle-werte.html", aw), ("zusammenfassung.txt", "\n".join(saetze()) + "\n")):
    p = os.path.join(OUTD, name)
    open(p, "w", encoding="utf-8").write(inhalt)
    print(p, os.path.getsize(p))
if RUHT:
    print("Hinweis: Werbung ruht, Bereich ohne Ampel („ruht“).")
for m in dict.fromkeys(MELDUNGEN):
    print(m)
rest = [w for w in ("TACoS", "ACoS", "ROAS", "Sitzung", "Einheiten", "Bestellposten", "gefährdet", "entgangen")
        if re.search(w, re.sub(r"<style>.*?</style>", "", s1 + aw, flags=re.S))]
if rest:
    print("Achtung, im Text stehen noch:", ", ".join(rest))
