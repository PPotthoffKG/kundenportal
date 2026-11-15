"""Farben, Schriften und Zahlformat für den Montagsbrief (Kundenportal, Richtung C).
Schriften kommen aus fonts/ im Repo und werden als data-URL eingebettet."""
import os, base64
HERE = os.path.dirname(os.path.abspath(__file__))
FD = os.path.normpath(os.path.join(HERE, "..", "..", "fonts"))
SURFACE="#f5f0e6"; SURFACE2="#ede6d6"; PAPER="#ffffff"; INK="#211f1a"; INK_SOFT="#5a564c"
GREEN="#22372d"; GREEN2="#2c4538"; ON_GREEN=SURFACE; GREEN_SOFT="#9fb2a6"; BRASS="#b0894c"; RULE="#ddd5c4"; CRITICAL="#9a3b22"
def _face(family, path, weight):
    p = os.path.join(FD, path)
    data = base64.b64encode(open(p, "rb").read()).decode()
    return f"@font-face{{font-family:'{family}';src:url(data:font/woff2;base64,{data}) format('woff2');font-weight:{weight};font-style:normal;font-display:swap}}"
FONTS = "".join([_face("Newsreader","newsreader-latin-300-normal.woff2",300),_face("Newsreader","newsreader-latin-400-normal.woff2",400),
  _face("Schibsted Grotesk","schibsted-grotesk-latin-400-normal.woff2",400),_face("Schibsted Grotesk","schibsted-grotesk-latin-600-normal.woff2",600)])
LOGO_NEG = open(os.path.join(HERE, "assets/logo-quer-negativ.svg")).read()
def fmt(n, dec=0):
    return f"{n:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")
