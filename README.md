# Rentz Multiplayer (MVP) — 4 jucători, fără login

Acest pachet rulează **fără terminal**. E un site static (HTML/CSS/JS) care folosește Supabase (Database + Realtime).

## 1) Supabase: creează tabelele
1. Supabase Dashboard → **SQL Editor**
2. Copy/paste din `supabase/schema.sql` și apasă **Run**
3. Verifică: Database → Tables: `rooms`, `room_players`, `room_events`
4. Verifică: Realtime → Tables: cele 3 tabele sunt active

## 2) Pune cheile în config
Editează `config.js`:
- `SUPABASE_URL`: Settings → Data API → Project URL
- `SUPABASE_ANON_KEY`: Settings → API Keys → **Publishable key**

## 3) Rulează local (fără terminal)
Deschide `index.html` în browser.

> Unele browsere blochează Realtime dacă deschizi `file://`. Dacă nu merge:
> - Urcă proiectul în GitHub și folosește GitHub Pages (recomandat),
> - sau Netlify (drag & drop).

## 4) Publicare pe GitHub Pages (fără terminal)
1. GitHub → New repository (public)
2. Upload toate fișierele din folder (drag & drop în web UI)
3. Repo → Settings → Pages → Source: `main` + `/ (root)` → Save
4. Aștepți link-ul Pages și deschizi de acolo.

## Cum testezi în 4 tab-uri
1. Tab 1: Create room, setezi nume, apoi copiezi codul.
2. Tab 2/3/4: Join cu codul.
3. Toți: Ready
4. Host: Start

## Notă de securitate (MVP)
Politicile sunt permisive (fără login). După ce confirmăm că merge, le restrângem.
