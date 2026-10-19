# tarra — 6-City Street Pole Event Stickers, Interactive 2D Map & Flyer Player (`tarra-demo`)

A client-side event discovery application inspired by street stickers on a galvanized pole, built for **GitHub Pages (`github.io`)** using the **6Aika Linked Events API (`api.hel.fi/linkedevents/v1/`)**, official municipal Localhub feeds (`kalenteri.turku.fi`, `tapahtumat.tampere.fi`, `tapahtumat.munoulu.fi`), and **OpenFreeMap (`tiles.openfreemap.org`)**.

## ✨ Features

- **6 Finnish Cities**:
  - **Helsinki, Espoo & Vantaa**: Live browser CORS fetch directly from `https://api.hel.fi/linkedevents/v1/event/?division={helsinki,espoo,vantaa}&include=location,keywords` with **15-minute IndexedDB caching**, stale-while-offline retention, and bundled JSON-LD snapshot fallbacks.
  - **Turku, Tampere & Oulu**: Static `LinkedEvent`-compliant JSON-LD snapshots (`public/feeds/{turku,tampere,oulu}.json`) synced from each city's official Localhub event calendar (`kalenteri.turku.fi`, `tapahtumat.tampere.fi`, `tapahtumat.munoulu.fi`) with multi-occurrence preservation and automated CI refreshes.
- **2D Interactive Street Map + Street Pole Feed**:
  - Lazy-loaded **MapLibre GL JS** 2D street map (`pitch: 0`, `bearing: 0`) with runtime surface switcher (`⚡ Street Dark`, `🌒 Deep Night`, `☀️ Paper Light`) and **Supercluster** venue sticker markers.
  - Automatic **WebGL & Map Provider Recovery**: isolates the map behind WebGL capability checks and error boundaries, offering a one-click fallback to the **Street Pole Feed** when WebGL is disabled or unavailable.
  - Honest venue coordinates and pricing: preserves unmapped/online events in the list and schedule without fabricating coordinates, and distinguishes confirmed free admission (`FREE`), paid tickets, and unspecified pricing (`Price not provided`).
- **9:16 Vertical Street Flyer Player & Calendar**:
  - Segmented story progress bars (pauses automatically when `prefers-reduced-motion: reduce` is enabled or the browser tab is hidden), keyboard & tap-zone navigation, and `DOMPurify`-sanitized HTML details drawer.
  - Occurrence-aware date filtering (including multi-day exhibitions and overnight sessions), **Google Calendar** links, and RFC 5545 `.ics` calendar exports.
  - Persistent cross-city **Saved Sticker Stash** with local event snapshots.
  - **Query-Parameter Deep Linking** (`?city=turku&view=list&date=2026-10-20&topic=music&q=...&sort=live&event=...`) with browser history navigation (`pushState` / `popstate`).

## 🚀 Local Development

```bash
npm install
npm run sync-feeds
npm run dev
```

Run the automated regression test suite:

```bash
npm test
```

## 📜 Data Licensing

Event metadata, places, and keywords are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (*6Aika Linked Events API*, *kalenteri.turku.fi*, *tapahtumat.tampere.fi*, *tapahtumat.munoulu.fi*). Event images marked `"license": "event_only"` are displayed strictly within their specific event's marker and flyer with source and photographer attribution.
