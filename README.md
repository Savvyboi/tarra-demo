# tarra — 6-City Street Pole Event Stickers, Live Map & Flyer Player (`tarra-demo`)

A 100% client-side WebGL event discovery application inspired by street stickers on a galvanized pole, built for **GitHub Pages (`github.io`)** using the **6Aika Linked Events API (`api.hel.fi/linkedevents/v1/`)** and **OpenFreeMap (`tiles.openfreemap.org`)**.

## ✨ Features

- **6 Finnish Cities**:
  - **Helsinki, Espoo & Vantaa**: Live browser CORS fetch directly from `https://api.hel.fi/linkedevents/v1/event/?division={helsinki,espoo,vantaa}&include=location,keywords` with **15-minute IndexedDB caching** and bundled offline JSON-LD fallbacks.
  - **Turku, Tampere & Oulu**: Static `LinkedEvent`-compliant JSON-LD feeds (`public/feeds/{turku,tampere,oulu}.json`) at real city venues (*Logomo, Turun kaupunginteatteri, Turun pääkirjasto, Kupittaanpuisto, Nokia Arena, Tampere-talo, Pääkirjasto Metso, Keskustori, Oulun teatteri, Kulttuuritalo Valve, Ouluhalli, Nallikari*) with dynamic date anchoring and automated 12-hour CI refreshes.
- **MapLibre GL JS + Custom Snap Styles**:
  - Runtime style switcher (`🌒 Snap Midnight`, `⚡ Nordic Neon`, `☀️ Snap Daylight`).
  - **GPU Thermal Heatmap Layer** weighted by live event status and venue event density.
  - **3D Extruded Buildings** at `zoom >= 14.5`.
  - **Supercluster + Venue Story Bubble Markers** with pulsing neon rings, event count badges, and category emojis.
- **9:16 Vertical Snap Story Player Modal**:
  - Segmented auto-advancing story progress bars, keyboard & tap-zone navigation, and pause-on-hold.
  - `DOMPurify`-sanitized HTML event description drawer.
  - Mandatory photographer & source attribution pill (`📷 {photographer_name} • {provider || data_source}`) and `event_only` vs `CC BY 4.0` license guard.
  - One-click **Digitransit / Reittiopas** transit directions to each venue.
  - **Query-Parameter Deep Linking** (`?city=helsinki&time=tonight&topic=music&event=...`) to avoid GitHub Pages `404.html` path-routing traps.

## 🚀 Local Development

```bash
npm install
npm run sync-feeds
npm run dev
```

## 📜 Data Licensing

Event metadata, places, and keywords are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (*Event data: City of Helsinki / Espoo / Vantaa / 6Aika Linked Events API*). Event images marked `"license": "event_only"` are displayed strictly within their specific event's marker and Story Card with full photographer and source credits.
