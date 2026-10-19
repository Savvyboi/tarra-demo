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
  if (!rawAddress || typeof rawAddress !== 'string' || !rawAddress.trim()) {
    return {
      venueName: 'Location not provided',
      streetAddress: 'Address not provided',
      hasAddress: false,
    };
  }
  const trimmed = rawAddress.trim();
  if (trimmed.toLowerCase() === cityName.toLowerCase()) {
    return {
      venueName: cityName,
      streetAddress: 'Address not provided',
      hasAddress: false,
    };
  }
  const parts = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return {
      venueName: parts[0],
      streetAddress: parts.slice(1).join(', '),
      hasAddress: true,
    };
  }
  if (parts.length === 2) {
    return {
      venueName: parts[0],
      streetAddress: parts.join(', '),
      hasAddress: true,
    };
  }
  return {
    venueName: parts[0] || cityName,
    streetAddress: trimmed,
    hasAddress: true,
  };
}

function buildLocalhubOffers(page, chosenSlot, ticketUrl) {
  // 1. Explicit structured price object from Localhub when hasPrice === true
  if (page.hasPrice === true && page.price && typeof page.price === 'object') {
    const min = Number(page.price.min);
    const max = Number(page.price.max);
    const hasMin = Number.isFinite(min) && min >= 0;
    const hasMax = Number.isFinite(max) && max >= 0;

    if (hasMin && min === 0 && (!hasMax || max === 0)) {
      return [
        {
          is_free: true,
          price: { fi: 'Vapaa pääsy', en: 'Free Entry' },
          info_url: { fi: ticketUrl, en: ticketUrl },
        },
      ];
    }

    if ((hasMin && min > 0) || (hasMax && max > 0)) {
      const label =
        hasMin && hasMax && min !== max
          ? `${min}–${max} €`
          : `${hasMin ? min : max} €`;
      return [
        {
          is_free: false,
          price: { fi: label, en: label },
          info_url: { fi: ticketUrl, en: ticketUrl },
        },
      ];
    }
  }

  // 2. Explicit boolean isFree flag if supplied by upstream
  if (page.isFree === true || page.event?.isFree === true) {
    return [
      {
        is_free: true,
        price: { fi: 'Vapaa pääsy', en: 'Free Entry' },
        info_url: { fi: ticketUrl, en: ticketUrl },
      },
    ];
  }

  // 3. Explicit commercial ticket vendor link or attribute -> Paid / Ticketed
  const vendorHint = `${page.attributes || ''} ${chosenSlot.urlPurchaseTicket || ''} ${page.event?.urlPurchaseTicket || ''}`;
  if (
    Boolean(chosenSlot.urlPurchaseTicket || page.event?.urlPurchaseTicket) ||
    /lippu\.fi|tiketti\.fi|tixly|liveto|biletti|eventim|netticket/i.test(
      vendorHint
    )
  ) {
    return [
      {
        is_free: false,
        price: { fi: 'Katso liput', en: 'See tickets' },
        info_url: { fi: ticketUrl, en: ticketUrl },
      },
    ];
  }

  // 4. Otherwise price is unknown/unprovided — never fabricate free admission
  return [];
}

function convertLocalhubPageToLinkedEvent(page, cfg) {
  const now = new Date();
  const loc =
    Array.isArray(page.locations) && page.locations[0]
      ? page.locations[0]
      : null;
  const rawAddress = loc?.alt?.fi?.address || loc?.address || '';

  const { venueName, streetAddress } = parseVenueAndAddress(
    rawAddress,
    cfg.cityName
  );

  // Finding 07: Only include coordinates when upstream provides finite lng/lat
  let coordinates = null;
  if (
    loc &&
    typeof loc.lng === 'number' &&
    typeof loc.lat === 'number' &&
    Number.isFinite(loc.lng) &&
    Number.isFinite(loc.lat)
  ) {
    coordinates = [Number(loc.lng.toFixed(6)), Number(loc.lat.toFixed(6))];
  }

  // Extract individual dates
  const rawDates = Array.isArray(page.event?.dates) ? page.event.dates : [];
  const validDates = rawDates
    .filter((d) => d && d.start && !d.isCancelled)
    .map((d) => ({
      start: d.start,
      end:
        d.end ||
        new Date(new Date(d.start).getTime() + 2 * 3600 * 1000).toISOString(),
      urlPurchaseTicket: d.urlPurchaseTicket || d.urlSignUp || null,
    }));

  // Pick the current or next upcoming occurrence (or fallback to defaultStartDate)
  const fallbackStart = page.defaultStartDate || page.event?.start || null;
  const fallbackEnd =
    page.defaultEndDate ||
    page.event?.end ||
    (fallbackStart
      ? new Date(new Date(fallbackStart).getTime() + 2 * 3600 * 1000).toISOString()
      : null);

  const chosenSlot =
    validDates.find((d) => new Date(d.end) >= now) ||
    validDates[0] ||
    (fallbackStart
      ? {
          start: fallbackStart,
          end: fallbackEnd,
          urlPurchaseTicket: null,
        }
      : null);

  if (!chosenSlot || !chosenSlot.start) {
    return null;
  }

  const imageHash =
    page.imageMobile || page.imageDesktop || page.imageList || null;
  const imageUrl = imageHash ? `${cfg.s3Base}/${imageHash}` : null;

  const canonicalEventUrl = `${cfg.frontend}/fi-FI/page/${page._id}`;
  const ticketUrl =
    chosenSlot.urlPurchaseTicket ||
    page.event?.urlPurchaseTicket ||
    page.event?.urlSignUp ||
    page.links?.[0]?.url ||
    canonicalEventUrl;

  const categories = Array.isArray(page.globalContentCategories)
    ? page.globalContentCategories
    : [];

  const providerName =
    page.ownerName ||
    page.sourceNameExternal ||
    page.sourceName ||
    `${cfg.cityName} Tapahtumakalenteri`;

  const shortText =
    (page.descriptionShort || '').trim() || (page.name || '').trim();

  const longHtml =
    (page.descriptionLong || '').trim() || `<p>${shortText}</p>`;

  const offers = buildLocalhubOffers(page, chosenSlot, ticketUrl);

  // Finding 17: Preserve genuine photographer credit only when supplied; never copy providerName
  const genuinePhotographer =
    (typeof page.imagePhotographer === 'string' &&
      page.imagePhotographer.trim()) ||
    (typeof page.photographer === 'string' && page.photographer.trim()) ||
    null;

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
    occurrence_dates: validDates.slice(0, 60).map((d) => ({
      start: d.start,
      end: d.end,
      ...(d.urlPurchaseTicket
        ? {
            info_url: {
              fi: d.urlPurchaseTicket,
              en: d.urlPurchaseTicket,
            },
          }
        : {}),
    })),
    provider: {
      fi: providerName,
      en: providerName,
    },
    info_url: {
      fi: ticketUrl,
      en: ticketUrl,
    },
    offers,
    location: {
      id: coordinates
        ? `${cfg.cityId}:loc-${coordinates[0].toFixed(4)}-${coordinates[1].toFixed(4)}`
        : `${cfg.cityId}:unmapped-${page._id}`,
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
      position: coordinates
        ? {
            type: 'Point',
            coordinates,
          }
        : null,
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
            photographer_name: genuinePhotographer,
            alt_text: page.name || cfg.cityName,
            license: 'event_only',
            data_source: `${cfg.cityName} Event Calendar (${cfg.frontend})`,
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
  const converted = sliced
    .map((p) => convertLocalhubPageToLinkedEvent(p, cfg))
    .filter(Boolean);

  if (converted.length < 10) {
    throw new Error(
      `Upstream ${cfg.cityName} returned suspiciously few valid events (${converted.length})`
    );
  }

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
  return converted.length;
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
    super_event: raw.super_event
      ? { id: raw.super_event.id, '@id': raw.super_event['@id'] }
      : null,
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
  let totalUpstream = null;

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://api.hel.fi/linkedevents/v1/event/?division=${cityId}&include=location,keywords&start=now&sort=end_time&page_size=100&page=${page}`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) break;
      const json = await res.json();
      if (typeof json.meta?.count === 'number' && totalUpstream === null) {
        totalUpstream = json.meta.count;
      }
      if (!Array.isArray(json.data) || json.data.length === 0) break;
      for (const item of json.data) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          collected.push(compactCapitalEvent(item, cityId));
        }
      }
      if (!json.meta?.next) break;
    } catch (err) {
      console.warn(
        `[sync-feeds] Warning fetching page ${page} for ${cityId}:`,
        err.message
      );
      break;
    }
  }

  if (collected.length < 5) {
    throw new Error(
      `Capital city ${cityId} returned too few events (${collected.length})`
    );
  }

  const outPath = path.join(FEEDS_DIR, `${cityId}.json`);
  const payload = {
    meta: {
      count: collected.length,
      total_upstream: totalUpstream ?? collected.length,
      next: null,
      previous: null,
      generated_at: new Date().toISOString(),
      source_calendar: 'https://api.hel.fi/linkedevents/v1/',
    },
    data: collected,
  };
  await fs.writeFile(outPath, JSON.stringify(payload), 'utf8');
  console.log(
    `[sync-feeds] ✓ ${cityId}: Saved ${collected.length} real 6Aika events (from ${totalUpstream ?? collected.length} upstream) -> public/feeds/${cityId}.json`
  );
  return collected.length;
}

async function ensureFallbackExists(cityId) {
  const outPath = path.join(FEEDS_DIR, `${cityId}.json`);
  try {
    const raw = await fs.readFile(outPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.data) && parsed.data.length > 0;
  } catch {
    return false;
  }
}

async function main() {
  await fs.mkdir(FEEDS_DIR, { recursive: true });
  let successCount = 0;
  const errors = [];

  for (const cfg of Object.values(LOCALHUB_CITIES)) {
    try {
      await syncLocalhubCity(cfg);
      successCount++;
    } catch (err) {
      console.error(
        `[sync-feeds] Failed to sync ${cfg.cityName}:`,
        err.message
      );
      const hasExisting = await ensureFallbackExists(cfg.cityId);
      if (!hasExisting) {
        errors.push(`${cfg.cityId}: ${err.message} (no existing fallback)`);
      }
    }
  }

  for (const capitalCity of ['helsinki', 'espoo', 'vantaa']) {
    try {
      await syncCapitalCity(capitalCity);
      successCount++;
    } catch (err) {
      console.error(
        `[sync-feeds] Failed to sync ${capitalCity}:`,
        err.message
      );
      const hasExisting = await ensureFallbackExists(capitalCity);
      if (!hasExisting) {
        errors.push(`${capitalCity}: ${err.message} (no existing fallback)`);
      }
    }
  }

  if (errors.length > 0 || successCount === 0) {
    throw new Error(
      `Feed synchronization failed critical checks (succeeded: ${successCount}/6). Errors: ${errors.join('; ')}`
    );
  }
}

main().catch((err) => {
  console.error('[sync-feeds] Fatal error:', err);
  process.exit(1);
});
