"""Legt eine gebaute Monatsauswertung als Entwurf im Kundenportal ab.

Aufruf: python3 veroeffentlichen.py <kunde_slug> <ausgabe/Dateiname ohne Endung> <zeitraum_start JJJJ-MM-TT> [--art monatsauswertung|wochenstand]
Der Ablage-Schlüssel kommt aus der Umgebungsvariable PORTAL_ABLAGE_SCHLUESSEL oder aus ablage_schluessel.local.txt.
Sichtbar für den Kunden wird der Bericht erst nach Freigabe im internen Bereich des Portals.
"""
import base64, json, os, sys, urllib.request

URL = "https://arzhbbpzoqwhyykewsat.supabase.co/functions/v1/ablage"
HIER = os.path.dirname(os.path.abspath(__file__))


def schluessel():
    s = os.environ.get("PORTAL_ABLAGE_SCHLUESSEL")
    if s:
        return s
    return open(os.path.join(HIER, "ablage_schluessel.local.txt")).read().strip()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    art = "wochenstand" if "--art" in sys.argv and sys.argv[sys.argv.index("--art") + 1] == "wochenstand" else "monatsauswertung"
    if art == "wochenstand":
        args = [a for a in args if a != "wochenstand"]
    slug, basis, start = args[:3]
    meta = json.load(open(basis + ".json"))
    html = open(basis + "_bildschirm.html", encoding="utf-8").read()
    pdf = base64.b64encode(open(basis + ".pdf", "rb").read()).decode() if os.path.exists(basis + ".pdf") else None
    titel = ("Monatsauswertung " if art == "monatsauswertung" else "Wochenstand ") + meta["monat"]
    daten = dict(aktion="bericht", kunde_slug=slug, art=art, zeitraum=meta["monat"], zeitraum_start=start, titel=titel,
                 zusammenfassung=meta.get("zusammenfassung"), html=html, pdf_base64=pdf, entscheidungen=meta.get("entscheidungen", []),
                 ueberschreiben="--ueberschreiben" in sys.argv)
    req = urllib.request.Request(URL, data=json.dumps(daten).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "x-ablage-schluessel": schluessel()})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            print(r.read().decode())
    except urllib.error.HTTPError as f:
        print(f.code, f.read().decode())
        sys.exit(1)


if __name__ == "__main__":
    main()
