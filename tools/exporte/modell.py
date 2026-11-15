"""Liest die Portalseiten eines Berichts (seite1.html, optional alle-werte.html) in ein einfaches Modell (JSON).

Aufruf: python3 modell.py <seite1.html> [alle-werte.html] --titel "Montagsbrief KW 45" --zeitraum "02.11. bis 08.11.2026" --kunde Pascoe > modell.json
Das Modell ist die gemeinsame Grundlage für PowerPoint und Excel.
"""
import argparse, json, re
import lxml.html

def text(el):
    return re.sub(r"\s+", " ", " ".join(el.itertext())).replace(" ,", ",").replace(" .", ".").strip() if el is not None else ""

def tabelle(t):
    kopf = [text(th) for th in t.xpath(".//thead//th")]
    zeilen = [[text(td) for td in tr.xpath("./td")] for tr in t.xpath(".//tbody/tr")]
    return {"kopf": kopf, "zeilen": [z for z in zeilen if any(z)]}

def werte(ul):
    out = []
    for li in ul.xpath("./li"):
        n = li.xpath('./span[contains(concat(" ",@class," ")," n ")]')
        amp = li.xpath('.//span[contains(@class,"ampel")]')
        name = text(n[0]) if n else ""
        a = text(amp[0]) if amp else ""
        if a and name.endswith(a):
            name = name[: -len(a)].strip()
        w = li.xpath('./span[contains(concat(" ",@class," ")," w ")]')
        v = li.xpath('./span[contains(concat(" ",@class," ")," v ")]')
        out.append({"name": name, "ampel": a, "wert": text(w[0]) if w else "", "vergleich": text(v[0]) if v else ""})
    return out

def abschnitte(body):
    """Folge von h2-Abschnitten mit Absätzen, Lage, Bereichen, Wertelisten und Tabellen (h3 als Untertitel)."""
    res, cur, unter = [], None, ""
    for el in body.iter():
        if not isinstance(el.tag, str):
            continue
        cls = " " + (el.get("class") or "") + " "
        if el.tag == "h2":
            cur = {"titel": text(el), "absaetze": [], "bereiche": [], "werte": [], "tabellen": []}; res.append(cur); unter = ""
        elif cur is None:
            continue
        elif el.tag == "h3":
            unter = text(el)
        elif el.tag == "div" and " lage " in cls:
            cur["absaetze"] += [text(p) for p in el.xpath("./p")]
        elif el.tag == "section" and " bereich " in cls:
            k = el.xpath('./div[contains(@class,"kopfz")]')
            amp = el.xpath('.//span[contains(@class,"ampel")]')
            name = text(k[0]) if k else ""
            a = text(amp[0]) if amp else ""
            if a and name.endswith(a):
                name = name[: -len(a)].strip()
            ps = el.xpath("./div[2]/p")
            satz = " ".join(text(p) for p in ps if "schritt" not in (p.get("class") or ""))
            schritt = " ".join(text(p) for p in ps if "schritt" in (p.get("class") or "")).replace("Nächster Schritt:", "").strip()
            cur["bereiche"].append({"name": name, "ampel": a, "satz": satz, "schritt": schritt})
        elif el.tag == "ul" and " punkte " in cls:
            cur["absaetze"] += [text(li) for li in el.xpath("./li")]
        elif el.tag == "ul" and " werte " in cls:
            cur["werte"] += werte(el)
        elif el.tag == "table" and " t " in cls:
            t = tabelle(el); t["titel"] = unter or cur["titel"]; cur["tabellen"].append(t)
        elif el.tag == "p" and el.getparent() is not None and el.getparent().tag == "body":
            c = el.get("class") or ""
            if "druckkopf" not in c and "quelle" not in c:
                cur["absaetze"].append(text(el))
    return res

if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("seite1"); a.add_argument("alle", nargs="?")
    a.add_argument("--titel", required=True); a.add_argument("--zeitraum", default=""); a.add_argument("--kunde", default="")
    o = a.parse_args()
    m = {"titel": o.titel, "zeitraum": o.zeitraum, "kunde": o.kunde, "seite1": [], "alle": []}
    m["seite1"] = abschnitte(lxml.html.parse(o.seite1).getroot().body)
    if o.alle:
        m["alle"] = abschnitte(lxml.html.parse(o.alle).getroot().body)
    q = lxml.html.parse(o.seite1).getroot().xpath('//p[contains(@class,"quelle")]')
    m["quelle"] = text(q[0]) if q else ""
    print(json.dumps(m, ensure_ascii=False, indent=1))
