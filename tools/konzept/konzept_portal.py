"""Konzept fürs Kundenportal (Berichtsart „konzept“): ein Dokument als Inhalt, z. B. Folien oder ein A+-Entwurf.

Aufruf: python3 konzept_portal.py <daten.json> <ausgabeordner>

Schreibt in den Ausgabeordner:
  seite1.html          das Dokument: kurze Einleitung, dann die Seiten als Bilder untereinander
  zusammenfassung.txt  höchstens drei Sätze, ein Satz je Zeile

Daten (JSON):
  titel, konto, stand (JJJJ-MM-TT)
  saetze: [bis zu 3 Sätze für oben]
  hinweis: Satz (optional, klein unter den Sätzen)
  seiten: [{bild, titel?}]   bild: Pfad zu PNG/JPG; titel wird als Bildunterschrift gezeigt
  breite: Pixelbreite der eingebetteten Bilder (Standard 1600)
  quelle: Satz

Mehrere Konzepte am selben Tag sind möglich (je eigener Zeitraum-Text).
Rahmen und Gestaltung wie Montagsbrief und Listing-Check: ohne JavaScript, CSS eingebettet.
"""
import os, re, sys, json, html, io, base64
from PIL import Image

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HIER, "..", "montagsbrief"))
import theme as T  # noqa: E402

e = html.escape
QUELLE_CSS = open(os.path.join(HIER, "..", "montagsbrief", "wochenstand_portal.py"), encoding="utf-8").read()
CSS = T.FONTS + re.search(r'CSS = T\.FONTS \+ """(.*?)"""', QUELLE_CSS, re.S).group(1) + """
figure{margin:var(--s4) 0 var(--s8)} figure img{display:block;width:100%;height:auto;border:1px solid var(--rule)}
figcaption{font-size:var(--t-fein);color:var(--ink-soft);margin-top:var(--s2)}
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


def seite1():
    t = f'<div class="lage">{"".join(f"<p>{e(x)}</p>" for x in (D.get("saetze") or [])[:3])}</div>'
    if D.get("hinweis"):
        t += f'<p class="note">{e(D["hinweis"])}</p>'
    br = int(D.get("breite", 1600))
    for i, s in enumerate(D.get("seiten") or [], 1):
        cap = f'<figcaption>{e(s["titel"])}</figcaption>' if s.get("titel") else ""
        t += f'<figure><img src="{bild(s["bild"], br, 78)}" alt="{e(s.get("titel") or D.get("titel", "") + " · Seite " + str(i))}">{cap}</figure>'
    if D.get("quelle"):
        t += f'<p class="quelle">{e(D["quelle"])}</p>'
    t += (f'<p class="druckkopf">PPotthoff · {e(D.get("titel", "Konzept"))} · {e(D.get("konto", ""))} · Stand {e(dat(D.get("stand", "")))} · '
          f'Fragen: kontakt@patrickpotthoff.de</p>')
    return (f'<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{e(D.get("titel", "Konzept"))}</title><style>{CSS}</style></head><body>{t}</body></html>')


os.makedirs(OUTD, exist_ok=True)
for name, inhalt in (("seite1.html", seite1()), ("zusammenfassung.txt", "\n".join((D.get("saetze") or [])[:3]) + "\n")):
    p = os.path.join(OUTD, name)
    open(p, "w", encoding="utf-8").write(inhalt)
    print(p, os.path.getsize(p))
