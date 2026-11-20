"""Listing-Check fürs Kundenportal: Bestandsaufnahme aller Produktseiten eines Kontos.

Aufruf: python3 listingcheck_portal.py <daten.json> <ausgabeordner>

Schreibt in den Ausgabeordner:
  seite1.html          Das Wichtigste, wo das Potenzial liegt, Vorschlag für die Reihenfolge
  alle-werte.html      alle Artikel mit Einschätzung je Bereich (im Portal: „Alle Artikel“)
  zusammenfassung.txt  höchstens drei Sätze, ein Satz je Zeile

Daten (JSON):
  konto, marktplatz, stand (JJJJ-MM-TT)
  saetze: [3 Sätze für oben]
  themen: [{titel, potenzial: hoch|mittel|gering, satz, schritt}]
  reihenfolge: [Sätze]
  aktiv, nicht_aktiv: [{asin, name, status?, texte, bilder, aplus, suchbegriffe, potenzial, vorschlag}]
     texte/bilder/aplus/suchbegriffe: gut | ausbaufaehig | fehlt
     verkauft_von (optional): wer den Artikel gerade auf amazon.de verkauft (Verkäufer im Kaufbereich)
  optional: quelle, aktiv_titel, aktiv_note, nicht_aktiv_note, potenzial_hinweis (eigene Sätze, z. B. bei Marken ohne eigenen Verkauf)

Wie beim Montagsbrief: ohne JavaScript, Rahmen und Titel stellt das Portal, CSS eingebettet
(Abschrift aus montagsbrief/wochenstand_portal.py).
"""
import os, re, sys, json, html

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HIER, "..", "montagsbrief"))
import theme as T  # noqa: E402

e = html.escape
QUELLE_CSS = open(os.path.join(HIER, "..", "montagsbrief", "wochenstand_portal.py"), encoding="utf-8").read()
CSS = T.FONTS + re.search(r'CSS = T\.FONTS \+ """(.*?)"""', QUELLE_CSS, re.S).group(1) + """
.stufe{display:inline-flex;align-items:center;gap:6px;font-size:var(--t-fein);white-space:nowrap}
.stufe::before{content:"";width:10px;height:10px;flex:none;border:1px solid var(--ink-soft)}
.stufe.gut::before{background:var(--green-soft);border-color:var(--green)}
.stufe.ausbaufaehig::before{background:var(--paper);border:3px solid var(--ink)}
.stufe.fehlt::before{background:var(--ink);border-color:var(--ink)}
.pot{font-size:var(--t-neben);white-space:nowrap} .pot.hoch{font-weight:600}
.legende{display:flex;flex-wrap:wrap;gap:var(--s2) var(--s6);margin:var(--s3) 0 var(--s4);font-size:var(--t-fein);color:var(--ink-soft)}
table.t td.vor{font-size:var(--t-fein);color:var(--ink-soft);min-width:220px}
@media print{table.t{break-inside:auto!important}table.t thead{display:table-header-group}}
"""

STUFE = {"gut": "passt", "ausbaufaehig": "ausbaufähig", "fehlt": "fehlt"}
POT = {"hoch": "Potenzial hoch", "mittel": "Potenzial mittel", "gering": "Potenzial gering"}
AMPEL_POT = {"hoch": "y", "mittel": "n", "gering": "g"}

if len(sys.argv) < 3:
    sys.exit(__doc__)
D = json.load(open(sys.argv[1], encoding="utf-8"))
OUTD = sys.argv[2]
KONTO = D.get("konto", "")
dat = lambda iso: f"{iso[8:10]}.{iso[5:7]}.{iso[0:4]}" if iso and len(iso) >= 10 else (iso or "")


def seite(titel, inhalt):
    return (f'<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{e(titel)}</title><style>{CSS}</style></head><body>{inhalt}</body></html>')


def stufe(s):
    return f'<span class="stufe {e(s)}">{e(STUFE.get(s, s))}</span>'


def quelle():
    if D.get("quelle"):
        return f'<p class="quelle">{e(D["quelle"])}</p>'
    return (f'<p class="quelle">Quelle: Seller Central {e(D.get("marktplatz", "DE"))}, Konto {e(KONTO)}, und die Produktseiten auf amazon.de, '
            f'abgerufen am {e(dat(D.get("stand", "")))}. Suchbegriffe: die im Hintergrund hinterlegten Begriffe der eigenen Angebote. '
            f'Im Konto wurde dafür nichts geändert.</p>')


def druckkopf(zusatz=""):
    return (f'<p class="druckkopf">PPotthoff · Listing-Check{e(zusatz)} · {e(KONTO)} · Stand {e(dat(D.get("stand", "")))} · '
            f'Fragen: kontakt@patrickpotthoff.de</p>')


def seite1():
    s = D.get("saetze") or []
    t = "<h2>Das Wichtigste</h2>"
    t += f'<div class="lage">{"".join(f"<p>{e(x)}</p>" for x in s[:3])}</div>'
    t += "<h2>Wo das meiste Potenzial liegt</h2>"
    for th in D.get("themen") or []:
        p = th.get("potenzial", "mittel")
        schritt = f'<p class="schritt">Vorschlag: {e(th["schritt"])}</p>' if th.get("schritt") else ""
        t += (f'<section class="bereich"><div class="kopfz">{e(th["titel"])}<span class="ampel {AMPEL_POT.get(p, "n")}">{e(POT.get(p, p))}</span></div>'
              f'<div><p>{e(th["satz"])}</p>{schritt}</div></section>')
    r = D.get("reihenfolge") or []
    if r:
        t += "<h2>Vorschlag für die Reihenfolge</h2>"
        t += f'<ol class="punkte" style="padding-left:22px">{"".join(f"<li>{e(x)}</li>" for x in r)}</ol>'
        t += f'<p class="note">{e(D.get("reihenfolge_hinweis", ""))}</p>' if D.get("reihenfolge_hinweis") else ""
    t += quelle() + druckkopf()
    return seite(f"Listing-Check · {KONTO}", t)


def tabelle(titel, zeilen, mit_status=False, note=""):
    mit_vk = any(z.get("verkauft_von") for z in zeilen)
    kopf = [("Artikel", "")] + ([("Verkauft von", "")] if mit_vk else []) + ([("Status", "")] if mit_status else []) + [
        ("Texte", ""), ("Bilder", ""), ("A+", ""), ("Suchbegriffe", ""), ("Potenzial", ""), ("Was wir vorschlagen", "vor")]
    th = "".join(f'<th class="{c}" scope="col">{e(h)}</th>' for h, c in kopf)
    body = ""
    for z in zeilen:
        zellen = [f'{e(z["name"])}<span class="asin">{e(z["asin"])}</span>'] + ([e(z.get("verkauft_von") or "")] if mit_vk else []) + ([e(z.get("status", ""))] if mit_status else []) + [
            stufe(z["texte"]), stufe(z["bilder"]), stufe(z["aplus"]), stufe(z["suchbegriffe"]),
            f'<span class="pot {e(z["potenzial"])}">{e(z["potenzial"])}</span>', e(z["vorschlag"])]
        body += "<tr>" + "".join(f'<td class="{c}" data-k="{e(h)}">{v}</td>' for (h, c), v in zip(kopf, zellen)) + "</tr>"
    n = f'<p class="note">{e(note)}</p>' if note else ""
    return f'<h2>{e(titel)}</h2><table class="t"><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>{n}'


def alle_artikel():
    leg = ('<div class="legende"><span class="stufe gut">passt</span><span class="stufe ausbaufaehig">ausbaufähig</span>'
           '<span class="stufe fehlt">fehlt</span><span>Potenzial: ' + e(D.get("potenzial_hinweis") or "wie viel eine Überarbeitung bringen kann, gemessen an Umsatz und Zustand") + '</span></div>')
    t = leg
    t += tabelle(f'{D.get("aktiv_titel") or "Aktive Artikel"} ({len(D.get("aktiv") or [])})', D.get("aktiv") or [],
                 note=D.get("aktiv_note") or "Sortiert nach Umsatz, der umsatzstärkste Artikel zuerst.")
    if D.get("nicht_aktiv"):
        t += tabelle(f'Zurzeit nicht verkaufbar ({len(D["nicht_aktiv"])})', D["nicht_aktiv"], mit_status=True,
                     note=D.get("nicht_aktiv_note") or "Nicht vorrätig oder inaktiv in Seller Central. Artikel mit Ware im Lager oder auf dem Weg zuerst.")
    t += quelle()
    t += ('<p class="quelle">Texte: Titel, Bullet Points und Beschreibung. Bilder: ab 7 passt, 4–6 ausbaufähig, bis 3 fehlt. '
          'Suchbegriffe: fehlen, enthalten fremde Markennamen (fehlt) oder sind länger als die 250 Byte, die Amazon auswertet (ausbaufähig).</p>')
    t += druckkopf(" · Alle Artikel")
    return seite(f"Listing-Check · Alle Artikel · {KONTO}", t)


os.makedirs(OUTD, exist_ok=True)
for name, inhalt in (("seite1.html", seite1()), ("alle-werte.html", alle_artikel()),
                     ("zusammenfassung.txt", "\n".join((D.get("saetze") or [])[:3]) + "\n")):
    p = os.path.join(OUTD, name)
    open(p, "w", encoding="utf-8").write(inhalt)
    print(p, os.path.getsize(p))
