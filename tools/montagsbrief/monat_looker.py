"""Monatsauswertung fürs Portal allein aus dem Datenblatt des Looker-Studio-Berichts (für zurückliegende Monate).

Aufruf: python3 monat_looker.py <looker.tsv> <JJ-MM> <vorlage.html> <ausgabeordner> [Kunde]
vorlage.html: irgendeine mit wochenstand_portal.py gebaute Seite; von ihr wird nur der <head> (CSS, Schriften) übernommen.
Schreibt seite1.html (Das Wichtigste des Monats, Zahlen je Marke im Überblick), alle-werte.html (Verlauf je Marke)
und zusammenfassung.txt. Keine Ampeln: Für diese Monate gibt es nur die Zahlen aus dem Datenblatt.
"""
import os, sys, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import marken_werte as M

e = html.escape
# Ab November 2025 laufen alle Marken über das Konto; davor ist der Vorjahresvergleich des Kontos nicht aussagekräftig
ERSTER_VOLLER = "25-11"

def prozent(a, b):
    return None if not a or not b else (a - b) / b * 100

def richtung(p, wort_vor):
    if p is None:
        return ""
    return f"{M.fmt(abs(p), 1)} % {'über' if p >= 0 else 'unter'} {wort_vor}"

def saetze(daten, ziel):
    alle = {(r["Marke"], r["Monat"]): r for r in daten}
    j, mm = ziel.split("-"); mm = int(mm)
    vor = f"{j}-{mm - 1:02d}" if mm > 1 else f"{int(j) - 1}-12"
    vj = f"{int(j) - 1}-{mm:02d}"
    sc = lambda m: M.zahl(alle[("Pascoe", m)]["gesamt_sc"]) if ("Pascoe", m) in alle else None
    s = []
    u, uv, uj = sc(ziel), sc(vor), sc(vj)
    if u:
        teile = [t for t in (richtung(prozent(u, uv), "dem Vormonat") if vor >= ERSTER_VOLLER else "", richtung(prozent(u, uj), "dem Vorjahresmonat") if vj >= ERSTER_VOLLER else "") if t]
        s.append(f"Der Umsatz im Konto lag im {M.monat(ziel).split()[0]} bei {M.eur(u)}" + (", " + " und ".join(teile) if teile else "") + ".")
    akt = [r for r in daten if r["Monat"] == ziel and M.zahl(r["gesamt"]) is not None]
    wk = sum(M.zahl(r["werbeausgaben"]) or 0 for r in akt); wu = sum(M.zahl(r["werbeumsatz"]) or 0 for r in akt)
    um = sum(M.zahl(r["gesamt"]) or 0 for r in akt)
    if wk and um:
        s.append(f"Die Werbung kostete {M.eur(wk)}, das sind {M.fmt(wk / um * 100, 1)} % vom Umsatz der Marken; aus Werbung kamen {M.eur(wu)}.")
    if akt:
        top = max(akt, key=lambda r: M.zahl(r["gesamt"]) or 0)
        satz = f"Den meisten Umsatz machte {M.NAME.get(top['Marke'], top['Marke'])} mit {M.eur(M.zahl(top['gesamt']))}"
        wachs = []
        for r in akt:
            p = alle.get((r["Marke"], vor))
            a, b = M.zahl(r["gesamt"]), M.zahl(p["gesamt"]) if p else None
            if a and b and a >= 1000 and b >= 1000:
                wachs.append((prozent(a, b), r["Marke"]))
        if wachs:
            p, m = max(wachs)
            if p > 0:
                satz += f"; am stärksten zugelegt hat {M.NAME.get(m, m)} mit {M.fmt(p, 1)} % mehr als im Vormonat"
        s.append(satz + ".")
    return s

def seite(kopf, titel, teil):
    k = kopf.split("<title>")[0] + f"<title>{e(titel)}</title>" + kopf.split("</title>", 1)[1] if "<title>" in kopf else kopf
    return k + "<body>" + teil + "</body></html>"

if __name__ == "__main__":
    tsv, ziel, vorlage, aus = sys.argv[1:5]
    kunde = sys.argv[5] if len(sys.argv) > 5 else ""
    daten = [r for r in M.lies(tsv) if r["Monat"] <= ziel]
    kopf = open(vorlage, encoding="utf-8").read().split("<body", 1)[0]
    s = saetze(daten, ziel)
    alles = M.abschnitt(daten, ziel)
    uebersicht = alles.split("<h3>", 1)[0].replace("<h2>Zahlen je Marke</h2>", "<h2>Zahlen je Marke</h2>", 1)
    quelle = f'<p class="quelle">Quelle: Datenblatt des Looker-Studio-Berichts (Seller Central und Werbekonsole, monatlich übertragen). Für diesen Monat gibt es nur diese Zahlen, darum ohne Ampeln. Die ganze Entwicklung je Marke steht unter Alle Werte.</p>'
    druck = f'<p class="druckkopf">PPotthoff · Monatsauswertung {e(M.monat(ziel))} · {e(kunde)} · Fragen: kontakt@patrickpotthoff.de</p>'
    s1 = "<h2>Das Wichtigste des Monats</h2><div class=\"lage\">" + "".join(f"<p>{e(x)}</p>" for x in s) + "</div>" + uebersicht + quelle + druck
    aw = alles + druck
    os.makedirs(aus, exist_ok=True)
    open(os.path.join(aus, "seite1.html"), "w", encoding="utf-8").write(seite(kopf, f"Monatsauswertung {M.monat(ziel)} · {kunde}", s1))
    open(os.path.join(aus, "alle-werte.html"), "w", encoding="utf-8").write(seite(kopf, f"Alle Werte {M.monat(ziel)} · {kunde}", aw))
    open(os.path.join(aus, "zusammenfassung.txt"), "w", encoding="utf-8").write("\n".join(s) + "\n")
    print(aus, "\n".join(s))
