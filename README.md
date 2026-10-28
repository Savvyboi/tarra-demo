# tarra — 28-City Street Pole Event Stickers, Interactive 2D Map & Flyer Player (`tarra-demo`)

A client-side event discovery application inspired by street stickers on a galvanized pole, built for **GitHub Pages (`github.io`)** using Finnish municipal & regional **Linked Events APIs**, municipal calendars, and **OpenFreeMap (`tiles.openfreemap.org`)**.

## ✨ Features

- **28 Finnish Cities across 7 Integrated Sources**:
  - **Helsinki, Espoo & Vantaa**: Live browser CORS fetch directly from `https://api.hel.fi/linkedevents/v1/event/?division={helsinki,espoo,vantaa}&include=location,keywords` with **15-minute IndexedDB caching**, stale-while-offline retention, and bundled JSON-LD snapshot fallbacks.
  - **Turku, Tampere & Oulu**: Static `LinkedEvent`-compliant JSON-LD snapshots (`public/feeds/{turku,tampere,oulu}.json`) synced from each city's official Localhub event calendar (`kalenteri.turku.fi`, `tapahtumat.tampere.fi`, `tapahtumat.munoulu.fi`).
  - **Keski-Suomi Events** (`keskisuomievents.fi/api/v1/`): Regional single-fetch sync with cached place-directory resolution across **Jyväskylä, Jämsä, Äänekoski, Keuruu, Saarijärvi & Viitasaari**.
  - **Satakunta Events** (`satakuntaevents.fi/api/v2/`): Regional single-fetch sync with dynamic `se:*` municipality/district place resolution across **Pori, Rauma, Ulvila, Harjavalta, Huittinen, Kokemäki & Kankaanpää**.
  - **EP Kalenteri** (`epkalenteri.linkedevents.fi/v1/`): South Ostrobothnia regional sync with HTTPS URL upgrading, `[lat, lon]` coordinate validation/correction, and historic municipality alias resolution across **Seinäjoki, Lapua, Kauhava, Kauhajoki, Kurikka, Alavus & Ähtäri**.
  - **Hello Kuopio** (`hellokuopio.fi/wp-json/tribe/events/v1/`): Paginated window sync for **Kuopio / Tahko**, filtering out neighboring outside municipalities.
  - **Salon Tapahtumat** (`tapahtumat.salo.fi/wp-json/everblox/v1/eventcalendar`): Municipal calendar sync for **Salo** using compound `blogId:id` identifiers and location classification.
- **2D Interactive Street Map + Street Pole Feed**:
  - Persistent lazy-loaded **MapLibre GL JS v6.16+** 2D street map (`pitch: 0`, `bearing: 0`) with three distinct OpenFreeMap surfaces (`Street` / Liberty, `Midnight` / Dark, `Daylight` / Positron) and **Supercluster** venue sticker markers.
  - Automatic **WebGL & Map Provider Recovery**: isolates the map behind WebGL capability checks, tile-error retry banners, and error boundaries, offering a one-click fallback to the **Street Pole Feed** when WebGL or tiles are unavailable.
  - Honest venue coordinates and pricing: preserves unmapped/online events in the list and schedule without fabricating coordinates, and distinguishes confirmed free admission (`FREE`), paid tickets, and unspecified pricing (`Price not provided`).
- **9:16 Vertical Street Flyer Player & Calendar**:
  - Segmented story progress bars (pauses automatically when `prefers-reduced-motion: reduce` is enabled or the browser tab is hidden, and stops cleanly at the last flyer of the opened venue), keyboard & tap-zone navigation, and `DOMPurify`-sanitized HTML details drawer with safe external link handling.
  - Finnish local time (`Europe/Helsinki`, DST-aware) occurrence date filtering across any viewer time zone, single-day calendar export for multi-day exhibitions, **Google Calendar** links, and RFC 5545 `.ics` calendar exports.
  - Persistent cross-city **Saved Sticker Stash** and **Pole Schedule** drawer with local event snapshots.
  - **Query-Parameter Deep Linking** (`?city=turku&view=list&date=2026-10-30&topic=music&q=...&sort=live&event=...`) with browser history navigation (`pushState` / `popstate`).

## 🚀 Local Development

Requires **Node.js `>= 22.18`** (Node 24 recommended).

```bash
npm install
npm run sync-feeds
npm run dev
```

Lint, unit-test (across time zones), and run Playwright E2E checks:

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

## 📜 Data Licensing

Event metadata, places, keywords, and map tiles are attributed per source:

- **Capital Region 6Aika Linked Events API** (`api.hel.fi/linkedevents/v1/` — Helsinki, Espoo, Vantaa): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Localhub Municipal Event Calendars** (`kalenteri.turku.fi`, `tapahtumat.tampere.fi`, `tapahtumat.munoulu.fi` — Turku, Tampere, Oulu): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Keski-Suomi Events API** (`keskisuomievents.fi/api/v1/` — Jyväskylä, Jämsä, Äänekoski, Keuruu, Saarijärvi, Viitasaari): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Satakunta Events API** (`satakuntaevents.fi/api/v2/` — Pori, Rauma, Ulvila, Harjavalta, Huittinen, Kokemäki, Kankaanpää): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **EP Kalenteri / Etelä-Pohjanmaan liitto** (`epkalenteri.linkedevents.fi/v1/` — Seinäjoki, Lapua, Kauhava, Kauhajoki, Kurikka, Alavus, Ähtäri): [EP Kalenteri Terms](https://epliitto.fi/kulttuurin-kehittaminen/tapahtumakalenteri/)
- **Hello Kuopio Regional Event Calendar** (`hellokuopio.fi/wp-json/tribe/events/v1/` — Kuopio / Tahko): [Hello Kuopio Terms](https://www.hellokuopio.fi/)
- **Salon Tapahtumat Municipal Calendar** (`tapahtumat.salo.fi/wp-json/everblox/v1/eventcalendar` — Salo): [Salon Tapahtumat Terms](https://tapahtumat.salo.fi/)
- **Base Map Tiles & Styles**: [OpenFreeMap](https://openfreemap.org) (`tiles.openfreemap.org`) & [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

Event images marked `"license": "event_only"` are displayed strictly within their specific event's marker and flyer with source and photographer attribution.
