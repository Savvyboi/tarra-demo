import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FEEDS_DIR = path.resolve(__dirname, '../public/feeds');

const HORIZON_DAYS = 90;
const CAPITAL_HORIZON_DAYS = 60;
const MAX_CONSOLIDATED_EVENTS_PER_CITY = 550;
const MAX_DESCRIPTION_CHARS = 1100;
export const MAX_FALLBACK_AGE_MS = 3 * 24 * 60 * 60 * 1000;

const KNOWN_LINKED_EVENTS_HOSTS = new Set([
  'epkalenteri.linkedevents.fi',
  'keskisuomievents.fi',
  'satakuntaevents.fi',
  'api.hel.fi',
]);

export const LOCALHUB_CITIES = {
  turku: {
    cityId: 'turku',
    cityName: 'Turku',
    siteId: '64eb1340b3df576fc965b8a7',
    backend: 'https://kalenteri.turku.fi/api',
    frontend: 'https://kalenteri.turku.fi',
    s3Base: 'https://localhub-oy.s3.eu-central-1.amazonaws.com/images',
    defaultCoords: [22.2666, 60.4518],
    maxEvents: 550,
  },
  tampere: {
    cityId: 'tampere',
    cityName: 'Tampere',
    siteId: '634844c32f41a024ee51a234',
    backend: 'https://tapahtumat.tampere.fi/api',
    frontend: 'https://tapahtumat.tampere.fi',
    s3Base: 'https://cdn.townbase.com/images',
    defaultCoords: [23.761, 61.4978],
    maxEvents: 550,
  },
  oulu: {
    cityId: 'oulu',
    cityName: 'Oulu',
    siteId: '5dc549a38925dd23b5949a4d',
    backend: 'https://tapahtumat.munoulu.fi/api',
    frontend: 'https://tapahtumat.munoulu.fi',
    s3Base: 'https://localhub-oy.s3.eu-central-1.amazonaws.com/images',
    defaultCoords: [25.4651, 65.0121],
    maxEvents: 550,
  },
};

export const KESKI_SUOMI_CITIES = {
  jyvaskyla: {
    cityId: 'jyvaskyla',
    cityName: 'Jyväskylä',
    coords: [25.7473, 62.2426],
    aliases: [
      'jyväskylä',
      'jyvaskyla',
      'korpilahti',
      'korpilahden',
      'tikkakoski',
      'vaajakoski',
      'palokka',
      'säynätsalo',
    ],
  },
  jamsa: {
    cityId: 'jamsa',
    cityName: 'Jämsä',
    coords: [25.19, 61.8645],
    aliases: ['jämsä', 'jamsa', 'jämsänkoski', 'kuorevesi', 'himos', 'halli'],
  },
  aanekoski: {
    cityId: 'aanekoski',
    cityName: 'Äänekoski',
    coords: [25.7323, 62.6046],
    aliases: [
      'äänekoski',
      'aanekoski',
      'suolahti',
      'sumiainen',
      'konginkangas',
    ],
  },
  keuruu: {
    cityId: 'keuruu',
    cityName: 'Keuruu',
    coords: [24.7069, 62.2569],
    aliases: ['keuruu', 'haapamäki', 'pihlajavesi'],
  },
  saarijarvi: {
    cityId: 'saarijarvi',
    cityName: 'Saarijärvi',
    coords: [25.2536, 62.7051],
    aliases: ['saarijärvi', 'saarijarvi', 'pylkönmäki'],
  },
  viitasaari: {
    cityId: 'viitasaari',
    cityName: 'Viitasaari',
    coords: [25.8595, 63.0747],
    aliases: ['viitasaari'],
  },
};

export const SATAKUNTA_CITIES = {
  pori: {
    cityId: 'pori',
    cityName: 'Pori',
    coords: [21.7975, 61.4851],
    aliases: [
      'pori',
      'björneborg',
      'noormarkku',
      'ahlainen',
      'lavia',
      'meri-pori',
      'yyteri',
      'reposaari',
    ],
  },
  rauma: {
    cityId: 'rauma',
    cityName: 'Rauma',
    coords: [21.5113, 61.1272],
    aliases: ['rauma', 'raumo', 'lappi', 'kodisjoki'],
  },
  ulvila: {
    cityId: 'ulvila',
    cityName: 'Ulvila',
    coords: [21.8833, 61.4306],
    aliases: ['ulvila', 'ulvsby', 'kullaa'],
  },
  harjavalta: {
    cityId: 'harjavalta',
    cityName: 'Harjavalta',
    coords: [22.1417, 61.3144],
    aliases: ['harjavalta'],
  },
  huittinen: {
    cityId: 'huittinen',
    cityName: 'Huittinen',
    coords: [22.6983, 61.1769],
    aliases: ['huittinen', 'vittis', 'vampula'],
  },
  kokemaki: {
    cityId: 'kokemaki',
    cityName: 'Kokemäki',
    coords: [22.3564, 61.2564],
    aliases: ['kokemäki', 'kokemaki', 'kumo', 'kauvatsa'],
  },
  kankaanpaa: {
    cityId: 'kankaanpaa',
    cityName: 'Kankaanpää',
    coords: [22.3958, 61.8047],
    aliases: ['kankaanpää', 'kankaanpaa', 'honkajoki'],
  },
};

export const EP_CITIES = {
  seinajoki: {
    cityId: 'seinajoki',
    cityName: 'Seinäjoki',
    coords: [22.8403, 62.7903],
    aliases: ['seinäjoki', 'seinajoki', 'nurmo', 'peräseinäjoki', 'ylistaro'],
  },
  lapua: {
    cityId: 'lapua',
    cityName: 'Lapua',
    coords: [23.0089, 62.9692],
    aliases: ['lapua', 'lappo'],
  },
  kauhava: {
    cityId: 'kauhava',
    cityName: 'Kauhava',
    coords: [23.0694, 63.1014],
    aliases: ['kauhava', 'alahärmä', 'ylihärmä', 'kortesjärvi', 'härmä'],
  },
  kauhajoki: {
    cityId: 'kauhajoki',
    cityName: 'Kauhajoki',
    coords: [22.1783, 62.4319],
    aliases: ['kauhajoki'],
  },
  kurikka: {
    cityId: 'kurikka',
    cityName: 'Kurikka',
    coords: [22.4042, 62.6169],
    aliases: ['kurikka', 'jalasjärvi', 'jurva'],
  },
  alavus: {
    cityId: 'alavus',
    cityName: 'Alavus',
    coords: [23.6194, 62.5861],
    aliases: ['alavus', 'alavo', 'töysä', 'tuuri'],
  },
  ahtari: {
    cityId: 'ahtari',
    cityName: 'Ähtäri',
    coords: [24.0694, 62.5556],
    aliases: ['ähtäri', 'ahtari', 'etseri'],
  },
};

export function upgradeKnownUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (!KNOWN_LINKED_EVENTS_HOSTS.has(parsed.hostname)) {
      return null;
    }
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeFinlandCoords(rawCoords) {
  if (
    !Array.isArray(rawCoords) ||
    rawCoords.length !== 2 ||
    typeof rawCoords[0] !== 'number' ||
    typeof rawCoords[1] !== 'number' ||
    !Number.isFinite(rawCoords[0]) ||
    !Number.isFinite(rawCoords[1])
  ) {
    return { coordinates: null, swapped: false };
  }

  const [first, second] = rawCoords;
  if (first >= 18.0 && first <= 32.5 && second >= 59.0 && second <= 70.5) {
    return {
      coordinates: [Number(first.toFixed(6)), Number(second.toFixed(6))],
      swapped: false,
    };
  }
  if (first >= 59.0 && first <= 70.5 && second >= 18.0 && second <= 32.5) {
    return {
      coordinates: [Number(second.toFixed(6)), Number(first.toFixed(6))],
      swapped: true,
    };
  }
  return { coordinates: null, swapped: false };
}

export function decodeHtmlEntities(input) {
  if (!input || typeof input !== 'string' || !input.includes('&')) {
    return input || '';
  }
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#8211;|&ndash;/gi, '–')
    .replace(/&#8212;|&mdash;/gi, '—')
    .replace(/&#8216;|&lsquo;/gi, '‘')
    .replace(/&#8217;|&rsquo;/gi, '’')
    .replace(/&#8220;|&ldquo;/gi, '“')
    .replace(/&#8221;|&rdquo;/gi, '”')
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : _;
    });
}

function stripHtmlTags(html) {
  if (!html || typeof html !== 'string') return '';
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const syncHelsinkiPartsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Helsinki',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function getHelsinkiWallParts(date) {
  const parts = syncHelsinkiPartsFmt.formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  for (const p of parts) {
    if (p.type === 'year') year = Number(p.value);
    else if (p.type === 'month') month = Number(p.value);
    else if (p.type === 'day') day = Number(p.value);
    else if (p.type === 'hour') {
      const h = Number(p.value);
      hour = h === 24 ? 0 : h;
    } else if (p.type === 'minute') minute = Number(p.value);
    else if (p.type === 'second') second = Number(p.value);
  }
  return { year, month, day, hour, minute, second };
}

export function toHelsinkiDateKey(date) {
  const p = getHelsinkiWallParts(date);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function addDaysToDateKey(dateKey, deltaDays) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0, 0));
  return `${String(dt.getUTCFullYear()).padStart(4, '0')}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function zonedHelsinkiToIso(year, month, day, hour = 0, minute = 0, second = 0) {
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const guess1 = targetUtc - 2 * 3600 * 1000;
  const p1 = getHelsinkiWallParts(new Date(guess1));
  const off1 =
    Date.UTC(p1.year, p1.month - 1, p1.day, p1.hour, p1.minute, p1.second, 0) -
    guess1;
  const guess2 = targetUtc - off1;
  const p2 = getHelsinkiWallParts(new Date(guess2));
  const off2 =
    Date.UTC(p2.year, p2.month - 1, p2.day, p2.hour, p2.minute, p2.second, 0) -
    guess2;
  return new Date(targetUtc - off2).toISOString();
}

function parseSyncTimestamp(raw, mode = 'start') {
  if (!raw || typeof raw !== 'string') return null;
  let trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^00[2-9]\d-/.test(trimmed)) {
    trimmed = `20${trimmed.slice(2)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    return mode === 'end'
      ? new Date(zonedHelsinkiToIso(y, m, d, 23, 59, 59))
      : new Date(zonedHelsinkiToIso(y, m, d, 0, 0, 0));
  }
  const localMatch =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (localMatch) {
    return new Date(
      zonedHelsinkiToIso(
        Number(localMatch[1]),
        Number(localMatch[2]),
        Number(localMatch[3]),
        Number(localMatch[4]),
        Number(localMatch[5]),
        localMatch[6] ? Number(localMatch[6]) : 0
      )
    );
  }
  const dt = new Date(trimmed);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function isNonEventTitle(title) {
  if (!title || typeof title !== 'string') return false;
  return /(?<!\p{L})(?:kausikortti|kausikortit|kotipassi|sarjakortti|lahjakortti|vuosikortti|season\s+ticket|season\s+pass)(?!\p{L})/iu.test(
    title
  );
}

/**
 * Strips inline styles/classes/comments and caps oversized descriptions cleanly (`PERF-03`).
 */
function compactDescriptionHtml(rawHtml, maxChars = MAX_DESCRIPTION_CHARS) {
  if (!rawHtml || typeof rawHtml !== 'string') return '';
  let cleaned = decodeHtmlEntities(rawHtml)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/\s+(?:style|class|id|data-[a-z0-9_-]+)="[^"]*"/gi, '')
    .replace(/\s+(?:style|class|id|data-[a-z0-9_-]+)='[^']*'/gi, '')
    .replace(/<p>\s*(?:&nbsp;|\u00a0|\s)*<\/p>/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (cleaned.length <= maxChars) {
    return cleaned;
  }

  // Truncate cleanly before an HTML tag or whitespace boundary so no tag is torn open
  let slice = cleaned.slice(0, maxChars);
  const lastOpenBracket = slice.lastIndexOf('<');
  const lastCloseBracket = slice.lastIndexOf('>');
  if (lastOpenBracket > lastCloseBracket) {
    slice = slice.slice(0, lastOpenBracket);
  }
  const paraBreak = Math.max(slice.lastIndexOf('</p>'), slice.lastIndexOf('</li>'));
  if (paraBreak > maxChars * 0.55) {
    const tagLen = slice.startsWith('</p>', paraBreak) ? 4 : 5;
    return `${slice.slice(0, paraBreak + tagLen)}<p>…</p>`;
  }
  const plainFallback = stripHtmlTags(cleaned).slice(0, maxChars).trim();
  return `<p>${plainFallback}…</p>`;
}

/**
 * Deduplicates identical `fi` / `sv` / `en` strings so JSON feeds don't store
 * 2–3 copies of the same text (`PERF-03`).
 */
function compactLocalized(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const fi = typeof obj.fi === 'string' ? obj.fi.trim() : '';
  const sv = typeof obj.sv === 'string' ? obj.sv.trim() : '';
  const en = typeof obj.en === 'string' ? obj.en.trim() : '';
  const out = {};
  if (fi) out.fi = fi;
  if (sv && sv !== fi) out.sv = sv;
  if (en && en !== fi && en !== sv) out.en = en;
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Picks only the primary localized string (`en || fi || sv` matching `pickLocalizedText`)
 * for bulky fields (`description`, `short_description`, `keywords`, `offers`) (`PERF-03`).
 */
function pickSingleLocalized(obj, transform) {
  if (!obj) return null;
  if (typeof obj === 'string') {
    const val = transform ? transform(obj) : obj.trim();
    return val ? { fi: val } : null;
  }
  if (typeof obj !== 'object') return null;
  for (const lang of ['en', 'fi', 'sv']) {
    const rawVal = typeof obj[lang] === 'string' ? obj[lang].trim() : '';
    if (rawVal) {
      const val = transform ? transform(rawVal) : rawVal;
      if (val) return { [lang]: val };
    }
  }
  return null;
}

function compactKeywordId(rawId) {
  if (!rawId || typeof rawId !== 'string') return '';
  const ysoMatch = /(yso:p\d+)/i.exec(rawId);
  if (ysoMatch) return ysoMatch[1].toLowerCase();
  const parts = rawId.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || '';
}

function haversineKm([lon1, lat1], [lon2, lat2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function sanitizePublisher(pub) {
  if (!pub || typeof pub !== 'string') return '';
  const trimmed = pub.trim();
  if (
    /oidc:user:|^[0-9a-f-]{24,}$|^se:places$|^eptapahtumat:eptapahtumat$/i.test(
      trimmed
    )
  ) {
    return '';
  }
  return trimmed;
}

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

  if (page.isFree === true || page.event?.isFree === true) {
    return [
      {
        is_free: true,
        price: { fi: 'Vapaa pääsy', en: 'Free Entry' },
        info_url: { fi: ticketUrl, en: ticketUrl },
      },
    ];
  }

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

  return [];
}

export function convertLocalhubPageToLinkedEvent(page, cfg, now = new Date()) {
  if (!page || isNonEventTitle(page.name || '')) {
    return null;
  }
  const nowMs = now.getTime();
  const loc =
    Array.isArray(page.locations) && page.locations[0]
      ? page.locations[0]
      : null;
  const rawAddress = loc?.alt?.fi?.address || loc?.address || '';

  const { venueName, streetAddress } = parseVenueAndAddress(
    rawAddress,
    cfg.cityName
  );

  let coordinates = null;
  if (
    loc &&
    typeof loc.lng === 'number' &&
    typeof loc.lat === 'number' &&
    Number.isFinite(loc.lng) &&
    Number.isFinite(loc.lat)
  ) {
    const validated = normalizeFinlandCoords([loc.lng, loc.lat]);
    coordinates = validated.coordinates;
  }

  const rawDates = Array.isArray(page.event?.dates) ? page.event.dates : [];
  const validDates = rawDates
    .filter((d) => d && d.start && !d.isCancelled)
    .map((d) => {
      const startDt = parseSyncTimestamp(d.start, 'start');
      if (!startDt) return null;
      const endDt = d.end
        ? parseSyncTimestamp(d.end, 'end')
        : new Date(startDt.getTime() + 2 * 3600 * 1000);
      const safeEnd =
        endDt && endDt >= startDt
          ? endDt
          : new Date(startDt.getTime() + 2 * 3600 * 1000);
      return {
        start: startDt.toISOString(),
        end: safeEnd.toISOString(),
        endMs: safeEnd.getTime(),
        urlPurchaseTicket: d.urlPurchaseTicket || d.urlSignUp || null,
      };
    })
    .filter(Boolean);

  // Drop past occurrences; return null when no date has end >= now (`BUG-02`, `DATA-01`)
  const upcomingDates = validDates.filter((d) => d.endMs >= nowMs);

  let chosenSlot;
  if (validDates.length > 0) {
    if (upcomingDates.length === 0) {
      return null;
    }
    upcomingDates.sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );
    chosenSlot = upcomingDates[0];
  } else {
    const fallbackStartRaw = page.defaultStartDate || page.event?.start || null;
    const fallbackStartDt = parseSyncTimestamp(fallbackStartRaw, 'start');
    if (!fallbackStartDt) {
      return null;
    }
    const fallbackEndRaw = page.defaultEndDate || page.event?.end || null;
    const fallbackEndDt = fallbackEndRaw
      ? parseSyncTimestamp(fallbackEndRaw, 'end')
      : new Date(fallbackStartDt.getTime() + 2 * 3600 * 1000);
    const safeEndDt =
      fallbackEndDt && fallbackEndDt >= fallbackStartDt
        ? fallbackEndDt
        : new Date(fallbackStartDt.getTime() + 2 * 3600 * 1000);
    if (safeEndDt.getTime() < nowMs) {
      return null;
    }
    chosenSlot = {
      start: fallbackStartDt.toISOString(),
      end: safeEndDt.toISOString(),
      urlPurchaseTicket: null,
    };
  }

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
    stripHtmlTags(page.descriptionShort || '').slice(0, 260) ||
    (page.name || '').trim();

  const longHtml =
    compactDescriptionHtml(page.descriptionLong || '') || `<p>${shortText}</p>`;

  const offers = buildLocalhubOffers(page, chosenSlot, ticketUrl);

  const genuinePhotographer =
    (typeof page.imagePhotographer === 'string' &&
      page.imagePhotographer.trim()) ||
    (typeof page.photographer === 'string' && page.photographer.trim()) ||
    null;

  return {
    id: `${cfg.cityId}:${page._id}`,
    data_source: cfg.cityId,
    publisher: providerName,
    name: {
      fi: page.name || 'Tapahtuma',
    },
    short_description: {
      fi: shortText,
    },
    description: {
      fi: longHtml,
    },
    start_time: chosenSlot.start,
    end_time: chosenSlot.end,
    ...(upcomingDates.length > 0
      ? {
          occurrence_dates: upcomingDates.slice(0, 60).map((d) => ({
            start: d.start,
            end: d.end,
            ...(d.urlPurchaseTicket && d.urlPurchaseTicket !== ticketUrl
              ? {
                  info_url: d.urlPurchaseTicket,
                }
              : {}),
          })),
        }
      : {}),
    provider: {
      fi: providerName,
    },
    info_url: {
      fi: ticketUrl,
    },
    offers,
    location: {
      id: coordinates
        ? `${cfg.cityId}:loc-${coordinates[0].toFixed(4)}-${coordinates[1].toFixed(4)}`
        : `${cfg.cityId}:unmapped-${page._id}`,
      name: {
        fi: venueName,
      },
      street_address: {
        fi: streetAddress,
      },
      address_locality: {
        fi: cfg.cityName,
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
      name: { fi: cat },
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

async function fetchJsonWithRetry(url, retries = 3) {
  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        return await res.json();
      }
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1200 * attempt));
        continue;
      }
      throw new Error(`HTTP ${res.status} from ${url}`);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
    }
  }
  throw lastErr || new Error(`Failed fetching ${url}`);
}

async function syncLocalhubCity(cfg) {
  const url = `${cfg.backend}/collection/${cfg.siteId}/content?lang=fi&country=FI&mode=event&sort=startDate`;
  console.log(`[sync-feeds] Fetching ${cfg.cityName} calendar from ${url}...`);
  const json = await fetchJsonWithRetry(url, 3);
  const pages = Array.isArray(json.pages) ? json.pages : [];
  const now = new Date();
  const nowMs = now.getTime();

  // Convert ALL upstream items first, dropping ended items before sorting & capping (`DATA-01`)
  const allUpcoming = pages
    .map((p) => convertLocalhubPageToLinkedEvent(p, cfg, now))
    .filter(Boolean);

  allUpcoming.sort((a, b) => {
    const aNext = Math.max(new Date(a.start_time).getTime(), nowMs);
    const bNext = Math.max(new Date(b.start_time).getTime(), nowMs);
    if (aNext !== bNext) return aNext - bNext;
    const aDur = new Date(a.end_time).getTime() - new Date(a.start_time).getTime();
    const bDur = new Date(b.end_time).getTime() - new Date(b.start_time).getTime();
    return aDur - bDur;
  });

  if (allUpcoming.length > cfg.maxEvents) {
    console.warn(
      `[sync-feeds] ! ${cfg.cityName}: Cap hit — keeping ${cfg.maxEvents} of ${allUpcoming.length} upcoming events (from ${pages.length} upstream pages).`
    );
  }
  const converted = allUpcoming.slice(0, cfg.maxEvents);

  if (converted.length < 10) {
    throw new Error(
      `Upstream ${cfg.cityName} returned suspiciously few valid events (${converted.length})`
    );
  }

  await writeCityFeedPayload(cfg.cityId, converted, {
    totalUpstream: allUpcoming.length,
    cappedFrom: allUpcoming.length > converted.length ? allUpcoming.length : undefined,
    sourceCalendar: cfg.frontend,
    sourceId: 'localhub',
  });
  console.log(
    `[sync-feeds] ✓ ${cfg.cityName}: Saved ${converted.length} upcoming events (of ${allUpcoming.length} active, ${pages.length} raw upstream) -> public/feeds/${cfg.cityId}.json`
  );
  return converted.length;
}

function compactLinkedEvent(raw, cityId, options = {}) {
  const {
    idPrefix = '',
    fallbackCalendarUrl = '',
    sourceDataLabel = cityId,
  } = options;

  if (!raw || !raw.id || raw.deleted === true) {
    return { event: null, swapped: false };
  }

  const titleCheck =
    raw.name?.fi || raw.name?.en || raw.name?.sv || '';
  if (isNonEventTitle(decodeHtmlEntities(titleCheck))) {
    return { event: null, swapped: false };
  }

  const namespacedId =
    idPrefix && !String(raw.id).startsWith(`${idPrefix}:`)
      ? `${idPrefix}:${raw.id}`
      : String(raw.id);

  let swapped = false;
  let normalizedPosition = null;
  if (raw.location?.position?.coordinates) {
    const coordCheck = normalizeFinlandCoords(
      raw.location.position.coordinates
    );
    swapped = coordCheck.swapped;
    if (coordCheck.coordinates) {
      normalizedPosition = {
        type: 'Point',
        coordinates: coordCheck.coordinates,
      };
    }
  }

  const extLink =
    (Array.isArray(raw.external_links)
      ? raw.external_links
          .map((l) => (typeof l?.link === 'string' ? l.link.trim() : ''))
          .find((u) => /^https?:\/\//i.test(u))
      : '') ||
    (typeof raw.provider_link === 'string' &&
    /^https?:\/\//i.test(raw.provider_link.trim())
      ? raw.provider_link.trim()
      : '') ||
    fallbackCalendarUrl ||
    null;

  const hasInfoUrl =
    raw.info_url &&
    ((typeof raw.info_url === 'string' && raw.info_url.trim()) ||
      (typeof raw.info_url === 'object' &&
        (raw.info_url.fi?.trim() ||
          raw.info_url.en?.trim() ||
          raw.info_url.sv?.trim())));

  const infoUrl = hasInfoUrl
    ? raw.info_url
    : extLink
      ? { fi: extLink, en: extLink }
      : null;

  const provider =
    raw.provider &&
    ((typeof raw.provider === 'string' && raw.provider.trim()) ||
      (typeof raw.provider === 'object' &&
        (raw.provider.fi?.trim() ||
          raw.provider.en?.trim() ||
          raw.provider.sv?.trim())))
      ? raw.provider
      : typeof raw.provider_name === 'string' && raw.provider_name.trim()
        ? { fi: raw.provider_name.trim(), en: raw.provider_name.trim() }
        : typeof raw.custom_data?.provider_name === 'string' &&
            raw.custom_data.provider_name.trim()
          ? {
              fi: raw.custom_data.provider_name.trim(),
              en: raw.custom_data.provider_name.trim(),
            }
          : null;

  const cleanDesc = raw.description
    ? pickSingleLocalized(raw.description, (v) => compactDescriptionHtml(v))
    : null;

  const primaryDescHtml =
    cleanDesc?.en || cleanDesc?.fi || cleanDesc?.sv || '';

  const cleanShortDesc =
    pickSingleLocalized(raw.short_description, (v) =>
      stripHtmlTags(v).slice(0, 240)
    ) ||
    (primaryDescHtml
      ? { fi: stripHtmlTags(primaryDescHtml).slice(0, 200) }
      : null);

  const superEventId = raw.super_event?.['@id'] || raw.super_event?.id || null;
  const compactProvider =
    typeof provider === 'object' ? pickSingleLocalized(provider) : provider;
  const compactInfoUrl =
    typeof infoUrl === 'object' ? pickSingleLocalized(infoUrl) : infoUrl;
  const compactExtraLoc = pickSingleLocalized(raw.location_extra_info);

  const compactOffers = Array.isArray(raw.offers)
    ? raw.offers.slice(0, 2).map((o) => ({
        is_free: Boolean(o?.is_free),
        ...(o?.price ? { price: pickSingleLocalized(o.price) } : {}),
        ...(o?.info_url ? { info_url: pickSingleLocalized(o.info_url) } : {}),
      }))
    : [];

  const compactKeywords = [
    ...(Array.isArray(raw.keywords) ? raw.keywords : []),
    ...(Array.isArray(raw.audience) ? raw.audience : []),
  ]
    .slice(0, 10)
    .map((k) => {
      const id = compactKeywordId(k.id || k['@id'] || '');
      const name = pickSingleLocalized(k.name);
      return id || name ? { ...(id ? { id } : {}), ...(name ? { name } : {}) } : null;
    })
    .filter(Boolean);

  return {
    swapped,
    event: {
      id: namespacedId,
      data_source: cityId,
      publisher: sanitizePublisher(raw.publisher) || sourceDataLabel,
      name: compactLocalized(raw.name) || raw.name,
      ...(cleanShortDesc ? { short_description: cleanShortDesc } : {}),
      ...(cleanDesc ? { description: cleanDesc } : {}),
      start_time: raw.start_time,
      end_time: raw.end_time,
      ...(raw.all_day ? { all_day: true } : {}),
      ...(raw.event_status && raw.event_status !== 'EventScheduled'
        ? { event_status: raw.event_status }
        : {}),
      ...(raw.is_virtualevent ? { is_virtualevent: true } : {}),
      ...(raw.virtualevent_url ? { virtualevent_url: raw.virtualevent_url } : {}),
      ...(superEventId
        ? { super_event: { id: String(superEventId) } }
        : {}),
      ...(compactProvider ? { provider: compactProvider } : {}),
      ...(compactInfoUrl ? { info_url: compactInfoUrl } : {}),
      ...(compactOffers.length > 0 ? { offers: compactOffers } : {}),
      ...(compactExtraLoc ? { location_extra_info: compactExtraLoc } : {}),
      location: raw.location
        ? {
            id:
              raw.location.id ||
              (normalizedPosition
                ? `${cityId}:loc-${normalizedPosition.coordinates[0].toFixed(4)}-${normalizedPosition.coordinates[1].toFixed(4)}`
                : `${cityId}:unmapped-${namespacedId}`),
            name: compactLocalized(raw.location.name) || {},
            ...(raw.location.street_address
              ? { street_address: pickSingleLocalized(raw.location.street_address) }
              : {}),
            ...(raw.location.address_locality
              ? {
                  address_locality: pickSingleLocalized(
                    raw.location.address_locality
                  ),
                }
              : {}),
            position: normalizedPosition,
            ...(swapped ? { coordinate_swapped: true } : {}),
          }
        : null,
      ...(compactKeywords.length > 0 ? { keywords: compactKeywords } : {}),
      images: Array.isArray(raw.images)
        ? raw.images.slice(0, 1).map((img) => ({
            id: img.id,
            url:
              typeof img.url === 'string'
                ? img.url.replace(/^http:\/\//i, 'https://')
                : '',
            ...(img.photographer_name
              ? { photographer_name: img.photographer_name }
              : {}),
            ...(img.alt_text
              ? {
                  alt_text:
                    typeof img.alt_text === 'object' && img.alt_text !== null
                      ? img.alt_text.en ||
                        img.alt_text.fi ||
                        img.alt_text.sv ||
                        undefined
                      : img.alt_text,
                }
              : {}),
            license: img.license || 'event_only',
          }))
        : [],
    },
  };
}

/**
 * Consolidates recurring sub-events sharing a `super_event` or `(title, venue)` into
 * a single `RawLinkedEvent` with `occurrence_dates`, keeping full `[start, end]` timestamps
 * so matinee + evening sessions on the same day are preserved without bloating static feeds.
 */
export function consolidateRawSeriesOccurrences(
  events,
  now = new Date(),
  maxEvents = MAX_CONSOLIDATED_EVENTS_PER_CITY,
  cityLabel = ''
) {
  const bySeries = new Map();

  for (const ev of events) {
    if (!ev || !ev.start_time) continue;
    const parsedStart = parseSyncTimestamp(ev.start_time, 'start');
    if (!parsedStart) continue;
    const parsedEnd = ev.end_time ? parseSyncTimestamp(ev.end_time, 'end') : null;
    const effectiveEnd =
      parsedEnd && parsedEnd >= parsedStart
        ? parsedEnd
        : new Date(parsedStart.getTime() + 2 * 3600 * 1000);

    const rawTitle =
      ev.name?.fi ||
      ev.name?.en ||
      ev.name?.sv ||
      '';
    if (isNonEventTitle(rawTitle)) continue;

    const titleKey = rawTitle.trim().toLowerCase();
    const superId = ev.super_event?.['@id'] || ev.super_event?.id || '';
    const coords = ev.location?.position?.coordinates;
    const locKey = Array.isArray(coords)
      ? `${coords[0].toFixed(4)},${coords[1].toFixed(4)}`
      : ev.location?.name?.fi?.trim().toLowerCase() || ev.location?.id || '';

    const groupKey = superId
      ? `super:${superId}:${titleKey}`
      : `venue:${locKey}:title:${titleKey}`;

    const occEntry = {
      id: ev.id,
      start: parsedStart.toISOString(),
      end: effectiveEnd.toISOString(),
      ...(ev.info_url ? { info_url: ev.info_url } : {}),
    };

    const existing = bySeries.get(groupKey);
    if (!existing) {
      bySeries.set(groupKey, {
        ...ev,
        occurrence_dates:
          Array.isArray(ev.occurrence_dates) && ev.occurrence_dates.length > 0
            ? [...ev.occurrence_dates]
            : [occEntry],
      });
    } else {
      const incomingOccs =
        Array.isArray(ev.occurrence_dates) && ev.occurrence_dates.length > 0
          ? ev.occurrence_dates
          : [occEntry];

      for (const inc of incomingOccs) {
        const dup = existing.occurrence_dates.some(
          (o) => o.start === inc.start && o.end === inc.end
        );
        if (!dup && existing.occurrence_dates.length < 90) {
          existing.occurrence_dates.push(inc);
        }
      }
      if ((!existing.images || existing.images.length === 0) && ev.images?.length > 0) {
        existing.images = ev.images;
      }
      if (
        (!existing.offers || existing.offers.length === 0) &&
        ev.offers?.length > 0
      ) {
        existing.offers = ev.offers;
      }
    }
  }

  const nowMs = now.getTime();
  const consolidated = [];

  for (const item of bySeries.values()) {
    // Drop past occurrences; drop the entire series when no occurrence has end >= now (`BUG-02`, `DATA-01`)
    const upcomingOccs = item.occurrence_dates
      .filter((o) => {
        const endDt = parseSyncTimestamp(o.end, 'end');
        return endDt && endDt.getTime() >= nowMs;
      })
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
      );

    if (upcomingOccs.length === 0) {
      continue;
    }

    const chosen = upcomingOccs[0];
    item.occurrence_dates = upcomingOccs;
    item.start_time = chosen.start;
    item.end_time = chosen.end;
    consolidated.push(item);
  }

  // Sort by next upcoming start (`Math.max(start, now)`) so multi-year ongoing exhibitions
  // don't push out future dated events when capping (`DATA-01`)
  consolidated.sort((a, b) => {
    const aNext = Math.max(new Date(a.start_time).getTime(), nowMs);
    const bNext = Math.max(new Date(b.start_time).getTime(), nowMs);
    if (aNext !== bNext) return aNext - bNext;
    const aDur = new Date(a.end_time).getTime() - new Date(a.start_time).getTime();
    const bDur = new Date(b.end_time).getTime() - new Date(b.start_time).getTime();
    return aDur - bDur;
  });

  if (consolidated.length > maxEvents) {
    console.warn(
      `[sync-feeds] ! Cap hit${cityLabel ? ` for ${cityLabel}` : ''}: keeping ${maxEvents} of ${consolidated.length} upcoming series.`
    );
  }

  return consolidated.slice(0, maxEvents);
}

async function fetchPlaceDirectory(initialUrl) {
  const placeMap = new Map();
  let nextUrl = initialUrl;
  let guard = 0;

  while (nextUrl && guard < 20) {
    guard++;
    const safeUrl = upgradeKnownUrl(nextUrl) || nextUrl;
    const res = await fetch(safeUrl, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) break;
    const json = await res.json();
    for (const place of json.data || []) {
      if (place.id) placeMap.set(String(place.id), place);
      if (place['@id']) {
        const cleanAtId = String(place['@id']).replace(/\/$/, '');
        placeMap.set(String(place['@id']), place);
        placeMap.set(cleanAtId, place);
        const httpsAtId = cleanAtId.replace(/^http:\/\//i, 'https://');
        placeMap.set(httpsAtId, place);
      }
    }
    nextUrl = json.meta?.next ? upgradeKnownUrl(json.meta.next) : null;
  }

  return placeMap;
}

async function fetchRegionalLinkedEvents(
  baseEventUrl,
  maxPages = 32,
  batchSize = 4
) {
  const safeBaseUrl = upgradeKnownUrl(baseEventUrl) || baseEventUrl;
  const firstJson = await fetchJsonWithRetry(safeBaseUrl, 3);
  const totalCount =
    typeof firstJson.meta?.count === 'number' ? firstJson.meta.count : 0;
  const allItems = [...(firstJson.data || [])];

  if (!firstJson.meta?.next || allItems.length === 0) {
    return { items: allItems, totalCount };
  }

  const parsedBase = new URL(safeBaseUrl);
  const pageSize = Number(parsedBase.searchParams.get('page_size')) || 50;
  const estimatedPages = Math.min(
    maxPages,
    Math.max(2, Math.ceil(totalCount / pageSize))
  );

  const pageUrls = [];
  for (let p = 2; p <= estimatedPages; p++) {
    const u = new URL(parsedBase.toString());
    u.searchParams.set('page', String(p));
    pageUrls.push(u.toString());
  }

  for (let i = 0; i < pageUrls.length; i += batchSize) {
    const batch = pageUrls.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map(async (u) => {
        const j = await fetchJsonWithRetry(u, 2);
        return Array.isArray(j.data) ? j.data : [];
      })
    );
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value.length > 0) {
        allItems.push(...s.value);
      }
    }
  }

  // Deduplicate by raw event id
  const seen = new Set();
  const deduped = [];
  for (const item of allItems) {
    if (item?.id && !seen.has(item.id)) {
      seen.add(item.id);
      deduped.push(item);
    }
  }

  return { items: deduped, totalCount: totalCount || deduped.length };
}

function matchCityFromAliases(candidates, cityDefs) {
  for (const rawCandidate of candidates) {
    if (!rawCandidate || typeof rawCandidate !== 'string') continue;
    const text = rawCandidate.trim().toLowerCase();
    if (!text) continue;

    // 1. Exact match against alias
    for (const def of Object.values(cityDefs)) {
      if (def.aliases.some((alias) => text === alias)) {
        return def.cityId;
      }
    }

    // 2. Word-boundary / token match in address or locality string
    for (const def of Object.values(cityDefs)) {
      for (const alias of def.aliases) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(^|[^a-zåäö])${escaped}([^a-zåäö]|$)`, 'i');
        if (re.test(text)) {
          return def.cityId;
        }
      }
    }
  }
  return null;
}

export function classifyKeskiSuomiEventCity(raw, placeMap) {
  const areaRef = (raw?.area?.['@id'] || raw?.area?.id || '').replace(/\/$/, '');
  const areaPlace =
    placeMap.get(areaRef) ||
    placeMap.get(areaRef.replace(/^http:\/\//i, 'https://')) ||
    null;

  // 1. Authoritative area reference from place directory
  if (areaPlace) {
    const areaCandidates = [
      areaPlace.name?.fi,
      areaPlace.name?.en,
      areaPlace.address_locality?.fi,
    ];
    const matchedArea = matchCityFromAliases(areaCandidates, KESKI_SUOMI_CITIES);
    if (matchedArea) return matchedArea;
    // If areaPlace explicitly names another Keski-Suomi municipality (e.g. Laukaa, Muurame), do not misassign it
    if (areaPlace.name?.fi?.trim()) {
      return null;
    }
  }

  // 2. Embedded location locality / address / name fallback
  const locCandidates = [
    raw?.location?.address_locality?.fi,
    raw?.location?.address_locality?.en,
    raw?.location?.street_address?.fi,
    raw?.location?.name?.fi,
    raw?.location_extra_info?.fi,
  ];
  const matchedLoc = matchCityFromAliases(locCandidates, KESKI_SUOMI_CITIES);
  if (matchedLoc) return matchedLoc;

  // 3. Coordinate fallback within 20 km of a target Keski-Suomi city center
  const coordCheck = normalizeFinlandCoords(
    raw?.location?.position?.coordinates
  );
  if (coordCheck.coordinates) {
    let bestCity = null;
    let bestDist = 20;
    for (const def of Object.values(KESKI_SUOMI_CITIES)) {
      const d = haversineKm(coordCheck.coordinates, def.coords);
      if (d < bestDist) {
        bestDist = d;
        bestCity = def.cityId;
      }
    }
    if (bestCity) return bestCity;
  }

  return null;
}

export function classifySatakuntaEventCity(raw, placeMap) {
  const areaRef = (raw?.area?.['@id'] || raw?.area?.id || '').replace(/\/$/, '');
  const parentRef = String(raw?.location?.parent || '').replace(/\/$/, '');
  const areaPlace =
    placeMap.get(areaRef) ||
    placeMap.get(areaRef.replace(/^http:\/\//i, 'https://')) ||
    placeMap.get(parentRef) ||
    null;

  // 1. Authoritative se:* municipality/district directory resolution
  if (areaPlace) {
    const areaCandidates = [
      areaPlace.address_locality?.fi,
      areaPlace.name?.fi,
      areaPlace.name?.sv,
    ];
    const matchedArea = matchCityFromAliases(areaCandidates, SATAKUNTA_CITIES);
    if (matchedArea) return matchedArea;
    // If se:* directory explicitly identifies another municipality (e.g. Säkylä, Eura, Nakkila), do not misassign
    if (areaPlace.address_locality?.fi?.trim() || areaPlace.name?.fi?.trim()) {
      return null;
    }
  }

  // 2. Fallback to embedded location locality / address
  const locCandidates = [
    raw?.location?.address_locality?.fi,
    raw?.location?.street_address?.fi,
    raw?.location?.name?.fi,
  ];
  return matchCityFromAliases(locCandidates, SATAKUNTA_CITIES);
}

export function classifyEpEventCity(raw) {
  const localityFi = raw?.location?.address_locality?.fi?.trim() || '';
  const localityEn = raw?.location?.address_locality?.en?.trim() || '';
  const localitySv = raw?.location?.address_locality?.sv?.trim() || '';
  const region =
    typeof raw?.location?.address_region === 'string'
      ? raw.location.address_region.trim()
      : '';

  const primaryMatch = matchCityFromAliases(
    [localityFi, localityEn, region, localitySv],
    EP_CITIES
  );
  if (primaryMatch) return primaryMatch;

  // If localityFi explicitly names a non-target municipality (e.g. Kauhava's neighbors like Ilmajoki, Kurikka's neighbors like Teuva), do not misassign
  if (localityFi) return null;

  return matchCityFromAliases(
    [raw?.location?.street_address?.fi, raw?.location?.name?.fi],
    EP_CITIES
  );
}

function computeFeedCoverageMeta(events, explicitHorizonEnd = null) {
  const now = new Date();
  const nowMs = now.getTime();
  const todayKey = toHelsinkiDateKey(now);
  let maxTimedMs = -Infinity;
  let maxAnyMs = -Infinity;
  const maxShortSpanMs = 35 * 24 * 3600 * 1000;

  for (const ev of events) {
    const occs =
      Array.isArray(ev.occurrence_dates) && ev.occurrence_dates.length > 0
        ? ev.occurrence_dates
        : [{ start: ev.start_time, end: ev.end_time }];
    for (const occ of occs) {
      const s = occ.start ? new Date(occ.start).getTime() : NaN;
      const e = occ.end ? new Date(occ.end).getTime() : s;
      if (!Number.isFinite(s) || !Number.isFinite(e) || e < nowMs) continue;
      if (e > maxAnyMs) maxAnyMs = e;
      if (s > maxTimedMs) maxTimedMs = s;
      if (e - s <= maxShortSpanMs && e > maxTimedMs) maxTimedMs = e;
    }
  }

  const computedEnd = Number.isFinite(maxTimedMs)
    ? toHelsinkiDateKey(new Date(maxTimedMs))
    : Number.isFinite(maxAnyMs)
      ? toHelsinkiDateKey(new Date(maxAnyMs))
      : todayKey;

  return {
    coverageStart: todayKey,
    coverageEnd:
      explicitHorizonEnd && explicitHorizonEnd > computedEnd
        ? explicitHorizonEnd
        : computedEnd,
  };
}

async function writeCityFeedPayload(cityId, convertedEvents, metaFields) {
  const { coverageStart, coverageEnd } = computeFeedCoverageMeta(
    convertedEvents,
    metaFields.coverageEnd || null
  );
  const payload = {
    meta: {
      count: convertedEvents.length,
      total_upstream: metaFields.totalUpstream ?? convertedEvents.length,
      ...(typeof metaFields.cappedFrom === 'number'
        ? { capped_from: metaFields.cappedFrom }
        : {}),
      coverage_start: metaFields.coverageStart || coverageStart,
      coverage_end: coverageEnd,
      next: null,
      previous: null,
      generated_at: new Date().toISOString(),
      source_calendar: metaFields.sourceCalendar,
      source_id: metaFields.sourceId,
      ...(typeof metaFields.coordinateCorrections === 'number' &&
      metaFields.coordinateCorrections > 0
        ? { coordinate_corrections: metaFields.coordinateCorrections }
        : {}),
    },
    data: convertedEvents,
  };

  const outPath = path.join(FEEDS_DIR, `${cityId}.json`);
  await fs.writeFile(outPath, JSON.stringify(payload), 'utf8');
}

async function syncKeskiSuomiRegion() {
  const endHorizonMs = Date.now() + HORIZON_DAYS * 24 * 3600 * 1000;
  console.log('[sync-feeds] Fetching Keski-Suomi place directory & events...');
  const placeMap = await fetchPlaceDirectory(
    'https://keskisuomievents.fi/api/v1/place/?page_size=100'
  );
  // Avoid server-side `end=` parameter with large `page_size` on keskisuomievents.fi (causes upstream 504);
  // paginate cleanly at page_size=50 and enforce the 90-day horizon locally.
  const { items } = await fetchRegionalLinkedEvents(
    'https://keskisuomievents.fi/api/v1/event/?start=today&page_size=50&include=location,keywords',
    48,
    3
  );

  const buckets = new Map(
    Object.keys(KESKI_SUOMI_CITIES).map((id) => [
      id,
      { rawCount: 0, swappedCount: 0, events: [] },
    ])
  );

  for (const raw of items) {
    if (raw?.start_time) {
      const st = new Date(raw.start_time).getTime();
      if (Number.isFinite(st) && st > endHorizonMs) continue;
    }
    const cityId = classifyKeskiSuomiEventCity(raw, placeMap);
    if (!cityId || !buckets.has(cityId)) continue;
    const bucket = buckets.get(cityId);
    bucket.rawCount++;
    const { event, swapped } = compactLinkedEvent(raw, cityId, {
      idPrefix: 'ks',
      fallbackCalendarUrl: `https://kalenteri.jyvaskyla.fi/event/${raw.id}`,
      sourceDataLabel: 'Keski-Suomi Events',
    });
    if (swapped) bucket.swappedCount++;
    if (event) bucket.events.push(event);
  }

  let savedCities = 0;
  for (const [cityId, cfg] of Object.entries(KESKI_SUOMI_CITIES)) {
    const bucket = buckets.get(cityId);
    const consolidated = consolidateRawSeriesOccurrences(bucket.events);
    if (consolidated.length === 0) {
      const hasExisting = await ensureFallbackExists(cityId);
      if (hasExisting) {
        console.warn(
          `[sync-feeds] ! ${cfg.cityName}: 0 upcoming events in window, preserving previous snapshot.`
        );
        savedCities++;
        continue;
      }
    }
    await writeCityFeedPayload(cityId, consolidated, {
      totalUpstream: bucket.rawCount,
      sourceCalendar: 'https://keskisuomievents.fi/api/v1/',
      sourceId: 'keskisuomi_linkedevents',
      coordinateCorrections: bucket.swappedCount,
    });
    console.log(
      `[sync-feeds] ✓ ${cfg.cityName}: Saved ${consolidated.length} consolidated events (from ${bucket.rawCount} regional occurrences) -> public/feeds/${cityId}.json`
    );
    savedCities++;
  }
  return savedCities;
}

async function syncSatakuntaRegion() {
  const endHorizon = new Date(
    Date.now() + HORIZON_DAYS * 24 * 3600 * 1000
  ).toISOString().slice(0, 10);
  console.log('[sync-feeds] Fetching Satakunta se:* place directory & events...');
  const placeMap = await fetchPlaceDirectory(
    'https://satakuntaevents.fi/api/v2/place/?data_source=se&page_size=100'
  );
  const { items } = await fetchRegionalLinkedEvents(
    `https://satakuntaevents.fi/api/v2/event/?start=today&end=${endHorizon}&page_size=100&include=location,keywords`,
    32
  );

  const buckets = new Map(
    Object.keys(SATAKUNTA_CITIES).map((id) => [
      id,
      { rawCount: 0, swappedCount: 0, events: [] },
    ])
  );

  for (const raw of items) {
    const cityId = classifySatakuntaEventCity(raw, placeMap);
    if (!cityId || !buckets.has(cityId)) continue;
    const bucket = buckets.get(cityId);
    bucket.rawCount++;
    const { event, swapped } = compactLinkedEvent(raw, cityId, {
      idPrefix: 'sk',
      fallbackCalendarUrl: 'https://satakuntaevents.fi/',
      sourceDataLabel: 'Satakunta Events',
    });
    if (swapped) bucket.swappedCount++;
    if (event) bucket.events.push(event);
  }

  let savedCities = 0;
  for (const [cityId, cfg] of Object.entries(SATAKUNTA_CITIES)) {
    const bucket = buckets.get(cityId);
    const consolidated = consolidateRawSeriesOccurrences(bucket.events);
    if (consolidated.length === 0) {
      const hasExisting = await ensureFallbackExists(cityId);
      if (hasExisting) {
        savedCities++;
        continue;
      }
    }
    await writeCityFeedPayload(cityId, consolidated, {
      totalUpstream: bucket.rawCount,
      sourceCalendar: 'https://satakuntaevents.fi/api/v2/',
      sourceId: 'satakunta_linkedevents',
      coordinateCorrections: bucket.swappedCount,
    });
    console.log(
      `[sync-feeds] ✓ ${cfg.cityName}: Saved ${consolidated.length} consolidated events (from ${bucket.rawCount} regional occurrences) -> public/feeds/${cityId}.json`
    );
    savedCities++;
  }
  return savedCities;
}

async function syncEpRegion() {
  const endHorizon = new Date(
    Date.now() + HORIZON_DAYS * 24 * 3600 * 1000
  ).toISOString().slice(0, 10);
  console.log('[sync-feeds] Fetching EP Kalenteri regional events...');
  const { items } = await fetchRegionalLinkedEvents(
    `https://epkalenteri.linkedevents.fi/v1/event/?start=today&end=${endHorizon}&page_size=100&include=location,keywords`,
    20
  );

  const buckets = new Map(
    Object.keys(EP_CITIES).map((id) => [
      id,
      { rawCount: 0, swappedCount: 0, events: [] },
    ])
  );

  for (const raw of items) {
    const cityId = classifyEpEventCity(raw);
    if (!cityId || !buckets.has(cityId)) continue;
    const bucket = buckets.get(cityId);
    bucket.rawCount++;
    const { event, swapped } = compactLinkedEvent(raw, cityId, {
      idPrefix: 'ep',
      fallbackCalendarUrl: `https://www.epkalenteri.fi/event/${raw.id}`,
      sourceDataLabel: 'EP Kalenteri',
    });
    if (swapped) bucket.swappedCount++;
    if (event) bucket.events.push(event);
  }

  let savedCities = 0;
  for (const [cityId, cfg] of Object.entries(EP_CITIES)) {
    const bucket = buckets.get(cityId);
    const consolidated = consolidateRawSeriesOccurrences(bucket.events);
    if (consolidated.length === 0) {
      const hasExisting = await ensureFallbackExists(cityId);
      if (hasExisting) {
        savedCities++;
        continue;
      }
    }
    await writeCityFeedPayload(cityId, consolidated, {
      totalUpstream: bucket.rawCount,
      sourceCalendar: 'https://epkalenteri.linkedevents.fi/v1/',
      sourceId: 'ep_linkedevents',
      coordinateCorrections: bucket.swappedCount,
    });
    console.log(
      `[sync-feeds] ✓ ${cfg.cityName}: Saved ${consolidated.length} consolidated events (from ${bucket.rawCount} regional occurrences${bucket.swappedCount > 0 ? `, ${bucket.swappedCount} swapped coords fixed` : ''}) -> public/feeds/${cityId}.json`
    );
    savedCities++;
  }
  return savedCities;
}

const OUTSIDE_KUOPIO_MUNICIPALITIES =
  /\b(vuorela|siilinjärvi|siilinjarvi|toivala|tuusniemi|leppävirta|leppavirta|suonenjoki|varkaus|iisalmi|lapinlahti|rautalampi|kaavi|tervo|vesanto|pielavesi)\b/i;

export function convertHelloKuopioEventToLinkedEvent(ev) {
  if (!ev || !ev.id) return null;

  const venue = ev.venue && typeof ev.venue === 'object' ? ev.venue : null;
  const publishedCity = typeof venue?.city === 'string' ? venue.city.trim() : '';

  // Exclude events explicitly located in neighboring municipalities outside Kuopio
  if (publishedCity && OUTSIDE_KUOPIO_MUNICIPALITIES.test(publishedCity)) {
    return null;
  }

  let startIso = null;
  let endIso = null;
  if (ev.all_day && typeof ev.start_date === 'string') {
    const startDay = ev.start_date.trim().slice(0, 10);
    const endDay =
      typeof ev.end_date === 'string' && ev.end_date.trim()
        ? ev.end_date.trim().slice(0, 10)
        : startDay;
    const sDt = parseSyncTimestamp(startDay, 'start');
    const eDt = parseSyncTimestamp(endDay, 'end');
    startIso = sDt ? sDt.toISOString() : null;
    endIso = eDt ? eDt.toISOString() : null;
  } else if (typeof ev.utc_start_date === 'string' && ev.utc_start_date.trim()) {
    startIso = `${ev.utc_start_date.trim().replace(' ', 'T')}Z`;
    endIso =
      typeof ev.utc_end_date === 'string' && ev.utc_end_date.trim()
        ? `${ev.utc_end_date.trim().replace(' ', 'T')}Z`
        : new Date(new Date(startIso).getTime() + 2 * 3600 * 1000).toISOString();
  } else if (typeof ev.start_date === 'string' && ev.start_date.trim()) {
    const sDt = parseSyncTimestamp(ev.start_date.trim(), 'start');
    const eDt =
      typeof ev.end_date === 'string' && ev.end_date.trim()
        ? parseSyncTimestamp(ev.end_date.trim(), 'end')
        : sDt
          ? new Date(sDt.getTime() + 2 * 3600 * 1000)
          : null;
    startIso = sDt ? sDt.toISOString() : null;
    endIso = eDt ? eDt.toISOString() : null;
  }

  if (!startIso || Number.isNaN(new Date(startIso).getTime())) {
    return null;
  }

  const title = decodeHtmlEntities(ev.title || 'Tapahtuma').trim();
  if (isNonEventTitle(title)) {
    return null;
  }
  const descriptionHtml = compactDescriptionHtml(ev.description || '');
  const shortText =
    stripHtmlTags(ev.excerpt || '').slice(0, 240) ||
    stripHtmlTags(descriptionHtml).slice(0, 220) ||
    title;

  const venueName = venue?.venue
    ? decodeHtmlEntities(String(venue.venue)).trim()
    : ev.is_virtual
      ? 'Online Event'
      : 'Kuopio';

  const localityLabel =
    publishedCity && publishedCity.toLowerCase() !== 'kuopio'
      ? `${publishedCity}, Kuopio`
      : 'Kuopio';

  const streetParts = [
    venue?.address ? decodeHtmlEntities(String(venue.address)).trim() : '',
    localityLabel,
  ].filter(Boolean);
  const streetAddress = streetParts.join(', ') || 'Kuopio';

  let coordinates = null;
  const rawLng = Number(venue?.geo_lng);
  const rawLat = Number(venue?.geo_lat);
  if (
    venue?.geo_lng !== undefined &&
    venue?.geo_lat !== undefined &&
    venue?.geo_lng !== '' &&
    venue?.geo_lat !== '' &&
    Number.isFinite(rawLng) &&
    Number.isFinite(rawLat)
  ) {
    const validated = normalizeFinlandCoords([rawLng, rawLat]);
    coordinates = validated.coordinates;
  }

  const infoUrl =
    (typeof ev.website === 'string' && /^https?:\/\//i.test(ev.website.trim())
      ? ev.website.trim()
      : '') ||
    (typeof ev.url === 'string' && /^https?:\/\//i.test(ev.url.trim())
      ? ev.url.trim()
      : 'https://www.hellokuopio.fi/');

  const rawCost = typeof ev.cost === 'string' ? decodeHtmlEntities(ev.cost).trim() : '';
  const offers = [];
  if (rawCost) {
    const isZero =
      /^(0\s*€|0,00\s*€|0|ilmainen|vapaa\s*pääsy|maksuton|free)$/i.test(rawCost);
    offers.push({
      is_free: isZero,
      price: isZero
        ? { fi: 'Vapaa pääsy', en: 'Free Entry' }
        : { fi: rawCost, en: rawCost },
      info_url: { fi: infoUrl, en: infoUrl },
    });
  } else if (
    /\b(vapaa\s*pääsy|maksuton|ilmainen\s*sisäänpääsy)\b/i.test(
      `${shortText} ${stripHtmlTags(descriptionHtml)}`
    )
  ) {
    offers.push({
      is_free: true,
      price: { fi: 'Vapaa pääsy', en: 'Free Entry' },
      info_url: { fi: infoUrl, en: infoUrl },
    });
  } else if (
    /lippu\.fi|tiketti\.fi|tixly|liveto|biletti|eventim|netticket/i.test(infoUrl)
  ) {
    offers.push({
      is_free: false,
      price: { fi: 'Katso liput', en: 'See tickets' },
      info_url: { fi: infoUrl, en: infoUrl },
    });
  }

  const organizerName =
    Array.isArray(ev.organizer) && ev.organizer[0]?.organizer
      ? decodeHtmlEntities(String(ev.organizer[0].organizer)).trim()
      : 'Hello Kuopio';

  const imgObj = ev.image && typeof ev.image === 'object' ? ev.image : null;
  const imgUrl =
    imgObj?.sizes?.large?.url ||
    imgObj?.sizes?.medium_large?.url ||
    imgObj?.url ||
    null;

  const categories = Array.isArray(ev.categories) ? ev.categories : [];

  return {
    id: `kuopio:${ev.id}`,
    data_source: 'kuopio',
    publisher: organizerName,
    name: { fi: title },
    short_description: { fi: shortText },
    description: {
      fi: descriptionHtml || `<p>${shortText}</p>`,
    },
    start_time: startIso,
    end_time: endIso,
    all_day: Boolean(ev.all_day),
    is_virtualevent: Boolean(ev.is_virtual),
    virtualevent_url: ev.virtual_url || null,
    provider: { fi: organizerName },
    info_url: { fi: infoUrl },
    offers,
    location: {
      id: venue?.id
        ? `kuopio:venue-${venue.id}`
        : coordinates
          ? `kuopio:loc-${coordinates[0].toFixed(4)}-${coordinates[1].toFixed(4)}`
          : `kuopio:unmapped-${ev.id}`,
      name: { fi: venueName, en: venueName },
      street_address: { fi: streetAddress, en: streetAddress },
      address_locality: { fi: localityLabel, en: localityLabel },
      position: coordinates
        ? {
            type: 'Point',
            coordinates,
          }
        : null,
    },
    keywords: categories.map((cat) => ({
      id: `kuopio:cat:${cat.slug || cat.id}`,
      name: {
        fi: decodeHtmlEntities(cat.name || ''),
        en: decodeHtmlEntities(cat.name || ''),
      },
    })),
    images: imgUrl
      ? [
          {
            id: imgObj?.id || `${ev.id}-img`,
            url: String(imgUrl).replace(/^http:\/\//i, 'https://'),
            photographer_name: null,
            alt_text: title,
            license: 'event_only',
            data_source: 'Hello Kuopio (hellokuopio.fi)',
          },
        ]
      : [],
  };
}

async function syncHelloKuopio() {
  const now = new Date();
  const startDateStr = `${now.toISOString().slice(0, 10)} 00:00:00`;
  const endHorizonDate = new Date(
    now.getTime() + HORIZON_DAYS * 24 * 3600 * 1000
  );
  const endDateStr = `${endHorizonDate.toISOString().slice(0, 10)} 23:59:59`;

  const buildPageUrl = (page) => {
    const u = new URL('https://www.hellokuopio.fi/wp-json/tribe/events/v1/events');
    u.searchParams.set('start_date', startDateStr);
    u.searchParams.set('end_date', endDateStr);
    u.searchParams.set('per_page', '50');
    u.searchParams.set('page', String(page));
    return u.toString();
  };

  console.log('[sync-feeds] Fetching Hello Kuopio events...');
  const firstRes = await fetch(buildPageUrl(1), {
    headers: { Accept: 'application/json' },
  });
  if (!firstRes.ok) {
    throw new Error(`HTTP ${firstRes.status} for Hello Kuopio`);
  }
  const firstJson = await firstRes.json();
  const totalPages = Math.min(20, Number(firstJson.total_pages) || 1);
  const rawEvents = [...(firstJson.events || [])];

  for (let p = 2; p <= totalPages; p += 4) {
    const batch = [];
    for (let k = p; k < p + 4 && k <= totalPages; k++) {
      batch.push(
        fetch(buildPageUrl(k), { headers: { Accept: 'application/json' } }).then(
          (r) => (r.ok ? r.json() : { events: [] })
        )
      );
    }
    const pages = await Promise.all(batch);
    for (const pj of pages) {
      if (Array.isArray(pj.events)) {
        rawEvents.push(...pj.events);
      }
    }
  }

  const converted = rawEvents
    .map((ev) => convertHelloKuopioEventToLinkedEvent(ev))
    .filter(Boolean);
  const consolidated = consolidateRawSeriesOccurrences(converted);

  if (consolidated.length < 5) {
    throw new Error(
      `Hello Kuopio returned too few valid Kuopio events (${consolidated.length})`
    );
  }

  await writeCityFeedPayload('kuopio', consolidated, {
    totalUpstream: rawEvents.length,
    sourceCalendar: 'https://www.hellokuopio.fi/wp-json/tribe/events/v1/',
    sourceId: 'hellokuopio_tribe',
  });
  console.log(
    `[sync-feeds] ✓ Kuopio: Saved ${consolidated.length} consolidated events (from ${rawEvents.length} upstream) -> public/feeds/kuopio.json`
  );
  return consolidated.length;
}

const OUTSIDE_SALO_MUNICIPALITIES =
  /\b(somero|someron|somerolla|somerolle|paimio|paimion|sauvo|sauvon|kemiönsaari|raasepori|lohja|forssa|koski\s*tl)\b/i;

export function convertSaloPostToLinkedEvent(post, now = new Date()) {
  if (!post || !post.id || !post.startDate) return null;

  const title = decodeHtmlEntities(String(post.title || 'Tapahtuma')).trim();
  if (isNonEventTitle(title)) return null;
  const locText = decodeHtmlEntities(String(post.locationText || '')).trim();
  const locationNames = Array.isArray(post.locations)
    ? post.locations.map((l) => decodeHtmlEntities(String(l?.name || '')).trim()).filter(Boolean)
    : [];

  // Exclude events explicitly located outside Salo (such as Somero service points)
  if (
    locationNames.length === 0 &&
    OUTSIDE_SALO_MUNICIPALITIES.test(`${locText} ${title}`)
  ) {
    return null;
  }

  let coordinates = null;
  if (
    typeof post.gps_lng === 'number' &&
    typeof post.gps_lat === 'number' &&
    Number.isFinite(post.gps_lng) &&
    Number.isFinite(post.gps_lat)
  ) {
    const validated = normalizeFinlandCoords([post.gps_lng, post.gps_lat]);
    if (validated.coordinates) {
      // Reject coordinates far outside Salo (> 42 km from Salo center, e.g. Somero town center)
      const distFromSalo = haversineKm(validated.coordinates, [23.1246, 60.3831]);
      if (distFromSalo > 42 && locationNames.length === 0) {
        return null;
      }
      coordinates = validated.coordinates;
    }
  }

  const startSec = Number(post.startDate);
  const endSec = Number(post.endDate);
  if (!Number.isFinite(startSec) || startSec <= 0) return null;

  const startDate = new Date(startSec * 1000);
  const endDate =
    Number.isFinite(endSec) && endSec >= startSec
      ? new Date(endSec * 1000)
      : new Date(startDate.getTime() + 2 * 3600 * 1000);

  // Skip already ended events
  if (endDate.getTime() < now.getTime() - 12 * 3600 * 1000) {
    return null;
  }

  // Compound source ID including blogId and id per research specification
  const blogId = String(post.blogId || '1').trim();
  const compoundId = `salo:${blogId}:${post.id}`;

  const { venueName, streetAddress } = locText
    ? parseVenueAndAddress(locText, 'Salo')
    : {
        venueName: locationNames[0] || 'Salo',
        streetAddress: locationNames.join(', ') || 'Address not provided',
      };

  const classes = Array.isArray(post.classes) ? post.classes : [];
  const eventCategories = Array.isArray(post.eventCategories)
    ? post.eventCategories
    : [];
  const userGroups = Array.isArray(post.userGroups) ? post.userGroups : [];
  const industries = Array.isArray(post.industriesAndServices)
    ? post.industriesAndServices
    : [];

  const classSlugs = new Set(
    classes.map((c) => String(c?.slug || '').toLowerCase())
  );
  const permalink =
    typeof post.permalink === 'string' && post.permalink.trim()
      ? post.permalink.trim()
      : 'https://tapahtumat.salo.fi/';

  const offers = [];
  if (classSlugs.has('ilmainen') || classSlugs.has('free_of_charge')) {
    offers.push({
      is_free: true,
      price: { fi: 'Vapaa pääsy', en: 'Free Entry' },
      info_url: { fi: permalink, en: permalink },
    });
  } else if (classSlugs.has('maksullinen')) {
    offers.push({
      is_free: false,
      price: { fi: 'Katso liput', en: 'See tickets' },
      info_url: { fi: permalink, en: permalink },
    });
  }

  const allTaxonomyTerms = [
    ...classes.filter((c) => c?.slug !== 'maksullisuus'),
    ...eventCategories,
    ...userGroups,
    ...industries,
  ];

  const excerptText = decodeHtmlEntities(String(post.excerpt || '')).trim();
  const summaryParts = [
    excerptText ? `Ajankohta: ${excerptText}.` : '',
    locText ? `Paikka: ${locText}.` : '',
  ].filter(Boolean);
  const shortDesc = summaryParts.join(' ') || title;

  const imgUrl =
    typeof post.featuredImage === 'string' && post.featuredImage.trim()
      ? post.featuredImage.trim().replace(/^http:\/\//i, 'https://')
      : null;

  return {
    id: compoundId,
    data_source: 'salo',
    publisher: 'Salon Tapahtumat',
    name: { fi: title },
    short_description: { fi: shortDesc },
    description: {
      fi: `<p>${shortDesc}</p><p><a href="${permalink}">Katso tapahtuman tarkemmat tiedot Salon tapahtumakalenterista</a></p>`,
      en: `<p>${shortDesc}</p><p><a href="${permalink}">View full event details on Salo Event Calendar</a></p>`,
    },
    start_time: startDate.toISOString(),
    end_time: endDate.toISOString(),
    provider: { fi: 'Salon tapahtumakalenteri', en: 'Salo Event Calendar' },
    info_url: { fi: permalink },
    offers,
    location: {
      id: coordinates
        ? `salo:loc-${coordinates[0].toFixed(4)}-${coordinates[1].toFixed(4)}`
        : `salo:unmapped-${blogId}-${post.id}`,
      name: { fi: venueName },
      street_address: { fi: streetAddress },
      address_locality: {
        fi: locationNames[0] ? `${locationNames[0]}, Salo` : 'Salo',
      },
      position: coordinates
        ? {
            type: 'Point',
            coordinates,
          }
        : null,
    },
    keywords: allTaxonomyTerms.map((term) => ({
      id: `salo:tax:${term.slug || term.name}`,
      name: {
        fi: decodeHtmlEntities(String(term.name || '')),
      },
    })),
    images: imgUrl
      ? [
          {
            id: `${compoundId}-img`,
            url: imgUrl,
            photographer_name: null,
            alt_text: title,
            license: 'event_only',
            data_source: 'Salon Tapahtumat (tapahtumat.salo.fi)',
          },
        ]
      : [],
  };
}

async function syncSalo() {
  const url = 'https://tapahtumat.salo.fi/wp-json/everblox/v1/eventcalendar';
  console.log(`[sync-feeds] Fetching Salon Tapahtumat from ${url}...`);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for Salon Tapahtumat`);
  }
  const json = await res.json();
  const posts = Array.isArray(json.posts) ? json.posts : [];
  const now = new Date();
  const converted = posts
    .map((p) => convertSaloPostToLinkedEvent(p, now))
    .filter(Boolean);
  const consolidated = consolidateRawSeriesOccurrences(converted, now);

  if (consolidated.length < 5) {
    throw new Error(
      `Salon Tapahtumat returned too few valid Salo events (${consolidated.length})`
    );
  }

  await writeCityFeedPayload('salo', consolidated, {
    totalUpstream: posts.length,
    sourceCalendar: url,
    sourceId: 'salo_everblox',
  });
  console.log(
    `[sync-feeds] ✓ Salo: Saved ${consolidated.length} consolidated events (from ${posts.length} upstream posts) -> public/feeds/salo.json`
  );
  return consolidated.length;
}

function compactCapitalEvent(raw, cityId) {
  const { event } = compactLinkedEvent(raw, cityId, {
    idPrefix: '',
    sourceDataLabel: cityId,
  });
  return event;
}

async function syncCapitalCity(cityId) {
  const now = new Date();
  const todayStr = toHelsinkiDateKey(now);
  const endHorizon = addDaysToDateKey(todayStr, CAPITAL_HORIZON_DAYS);
  const baseUrl = `https://api.hel.fi/linkedevents/v1/event/?division=${cityId}&include=location,keywords&start=today&end=${endHorizon}&sort=start_time&page_size=100`;

  console.log(
    `[sync-feeds] Fetching ${cityId} 6Aika events (${todayStr}..${endHorizon})...`
  );
  const { items, totalCount } = await fetchRegionalLinkedEvents(baseUrl, 40, 4);

  const compacted = [];
  for (const raw of items) {
    const ev = compactCapitalEvent(raw, cityId);
    if (ev) compacted.push(ev);
  }

  const consolidated = consolidateRawSeriesOccurrences(
    compacted,
    now,
    MAX_CONSOLIDATED_EVENTS_PER_CITY,
    cityId
  );

  if (consolidated.length < 5) {
    throw new Error(
      `Capital city ${cityId} returned too few events (${consolidated.length})`
    );
  }

  await writeCityFeedPayload(cityId, consolidated, {
    totalUpstream: totalCount || items.length,
    coverageStart: todayStr,
    sourceCalendar: 'https://api.hel.fi/linkedevents/v1/',
    sourceId: 'hel_linkedevents',
  });
  console.log(
    `[sync-feeds] ✓ ${cityId}: Saved ${consolidated.length} consolidated 6Aika series (from ${items.length} fetched / ${totalCount} upstream) -> public/feeds/${cityId}.json`
  );
  return consolidated.length;
}

/**
 * Validates that a committed fallback feed exists, is non-empty, AND is no older than
 * `MAX_FALLBACK_AGE_MS` (3 days) (`TOOL-03`). Emits GitHub Actions annotations when
 * falling back or failing due to stale data.
 */
export async function validateFallbackFreshness(
  cityId,
  now = new Date(),
  feedsDir = FEEDS_DIR
) {
  const outPath = path.join(feedsDir, `${cityId}.json`);
  try {
    const raw = await fs.readFile(outPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.data) || parsed.data.length === 0) {
      return { valid: false, reason: 'empty fallback payload' };
    }
    const genRaw = parsed.meta?.generated_at;
    const genMs = typeof genRaw === 'string' ? new Date(genRaw).getTime() : NaN;
    if (!Number.isFinite(genMs)) {
      console.error(
        `::error file=public/feeds/${cityId}.json::Fallback feed for ${cityId} has no valid meta.generated_at timestamp`
      );
      return { valid: false, reason: 'missing meta.generated_at' };
    }
    const ageMs = now.getTime() - genMs;
    if (ageMs > MAX_FALLBACK_AGE_MS) {
      const ageDays = (ageMs / (24 * 3600 * 1000)).toFixed(1);
      console.error(
        `::error file=public/feeds/${cityId}.json::Fallback feed for ${cityId} is ${ageDays} days old (exceeds 3-day freshness limit)`
      );
      return {
        valid: false,
        reason: `stale fallback (${ageDays} days old > 3 days)`,
      };
    }
    const ageHours = Math.max(0, ageMs / (3600 * 1000)).toFixed(1);
    console.warn(
      `::warning file=public/feeds/${cityId}.json::Upstream sync failed for ${cityId}; using committed fallback (${ageHours}h old)`
    );
    return { valid: true, reason: `fresh fallback (${ageHours}h old)` };
  } catch {
    return { valid: false, reason: 'no existing fallback file' };
  }
}

async function ensureFallbackExists(cityId) {
  const check = await validateFallbackFreshness(cityId);
  return check.valid;
}

export async function syncAllFeeds() {
  await fs.mkdir(FEEDS_DIR, { recursive: true });
  let successCount = 0;
  const errors = [];

  // 1. Existing Localhub municipal calendars (Turku, Tampere, Oulu)
  for (const cfg of Object.values(LOCALHUB_CITIES)) {
    try {
      await syncLocalhubCity(cfg);
      successCount++;
    } catch (err) {
      console.error(`[sync-feeds] Failed to sync ${cfg.cityName}:`, err.message);
      if (!(await ensureFallbackExists(cfg.cityId))) {
        errors.push(`${cfg.cityId}: ${err.message} (no existing fallback)`);
      }
    }
  }

  // 2. Existing Capital Region 6Aika Linked Events (Helsinki, Espoo, Vantaa)
  for (const capitalCity of ['helsinki', 'espoo', 'vantaa']) {
    try {
      await syncCapitalCity(capitalCity);
      successCount++;
    } catch (err) {
      console.error(`[sync-feeds] Failed to sync ${capitalCity}:`, err.message);
      if (!(await ensureFallbackExists(capitalCity))) {
        errors.push(`${capitalCity}: ${err.message} (no existing fallback)`);
      }
    }
  }

  // 3. Regional Linked Events: Keski-Suomi Events (6 cities)
  try {
    const count = await syncKeskiSuomiRegion();
    successCount += count;
  } catch (err) {
    console.error('[sync-feeds] Failed to sync Keski-Suomi Events:', err.message);
    for (const cityId of Object.keys(KESKI_SUOMI_CITIES)) {
      if (!(await ensureFallbackExists(cityId))) {
        errors.push(`${cityId}: ${err.message} (no existing fallback)`);
      }
    }
  }

  // 4. Regional Linked Events: Satakunta Events (7 cities)
  try {
    const count = await syncSatakuntaRegion();
    successCount += count;
  } catch (err) {
    console.error('[sync-feeds] Failed to sync Satakunta Events:', err.message);
    for (const cityId of Object.keys(SATAKUNTA_CITIES)) {
      if (!(await ensureFallbackExists(cityId))) {
        errors.push(`${cityId}: ${err.message} (no existing fallback)`);
      }
    }
  }

  // 5. Regional Linked Events: EP Kalenteri (7 cities)
  try {
    const count = await syncEpRegion();
    successCount += count;
  } catch (err) {
    console.error('[sync-feeds] Failed to sync EP Kalenteri:', err.message);
    for (const cityId of Object.keys(EP_CITIES)) {
      if (!(await ensureFallbackExists(cityId))) {
        errors.push(`${cityId}: ${err.message} (no existing fallback)`);
      }
    }
  }

  // 6. Hello Kuopio (Kuopio / Tahko)
  try {
    await syncHelloKuopio();
    successCount++;
  } catch (err) {
    console.error('[sync-feeds] Failed to sync Hello Kuopio:', err.message);
    if (!(await ensureFallbackExists('kuopio'))) {
      errors.push(`kuopio: ${err.message} (no existing fallback)`);
    }
  }

  // 7. Salon Tapahtumat (Salo)
  try {
    await syncSalo();
    successCount++;
  } catch (err) {
    console.error('[sync-feeds] Failed to sync Salon Tapahtumat:', err.message);
    if (!(await ensureFallbackExists('salo'))) {
      errors.push(`salo: ${err.message} (no existing fallback)`);
    }
  }

  if (errors.length > 0 || successCount === 0) {
    throw new Error(
      `Feed synchronization failed critical checks (succeeded: ${successCount}/28). Errors: ${errors.join('; ')}`
    );
  }
  console.log(
    `[sync-feeds] Completed successfully: ${successCount}/28 city feeds ready in public/feeds/.`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  syncAllFeeds().catch((err) => {
    console.error('[sync-feeds] Fatal error:', err);
    process.exit(1);
  });
}
