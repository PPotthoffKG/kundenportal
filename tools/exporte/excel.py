"""Excel-Datei zu einem Bericht aus dem Modell (modell.py) und optional den Kennzahlen.

Aufruf: python3 excel.py <modell.json> <ausgabe.xlsx> [kennzahlen.json]
Blätter: Überblick, Alle Werte, je Tabelle ein Blatt, Kennzahlen (Zahlen zum Weiterrechnen).
"""
import json, re, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

GRUEN, CREME, TINTE, LEISE, ROT = "22372D", "F5F0E6", "211F1A", "5A564C", "9A3B22"
F = "Arial"
KOPF = PatternFill("solid", fgColor=GRUEN)
LINIE = Border(bottom=Side(style="thin", color="DDD5C4"))

def zahl(s):
    """'27.210 €' -> (27210, '#,##0 €'), '86 %' -> (0.86, '0%'), '19,0' -> 19.0; sonst der Text."""
    t = (s or "").strip()
    m = re.fullmatch(r"([−-]?[\d.]+(?:,\d+)?)\s*(€|%)?", t)
    if not m or not re.search(r"\d", m.group(1)):
        return t, None
    roh = m.group(1).replace("−", "-")
    dez = len(roh.split(",")[1]) if "," in roh else 0
    if re.fullmatch(r"-?\d{1,3}(\.\d{3})+(,\d+)?|-?\d+(,\d+)?", roh) is None:
        return t, None
    v = float(roh.replace(".", "").replace(",", "."))
    d = "0" if dez == 0 else "0." + "0" * dez
    if m.group(2) == "€":
        return v, f'#,##{d} "€"'
    if m.group(2) == "%":
        return v / 100, d + "%"
    return v, f"#,##{d}"

def kopfzeile(ws, r, werte):
    for i, w in enumerate(werte, 1):
        c = ws.cell(row=r, column=i, value=w)
        c.font = Font(name=F, bold=True, color="FFFFFF", size=10); c.fill = KOPF
        c.alignment = Alignment(vertical="center", wrap_text=True)
    ws.row_dimensions[r].height = 30

def zelle(ws, r, c, wert, umwandeln=True, fett=False, farbe=TINTE):
    v, fmt = zahl(wert) if umwandeln and isinstance(wert, str) else (wert, None)
    z = ws.cell(row=r, column=c, value=v)
    z.font = Font(name=F, size=10, bold=fett, color=farbe); z.border = LINIE
    z.alignment = Alignment(vertical="top", wrap_text=isinstance(v, str))
    if fmt:
        z.number_format = fmt; z.alignment = Alignment(horizontal="right", vertical="top")
    return z

def breiten(ws, b):
    for i, w in enumerate(b, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

def blattname(n, belegt):
    n = re.sub(r"[\[\]:*?/\\]", "", n)[:31] or "Tabelle"
    k, i = n, 2
    while k in belegt:
        k = f"{n[:28]} {i}"; i += 1
    belegt.add(k); return k

if __name__ == "__main__":
    m = json.load(open(sys.argv[1])); aus = sys.argv[2]
    kz = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else None
    wb = Workbook(); ws = wb.active; ws.title = "Überblick"; belegt = {"Überblick"}
    ws["A1"] = m["titel"]; ws["A1"].font = Font(name="Georgia", size=18, color=GRUEN)
    ws["A2"] = " · ".join(x for x in (m.get("kunde"), m.get("zeitraum")) if x); ws["A2"].font = Font(name=F, size=10, color=LEISE)
    r = 4
    for a in m["seite1"]:
        ws.cell(row=r, column=1, value=a["titel"]).font = Font(name="Georgia", size=13, color=GRUEN); r += 1
        for p in a["absaetze"]:
            c = ws.cell(row=r, column=1, value=p); c.font = Font(name=F, size=11); c.alignment = Alignment(wrap_text=True, vertical="top")
            ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4); ws.row_dimensions[r].height = 32; r += 1
        if a["bereiche"]:
            kopfzeile(ws, r, ["Bereich", "Ampel", "Stand", "Nächster Schritt"]); r += 1
            for b in a["bereiche"]:
                zelle(ws, r, 1, b["name"], False, True); zelle(ws, r, 2, b["ampel"], False, farbe=ROT if b["ampel"] == "Handeln" else TINTE)
                zelle(ws, r, 3, b["satz"], False); zelle(ws, r, 4, b["schritt"], False); r += 1
        for t in a["tabellen"]:
            kopfzeile(ws, r, t["kopf"]); r += 1
            for z in t["zeilen"]:
                for i, w in enumerate(z, 1):
                    zelle(ws, r, i, w)
                r += 1
        r += 1
    if m.get("quelle"):
        ws.cell(row=r, column=1, value=m["quelle"]).font = Font(name=F, size=9, color=LEISE)
    breiten(ws, [26, 14, 60, 50, 16, 16, 16, 16, 16])
    werte = [(a["titel"], w) for a in m["alle"] for w in a["werte"]]
    if werte:
        w2 = wb.create_sheet(blattname("Alle Werte", belegt)); kopfzeile(w2, 1, ["Bereich", "Kennzahl", "Ampel", "Wert", "Vergleich und Hinweis"])
        for i, (ber, w) in enumerate(werte, 2):
            zelle(w2, i, 1, ber, False); zelle(w2, i, 2, w["name"], False, True); zelle(w2, i, 3, w["ampel"], False, farbe=ROT if w["ampel"] == "Handeln" else TINTE)
            zelle(w2, i, 4, w["wert"]); zelle(w2, i, 5, w["vergleich"], False)
        breiten(w2, [22, 38, 14, 16, 80]); w2.freeze_panes = "A2"
    for a in m["alle"]:
        for t in a["tabellen"]:
            w3 = wb.create_sheet(blattname(t["titel"], belegt)); kopfzeile(w3, 1, t["kopf"])
            for i, z in enumerate(t["zeilen"], 2):
                for j, w in enumerate(z, 1):
                    zelle(w3, i, j, w)
            breiten(w3, [max(14, min(50, max([len(z[0]) for z in t["zeilen"]] + [10]) + 2))] + [15] * (len(t["kopf"]) - 1)); w3.freeze_panes = "B2"
    if kz:
        w4 = wb.create_sheet(blattname("Kennzahlen", belegt)); kopfzeile(w4, 1, ["Gruppe", "Kennzahl", "Wert", "Einheit"])
        for i, k in enumerate(kz, 2):
            zelle(w4, i, 1, k["gruppe"], False); zelle(w4, i, 2, k["name"], False)
            c = zelle(w4, i, 3, k["wert"], False)
            if isinstance(k["wert"], (int, float)):
                c.number_format = "#,##0.00"; c.alignment = Alignment(horizontal="right")
            zelle(w4, i, 4, k["einheit"], False)
        breiten(w4, [22, 40, 16, 8]); w4.freeze_panes = "A2"
    wb.save(aus); print(aus)
