"""Montagsbrief (Wochenstand) als schlichte HTML-Seite für das Kundenportal.
Gleiche Inhalte wie build_wochenstand.py, ohne Verschlüsselung und ohne eigenes Rückmeldeformular:
Kommentare laufen im Portal. Läuft ohne JavaScript (das Portal zeigt Berichte ohne Skripte).
Aufruf: python3 wochenstand_portal.py daten.json ausgabe.html [Kundenname]"""
import os, sys, json, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import theme as T
e = html.escape
SRC, OUTF = sys.argv[1], sys.argv[2]
D = json.load(open(SRC)); KUNDE = sys.argv[3] if len(sys.argv) > 3 else D["konto"]
BEREICHE = ["Fristen", "Konto", "Katalog", "Verkauf", "Werbung", "Lager", "Marke", "Zahlungen"]
TITEL = {"Konto": "Konto und Verkäuferleistung", "Verkauf": "Verkauf und Besucher", "Werbung": "Werbung", "Lager": "Lager und FBA",
         "Katalog": "Katalog und Angebote", "Marke": "Marke und Markt", "Zahlungen": "Zahlungen und Gebühren", "Fristen": "Fristen und Aktionen"}
RANG = {"r": 3, "y": 2, "g": 1, "": 0}
STATUS = {"r": "Handeln", "y": "Beobachten", "g": "Im Ziel", "": "Ohne Zielwert"}
SR = {"g": "im Ziel", "y": "beobachten", "r": "handeln", "": ""}
d = lambda iso: f"{iso[8:10]}.{iso[5:7]}.{iso[0:4]}" if iso and len(iso) >= 10 else (iso or "")
eur = lambda x: T.fmt(x, 0 if abs(x) >= 100 else 2) + " €" if isinstance(x, (int, float)) else e(str(x))
pct = lambda x: T.fmt(x, 1 if x < 10 else 0) + " %" if isinstance(x, (int, float)) else e(str(x))
KZ = D.get("kennzahlen", []); groups = {b: [k for k in KZ if k.get("bereich") == b] for b in BEREICHE}
worst = lambda ks: max((k.get("ampel", "") for k in ks), key=lambda a: RANG[a], default="")
ZF = D.get("zusammenfassung", {})

def glance():
    tiles = ""
    for b in BEREICHE:
        ks = groups[b]
        if not ks: continue
        w = worst(ks); lead = next((k for k in ks if k.get("leit")), ks[0])
        n_r = sum(1 for k in ks if k.get("ampel") == "r"); n_y = sum(1 for k in ks if k.get("ampel") == "y")
        cnt = " · ".join(x for x in [f"{n_r} handeln" if n_r else "", f"{n_y} beobachten" if n_y else ""] if x)
        tiles += (f'<div class="tile t-{w or "n"}"><span class="tb">{e(b)}</span><span class="tv">{e(lead.get("kachel") or lead["wert"])}</span>'
                  f'<span class="tl">{e(lead.get("kachel_name") or lead["name"])}</span><span class="ts">{cnt or STATUS[w]}</span></div>')
    return f'<section class="wrap" aria-label="Auf einen Blick"><div class="glance">{tiles}</div></section>'

def rows(ks):
    out = ""
    for k in ks:
        a = k.get("ampel", ""); ziel = f' · Ziel {e(k["ziel"])}' if k.get("ziel") else ""
        flag = f'<span class="kflag f-{a}">{SR[a]}</span>' if a in ("r", "y") else ""
        out += (f'<li class="krow"><span class="dot d-{a or "n"}" title="{SR[a] or "ohne Zielwert"}"></span><span class="kleft"><span class="kname">{e(k["name"])}</span>'
                f'<span class="kcmp">{e(k.get("vergleich", ""))}{ziel}</span></span><span class="kval{" long" if len(k["wert"]) > 14 else ""}">{e(k["wert"])}{flag}</span></li>')
    return f'<ul class="klist">{out}</ul>'

def tab(head, body, cls=""):
    th = "".join(f'<th class="{c}">{e(h)}</th>' for h, c in head)
    return f'<div class="tw"><table class="dt {cls}"><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table></div>'

def art_top():
    a = D.get("artikel_top") or []
    if not a: return ""
    body = "".join(f'<tr><td class="ti">{e(x["titel"])}<span class="asin">{e(x["asin"])}</span></td><td class="r">{eur(x["umsatz"])}</td><td class="r">{x["einheiten"]}</td>'
                   f'<td class="r">{x["sitzungen"]}</td><td class="r">{pct(x["conversion"])}</td><td class="r">{pct(x["buybox"])}</td></tr>' for x in a)
    return '<h3 class="sub">Top 10 Artikel nach Umsatz</h3>' + tab([("Artikel", ""), ("Umsatz", "r"), ("Einh.", "r"), ("Sitzungen", "r"), ("Conversion", "r"), ("Buy Box", "r")], body)

def movers():
    g, v = D.get("gewinner") or [], D.get("verlierer") or []
    if not g and not v: return ""
    def li(xs, sign):
        out = ""
        for x in xs:
            u, p = x.get("umsatz", 0) or 0, x.get("vorwoche", 0) or 0; diff = u - p
            out += f'<li><span class="mt">{e(x["titel"])}</span><span class="mv {sign}">{"+" if diff >= 0 else "−"}{eur(abs(diff))}</span><span class="mc">{eur(p)} → {eur(u)}</span></li>'
        return out
    return f'<div class="mov"><div><h3 class="sub">Gewinner zur Vorwoche</h3><ul class="ml">{li(g, "up")}</ul></div><div><h3 class="sub">Verlierer zur Vorwoche</h3><ul class="ml">{li(v, "dn")}</ul></div></div>'

def reichweite():
    r = D.get("reichweite") or []
    if not r: return ""
    cls = lambda w: "k-r" if w < 2 else ("k-y" if w < 4 else "")
    body = "".join(f'<tr class="{cls(x["wochen"])}"><td class="ti">{e(x["titel"])}<span class="asin">{e(x["asin"])}</span></td><td class="r">{x["bestand"]}</td>'
                   f'<td class="r">{x["einheiten_woche"]}</td><td class="r b">{T.fmt(x["wochen"], 1)}</td></tr>' for x in r)
    return ('<h3 class="sub">Reichweite der Top-Artikel (FBA)</h3>' + tab([("Artikel", ""), ("Bestand", "r"), ("Verkauft/Woche", "r"), ("Wochen", "r")], body) +
            '<p class="note">Rot unter 2 Wochen. Gerechnet: Bestand geteilt durch verkaufte Einheiten der Woche.</p>')

def suchbegriffe():
    s = D.get("suchbegriffe") or []
    if not s: return ""
    body = "".join(f'<tr><td class="ti">{e(x["begriff"])}</td><td class="r">{T.fmt(x["volumen"])}</td><td class="r">{pct(x["impr_anteil"])}</td>'
                   f'<td class="r">{pct(x["klick_anteil"])}</td><td class="r b">{pct(x["kauf_anteil"])}</td></tr>' for x in s)
    return '<h3 class="sub">Suchbegriffe: euer Anteil</h3>' + tab([("Suchbegriff", ""), ("Suchvolumen", "r"), ("Impressionen", "r"), ("Klicks", "r"), ("Käufe", "r")], body)

def fristen():
    f = sorted(D.get("fristen") or [], key=lambda x: x.get("datum", "")); h = D.get("hinweise") or []
    out = '<div class="fgrid">'
    if f:
        out += '<div><h3 class="sub">Termine</h3><ul class="fl">' + "".join(f'<li><span class="fd">{e(d(x["datum"]))}</span><span class="fw">{e(x["was"])}</span><span class="fb">{e(x.get("betrag", ""))}</span></li>' for x in f) + "</ul></div>"
    if h:
        out += '<div><h3 class="sub">Hinweise von Amazon</h3><ul class="hl">' + "".join(f"<li>{e(x)}</li>" for x in h) + "</ul></div>"
    return out + "</div>"

EXTRA = {"Verkauf": art_top, "Lager": reichweite, "Marke": suchbegriffe}
SICHTBAR = {"Verkauf": movers, "Fristen": fristen}

def sections():
    out = ""
    for b in sorted(BEREICHE, key=lambda b: -RANG[worst(groups[b])]):
        ks = groups[b]; extra = EXTRA.get(b, lambda: "")(); shown = SICHTBAR.get(b, lambda: "")()
        if not ks and not extra and not shown: continue
        w = worst(ks)
        n_r = sum(1 for k in ks if k.get("ampel") == "r"); n_y = sum(1 for k in ks if k.get("ampel") == "y")
        stat = " · ".join(x for x in [f"{n_r} handeln" if n_r else "", f"{n_y} beobachten" if n_y else ""] if x) or (STATUS[w] if ks else "")
        body_rows = sorted(ks, key=lambda k: (not k.get("leit"), -RANG[k.get("ampel", "")], ks.index(k)))
        if b == "Fristen" and shown: body_rows = []
        hb = (D.get("hinweise_bereich") or {}).get(b) or []
        auf = ('<h3 class="sub">Aufgefallen</h3><ul class="hl">' + "".join(f"<li>{e(x)}</li>" for x in hb) + "</ul>") if hb else ""
        detail = ((f'<h3 class="sub">Alle {len(body_rows)} Werte</h3>' + rows(body_rows)) if body_rows else "") + shown + auf + extra
        out += (f'<details class="area a-{w or "n"}" id="b-{b}"><summary><span class="dot d-{w or "n"}"></span><span class="at"><span class="an">{e(TITEL[b])}</span>'
                f'<span class="ak">{e(ZF.get(b, ""))}</span></span><span class="as s-{w or "n"}">{e(stat)}</span><span class="chev" aria-hidden="true"></span></summary><div class="ad">{detail}</div></details>')
    return f'<div class="atools"><h2 class="ah">Die Bereiche</h2><span class="hint">Zum Aufklappen auf einen Bereich tippen</span></div><div class="areas">{out}</div>'

def wichtigstes():
    g = ZF.get("gesamt") or []
    return f'<div class="key"><h2>Das Wichtigste der Woche</h2><ul>{"".join(f"<li>{e(x)}</li>" for x in g)}</ul></div>' if g else ""

def luecken():
    l = D.get("luecken") or []
    if not l: return ""
    return f'<details class="gaps"><summary>Was diese Woche fehlt ({len(l)})</summary><ul>{"".join(f"<li><b>{e(x["was"])}</b> {e(x["warum"])}</li>" for x in l)}</ul></details>'

W, VW, VJ = D["woche"], D.get("vorwoche", {}), D.get("vorjahr", {})
zeitraum = f'{d(W["von"])} bis {d(W["bis"])}'
quelle = (f'Quelle: Seller Central {D.get("marktplatz", "DE")}, Konto {D["konto"]}, abgerufen am {d(D.get("abgerufen", ""))}. Woche {zeitraum}'
          + (f', Vorwoche {d(VW.get("von"))} bis {d(VW.get("bis"))}' if VW else "") + (f', Vorjahr {d(VJ.get("von"))} bis {d(VJ.get("bis"))}' if VJ else "")
          + '. Rollierende Amazon-Kennzahlen mit dem Zeitraum, den Amazon anzeigt. Gerechnete Werte sind aus den Amazon-Zahlen abgeleitet.')
legend = '<p class="klegend"><span><span class="dot d-r"></span>handeln</span><span><span class="dot d-y"></span>beobachten</span><span><span class="dot d-g"></span>im Ziel</span><span><span class="dot d-n"></span>ohne Zielwert</span></p>'
n_r = sum(1 for k in KZ if k.get("ampel") == "r"); n_y = sum(1 for k in KZ if k.get("ampel") == "y")
h1 = f'{n_r} {"Wert" if n_r == 1 else "Werte"} zum Handeln, {n_y} zum Beobachten.' if (n_r or n_y) else "Alle Werte im Ziel."

CONTENT = f"""<header class="hero"><div class="wrap"><div class="htop"><div class="logo" aria-label="PPotthoff">{T.LOGO_NEG}</div>
<div class="kicker">Montagsbrief · {e(W["kw"])} · {e(KUNDE)} auf Amazon · Woche vom {e(zeitraum)}</div></div>
<div class="hgrid"><div><h1>{e(h1)}</h1></div>{wichtigstes()}</div></div></header>
{glance()}<main class="wrap">{sections()}{legend}{luecken()}<p class="src">{e(quelle)}</p></main>
<footer class="foot wrap"><span>PPotthoff · Montagsbrief {e(W["kw"])} · {e(KUNDE)}</span><span>Fragen und Anmerkungen gern unten in den Kommentaren.</span></footer>"""

CSS = T.FONTS + f""":root{{--surface:{T.SURFACE};--surface2:{T.SURFACE2};--paper:{T.PAPER};--ink:{T.INK};--ink-soft:{T.INK_SOFT};--green:{T.GREEN};--on-green:{T.ON_GREEN};--green-soft:{T.GREEN_SOFT};--rule:{T.RULE};--critical:{T.CRITICAL};--display:Newsreader,Georgia,serif;--sans:"Schibsted Grotesk",Arial,sans-serif}}
*{{box-sizing:border-box;border-radius:0}} html,body{{margin:0;background:var(--surface);color:var(--ink)}}
body{{font-family:var(--sans);font-size:15.5px;line-height:1.5;-webkit-font-smoothing:antialiased}} a{{color:var(--green)}}
.wrap{{max-width:1240px;margin:0 auto;padding:0 32px}}
.hero{{background:var(--green);color:var(--on-green);padding:22px 0 30px}} .htop{{display:flex;align-items:center;gap:24px;flex-wrap:wrap}}
.logo svg{{height:24px;width:auto;display:block}} .kicker{{font-size:13px;color:var(--green-soft)}}
.hgrid{{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:40px;margin-top:22px;align-items:start}}
h1{{font-family:var(--display);font-weight:300;font-size:clamp(28px,3.4vw,40px);line-height:1.12;letter-spacing:-.5px;margin:0}}
.key{{border-left:1px solid rgba(245,240,230,.25);padding-left:32px}} .key h2{{font-size:13px;font-weight:600;color:var(--green-soft);margin:0 0 8px}}
.key ul{{margin:0;padding-left:18px;font-size:16px}} .key li{{margin-bottom:6px}}
.glance{{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));background:var(--paper);border:1px solid var(--rule);border-top:0}}
.tile{{display:flex;flex-direction:column;gap:1px;padding:12px 14px 14px;text-decoration:none;color:var(--ink);border-top:4px solid var(--rule);border-right:1px solid var(--rule)}}
.tile:last-child{{border-right:0}} .t-g{{border-top-color:var(--green-soft)}} .t-y{{border-top-color:var(--ink)}} .t-r{{border-top-color:var(--critical)}}
.tb{{font-size:12px;color:var(--ink-soft);font-weight:600}} .tv{{font-family:var(--display);font-size:24px;line-height:1.15;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.tl{{font-size:12px;color:var(--ink-soft);line-height:1.3}} .ts{{font-size:12px;font-weight:600;margin-top:6px}} .t-r .ts{{color:var(--critical)}}
.klegend{{font-size:12.5px;color:var(--ink-soft);margin:18px 0 14px;display:flex;flex-wrap:wrap;gap:4px 16px}}
.dot{{display:inline-block;width:10px;height:10px;flex:none;margin-right:6px;vertical-align:-1px}}
.d-r{{background:var(--critical)}} .d-y{{background:var(--ink)}} .d-g{{background:var(--green-soft)}} .d-n{{border:1px solid var(--ink-soft)}}
.atools{{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:28px 0 10px;flex-wrap:wrap}} .ah{{font-family:var(--display);font-weight:400;font-size:24px;color:var(--green);margin:0}}
.hint{{font-size:13px;color:var(--ink-soft)}}
.areas{{background:var(--paper);border:1px solid var(--rule)}} .area{{border-top:1px solid var(--rule)}} .area:first-child{{border-top:0}}
.area>summary{{list-style:none;cursor:pointer;display:grid;grid-template-columns:auto minmax(0,1fr) 190px 20px;column-gap:20px;align-items:center;padding:16px 22px}}
.area>summary::-webkit-details-marker{{display:none}} .area>summary:hover{{background:var(--surface)}} .area[open]>summary{{background:var(--surface2)}}
.area>summary .dot{{width:12px;height:12px;margin:0}} .at{{display:flex;flex-direction:column;min-width:0}}
.an{{font-family:var(--display);font-size:20px;line-height:1.2;color:var(--green)}} .ak{{font-size:14.5px;margin-top:2px}}
.as{{font-size:13px;font-weight:600;text-align:right}} .as.s-g,.as.s-n{{color:var(--ink-soft);font-weight:400}} .s-r{{color:var(--critical)}}
.chev{{width:10px;height:10px;border-right:2px solid var(--green);border-bottom:2px solid var(--green);transform:rotate(45deg);margin-top:-6px;justify-self:end}}
.area[open] .chev{{transform:rotate(225deg);margin-top:4px}}
.ad{{padding:4px 22px 22px 54px;border-top:1px solid var(--rule)}} .ad>.klist{{display:grid;grid-template-columns:1fr 1fr;column-gap:48px}}
.fgrid{{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:40px}}
.klist{{list-style:none;margin:0;padding:0}} .krow{{display:grid;grid-template-columns:auto minmax(0,1fr) auto;column-gap:4px;align-items:start;padding:10px 0;border-bottom:1px solid var(--rule)}}
.krow .dot{{margin-top:5px;margin-right:8px}} .kleft{{display:flex;flex-direction:column;min-width:0}} .kname{{font-weight:600;font-size:15px}}
.kcmp{{font-size:13px;color:var(--ink-soft);line-height:1.4}} .kval{{font-family:var(--display);font-size:21px;line-height:1.15;text-align:right;white-space:nowrap;padding-left:16px}}
.kval.long{{white-space:normal;font-family:var(--sans);font-size:14px;font-weight:600;max-width:220px}} .kflag{{display:block;font-family:var(--sans);font-size:12px;font-weight:600;margin-top:2px}}
.f-r{{color:var(--critical)}} h3.sub{{font-size:13px;color:var(--ink-soft);font-weight:600;margin:20px 0 6px}}
.tw{{overflow-x:auto}} .dt{{width:100%;border-collapse:collapse;font-size:14px}}
.dt th{{text-align:left;font-size:12px;color:var(--ink-soft);font-weight:600;padding:0 12px 6px 0;border-bottom:1px solid var(--ink-soft);white-space:nowrap}}
.dt td{{padding:8px 12px 8px 0;border-bottom:1px solid var(--rule);vertical-align:top}} .dt .r{{text-align:right;white-space:nowrap}} .dt .b{{font-weight:600}}
.dt .ti{{min-width:180px}} .asin{{display:block;font-size:12px;color:var(--ink-soft)}} .dt tr.k-r td:last-child{{color:var(--critical)}}
.note{{font-size:12.5px;color:var(--ink-soft);margin:6px 0 4px}}
.mov{{display:grid;grid-template-columns:1fr 1fr;gap:28px;border-top:1px solid var(--rule);margin-top:4px}} .ml{{list-style:none;margin:0;padding:0}}
.ml li{{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;padding:8px 0;border-bottom:1px solid var(--rule);font-size:14px}}
.mt{{font-weight:600}} .mv{{font-family:var(--display);font-size:19px;text-align:right}} .mv.dn{{color:var(--critical)}} .mc{{grid-column:1/-1;font-size:12.5px;color:var(--ink-soft)}}
.fl,.hl{{list-style:none;margin:0;padding:0}} .fl li{{display:grid;grid-template-columns:96px minmax(0,1fr) auto;column-gap:12px;padding:9px 0;border-bottom:1px solid var(--rule);font-size:14.5px}}
.fd{{font-weight:600}} .fb{{text-align:right;white-space:nowrap}} .hl li{{padding:8px 0;border-bottom:1px solid var(--rule);font-size:14px}}
.gaps{{margin-top:28px;font-size:14px}} .gaps summary{{cursor:pointer;color:var(--ink-soft);text-decoration:underline}} .gaps li{{margin:6px 0}}
.src{{font-size:12px;color:var(--ink-soft);margin-top:20px;max-width:900px}}
.foot{{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;border-top:1px solid var(--rule);margin-top:28px;padding-top:14px;padding-bottom:28px;font-size:12.5px;color:var(--ink-soft)}}
@media (max-width:1100px){{ .glance{{grid-template-columns:repeat(4,minmax(0,1fr))}} .tile:nth-child(4n){{border-right:0}} }}
@media (max-width:900px){{ .ad>.klist,.fgrid{{grid-template-columns:1fr;gap:0}} .area>summary{{grid-template-columns:auto minmax(0,1fr) 150px 20px}} .hgrid{{grid-template-columns:1fr;gap:20px}} .key{{border-left:0;padding-left:0}} }}
@media (max-width:640px){{ .wrap{{padding:0 16px}} .glance{{grid-template-columns:1fr 1fr}} .tile:nth-child(2n){{border-right:0}}
 .area>summary{{grid-template-columns:auto minmax(0,1fr) 20px;padding:14px 16px;column-gap:12px;align-items:start}} .area>summary .dot{{grid-column:1;grid-row:1;margin-top:6px}} .at{{grid-column:2;grid-row:1}} .chev{{grid-column:3;grid-row:1;margin-top:6px}} .as{{grid-column:2;grid-row:2;text-align:left;margin-top:6px}} .ad{{padding:4px 16px 18px}}
 .mov{{grid-template-columns:1fr;gap:0}} .fl li{{grid-template-columns:84px minmax(0,1fr)}} .fb{{grid-column:2;text-align:left}} }}"""

open(OUTF, "w").write(f'<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Montagsbrief {e(W["kw"])} · {e(KUNDE)}</title><style>{CSS}</style></head><body>{CONTENT}</body></html>')
print(OUTF, os.path.getsize(OUTF))
