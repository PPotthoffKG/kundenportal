# Kundenportal PPotthoff

Oberfläche des Kundenportals (GitHub Pages, portal.ppotthoff.io). Daten, Anmeldung und Dateien liegen in Supabase (Frankfurt); alle Zugriffsrechte stehen als Zeilenregeln in der Datenbank.

- `index.html`, `app.js`, `styles.css`: Oberfläche im Design System PPotthoff
- `config.js`: öffentliche Verbindungsdaten (Publishable Key, kein Geheimnis)
- `supabase/functions/ablage`: Ablage für Berichte (Entwürfe), geschützt mit Ablage-Schlüssel
- `tools/veroeffentlichen.py`: legt eine gebaute Monatsauswertung als Entwurf ab

Keine Schlüssel, Passwörter oder Kundendaten in dieses Repo.
