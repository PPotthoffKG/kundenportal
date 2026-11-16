"""PDF, PowerPoint und Excel zu einem Bericht bauen und an den Bericht im Portal hängen (Status bleibt).

Aufruf: python3 bauen.py --kunde pascoe --art wochenstand --zeitraum "KW 45" --titel "Montagsbrief KW 45" \
          --unter "Pascoe · 02.11. bis 08.11.2026" --seite1 seite1.html [--alle alle-werte.html] [--kennzahlen kz.json] [--ohne-excel] [--nur-bauen DIR] [--kanal vendor|seller]
"""
import argparse, base64, json, os, subprocess, sys, tempfile, urllib.request, urllib.error
HIER = os.path.dirname(os.path.abspath(__file__))
URL = "https://arzhbbpzoqwhyykewsat.supabase.co/functions/v1/ablage"
NODE = dict(os.environ, NODE_PATH=subprocess.run(["npm", "root", "-g"], capture_output=True, text=True).stdout.strip())

def schluessel():
    return os.environ.get("PORTAL_ABLAGE_SCHLUESSEL") or open(os.path.join(HIER, "..", "ablage_schluessel.local.txt")).read().strip()

a = argparse.ArgumentParser()
for f in ("kunde", "art", "zeitraum", "titel", "unter", "seite1"):
    a.add_argument("--" + f, required=True)
a.add_argument("--alle"); a.add_argument("--kennzahlen"); a.add_argument("--kanal"); a.add_argument("--ohne-excel", action="store_true"); a.add_argument("--nur-bauen")
o = a.parse_args()
d = o.nur_bauen or tempfile.mkdtemp()
os.makedirs(d, exist_ok=True)
modell = os.path.join(d, "modell.json")
kunde_name, _, zeitraum_text = o.unter.partition(" · ")
with open(modell, "w") as f:
    subprocess.run([sys.executable, os.path.join(HIER, "modell.py"), o.seite1] + ([o.alle] if o.alle else []) +
                   ["--titel", o.titel, "--zeitraum", zeitraum_text, "--kunde", kunde_name], stdout=f, check=True)
pdf, pptx, xlsx = (os.path.join(d, "bericht." + e) for e in ("pdf", "pptx", "xlsx"))
subprocess.run(["node", os.path.join(HIER, "pdf.js"), o.seite1, o.alle or "-", pdf, o.titel, o.unter], check=True, env=NODE, stdout=subprocess.DEVNULL)
subprocess.run(["node", os.path.join(HIER, "powerpoint.js"), modell, pptx], check=True, env=NODE, stdout=subprocess.DEVNULL)
subprocess.run(["zip", "-dq", pptx, "*/"], stderr=subprocess.DEVNULL)
if not o.ohne_excel:
    subprocess.run([sys.executable, os.path.join(HIER, "excel.py"), modell, xlsx] + ([o.kennzahlen] if o.kennzahlen else []), check=True, stdout=subprocess.DEVNULL)
if o.nur_bauen:
    print("gebaut in", d); sys.exit(0)
b64 = lambda p: base64.b64encode(open(p, "rb").read()).decode() if os.path.exists(p) else None
daten = dict(aktion="exporte", kunde_slug=o.kunde, art=o.art, zeitraum=o.zeitraum, kanal=o.kanal, pdf_base64=b64(pdf), pptx_base64=b64(pptx),
             xlsx_base64=None if o.ohne_excel else b64(xlsx))
req = urllib.request.Request(URL, data=json.dumps(daten).encode(), method="POST", headers={"Content-Type": "application/json", "x-ablage-schluessel": schluessel()})
try:
    with urllib.request.urlopen(req, timeout=120) as r:
        print(o.zeitraum, r.read().decode())
except urllib.error.HTTPError as f:
    print(o.zeitraum, f.code, f.read().decode()); sys.exit(1)
