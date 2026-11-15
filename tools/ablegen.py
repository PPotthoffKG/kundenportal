"""Legt einen Bericht als Entwurf im Kundenportal ab (Montagsbrief, Monatsauswertung, Terminnotiz).

Aufruf:
  python3 ablegen.py --kunde pascoe --art wochenstand --zeitraum "KW 45 2026" --start 2026-11-02 \
      --titel "Montagsbrief KW 45" --html seite1.html [--werte alle-werte.html] [--pdf brief.pdf] \
      [--zusammenfassung zusammenfassung.txt] [--entscheidungen entscheidungen.json] [--ueberschreiben]
Der Ablage-Schlüssel kommt aus PORTAL_ABLAGE_SCHLUESSEL oder ablage_schluessel.local.txt neben diesem Skript.
Sichtbar wird der Bericht erst nach Freigabe im internen Bereich des Portals.
"""
import argparse, base64, json, os, sys, urllib.request, urllib.error

URL = "https://arzhbbpzoqwhyykewsat.supabase.co/functions/v1/ablage"
HIER = os.path.dirname(os.path.abspath(__file__))

def schluessel():
    return os.environ.get("PORTAL_ABLAGE_SCHLUESSEL") or open(os.path.join(HIER, "ablage_schluessel.local.txt")).read().strip()

a = argparse.ArgumentParser()
for f in ("kunde", "art", "zeitraum", "start", "titel", "html"):
    a.add_argument("--" + f, required=True)
for f in ("werte", "pdf", "zusammenfassung", "entscheidungen"):
    a.add_argument("--" + f)
a.add_argument("--ueberschreiben", action="store_true")
o = a.parse_args()
lies = lambda p: open(p, encoding="utf-8").read() if p else None
daten = dict(aktion="bericht", kunde_slug=o.kunde, art=o.art, zeitraum=o.zeitraum, zeitraum_start=o.start, titel=o.titel,
             html=lies(o.html), html_werte=lies(o.werte), zusammenfassung=(lies(o.zusammenfassung) or "").strip() or None,
             pdf_base64=base64.b64encode(open(o.pdf, "rb").read()).decode() if o.pdf else None,
             entscheidungen=json.load(open(o.entscheidungen)) if o.entscheidungen else [], ueberschreiben=o.ueberschreiben)
req = urllib.request.Request(URL, data=json.dumps(daten).encode(), method="POST",
                             headers={"Content-Type": "application/json", "x-ablage-schluessel": schluessel()})
try:
    with urllib.request.urlopen(req, timeout=90) as r:
        print(r.read().decode())
except urllib.error.HTTPError as f:
    print(f.code, f.read().decode()); sys.exit(1)
