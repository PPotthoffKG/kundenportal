"""Kennzahlen eines Berichts als Daten (für den Vergleich von Wochen und Monaten im Portal).

  python3 kennzahlen.py woche  <daten.json>                     -> JSON-Liste auf stdout
  python3 kennzahlen.py monat  <looker.tsv> <JJ-MM> [daten.json] -> JSON-Liste (Looker-Datenblatt, optional plus Erhebung)

Jede Kennzahl: {"gruppe", "name", "wert" (Zahl oder null), "einheit" ("€", "%", "")}. Namen nach der Wörterliste.
"""
import json, re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# (Bereich, Anfang des Namens in der Erhebung) -> (Gruppe, Name im Portal, Einheit)
WOCHE = [
    ("Verkauf", "Umsatz", "Verkauf", "Umsatz", "€"),
    ("Verkauf", "Bestellungen", "Verkauf", "Bestellungen", ""),
    ("Verkauf", "Einheiten", "Verkauf", "Verkaufte Packungen", ""),
    ("Verkauf", "Ø Verkaufspreis", "Verkauf", "Ø Verkaufspreis", "€"),
    ("Verkauf", "Sitzungen", "Verkauf", "Besuche", ""),
    ("Verkauf", "Seitenaufrufe", "Verkauf", "Seitenaufrufe", ""),
    ("Verkauf", "Conversion", "Verkauf", "Packungen je 100 Besuche", ""),
    ("Verkauf", "Buy-Box-Anteil", "Verkauf", "Buy-Box-Anteil", "%"),
    ("Verkauf", "B2B-Umsatz", "Verkauf", "Umsatz mit Geschäftskunden", "€"),
    ("Werbung", "Ausgaben", "Werbung", "Werbekosten", "€"),
    ("Werbung", "Werbeumsatz", "Werbung", "Werbeumsatz", "€"),
    ("Werbung", "TACoS", "Werbung", "Werbekosten am Umsatz", "%"),
    ("Werbung", "ACoS", "Werbung", "Werbekosten am Werbeumsatz", "%"),
    ("Werbung", "ROAS", "Werbung", "Werbeumsatz je Werbe-Euro", "€"),
    ("Werbung", "Klicks", "Werbung", "Klicks", ""),
    ("Werbung", "Impressionen", "Werbung", "Impressionen", ""),
    ("Werbung", "CTR", "Werbung", "Klickrate", "%"),
    ("Werbung", "CPC", "Werbung", "Preis je Klick", "€"),
    ("Konto", "Bewertung der Verkäuferleistung", "Konto", "Kontozustand", ""),
    ("Konto", "Offene Richtlinienverstöße", "Konto", "Offene Richtlinienverstöße", ""),
    ("Lager", "Rate auf Lager", "Lager", "Rate auf Lager", "%"),
    ("Lager", "Lagerbestandsindex", "Lager", "Lagerbestandsindex", ""),
    ("Katalog", "Inaktive Angebote", "Katalog", "Inaktive Angebote", ""),
    ("Katalog", "Offene Vorgänge Produktsicherheit", "Katalog", "Offene Vorgänge Produktsicherheit", ""),
    ("Marke", "Kaufanteil", "Marke", "Kaufanteil Suchbegriff", "%"),
]

def zahl(s):
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return float(s)
    m = re.search(r"-?\d[\d.]*(?:,\d+)?", str(s))
    if not m:
        return None
    t = m.group(0)
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(\.\d{3})+", t):
        t = t.replace(".", "")
    try:
        return float(t)
    except ValueError:
        return None

def aus_erhebung(d):
    out, gesehen = [], set()
    for x in d.get("kennzahlen", []):
        for ber, anfang, gruppe, name, einheit in WOCHE:
            if x.get("bereich") == ber and str(x.get("name", "")).startswith(anfang) and name not in gesehen:
                if ber == "Werbung" and anfang == "Werbeumsatz" and not str(x.get("name")).startswith("Werbeumsatz"):
                    continue
                w = zahl(x.get("wert"))
                out.append({"gruppe": gruppe, "name": name, "wert": w, "einheit": einheit})
                gesehen.add(name)
                break
    return out

def aus_looker(tsv, monat):
    import marken_werte as M
    daten = [r for r in M.lies(tsv) if r["Monat"] == monat and M.zahl(r["gesamt"]) is not None]
    out = []
    sc = next((M.zahl(r["gesamt_sc"]) for r in M.lies(tsv) if r["Monat"] == monat and r["Marke"] == "Pascoe"), None)
    if sc is not None:
        out.append({"gruppe": "Gesamt", "name": "Umsatz im Konto (Seller Central)", "wert": sc, "einheit": "€"})
    summe = lambda f: sum(M.zahl(r[f]) or 0 for r in daten) if daten else None
    out += [{"gruppe": "Gesamt", "name": "Umsatz der Marken", "wert": summe("gesamt"), "einheit": "€"},
            {"gruppe": "Gesamt", "name": "Werbeumsatz der Marken", "wert": summe("werbeumsatz"), "einheit": "€"},
            {"gruppe": "Gesamt", "name": "Werbekosten der Marken", "wert": summe("werbeausgaben"), "einheit": "€"},
            {"gruppe": "Gesamt", "name": "Besuche der Marken", "wert": summe("sitzungen"), "einheit": ""}]
    for r in daten:
        g = M.NAME.get(r["Marke"], r["Marke"])
        bb = M.zahl(r["buybox"]); ra = M.zahl(r["realer_acos"])
        out += [{"gruppe": g, "name": "Umsatz", "wert": M.zahl(r["gesamt"]), "einheit": "€"},
                {"gruppe": g, "name": "davon Werbung", "wert": M.zahl(r["werbeumsatz"]), "einheit": "€"},
                {"gruppe": g, "name": "Besuche", "wert": M.zahl(r["sitzungen"]), "einheit": ""},
                {"gruppe": g, "name": "Buy-Box-Anteil", "wert": None if bb is None else round(bb * 100, 2), "einheit": "%"},
                {"gruppe": g, "name": "Werbekosten", "wert": M.zahl(r["werbeausgaben"]), "einheit": "€"},
                {"gruppe": g, "name": "Werbekosten am Umsatz", "wert": None if ra is None else round(ra * 100, 2), "einheit": "%"}]
    return out

if __name__ == "__main__":
    art = sys.argv[1]
    if art == "woche":
        res = aus_erhebung(json.load(open(sys.argv[2])))
    else:
        res = aus_looker(sys.argv[2], sys.argv[3])
        if len(sys.argv) > 4:
            res = aus_erhebung(json.load(open(sys.argv[4]))) + res
    print(json.dumps(res, ensure_ascii=False))
