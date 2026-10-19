import { CITIES, TOPICS } from '../config/cities';
import type {
  CityId,
  LinkedEventsApiResponse,
  NormalizedEvent,
  NormalizedOccurrence,
  PriceStatus,
  RawLinkedEvent,
  TopicCategory,
  VenueStoryGroup,
} from '../types/linkedEvents';
import {
  isEventOccurringTonight,
  isEventOnUpcomingWeekend,
  resolveEventOccurrence,
  toDateKey,
} from '../utils/calendarUtils';
import { calculateDistanceKm } from '../utils/distanceUtils';
import {
  buildLicenseAttribution,
  getSafeEventImageUrl,
  pickLocalizedText,
} from '../utils/licenseGuard';

const DB_NAME = 'tarra_linkedevents_cache_v4';
const STORE_NAME = 'city_feeds';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const FETCH_TIMEOUT_MS = 6500;

interface CachedFeedRecord {
  cacheKey: string;
  cityId: CityId;
  timestamp: number;
  source: 'live-api' | 'static-feed' | 'offline-fallback';
  payload: LinkedEventsApiResponse;
}

interface CacheLookupResult {
  record: CachedFeedRecord;
  isFresh: boolean;
}

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCachedFeed(
  cacheKey: string
): Promise<CacheLookupResult | null> {
  try {
    const db = await openCacheDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cacheKey);
      req.onsuccess = () => {
        const record = req.result as CachedFeedRecord | undefined;
        if (!record) {
          resolve(null);
          return;
        }
        const isFresh = Date.now() - record.timestamp <= CACHE_TTL_MS;
        resolve({ record, isFresh });
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function writeCachedFeed(record: CachedFeedRecord): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IndexedDB quota/private mode errors gracefully
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * Classifies an event into one or more TopicCategories using upstream taxonomy keywords first,
 * followed by word-boundary-aware Finnish/Swedish/English token matching (Finding 18).
 */
export function classifyTopics(
  raw: RawLinkedEvent
): Array<Exclude<TopicCategory, 'all'>> {
  const title = pickLocalizedText(raw.name, '').toLowerCase();
  const shortDesc = pickLocalizedText(raw.short_description, '').toLowerCase();
  const kwText = (raw.keywords || [])
    .map((k) => `${k.id || ''} ${pickLocalizedText(k.name, '')}`)
    .join(' ')
    .toLowerCase();
  const text = `${title} ${shortDesc}`;
  const fullHaystack = `${title} ${shortDesc} ${kwText}`;

  const matched: Array<Exclude<TopicCategory, 'all'>> = [];
  const addCategory = (cat: Exclude<TopicCategory, 'all'>) => {
    if (!matched.includes(cat)) {
      matched.push(cat);
    }
  };

  const isGuidedTourOrExhibition =
    /(\bkierros\b|\bkierrokset\b|erikoiskierros|kummituskierros|kävelykierros|teatterikierros\w*|\bopastus\b|\bopastettu\b|guided tour|true crime|\bnäyttely\w*|\bexhibition\w*|\bmuseo\w*|\bmuseum\w*|\blukupiiri\b|\bkirjakerho\b|\bluento\b|\blecture\b)/i.test(
      fullHaystack
    );

  const isClassicalOrConcert =
    /(\bbarokk\w*|\bbarokin\b|\bbaroque\b|\bsinfonia\w*|\bsymphon\w*|\borkesteri\w*|\borchestra\b|\bkamarimusiik\w*|\bkonsert\w*|\bconcert\w*|\bresitaali\w*|\bkuoro\w*|\bchoir\b|\booppera\w*|\bopera\b)/i.test(
      fullHaystack
    );

  if (isClassicalOrConcert) {
    addCategory('music');
  }

  if (isGuidedTourOrExhibition && !isClassicalOrConcert) {
    addCategory('culture');
  }

  // Music & Gigs (word-boundary aware so "miljoonakeikka" never matches "\bkeikka\b")
  if (
    /(\bmusiik\w*|\bmusic\b|\bkonsert\w*|\bconcert\w*|\bgigs?\b|\bjazz\w*|\brock\b|\bpop\b|\bsinfonia\w*|\bsymphon\w*|\bchoir\b|\bkuoro\w*|\bkeikka\b|\bkeikat\b|\bsynth\w*|\bvinyl\b|\bopera\b|\booppera\w*|\bkaraoke\w*|\bswing\w*|\bbarokk\w*|\bbarokin\b|\bbaroque\b|\bblues\b|\bmetal\b|\bpunk\b|\bfolk\b|\blive music\b)/i.test(
      fullHaystack
    ) &&
    !/miljoonakeikka/i.test(title)
  ) {
    addCategory('music');
  }

  // Nightlife & Clubs (strictly club/DJ/party/nightlife tokens; never bare "bar" inside "barokin" or book clubs)
  if (
    /(\byöelämä\w*|\byökerho\w*|\bclubbing\b|\bnightlife\b|\bdj\b|\bdj-ilta\b|\bbileet\b|\bafterglow\b|\bafterparty\b|\brave\b|\btechno\b|\bdisco\b|\bdisko\b|\bklubi-ilta\b|\bclub night\b)/i.test(
      fullHaystack
    ) &&
    !isClassicalOrConcert &&
    !/kirjakerho|lukupiiri|business club/i.test(title)
  ) {
    addCategory('nightlife');
  }

  // Food & Markets
  if (
    /(\bruoka\w*|\bfood\b|\bmarkets?\b|\bmarkkinat\b|\bmyyjäiset\b|\bkahvila\w*|\bcafe\b|\bwine\b|\bviini\w*|\bpanimo\w*|\bstreet food\b|\bglögi\w*|\btasting\b|\bravintola\w*|\bcooking\b|\bbrunssi\w*|\bbrunch\b)/i.test(
      fullHaystack
    )
  ) {
    addCategory('food');
  }

  // Sports & Action
  if (
    /(\bliikunta\w*|\burheilu\w*|\bsports?\b|\bspectator sports\b|\bcompetitions\b|\bfitness\b|\bkuntosali\w*|\bgym\b|\bjuoksu\w*|\bjooga\w*|\byoga\b|\bhockey\b|\bjääkiekko\w*|\brunkosarja\b|\bilves\b|\btappara\b|\bkärpät\b|\bkiipeily\w*|\bboulder\w*|\bbasketball\b|\bkoripallo\w*|\buinti\w*|\bvesijumppa\w*|\btuoli-?jumppa\w*|\bjumppa\w*|\btanssi\w*|\bdance\b)/i.test(
      fullHaystack
    ) &&
    !/business club/i.test(title)
  ) {
    addCategory('sports');
  }

  // Nature & Outdoors
  if (
    /(\bluonto\w*|\bnature\b|\bpuisto\w*|\bpark\b|\bulkoilu\w*|\boutdoor\w*|\bretki\b|\bretkeily\w*|\bexcursion\b|\bvaellus\w*|\baurora\b|\brevontul\w*|\brantareitti\b|\bsaaristo\w*|\bsadonkorjuu\w*)/i.test(
      fullHaystack
    ) &&
    !/teatterikierros|kummituskierros|true crime/i.test(text)
  ) {
    addCategory('nature');
  }

  // Family & Youth
  if (
    /(\bperhe\w*|\bfamily\b|\bkids and family\b|\bkids?\b|\blapsille\b|\blasten\b|\blapset\b|\bchildren\b|\bnuorille\b|\bnuorten\b|\byouths?\b|\btaapero\w*|\bvauva\w*|\bleikkipuisto\w*|\bmuumi\w*|\bmoomin\w*|\bsatutunti\w*|\bsatutuokio\w*|\bkoululais\w*|\bvanhempainilta\b)/i.test(
      fullHaystack
    )
  ) {
    addCategory('family');
  }

  // Culture & Theatre explicit fallback
  if (
    /(\bkulttuuri\w*|\bculture\b|\bteatteri\w*|\btheat(?:er|re)\b|\bvisual arts\b|\bkuvataide\w*|\bperformance\b|\bsirkus\b|\bcircus\b|\bcomedy\b|\bkomedia\w*|\belokuva\w*|\bfilm\b|\bkirjasto\w*|\blibrary\b)/i.test(
      fullHaystack
    )
  ) {
    addCategory('culture');
  }

  if (matched.length === 0) {
    matched.push('culture');
  }

  return matched;
}

export function classifyTopic(
  raw: RawLinkedEvent
): Exclude<TopicCategory, 'all'> {
  return classifyTopics(raw)[0];
}

function buildReittiopasUrl(
  cityId: CityId,
  venueName: string,
  coordinates: [number, number] | null
): string | null {
  if (!coordinates) return null;
  const [lon, lat] = coordinates;
  const encodedDest = encodeURIComponent(`${venueName}::${lat},${lon}`);
  if (cityId === 'helsinki' || cityId === 'espoo' || cityId === 'vantaa') {
    return `https://reittiopas.hsl.fi/reitti/%20/${encodedDest}`;
  }
  if (cityId === 'tampere') {
    return `https://reittiopas.tampere.fi/reitti/%20/${encodedDest}`;
  }
  if (cityId === 'turku') {
    return `https://reittiopas.foli.fi/reitti/%20/${encodedDest}`;
  }
  return `https://opas.matka.fi/reitti/%20/${encodedDest}`;
}

const PAID_TICKET_VENDOR_REGEX =
  /lippu\.fi|tiketti\.fi|tixly\.|liveto\.io|biletti\.fi|eventim\.|netticket\.fi/i;

/**
 * Evaluates all offers on a raw event and distinguishes confirmed free admission,
 * paid admission, and unknown/unprovided price (Finding 06).
 */
export function evaluateEventPrice(raw: RawLinkedEvent): {
  priceStatus: PriceStatus;
  isFree: boolean;
  priceText: string;
} {
  const offers = Array.isArray(raw.offers) ? raw.offers.filter(Boolean) : [];
  if (offers.length === 0) {
    return {
      priceStatus: 'unknown',
      isFree: false,
      priceText: 'Price not provided',
    };
  }

  const priceStrings: string[] = [];
  let hasExplicitPaid = false;
  let hasExplicitFree = false;
  let hasPaidVendorLink = false;

  for (const offer of offers) {
    const rawPriceText = pickLocalizedText(offer.price, '').trim();
    const offerUrl = pickLocalizedText(offer.info_url, '').trim();
    if (offerUrl && PAID_TICKET_VENDOR_REGEX.test(offerUrl)) {
      hasPaidVendorLink = true;
    }

    if (rawPriceText) {
      const isZeroPrice =
        /^(0\s*€|0,00\s*€|vapaa\s*pääsy|maksuton|ilmainen|free|free\s*entry)$/i.test(
          rawPriceText
        );
      if (isZeroPrice && offer.is_free !== false) {
        hasExplicitFree = true;
      } else {
        hasExplicitPaid = true;
        if (!priceStrings.includes(rawPriceText)) {
          priceStrings.push(rawPriceText);
        }
      }
    }

    if (offer.is_free === false) {
      hasExplicitPaid = true;
    } else if (offer.is_free === true) {
      // Guard against legacy static Localhub feeds where `!page.hasPrice` was converted
      // into `{ is_free: true, price: null }` even for Lippu.fi / unknown-price events
      const isLegacyLocalhubEvent =
        raw.data_source === 'turku' ||
        raw.data_source === 'tampere' ||
        raw.data_source === 'oulu';
      if (isLegacyLocalhubEvent && !rawPriceText) {
        if (hasPaidVendorLink) {
          hasExplicitPaid = true;
        }
        // Leave hasExplicitFree false when price was null in legacy Localhub conversion
      } else {
        hasExplicitFree = true;
      }
    }
  }

  if (hasExplicitPaid) {
    const label =
      priceStrings.length > 0 ? priceStrings.join(' • ') : 'See tickets';
    return {
      priceStatus: 'paid',
      isFree: false,
      priceText: label,
    };
  }

  if (hasExplicitFree) {
    return {
      priceStatus: 'free',
      isFree: true,
      priceText: 'Free Entry',
    };
  }

  return {
    priceStatus: 'unknown',
    isFree: false,
    priceText: 'Price not provided',
  };
}

/**
 * Extracts real venue coordinates when provided by the source and rejects missing or
 * synthetically offset city-center coordinates (Finding 07).
 */
function extractGenuineCoordinates(
  raw: RawLinkedEvent,
  cityId: CityId
): {
  coordinates: [number, number] | null;
  hasExactCoordinates: boolean;
  isOnline: boolean;
} {
  const title = pickLocalizedText(raw.name, '');
  const rawLocName = pickLocalizedText(raw.location?.name, '');
  const rawStreet = pickLocalizedText(raw.location?.street_address, '');
  const rawExtra = pickLocalizedText(raw.location_extra_info, '');
  const locId = raw.location?.id || '';

  const isOnline =
    locId.includes('internet') ||
    locId.includes('virtual') ||
    /\b(verkossa|verkkotapahtuma|online|etänä|etätapahtuma|webinaari|webinar|livestream|stream|teams|zoom)\b/i.test(
      `${rawLocName} ${rawStreet} ${rawExtra} ${title}`
    );

  const coords = raw.location?.position?.coordinates;
  if (
    !Array.isArray(coords) ||
    coords.length !== 2 ||
    !Number.isFinite(coords[0]) ||
    !Number.isFinite(coords[1])
  ) {
    return { coordinates: null, hasExactCoordinates: false, isOnline };
  }

  const [lon, lat] = coords;
  const cityNameLower = CITIES[cityId].name.toLowerCase();

  // Detect legacy synthetic coordinates generated around the city center when address was just the city name
  if (
    locId.startsWith(`${cityId}:loc-`) &&
    rawLocName.trim().toLowerCase() === cityNameLower &&
    rawStreet.trim().toLowerCase() === cityNameLower
  ) {
    return { coordinates: null, hasExactCoordinates: false, isOnline };
  }

  return {
    coordinates: [lon, lat],
    hasExactCoordinates: true,
    isOnline,
  };
}

/**
 * Recomputes temporal flags (`isLiveNow`, `isStartingSoon`, `isTonight`, `isThisWeekend`, `heatWeight`)
 * and representative `startTime`/`endTime`/`dateKey` against `now` and optional `selectedDate`
 * (Findings 04, 10, 11, 12).
 */
export function refreshEventTemporalState(
  event: NormalizedEvent,
  now: Date = new Date(),
  selectedDate: string | null = null
): NormalizedEvent {
  const nowMs = now.getTime();
  const occurrences =
    event.occurrenceDates.length > 0
      ? event.occurrenceDates
      : [
          {
            start: event.startTime,
            end: event.endTime,
            dateKey: event.dateKey,
            infoUrl: event.infoUrl,
            sourceEventId: event.id,
          },
        ];

  const activeOcc = resolveEventOccurrence(
    {
      startTime: event.startTime,
      endTime: event.endTime,
      dateKey: event.dateKey,
      occurrenceDates: occurrences,
      infoUrl: event.infoUrl,
    },
    selectedDate,
    now
  );

  const isLiveNow = occurrences.some(
    (o) => nowMs >= o.start.getTime() && nowMs <= o.end.getTime()
  );

  const isStartingSoon =
    !isLiveNow &&
    occurrences.some((o) => {
      const diffHours = (o.start.getTime() - nowMs) / (3600 * 1000);
      return diffHours > 0 && diffHours <= 4;
    });

  const isTonight = isEventOccurringTonight(occurrences, now);
  const isThisWeekend = isEventOnUpcomingWeekend(occurrences, now);

  const diffFromStartHours =
    (nowMs - activeOcc.start.getTime()) / (3600 * 1000);
  const heatWeight = isLiveNow
    ? 1.0
    : isStartingSoon
      ? 0.85
      : isTonight
        ? 0.68
        : Math.abs(diffFromStartHours) < 24
          ? 0.5
          : 0.38;

  return {
    ...event,
    startTime: activeOcc.start,
    endTime: activeOcc.end,
    dateKey: toDateKey(activeOcc.start),
    infoUrl: activeOcc.infoUrl || event.infoUrl,
    isLiveNow,
    isStartingSoon,
    isTonight,
    isThisWeekend,
    heatWeight,
  };
}

export function normalizeLinkedEvent(
  raw: RawLinkedEvent,
  cityId: CityId,
  _index = 0,
  referenceCoords?: [number, number] | null,
  now: Date = new Date()
): NormalizedEvent | null {
  if (!raw || !raw.id) return null;

  const { coordinates, hasExactCoordinates, isOnline } =
    extractGenuineCoordinates(raw, cityId);

  const defaultInfoUrl =
    pickLocalizedText(raw.info_url, '') ||
    pickLocalizedText(raw.offers?.[0]?.info_url, '') ||
    pickLocalizedText(raw.location?.info_url, '') ||
    null;

  const occurrenceDates: NormalizedOccurrence[] = [];

  if (Array.isArray(raw.occurrence_dates) && raw.occurrence_dates.length > 0) {
    for (const occ of raw.occurrence_dates) {
      if (!occ?.start) continue;
      const s = new Date(occ.start);
      if (Number.isNaN(s.getTime())) continue;
      const parsedEnd = occ.end ? new Date(occ.end) : null;
      const e =
        parsedEnd && !Number.isNaN(parsedEnd.getTime()) && parsedEnd >= s
          ? parsedEnd
          : new Date(s.getTime() + 2 * 3600 * 1000);

      const occUrl = pickLocalizedText(occ.info_url, '') || defaultInfoUrl;
      occurrenceDates.push({
        start: s,
        end: e,
        dateKey: toDateKey(s),
        infoUrl: occUrl,
        sourceEventId: occ.id || raw.id,
      });
    }
  }

  let startTime: Date;
  let endTime: Date;

  if (occurrenceDates.length > 0) {
    occurrenceDates.sort((a, b) => a.start.getTime() - b.start.getTime());
    const upcoming =
      occurrenceDates.find((o) => o.end.getTime() >= now.getTime()) ||
      occurrenceDates[0];
    startTime = upcoming.start;
    endTime = upcoming.end;
  } else if (raw.start_time) {
    const parsedStart = new Date(raw.start_time);
    if (Number.isNaN(parsedStart.getTime())) {
      return null;
    }
    startTime = parsedStart;
    const parsedEnd = raw.end_time ? new Date(raw.end_time) : null;
    endTime =
      parsedEnd && !Number.isNaN(parsedEnd.getTime()) && parsedEnd >= startTime
        ? parsedEnd
        : new Date(startTime.getTime() + 2 * 3600 * 1000);

    occurrenceDates.push({
      start: startTime,
      end: endTime,
      dateKey: toDateKey(startTime),
      infoUrl: defaultInfoUrl,
      sourceEventId: raw.id,
    });
  } else {
    // Do not invent timestamps for events lacking any start time
    return null;
  }

  const categories = classifyTopics(raw);
  const category = categories[0];
  const topicMeta = TOPICS.find((t) => t.id === category) || TOPICS[0];

  const title = pickLocalizedText(raw.name, 'Untitled Event');
  const shortDescription = pickLocalizedText(
    raw.short_description,
    'Open flyer for event details and schedule.'
  );
  const descriptionHtml = pickLocalizedText(
    raw.description,
    `<p>${shortDescription}</p>`
  );

  const rawVenueName = pickLocalizedText(raw.location?.name, '');
  const rawStreetAddress = pickLocalizedText(raw.location?.street_address, '');

  const venueName =
    rawVenueName ||
    (isOnline
      ? 'Online Event'
      : hasExactCoordinates
        ? `${CITIES[cityId].name} Venue`
        : 'Location not provided');

  const streetAddress =
    rawStreetAddress ||
    (isOnline
      ? 'Online'
      : hasExactCoordinates
        ? CITIES[cityId].name
        : 'Address not provided');

  const venueId =
    raw.location?.id ||
    (coordinates
      ? `${cityId}:${coordinates[0].toFixed(4)},${coordinates[1].toFixed(4)}`
      : `${cityId}:unmapped:${venueName.toLowerCase().trim()}`);

  const primaryImage = raw.images?.[0] || null;
  const imageUrl = getSafeEventImageUrl(raw, raw.id, [raw.id]);
  const imageAlt = primaryImage?.alt_text || title;
  const attribution = buildLicenseAttribution(raw, primaryImage, cityId);

  const { priceStatus, isFree, priceText } = evaluateEventPrice(raw);

  const reittiopasUrl = buildReittiopasUrl(cityId, venueName, coordinates);
  const refPoint = referenceCoords || CITIES[cityId].coordinates;
  const distanceKm = calculateDistanceKm(refPoint, coordinates);

  const baseEvent: NormalizedEvent = {
    id: raw.id,
    aliasIds: [raw.id],
    cityId,
    title,
    shortDescription,
    descriptionHtml,
    startTime,
    endTime,
    dateKey: toDateKey(startTime),
    occurrenceDates,
    isLiveNow: false,
    isStartingSoon: false,
    isTonight: false,
    isThisWeekend: false,
    category,
    categories,
    categoryEmoji: topicMeta.emoji,
    categoryLabel: topicMeta.label,
    venueId,
    venueName,
    streetAddress,
    coordinates,
    hasExactCoordinates,
    isOnline,
    distanceKm,
    imageUrl,
    imageAlt,
    attribution,
    priceStatus,
    isFree,
    priceText,
    infoUrl: defaultInfoUrl,
    reittiopasUrl,
    heatWeight: 0.38,
    raw,
  };

  return refreshEventTemporalState(baseEvent, now, null);
}

/**
 * Consolidates recurring sub-events that belong to the same upstream series (super_event)
 * or share the same venue and title:
 * - Preserves same-day multiple sessions by deduplicating on full [start, end] timestamps (never dateKey alone)
 * - Retains all original event IDs in `aliasIds` so deep links and saved IDs stay resolvable
 * - Recomputes representative occurrence and temporal status after merging (Finding 05).
 */
export function consolidateRecurringEvents(
  events: NormalizedEvent[],
  now: Date = new Date()
): NormalizedEvent[] {
  const bySeriesOrVenue = new Map<string, NormalizedEvent>();

  for (const ev of events) {
    const superId =
      ev.raw.super_event?.['@id'] || ev.raw.super_event?.id || null;
    const locKey = ev.coordinates
      ? `${ev.coordinates[0].toFixed(4)},${ev.coordinates[1].toFixed(4)}`
      : `unmapped:${ev.venueId}`;
    const key = superId
      ? `${ev.cityId}:super:${superId}:${ev.title.toLowerCase().trim()}`
      : `${ev.cityId}:venue:${locKey}:title:${ev.title.toLowerCase().trim()}`;

    const existing = bySeriesOrVenue.get(key);
    if (!existing) {
      bySeriesOrVenue.set(key, {
        ...ev,
        aliasIds: [...ev.aliasIds],
        occurrenceDates: [...ev.occurrenceDates],
        categories: [...ev.categories],
      });
    } else {
      for (const aliasId of ev.aliasIds) {
        if (!existing.aliasIds.includes(aliasId)) {
          existing.aliasIds.push(aliasId);
        }
      }
      if (!existing.aliasIds.includes(ev.id)) {
        existing.aliasIds.push(ev.id);
      }

      for (const occ of ev.occurrenceDates) {
        const isDuplicateTimestamp = existing.occurrenceDates.some(
          (o) =>
            o.start.getTime() === occ.start.getTime() &&
            o.end.getTime() === occ.end.getTime()
        );
        if (!isDuplicateTimestamp) {
          existing.occurrenceDates.push(occ);
        }
      }

      existing.occurrenceDates.sort(
        (a, b) =>
          a.start.getTime() - b.start.getTime() ||
          a.end.getTime() - b.end.getTime()
      );

      for (const cat of ev.categories) {
        if (!existing.categories.includes(cat)) {
          existing.categories.push(cat);
        }
      }

      if (!existing.imageUrl && ev.imageUrl) {
        existing.imageUrl = ev.imageUrl;
        existing.imageAlt = ev.imageAlt;
        existing.attribution = ev.attribution;
      }
      if (!existing.infoUrl && ev.infoUrl) {
        existing.infoUrl = ev.infoUrl;
      }
      if (existing.priceStatus === 'unknown' && ev.priceStatus !== 'unknown') {
        existing.priceStatus = ev.priceStatus;
        existing.isFree = ev.isFree;
        existing.priceText = ev.priceText;
      }
    }
  }

  return Array.from(bySeriesOrVenue.values()).map((ev) =>
    refreshEventTemporalState(ev, now, null)
  );
}

function computeCoverageBounds(events: NormalizedEvent[]): {
  coverageStart: string | null;
  coverageEnd: string | null;
} {
  let minMs = Infinity;
  let maxMs = -Infinity;

  for (const ev of events) {
    for (const occ of ev.occurrenceDates) {
      const s = occ.start.getTime();
      const e = occ.end.getTime();
      if (!Number.isNaN(s) && s < minMs) minMs = s;
      if (!Number.isNaN(e) && e > maxMs) maxMs = e;
    }
  }

  return {
    coverageStart: Number.isFinite(minMs) ? toDateKey(new Date(minMs)) : null,
    coverageEnd: Number.isFinite(maxMs) ? toDateKey(new Date(maxMs)) : null,
  };
}

export interface CityEventsResult {
  cityId: CityId;
  events: NormalizedEvent[];
  source: 'live-api' | 'indexeddb-cache' | 'static-feed' | 'offline-fallback';
  fetchedAt: Date;
  generatedAt: string | null;
  totalUpstream: number | null;
  isStale: boolean;
  coverageStart: string | null;
  coverageEnd: string | null;
}

function buildResultFromPayload(
  cityId: CityId,
  payload: LinkedEventsApiResponse,
  source: CityEventsResult['source'],
  fetchedAt: Date,
  isStale: boolean
): CityEventsResult {
  const normalized = (payload.data || [])
    .map((raw, idx) => normalizeLinkedEvent(raw, cityId, idx))
    .filter((e): e is NormalizedEvent => e !== null);
  const events = consolidateRecurringEvents(normalized);
  const { coverageStart, coverageEnd } = computeCoverageBounds(events);

  return {
    cityId,
    events,
    source,
    fetchedAt,
    generatedAt: payload.meta?.generated_at || null,
    totalUpstream:
      typeof payload.meta?.total_upstream === 'number'
        ? payload.meta.total_upstream
        : typeof payload.meta?.count === 'number'
          ? payload.meta.count
          : null,
    isStale,
    coverageStart,
    coverageEnd,
  };
}

export async function fetchCityEvents(
  cityId: CityId,
  forceRefresh = false,
  targetDateKey: string | null = null,
  signal?: AbortSignal
): Promise<CityEventsResult> {
  const cityConfig = CITIES[cityId];
  // Static-jsonld feeds already contain all events in the base city feed; only key by date for live-api
  const cacheKey =
    cityConfig.dataMechanism === 'live-api' && targetDateKey
      ? `${cityId}:${targetDateKey}`
      : cityId;

  const cachedLookup = await readCachedFeed(cacheKey);

  if (
    !forceRefresh &&
    cachedLookup?.isFresh &&
    Array.isArray(cachedLookup.record.payload?.data)
  ) {
    const result = buildResultFromPayload(
      cityId,
      cachedLookup.record.payload,
      cityConfig.dataMechanism === 'live-api'
        ? 'indexeddb-cache'
        : 'static-feed',
      new Date(cachedLookup.record.timestamp),
      false
    );
    if (result.events.length > 0 || targetDateKey) {
      return result;
    }
  }

  const baseUrl =
    typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? import.meta.env.BASE_URL
      : '/';
  const staticFeedUrl = `${baseUrl}feeds/${cityId}.json`;

  if (cityConfig.dataMechanism === 'live-api') {
    try {
      const dateQuery = targetDateKey
        ? `start=${targetDateKey}&end=${targetDateKey}&sort=end_time&page_size=100`
        : `start=now&sort=end_time&page_size=100`;

      const page1Url = `https://api.hel.fi/linkedevents/v1/event/?division=${cityId}&include=location,keywords&${dateQuery}&page=1`;
      const page2Url = `https://api.hel.fi/linkedevents/v1/event/?division=${cityId}&include=location,keywords&${dateQuery}&page=2`;

      const [res1, res2, staticRes] = await Promise.allSettled([
        fetchWithTimeout(
          page1Url,
          { headers: { Accept: 'application/json' } },
          FETCH_TIMEOUT_MS,
          signal
        ),
        fetchWithTimeout(
          page2Url,
          { headers: { Accept: 'application/json' } },
          FETCH_TIMEOUT_MS,
          signal
        ),
        !targetDateKey
          ? fetchWithTimeout(
              staticFeedUrl,
              { headers: { Accept: 'application/json' } },
              FETCH_TIMEOUT_MS,
              signal
            )
          : Promise.reject(new Error('skip static on custom date')),
      ]);

      if (signal?.aborted) {
        throw new DOMException('Request aborted', 'AbortError');
      }

      const anyLiveFulfilled =
        (res1.status === 'fulfilled' && res1.value.ok) ||
        (res2.status === 'fulfilled' && res2.value.ok);

      const combinedRaw: RawLinkedEvent[] = [];
      const seenIds = new Set<string>();
      let upstreamCount: number | undefined;

      for (const settled of [res1, res2, staticRes]) {
        if (settled.status === 'fulfilled' && settled.value.ok) {
          const json = (await settled.value.json()) as LinkedEventsApiResponse;
          if (
            typeof json.meta?.count === 'number' &&
            upstreamCount === undefined
          ) {
            upstreamCount = json.meta.count;
          }
          if (Array.isArray(json.data)) {
            for (const item of json.data) {
              if (!seenIds.has(item.id)) {
                seenIds.add(item.id);
                combinedRaw.push(item);
              }
            }
          }
        }
      }

      // Return live result if either events were found OR the live API explicitly returned 0 events for a specific date
      if (combinedRaw.length > 0 || (targetDateKey && anyLiveFulfilled)) {
        const payload: LinkedEventsApiResponse = {
          meta: {
            count: combinedRaw.length,
            total_upstream: upstreamCount ?? combinedRaw.length,
            next: null,
            previous: null,
            generated_at: new Date().toISOString(),
          },
          data: combinedRaw,
        };
        await writeCachedFeed({
          cacheKey,
          cityId,
          timestamp: Date.now(),
          source: 'live-api',
          payload,
        });

        return buildResultFromPayload(
          cityId,
          payload,
          'live-api',
          new Date(),
          false
        );
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      console.warn(
        `[linkedEventsClient] Live API fetch failed for ${cityId}, falling back:`,
        err
      );
    }
  }

  // Static JSON-LD feed or capital fallback
  try {
    const fallbackRes = await fetchWithTimeout(
      staticFeedUrl,
      { headers: { Accept: 'application/json' } },
      FETCH_TIMEOUT_MS,
      signal
    );
    if (!fallbackRes.ok) {
      throw new Error(`Failed to load static feed ${staticFeedUrl}`);
    }
    const payload = (await fallbackRes.json()) as LinkedEventsApiResponse;
    await writeCachedFeed({
      cacheKey: cityId,
      cityId,
      timestamp: Date.now(),
      source:
        cityConfig.dataMechanism === 'static-jsonld'
          ? 'static-feed'
          : 'offline-fallback',
      payload,
    });

    // Finding 02: Never fabricate or project events onto uncovered dates.
    return buildResultFromPayload(
      cityId,
      payload,
      cityConfig.dataMechanism === 'static-jsonld'
        ? 'static-feed'
        : 'offline-fallback',
      new Date(),
      cityConfig.dataMechanism === 'live-api'
    );
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;

    // Finding 21: Retain and serve stale IndexedDB cached records when offline or network fails
    const staleLookup =
      cachedLookup || (targetDateKey ? await readCachedFeed(cityId) : null);
    if (staleLookup && Array.isArray(staleLookup.record.payload?.data)) {
      return buildResultFromPayload(
        cityId,
        staleLookup.record.payload,
        'offline-fallback',
        new Date(staleLookup.record.timestamp),
        true
      );
    }
    throw err;
  }
}

/**
 * Groups events into VenueStoryGroups for map markers and flyer stories.
 * By default, only events with genuine coordinates are placed on the map (`includeUnmapped = false`),
 * preventing invented locations (Finding 07). When opening a single unmapped event in the flyer player,
 * pass `includeUnmapped = true`.
 */
export function groupEventsByVenue(
  events: NormalizedEvent[],
  options: { includeUnmapped?: boolean } = {}
): VenueStoryGroup[] {
  const { includeUnmapped = false } = options;
  const map = new Map<string, VenueStoryGroup>();

  for (const ev of events) {
    if (!ev.coordinates || !ev.hasExactCoordinates) {
      if (!includeUnmapped) continue;
    }

    const coords: [number, number] = ev.coordinates || CITIES[ev.cityId].coordinates;
    const coordKey = ev.coordinates
      ? `${ev.coordinates[0].toFixed(4)},${ev.coordinates[1].toFixed(4)}`
      : `unmapped:${ev.venueId}`;
    const groupKey = `${ev.cityId}:${coordKey}`;
    const dist = ev.distanceKm ?? Infinity;

    const existing = map.get(groupKey);
    if (!existing) {
      map.set(groupKey, {
        venueId: ev.venueId,
        venueName: ev.venueName,
        streetAddress: ev.streetAddress,
        cityId: ev.cityId,
        coordinates: coords,
        distanceKm: dist,
        events: [ev],
        hasLiveEvent: ev.isLiveNow,
        hasStartingSoon: ev.isStartingSoon,
        topCategory: ev.category,
        topEmoji: ev.categoryEmoji,
        coverImageUrl: ev.imageUrl,
        totalHeat: ev.heatWeight,
      });
    } else {
      if (!existing.events.some((e) => e.id === ev.id)) {
        existing.events.push(ev);
      }
      existing.hasLiveEvent = existing.hasLiveEvent || ev.isLiveNow;
      existing.hasStartingSoon = existing.hasStartingSoon || ev.isStartingSoon;
      if (!existing.coverImageUrl && ev.imageUrl) {
        existing.coverImageUrl = ev.imageUrl;
      }
      existing.distanceKm = Math.min(existing.distanceKm, dist);
      existing.totalHeat = Math.min(
        2.5,
        existing.totalHeat + ev.heatWeight * 0.45
      );
    }
  }

  for (const group of map.values()) {
    group.events.sort((a, b) => {
      if (a.isLiveNow !== b.isLiveNow) return a.isLiveNow ? -1 : 1;
      return a.startTime.getTime() - b.startTime.getTime();
    });
    const lead = group.events[0];
    group.topCategory = lead.category;
    group.topEmoji = lead.categoryEmoji;
  }

  return Array.from(map.values());
}
