"""Konzept fürs Kundenportal (Berichtsart „konzept“).

Aufruf: python3 konzept_portal.py <daten.json> <ausgabeordner>

Schreibt in den Ausgabeordner:
  seite1.html          Kurzfassung: das Wichtigste, Ist-Stand, Richtungen, Reihenfolge, offene Fragen
  alle-werte.html      alles in voller Länge: Folien und Entwürfe (im Portal: „In voller Länge“)
  zusammenfassung.txt  höchstens drei Sätze, ein Satz je Zeile

Daten (JSON):
  titel, konto, stand (JJJJ-MM-TT)
  saetze: [3 Sätze]
  stand_kurz: [{titel, satz}]
  richtungen: [{titel, satz, bild}]        bild: Pfad zu einer Bilddatei (Vorschau)
  reihenfolge: [Sätze], fragen: [Sätze]
  folien: [{titel, bild}], entwuerfe: [{titel, satz, bild}]
  quelle: Satz

Rahmen und Gestaltung wie Montagsbrief und Listing-Check: ohne JavaScript, CSS eingebettet,
Bilder als eingebettete JPEG.
"""
import os, re, sys, json, html, io, base64
from PIL import Image

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HIER, "..", "montagsbrief"))
import theme as T  # noqa: E402

e = html.escape
QUELLE_CSS = open(os.path.join(HIER, "..", "montagsbrief", "wochenstand_portal.py"), encoding="utf-8").read()
CSS = T.FONTS + re.search(r'CSS = T\.FONTS \+ """(.*?)"""', QUELLE_CSS, re.S).group(1) + """
.richtungen{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--s6);margin-top:var(--s4)}
.richtung{display:flex;flex-direction:column;gap:var(--s2)}
.richtung img{width:100%;aspect-ratio:16/7;object-fit:cover;object-position:top;border:1px solid var(--rule);display:block}
.richtung .n{font:400 var(--t-h3)/1.25 var(--serif);color:var(--green)}
.richtung p{font-size:var(--t-neben)}
.verweis{margin-top:var(--s8);padding:var(--s4) var(--s6);background:var(--surface);font-size:var(--t-neben);max-width:var(--lesebreite)}
figure{margin:var(--s4) 0 var(--s8)} figure img{display:block;width:100%;height:auto;border:1px solid var(--rule)}
figcaption{font-size:var(--t-fein);color:var(--ink-soft);margin-top:var(--s2)}
.zwischen{font:400 var(--t-h3)/1.25 var(--serif);color:var(--green);margin:var(--s8) 0 var(--s1)}
@media (max-width:700px){.richtungen{grid-template-columns:1fr}.bereich{grid-template-columns:1fr}}
@media print{figure{break-inside:avoid}}
"""

if len(sys.argv) < 3:
    sys.exit(__doc__)
D = json.load(open(sys.argv[1], encoding="utf-8"))
OUTD = sys.argv[2]
dat = lambda iso: f"{iso[8:10]}.{iso[5:7]}.{iso[0:4]}" if iso and len(iso) >= 10 else (iso or "")


def bild(pfad, breite, q=80):
    im = Image.open(pfad).convert("RGB")
    if im.width > breite:
        im = im.resize((breite, int(im.height * breite / im.width)), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, "JPEG", quality=q, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


def seite(titel, inhalt):
    return (f'<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{e(titel)}</title><style>{CSS}</style></head><body>{inhalt}</body></html>')


def druckkopf(zusatz=""):
    return (f'<p class="druckkopf">PPotthoff · Konzept{e(zusatz)} · {e(D.get("konto", ""))} · Stand {e(dat(D.get("stand", "")))} · '
            f'Fragen: kontakt@patrickpotthoff.de</p>')


def quelle():
    return f'<p class="quelle">{e(D.get("quelle", ""))}</p>' if D.get("quelle") else ""


def seite1():
    t = "<h2>Das Wichtigste</h2>"
    t += f'<div class="lage">{"".join(f"<p>{e(x)}</p>" for x in (D.get("saetze") or [])[:3])}</div>'
    if D.get("stand_kurz"):
        t += "<h2>Wo wir stehen</h2>"
        for b in D["stand_kurz"]:
            t += f'<section class="bereich"><div class="kopfz">{e(b["titel"])}</div><div><p>{e(b["satz"])}</p></div></section>'
    if D.get("richtungen"):
        t += "<h2>Drei Richtungen zur Auswahl</h2><div class=\"richtungen\">"
        for r in D["richtungen"]:
            t += (f'<div class="richtung"><img src="{bild(r["bild"], 640, 78)}" alt="Vorschau {e(r["titel"])}">'
                  f'<p class="n">{e(r["titel"])}</p><p>{e(r["satz"])}</p></div>')
        t += "</div>"
    if D.get("reihenfolge"):
        t += "<h2>Vorschlag für die Reihenfolge</h2>"
        t += f'<ol class="punkte" style="padding-left:22px">{"".join(f"<li>{e(x)}</li>" for x in D["reihenfolge"])}</ol>'
    if D.get("fragen"):
        t += "<h2>Was wir noch brauchen</h2>"
        t += f'<ol class="punkte" style="padding-left:22px">{"".join(f"<li>{e(x)}</li>" for x in D["fragen"])}</ol>'
    t += '<p class="verweis">Alle Folien und die drei A+-Entwürfe stehen unter „In voller Länge“.</p>'
    t += quelle() + druckkopf()
    return seite(f'{D.get("titel", "Konzept")}', t)


def voll():
    t = ""
    if D.get("folien"):
        t += "<h2>Konzept</h2>"
        for i, f in enumerate(D["folien"], 1):
            t += f'<figure><img src="{bild(f["bild"], 1600, 78)}" alt="Folie {i}: {e(f["titel"])}"><figcaption>Folie {i} · {e(f["titel"])}</figcaption></figure>'
    if D.get("entwuerfe"):
        t += "<h2>A+-Entwürfe</h2>"
        if D.get("entwuerfe_hinweis"):
            t += f'<p class="note">{e(D["entwuerfe_hinweis"])}</p>'
        for x in D["entwuerfe"]:
            t += (f'<p class="zwischen">{e(x["titel"])}</p><p style="font-size:var(--t-neben)">{e(x["satz"])}</p>'
                  f'<figure><img src="{bild(x["bild"], 1200, 78)}" alt="Entwurf {e(x["titel"])}"></figure>')
    t += quelle() + druckkopf(" · In voller Länge")
    return seite(f'{D.get("titel", "Konzept")} · In voller Länge', t)


os.makedirs(OUTD, exist_ok=True)
for name, inhalt in (("seite1.html", seite1()), ("alle-werte.html", voll()),
                     ("zusammenfassung.txt", "\n".join((D.get("saetze") or [])[:3]) + "\n")):
    p = os.path.join(OUTD, name)
    open(p, "w", encoding="utf-8").write(inhalt)
    print(p, os.path.getsize(p))
