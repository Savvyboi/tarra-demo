import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEEDS_DIR = path.resolve(__dirname, '../public/feeds');

const LOCALHUB_CITIES = {
  turku: {
    cityId: 'turku',
    cityName: 'Turku',
    siteId: '64eb1340b3df576fc965b8a7',
    backend: 'https://kalenteri.turku.fi/api',
    frontend: 'https://kalenteri.turku.fi',
    s3Base: 'https://localhub-oy.s3.eu-central-1.amazonaws.com/images',
    defaultCoords: [22.2666, 60.4518],
    maxEvents: 450,
  },
  tampere: {
    cityId: 'tampere',
    cityName: 'Tampere',
    siteId: '634844c32f41a024ee51a234',
    backend: 'https://tapahtumat.tampere.fi/api',
    frontend: 'https://tapahtumat.tampere.fi',
    s3Base: 'https://cdn.townbase.com/images',
    defaultCoords: [23.7610, 61.4978],
    maxEvents: 450,
  },
  oulu: {
    cityId: 'oulu',
    cityName: 'Oulu',
    siteId: '5dc549a38925dd23b5949a4d',
    backend: 'https://tapahtumat.munoulu.fi/api',
    frontend: 'https://tapahtumat.munoulu.fi',
    s3Base: 'https://localhub-oy.s3.eu-central-1.amazonaws.com/images',
    defaultCoords: [25.4651, 65.0121],
    maxEvents: 450,
  },
};

function parseVenueAndAddress(rawAddress, cityName) {
  if (!rawAddress || typeof rawAddress !== 'string') {
    return { venueName: `${cityName} Tapahtumapaikka`, streetAddress: cityName };
  }
  const parts = rawAddress
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return {
      venueName: parts[0],
      streetAddress: parts.slice(1).join(', '),
    };
  }
  if (parts.length === 2) {
    // e.g. "Kristiinankatu 5, 20100 Turku" vs "Logomo, Junakatu 9"
    const firstHasDigits = /\d/.test(parts[0]);
    return {
      venueName: firstHasDigits ? parts[0] : parts[0],
      streetAddress: parts.join(', '),
    };
  }
  return {
    venueName: parts[0] || cityName,
    streetAddress: rawAddress,
  };
}

function convertLocalhubPageToLinkedEvent(page, cfg, index) {
  const now = new Date();
  const loc = Array.isArray(page.locations) && page.locations[0] ? page.locations[0] : null;
  const rawAddress =
    loc?.alt?.fi?.address ||
    loc?.address ||
    cfg.cityName;

  const { venueName, streetAddress } = parseVenueAndAddress(rawAddress, cfg.cityName);

  let coordinates = cfg.defaultCoords;
  if (loc && Number.isFinite(loc.lng) && Number.isFinite(loc.lat)) {
    coordinates = [Number(loc.lng.toFixed(6)), Number(loc.lat.toFixed(6))];
  } else {
    // Slight deterministic offset around city center for virtual/unmapped events
    const angle = (index * 137.5 * Math.PI) / 180;
    const r = 0.003 + (index % 7) * 0.002;
    coordinates = [
      Number((cfg.defaultCoords[0] + Math.cos(angle) * r * 1.8).toFixed(6)),
      Number((cfg.defaultCoords[1] + Math.sin(angle) * r).toFixed(6)),
    ];
  }

  // Extract upcoming individual dates
  const rawDates = Array.isArray(page.event?.dates) ? page.event.dates : [];
  const validDates = rawDates
    .filter((d) => d && d.start && !d.isCancelled)
    .map((d) => ({
      start: d.start,
      end: d.end || new Date(new Date(d.start).getTime() + 2.5 * 3600 * 1000).toISOString(),
      urlPurchaseTicket: d.urlPurchaseTicket || d.urlSignUp || null,
    }));

  // Pick the current or next upcoming occurrence (or fallback to defaultStartDate)
  let chosenSlot =
    validDates.find((d) => new Date(d.end) >= now) ||
    validDates[0] || {
      start: page.defaultStartDate || page.event?.start || now.toISOString(),
      end:
        page.defaultEndDate ||
        page.event?.end ||
        new Date(now.getTime() + 3 * 3600 * 1000).toISOString(),
      urlPurchaseTicket: null,
    };

  const imageHash = page.imageMobile || page.imageDesktop || page.imageList || null;
  const imageUrl = imageHash ? `${cfg.s3Base}/${imageHash}` : null;

  const ticketUrl =
    chosenSlot.urlPurchaseTicket ||
    page.event?.urlPurchaseTicket ||
    page.event?.urlSignUp ||
    page.links?.[0]?.url ||
    `${cfg.frontend}/fi-FI/page/${page._id}`;

  const categories = Array.isArray(page.globalContentCategories)
    ? page.globalContentCategories
    : [];

  const isFree = !page.hasPrice;
  const providerName =
    page.ownerName || page.sourceNameExternal || page.sourceName || `${cfg.cityName} Tapahtumakalenteri`;

  const shortText =
    (page.descriptionShort || '').trim() ||
    (page.name || '').trim();

  const longHtml =
    (page.descriptionLong || '').trim() ||
    `<p>${shortText}</p>`;

  return {
    id: `${cfg.cityId}:${page._id}`,
    '@type': 'Event/LinkedEvent',
    data_source: cfg.cityId,
    publisher: providerName,
    name: {
      fi: page.name || 'Tapahtuma',
      en: page.name || 'Event',
    },
    short_description: {
      fi: shortText,
      en: shortText,
    },
    description: {
      fi: longHtml,
      en: longHtml,
    },
    start_time: chosenSlot.start,
    end_time: chosenSlot.end,
    occurrence_dates: validDates.slice(0, 40).map((d) => ({
      start: d.start,
      end: d.end,
    })),
    provider: {
      fi: providerName,
      en: providerName,
    },
    info_url: {
      fi: ticketUrl,
      en: ticketUrl,
    },
    offers: [
      {
        is_free: isFree,
        price: isFree ? null : { fi: 'Katso liput', en: 'See tickets' },
        info_url: { fi: ticketUrl, en: ticketUrl },
      },
    ],
    location: {
      id: `${cfg.cityId}:loc-${coordinates[0].toFixed(4)}-${coordinates[1].toFixed(4)}`,
      name: {
        fi: venueName,
        en: venueName,
      },
      street_address: {
        fi: streetAddress,
        en: streetAddress,
      },
      address_locality: {
        fi: cfg.cityName,
        en: cfg.cityName,
      },
      position: {
        type: 'Point',
        coordinates,
      },
    },
    keywords: categories.map((cat) => ({
      id: `cat:${cat.toLowerCase()}`,
      name: { fi: cat, en: cat },
    })),
    images: imageUrl
      ? [
          {
            id: `${page._id}-img`,
            url: imageUrl,
            photographer_name: providerName,
            alt_text: page.name || cfg.cityName,
            license: 'event_only',
            data_source: `${cfg.cityName} Tapahtumakalenteri`,
          },
        ]
      : [],
  };
}

async function syncLocalhubCity(cfg) {
  const url = `${cfg.backend}/collection/${cfg.siteId}/content?lang=fi&country=FI&mode=event&sort=startDate`;
  console.log(`[sync-feeds] Fetching ${cfg.cityName} calendar from ${url}...`);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${cfg.cityName}`);
  }
  const json = await res.json();
  const pages = Array.isArray(json.pages) ? json.pages : [];
  const sliced = pages.slice(0, cfg.maxEvents);
  const converted = sliced.map((p, idx) =>
    convertLocalhubPageToLinkedEvent(p, cfg, idx)
  );

  const payload = {
    meta: {
      count: converted.length,
      total_upstream: pages.length,
      next: null,
      previous: null,
      generated_at: new Date().toISOString(),
      source_calendar: cfg.frontend,
    },
    data: converted,
  };

  const outPath = path.join(FEEDS_DIR, `${cfg.cityId}.json`);
  await fs.writeFile(outPath, JSON.stringify(payload), 'utf8');
  console.log(
    `[sync-feeds] ✓ ${cfg.cityName}: Saved ${converted.length} real events (from ${pages.length} upstream) -> public/feeds/${cfg.cityId}.json`
  );
}

function compactCapitalEvent(raw, cityId) {
  return {
    id: raw.id,
    data_source: raw.data_source || cityId,
    publisher: raw.publisher || cityId,
    name: raw.name,
    short_description: raw.short_description,
    description: raw.description,
    start_time: raw.start_time,
    end_time: raw.end_time,
    provider: raw.provider,
    info_url: raw.info_url,
    offers: raw.offers,
    location: raw.location
      ? {
          id: raw.location.id,
          name: raw.location.name,
          street_address: raw.location.street_address,
          address_locality: raw.location.address_locality,
          position: raw.location.position,
        }
      : null,
    keywords: Array.isArray(raw.keywords)
      ? raw.keywords.map((k) => ({ id: k.id, name: k.name }))
      : [],
    images: Array.isArray(raw.images)
      ? raw.images.slice(0, 1).map((img) => ({
          id: img.id,
          url: img.url,
          photographer_name: img.photographer_name,
          alt_text: img.alt_text,
          license: img.license,
          data_source: img.data_source,
        }))
      : [],
  };
}

async function syncCapitalCity(cityId) {
  const collected = [];
  const seenIds = new Set();
  const maxPages = 3; // 3 x 100 = up to 300 real events per Capital Region city

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://api.hel.fi/linkedevents/v1/event/?division=${cityId}&include=location,keywords&start=now&sort=end_time&page_size=100&page=${page}`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) break;
      const json = await res.json();
      if (!Array.isArray(json.data) || json.data.length === 0) break;
      for (const item of json.data) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          collected.push(compactCapitalEvent(item, cityId));
        }
      }
      if (!json.meta?.next) break;
    } catch (err) {
      console.warn(`[sync-feeds] Warning fetching page ${page} for ${cityId}:`, err.message);
      break;
    }
  }

  if (collected.length > 0) {
    const outPath = path.join(FEEDS_DIR, `${cityId}.json`);
    const payload = {
      meta: {
        count: collected.length,
        next: null,
        previous: null,
        generated_at: new Date().toISOString(),
      },
      data: collected,
    };
    await fs.writeFile(outPath, JSON.stringify(payload), 'utf8');
    console.log(
      `[sync-feeds] ✓ ${cityId}: Saved ${collected.length} real 6Aika events -> public/feeds/${cityId}.json`
    );
  }
}

async function main() {
  await fs.mkdir(FEEDS_DIR, { recursive: true });

  for (const cfg of Object.values(LOCALHUB_CITIES)) {
    try {
      await syncLocalhubCity(cfg);
    } catch (err) {
      console.error(`[sync-feeds] Failed to sync ${cfg.cityName}:`, err.message);
    }
  }

  for (const capitalCity of ['helsinki', 'espoo', 'vantaa']) {
    await syncCapitalCity(capitalCity);
  }
}

main().catch((err) => {
  console.error('[sync-feeds] Fatal error:', err);
  process.exit(1);
});
