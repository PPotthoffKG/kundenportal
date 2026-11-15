"""Montagsbrief fürs Kundenportal (Weg 1: ohne Aufklappen, Tiefe als zweite Seite).

Aufruf: python3 wochenstand_portal.py <daten.json> <ausgabeordner> [Kundenname] [--eigenstaendig]

Schreibt in den Ausgabeordner:
  seite1.html          Das Wichtigste der Woche, Zum Handeln, die übrigen Bereiche
  alle_werte.html      alle Werte und Tabellen nach Bereichen
  zusammenfassung.txt  höchstens drei Sätze, ein Satz je Zeile (Übersicht im Portal)

Beide Seiten ohne JavaScript, ohne <details>, ohne eigenen Kopf, Logo und Fußzeile:
den Kopf stellt das Portal. Schriften sind eingebettet. Mit --eigenstaendig verlinken
sich die Seiten gegenseitig (zum Ansehen außerhalb des Portals); im Portal läuft die
Verbindung über das Portal, weil der Bericht dort per srcdoc im iframe steht.

Optionale Felder in den Daten:
  vorlaeufig: true                      -> Hinweis, dass die Sonntagswerte vorläufig sind
  zusammenfassung.saetze: [..]          -> fertige Sätze für oben (sonst die ersten drei aus .gesamt)
  zusammenfassung.schritte: {Bereich: ..} -> nächster Schritt je Bereich unter „Zum Handeln“
  kennzahlen[].ziel_quelle: "amazon"|"vorschlag", kennzahlen[].vorschlag: Text
"""
import os, re, sys, json, html

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import theme as T

e = html.escape

# ---------------------------------------------------------------- Wörter
# Wörterliste aus kundenportal/inhalte.md: Begriffe aus Seller Central und Werbekonsole,
# die im Kundentext ersetzt werden. Reihenfolge zählt (längere Begriffe zuerst).
WOERTER = [
    (r"Bewertung der Verkäuferleistung", "Kontozustand"),
    (r"Bestellungen \(Bestellposten\)", "Bestellungen"),
    (r"Conversion \(Einheiten pro Sitzung\)", "Verkaufte Packungen je 100 Besuche"),
    (r"\bTACoS\b", "Werbekosten am Umsatz"),
    (r"\bACoS\b", "Werbekosten am Werbeumsatz"),
    (r"\bROAS\b", "Werbeumsatz je Werbe-Euro"),
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
# Amazons Hochrechnungen zu verlorenen Verkäufen stehen nie im Kundentext.
VERBOTEN = re.compile(r"gefährdete[nr]? (Verk(ä|a)uf|Umsatz)|entgangene[nr]? Verk(ä|a)uf", re.I)


def wort(s):
    s = "" if s is None else str(s)
    for a, b in WOERTER:
        s = re.sub(a, b, s)
    return s


def ohne_hochrechnung(s):
    """Entfernt Teile, die Amazons Hochrechnung zu gefährdeten oder entgangenen Verkäufen nennen."""
    if not s or not VERBOTEN.search(s):
        return s
    s = re.sub(r"\s*\([^()]*\)", lambda m: "" if VERBOTEN.search(m.group(0)) else m.group(0), s)
    for trenn in (" · ", "; ", ", "):
        teile = s.split(trenn)
        s = trenn.join(t for t in teile if not VERBOTEN.search(t))
    return "" if VERBOTEN.search(s) else s.strip(" ;,·")


def txt(s):
    return ohne_hochrechnung(wort(s))


# ---------------------------------------------------------------- Daten
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
if len(ARGS) < 2:
    sys.exit(__doc__)
SRC, OUTD = ARGS[0], ARGS[1]
EIGEN = "--eigenstaendig" in sys.argv
D = json.load(open(SRC, encoding="utf-8"))
KUNDE = ARGS[2] if len(ARGS) > 2 else D.get("konto", "")

BEREICHE = ["Konto", "Katalog", "Verkauf", "Werbung", "Lager", "Marke", "Zahlungen", "Fristen"]
TITEL = {"Konto": "Konto und Verkäuferleistung", "Verkauf": "Verkauf und Besuche", "Werbung": "Werbung", "Lager": "Lager und Versand durch Amazon",
         "Katalog": "Katalog und Angebote", "Marke": "Marke und Markt", "Zahlungen": "Zahlungen und Gebühren", "Fristen": "Fristen"}
RANG = {"r": 3, "y": 2, "g": 1, "": 0}
STATUS = {"r": "Handeln", "y": "Beobachten", "g": "Im Ziel", "": "Ohne Zielwert"}

KZ = [k for k in (D.get("kennzahlen") or []) if isinstance(k, dict)]
for k in KZ:
    if k.get("ampel") not in RANG:
        k["ampel"] = ""
alle_b = BEREICHE + [b for b in dict.fromkeys(k.get("bereich") for k in KZ) if b and b not in BEREICHE]
GRUPPEN = {b: [k for k in KZ if k.get("bereich") == b] for b in alle_b}
schlimmste = lambda ks: max((k["ampel"] for k in ks), key=lambda a: RANG[a], default="")
ZF = D.get("zusammenfassung") or {}
SCHRITTE = ZF.get("schritte") or D.get("naechster_schritt") or {}
W = D.get("woche") or {}
VW, VJ = D.get("vorwoche") or {}, D.get("vorjahr") or {}

dat = lambda iso: f"{iso[8:10]}.{iso[5:7]}.{iso[0:4]}" if iso and len(iso) >= 10 else (iso or "")
dat_kurz = lambda iso: f"{iso[8:10]}.{iso[5:7]}." if iso and len(iso) >= 10 else (iso or "")
num = lambda x: x if isinstance(x, (int, float)) else None
eur = lambda x: (T.fmt(x, 0 if abs(x) >= 100 else 2) + " €") if num(x) is not None else e(str(x or ""))
pct = lambda x: (T.fmt(x, 1 if abs(x) < 10 else 0) + " %") if num(x) is not None else e(str(x or ""))
ganz = lambda x: T.fmt(x) if num(x) is not None else e(str(x or ""))
zeitraum = f'{dat(W.get("von"))} bis {dat(W.get("bis"))}' if W.get("von") else ""


def saetze():
    s = ZF.get("saetze") or (ZF.get("gesamt") or [])
    out = []
    for x in s:
        x = txt(x).strip()
        if x:
            out.append(x)
    return out[:3]


def bereich_satz(b):
    s = ZF.get(b)
    if isinstance(s, list):
        s = " ".join(s)
    s = txt(s or "").strip()
    if s:
        return s
    ks = GRUPPEN.get(b) or []
    lead = next((k for k in ks if k.get("leit")), ks[0] if ks else None)
    return f'{txt(lead.get("kachel_name") or lead.get("name"))}: {txt(lead.get("wert"))}.' if lead else ""


# ---------------------------------------------------------------- Bausteine
def marke(a):
    return f'<span class="m m-{a or "n"}" aria-hidden="true"></span>'


def status_wort(a):
    return f'<span class="st st-{a or "n"}">{STATUS[a]}</span>'


def ziel_text(k):
    """Ziel mit Herkunft. Ohne Amazon-Grenzwert ist die Ampel unser Vorschlag."""
    a, ziel, quelle = k["ampel"], txt(k.get("ziel")).strip(), k.get("ziel_quelle")
    vorschlag = txt(k.get("vorschlag")).strip()
    if quelle == "vorschlag" or (a and not ziel):
        return f"Unser Vorschlag: {vorschlag}" if vorschlag else ("Ampel nach unserem Vorschlag, Amazon nennt keinen Grenzwert" if a else "")
    if ziel and not ziel.lower().startswith("kein"):
        return f"Grenze laut Amazon: {ziel}"
    return ziel


def werte(ks):
    out = ""
    for k in ks:
        a = k["ampel"]
        unter = " · ".join(x for x in [e(txt(k.get("vergleich"))), e(ziel_text(k))] if x)
        wert = txt(k.get("wert"))
        lang = " lang" if len(wert) > 16 else ""
        st = f'<span class="wst">{status_wort(a)}</span>' if a in ("r", "y") else ""
        out += (f'<li class="w">{marke(a)}<div class="wl"><div class="wn">{e(txt(k.get("name")))}</div>'
                f'{f"<div class=wu>{unter}</div>" if unter else ""}</div>'
                f'<div class="wv{lang}">{e(wert)}{st}</div></li>')
    return f'<ul class="werte">{out}</ul>' if out else ""


def tabelle(kopf, zeilen, note=""):
    """Breite Tabelle am Laptop, am Handy Liste untereinander (data-label)."""
    th = "".join(f'<th class="{c}" scope="col">{e(h)}</th>' for h, c in kopf)
    body = ""
    for z in zeilen:
        cls = z.get("cls", "")
        tds = ""
        for (h, c), v in zip(kopf, z["zellen"]):
            tds += f'<td class="{c}" data-label="{e(h)}">{v}</td>'
        body += f'<tr class="{cls}">{tds}</tr>'
    n = f'<p class="note">{e(note)}</p>' if note else ""
    return f'<table class="tab"><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>{n}'


def artikel(x):
    asin = f'<span class="asin">{e(str(x.get("asin", "")))}</span>' if x.get("asin") else ""
    return f'<span class="ti">{e(txt(x.get("titel")))}</span>{asin}'


def tab_artikel():
    a = D.get("artikel_top") or []
    if not a:
        return ""
    z = [{"zellen": [artikel(x), eur(x.get("umsatz")), ganz(x.get("einheiten")), ganz(x.get("sitzungen", x.get("besuche"))),
                     pct(x.get("conversion")), pct(x.get("buybox"))]} for x in a]
    return '<h3>Die zehn Artikel mit dem meisten Umsatz</h3>' + tabelle(
        [("Artikel", "t"), ("Umsatz", "r"), ("Einheiten", "r"), ("Besuche", "r"), ("Conversion", "r"), ("Buy Box", "r")], z,
        "Conversion: verkaufte Einheiten je Besuch. Buy Box: Anteil der Besuche, in denen euer Angebot vorne stand.")


def tab_bewegung():
    out = ""
    for key, titel in (("gewinner", "Mehr Umsatz als in der Vorwoche"), ("verlierer", "Weniger Umsatz als in der Vorwoche")):
        xs = D.get(key) or []
        if not xs:
            continue
        z = []
        for x in xs:
            u, p = num(x.get("umsatz")) or 0, num(x.get("vorwoche")) or 0
            diff = u - p
            z.append({"zellen": [artikel(x), eur(p), eur(u), ("+" if diff >= 0 else "−") + eur(abs(diff))], "cls": "dn" if diff < 0 else ""})
        out += f"<h3>{titel}</h3>" + tabelle([("Artikel", "t"), ("Vorwoche", "r"), ("Diese Woche", "r"), ("Unterschied", "r b")], z)
    return out


def tab_reichweite():
    r = D.get("reichweite") or []
    if not r:
        return ""
    def cls(w):
        w = num(w)
        return "" if w is None else ("kr" if w < 2 else "")
    z = [{"zellen": [artikel(x), ganz(x.get("bestand")), ganz(x.get("einheiten_woche")),
                     T.fmt(x["wochen"], 1) if num(x.get("wochen")) is not None else e(str(x.get("wochen", "")))], "cls": cls(x.get("wochen"))} for x in r]
    return '<h3>Wie lange der Bestand der Top-Artikel reicht</h3>' + tabelle(
        [("Artikel", "t"), ("Bestand", "r"), ("Verkauft je Woche", "r"), ("Reicht Wochen", "r b")], z,
        "Gerechnet: Bestand geteilt durch die verkauften Einheiten der Woche. Rot heißt: reicht weniger als zwei Wochen (unser Vorschlag).")


def tab_suche():
    s = D.get("suchbegriffe") or []
    if not s:
        return ""
    z = [{"zellen": [e(txt(x.get("begriff"))), ganz(x.get("volumen")), pct(x.get("impr_anteil")), pct(x.get("klick_anteil")), pct(x.get("kauf_anteil"))]} for x in s]
    return '<h3>Suchbegriffe: euer Anteil</h3>' + tabelle(
        [("Suchbegriff", "t"), ("Suchanfragen", "r"), ("Anteil Anzeigen", "r"), ("Anteil Klicks", "r"), ("Anteil Käufe", "r b")], z,
        "Anteil: wie viel von allen Einblendungen, Klicks und Käufen zu diesem Suchbegriff auf eure Artikel fiel.")


def tab_fristen():
    f = sorted([x for x in (D.get("fristen") or []) if isinstance(x, dict)], key=lambda x: x.get("datum", ""))
    if not f:
        return ""
    z = [{"zellen": [f'<b>{e(dat(x.get("datum")))}</b>', e(txt(x.get("was"))), e(txt(x.get("betrag")))]} for x in f]
    return "<h3>Termine</h3>" + tabelle([("Datum", "t"), ("Was", "t"), ("Betrag", "r")], z)


def liste(titel, xs):
    xs = [txt(x) for x in xs if txt(x)]
    return f'<h3>{titel}</h3><ul class="punkte">{"".join(f"<li>{e(x)}</li>" for x in xs)}</ul>' if xs else ""


TABELLEN = {"Verkauf": [tab_bewegung, tab_artikel], "Lager": [tab_reichweite], "Marke": [tab_suche], "Fristen": [tab_fristen]}

# ---------------------------------------------------------------- Stil
CSS = T.FONTS + f""":root{{--surface:{T.SURFACE};--paper:{T.PAPER};--ink:{T.INK};--soft:{T.INK_SOFT};--green:{T.GREEN};--green-soft:{T.GREEN_SOFT};--rule:{T.RULE};--crit:{T.CRITICAL};
--serif:Newsreader,Georgia,serif;--sans:"Schibsted Grotesk",Arial,sans-serif}}
*{{box-sizing:border-box}} html,body{{margin:0;background:var(--paper);color:var(--ink)}}
body{{font:400 16px/1.55 var(--sans);-webkit-font-smoothing:antialiased;overflow-wrap:break-word}}
a{{color:var(--green)}}
.blatt{{max-width:880px;margin:0 auto;padding:32px 40px 36px}}
.meta{{font-size:13px;color:var(--soft);margin:0 0 6px}}
h2{{font-family:var(--serif);font-weight:400;font-size:26px;line-height:1.2;color:var(--green);margin:36px 0 12px}}
h2:first-of-type{{margin-top:0}}
h3{{font-size:13px;font-weight:600;color:var(--soft);margin:22px 0 6px}}
.kurz{{font-family:var(--serif);font-weight:300;font-size:21px;line-height:1.45;margin:0}}
.kurz p{{margin:0 0 10px}}
.vorl{{font-size:14px;color:var(--soft);border-left:3px solid var(--rule);padding:2px 0 2px 12px;margin:14px 0 0}}
.m{{display:inline-block;width:10px;height:10px;flex:none}}
.m-r{{background:var(--crit)}} .m-y{{background:var(--ink)}} .m-g{{background:var(--green-soft)}} .m-n{{border:1px solid var(--soft)}}
.st{{font-size:13px;font-weight:600;white-space:nowrap}} .st-r{{color:var(--crit)}} .st-g,.st-n{{color:var(--soft);font-weight:400}}
.handeln{{list-style:none;margin:0;padding:0;border-top:1px solid var(--rule)}}
.handeln li{{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:14px;padding:16px 0;border-bottom:1px solid var(--rule)}}
.handeln .m{{margin-top:9px}}
.hb{{font-family:var(--serif);font-size:20px;line-height:1.25;color:var(--green)}}
.hs{{margin-top:4px}} .hn{{margin-top:6px;font-size:15px}} .hn b{{font-weight:600}}
.uebrig{{list-style:none;margin:0;padding:0;border-top:1px solid var(--rule)}}
.uebrig li{{display:grid;grid-template-columns:auto minmax(0,190px) minmax(0,1fr) auto;column-gap:14px;align-items:baseline;padding:11px 0;border-bottom:1px solid var(--rule);font-size:15px}}
.uebrig .ub{{font-weight:600}}
.weiter{{margin-top:28px;font-size:14px;color:var(--soft)}}
.bereich{{margin-top:44px}} .bereich:first-of-type{{margin-top:0}}
.bk{{display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-bottom:1px solid var(--ink);padding-bottom:6px;margin-bottom:4px}}
.bk h2{{margin:0}} .bs{{margin:8px 0 0}}
.werte{{list-style:none;margin:0;padding:0}}
.w{{display:grid;grid-template-columns:auto minmax(0,1fr) auto;column-gap:12px;padding:11px 0;border-bottom:1px solid var(--rule)}}
.w .m{{margin-top:7px}} .wn{{font-weight:600;font-size:15px}} .wu{{font-size:13.5px;color:var(--soft);line-height:1.45}}
.wv{{font-family:var(--serif);font-size:21px;line-height:1.2;text-align:right;white-space:nowrap;padding-left:12px}}
.wv.lang{{white-space:normal;font-family:var(--sans);font-size:14px;font-weight:600;max-width:240px}}
.wst{{display:block;font-family:var(--sans)}}
.tab{{width:100%;border-collapse:collapse;font-size:14px}}
.tab th{{text-align:left;font-size:12px;font-weight:600;color:var(--soft);padding:0 10px 6px 0;border-bottom:1px solid var(--soft);vertical-align:bottom}}
.tab td{{padding:8px 10px 8px 0;border-bottom:1px solid var(--rule);vertical-align:top}}
.tab .r{{text-align:right;white-space:nowrap}} .tab td.b{{font-weight:600}}
.tab tr.kr td:last-child,.tab tr.dn td:last-child{{color:var(--crit)}}
.ti{{display:block}} .asin{{display:block;font-size:12px;color:var(--soft)}}
.note{{font-size:13px;color:var(--soft);margin:6px 0 0}}
.punkte{{margin:0;padding-left:18px;font-size:15px}} .punkte li{{margin:4px 0}}
.legende{{display:flex;flex-wrap:wrap;gap:4px 18px;font-size:13px;color:var(--soft);margin-top:36px}}
.legende span{{display:inline-flex;align-items:center;gap:6px}}
.quelle{{font-size:12.5px;color:var(--soft);margin-top:14px}}
@media (max-width:640px){{
 .blatt{{padding:20px 16px 28px}}
 h2{{font-size:23px;margin-top:30px}} .kurz{{font-size:19px}}
 .uebrig li{{grid-template-columns:auto minmax(0,1fr) auto;row-gap:2px}}
 .uebrig .us{{grid-column:2/4;grid-row:2;color:var(--soft);font-size:14px}}
 .bk{{flex-wrap:wrap}}
 .w{{grid-template-columns:auto minmax(0,1fr)}} .wv{{grid-column:2;text-align:left;padding:4px 0 0}} .wv.lang{{max-width:none}}
 .tab thead{{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}}
 .tab,.tab tbody,.tab tr,.tab td{{display:block;width:100%}}
 .tab tr{{border-bottom:1px solid var(--rule);padding:8px 0}}
 .tab td{{border:0;padding:2px 0;display:flex;justify-content:space-between;gap:12px;text-align:right}}
 .tab td::before{{content:attr(data-label);color:var(--soft);font-size:13px;text-align:left;flex:none}}
 .tab td.t:first-child{{display:block;text-align:left;padding-bottom:4px}} .tab td.t:first-child::before{{content:none}}
 .tab td.t:not(:first-child){{text-align:right}}
 .tab .r{{white-space:normal}}
}}"""


def seite(titel, inhalt):
    return (f'<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{e(titel)}</title><style>{CSS}</style></head><body><main class="blatt">{inhalt}</main></body></html>')


# ---------------------------------------------------------------- Seite 1
def seite1():
    s = saetze()
    kopf = f'<p class="meta">Montagsbrief {e(W.get("kw", ""))} · {e(KUNDE)} auf Amazon · Woche vom {e(zeitraum)}</p>' if W else ""
    teil = kopf + "<h2>Das Wichtigste der Woche</h2>"
    teil += f'<div class="kurz">{"".join(f"<p>{e(x)}</p>" for x in s)}</div>' if s else '<p class="kurz">Für diese Woche liegt noch keine Zusammenfassung vor.</p>'
    if D.get("vorlaeufig"):
        teil += '<p class="vorl">Die Werte vom Sonntag sind noch vorläufig.</p>'
    rot = [b for b in alle_b if GRUPPEN[b] and schlimmste(GRUPPEN[b]) == "r"]
    rest = [b for b in alle_b if b not in rot and (GRUPPEN[b] or bereich_satz(b))]
    if rot:
        li = ""
        for b in rot:
            schritt = txt(SCHRITTE.get(b, "")).strip()
            n = f'<div class="hn"><b>Nächster Schritt:</b> {e(schritt)}</div>' if schritt else ""
            li += f'<li>{marke("r")}<div><div class="hb">{e(TITEL.get(b, b))}</div><div class="hs">{e(bereich_satz(b))}</div>{n}</div></li>'
        teil += f'<h2>Zum Handeln</h2><ul class="handeln">{li}</ul>'
    if rest:
        rest.sort(key=lambda b: (-RANG[schlimmste(GRUPPEN[b])], alle_b.index(b)))
        li = "".join(f'<li>{marke(schlimmste(GRUPPEN[b]))}<span class="ub">{e(TITEL.get(b, b))}</span><span class="us">{e(bereich_satz(b))}</span>'
                     f'{status_wort(schlimmste(GRUPPEN[b]))}</li>' for b in rest)
        teil += f'<h2>{"Die übrigen Bereiche" if rot else "Die Bereiche"}</h2><ul class="uebrig">{li}</ul>'
    weiter = '<a href="alle_werte.html">Alle Werte und Tabellen</a>' if EIGEN else "Alle Werte und Tabellen"
    teil += f'<p class="weiter">{weiter} stehen auf der zweiten Seite, nach Bereichen geordnet.</p>'
    return seite(f'Montagsbrief {W.get("kw", "")} · {KUNDE}', teil)


# ---------------------------------------------------------------- Alle Werte
def alle_werte():
    teil = (f'<p class="meta">Montagsbrief {e(W.get("kw", ""))} · {e(KUNDE)} · Alle Werte · Woche vom {e(zeitraum)}</p>' if W else "")
    if EIGEN:
        teil += '<p class="meta"><a href="seite1.html">Zurück zum Wichtigsten der Woche</a></p>'
    if D.get("vorlaeufig"):
        teil += '<p class="vorl">Die Werte vom Sonntag sind noch vorläufig.</p>'
    hb = D.get("hinweise_bereich") or {}
    for b in alle_b:
        ks = GRUPPEN[b]
        tabs = "".join(f() for f in TABELLEN.get(b, []))
        auf = liste("Aufgefallen", hb.get(b) or [])
        if b == "Fristen":
            auf += liste("Hinweise von Amazon", D.get("hinweise") or [])
        if not ks and not tabs and not auf:
            continue
        w = schlimmste(ks)
        reihe = sorted(ks, key=lambda k: (-RANG[k["ampel"]], not k.get("leit"), ks.index(k)))
        if b == "Fristen" and tabs:
            reihe = []  # die Termine stehen vollständig in der Tabelle
        stat = status_wort(w) if ks else ""
        satz = bereich_satz(b)
        teil += (f'<section class="bereich" id="b-{e(b)}"><div class="bk"><h2>{e(TITEL.get(b, b))}</h2>{stat}</div>'
                 f'{f"<p class=bs>{e(satz)}</p>" if satz else ""}{werte(reihe)}{tabs}{auf}</section>')
    l = [x for x in (D.get("luecken") or []) if isinstance(x, dict)]
    if l:
        teil += ('<section class="bereich"><div class="bk"><h2>Was diese Woche fehlt</h2></div><ul class="punkte">'
                 + "".join(f'<li><b>{e(txt(x.get("was")))}</b>: {e(txt(x.get("warum")))}</li>' for x in l) + "</ul></section>")
    teil += ('<p class="legende"><span>' + marke("r") + 'Handeln</span><span>' + marke("y") + 'Beobachten</span><span>' + marke("g")
             + 'Im Ziel</span><span>' + marke("") + 'Ohne Zielwert</span></p>')
    q = (f'Quelle: Seller Central {D.get("marktplatz", "DE")}, Konto {D.get("konto", KUNDE)}'
         + (f', abgerufen am {dat(D.get("abgerufen", ""))}' if D.get("abgerufen") else "") + (f". Woche {zeitraum}" if zeitraum else "")
         + (f', Vorwoche {dat(VW.get("von"))} bis {dat(VW.get("bis"))}' if VW.get("von") else "")
         + (f', Vorjahr {dat(VJ.get("von"))} bis {dat(VJ.get("bis"))}' if VJ.get("von") else "")
         + ". Rollierende Amazon-Kennzahlen mit dem Zeitraum, den Amazon anzeigt. Gerechnete Werte sind aus den Amazon-Zahlen abgeleitet."
         + " Wo Amazon keinen Grenzwert nennt, ist die Ampel unser Vorschlag.")
    teil += f'<p class="quelle">{e(q)}</p>'
    return seite(f'Alle Werte {W.get("kw", "")} · {KUNDE}', teil)


os.makedirs(OUTD, exist_ok=True)
for name, inhalt in (("seite1.html", seite1()), ("alle_werte.html", alle_werte()), ("zusammenfassung.txt", "\n".join(saetze()) + "\n")):
    p = os.path.join(OUTD, name)
    open(p, "w", encoding="utf-8").write(inhalt)
    print(p, os.path.getsize(p))
