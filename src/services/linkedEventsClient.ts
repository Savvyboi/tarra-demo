import { CITIES, TOPICS } from '../config/cities';
import {
  CityId,
  LinkedEventsApiResponse,
  NormalizedEvent,
  NormalizedOccurrence,
  RawLinkedEvent,
  TopicCategory,
  VenueStoryGroup,
} from '../types/linkedEvents';
import {
  doesEventOccurOnDate,
  parseDateKey,
  toDateKey,
} from '../utils/calendarUtils';
import { calculateDistanceKm } from '../utils/distanceUtils';
import {
  buildLicenseAttribution,
  getSafeEventImageUrl,
  pickLocalizedText,
} from '../utils/licenseGuard';

const DB_NAME = 'snapevents_linkedevents_cache_v3';
const STORE_NAME = 'city_feeds';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CachedFeedRecord {
  cacheKey: string;
  cityId: CityId;
  timestamp: number;
  source: 'live-api' | 'static-feed' | 'offline-fallback';
  payload: LinkedEventsApiResponse;
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
): Promise<CachedFeedRecord | null> {
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
        if (Date.now() - record.timestamp > CACHE_TTL_MS) {
          resolve(null);
          return;
        }
        resolve(record);
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

function classifyTopic(raw: RawLinkedEvent): Exclude<TopicCategory, 'all'> {
  const title = pickLocalizedText(raw.name, '').toLowerCase();
  const shortDesc = pickLocalizedText(raw.short_description, '').toLowerCase();
  const kwText = (raw.keywords || [])
    .map((k) => `${k.id || ''} ${pickLocalizedText(k.name, '')}`)
    .join(' ')
    .toLowerCase();
  const haystack = `${title} ${shortDesc} ${kwText}`;

  if (
    /yöelämä|klubi|club|clubbing|dj|party|bileet|nightlife|bar|pub|afterglow/.test(
      haystack
    )
  ) {
    return 'nightlife';
  }
  if (
    /musiik|music|konsert|concert|concerts|gigs|jazz|rock|pop|sinfonia|symphony|choir|kuoro|keikka|gig|synth|vinyl|opera|ooppera|karaoke|swing/.test(
      haystack
    )
  ) {
    return 'music';
  }
  if (
    /ruoka|food|market|markets|markkinat|kahvila|cafe|wine|panimo|street food|glögi|taste|ravintola|cooking|beverage/.test(
      haystack
    )
  ) {
    return 'food';
  }
  if (
    /liikunta|urheilu|sport|sports|fitness|kuntosali|gym|juoksu|run|jooga|yoga|hockey|jääkiekko|tps|ilves|tappara|kärpät|kiipeily|boulder|basketball|koripallo|uinti|vesijumppa|jumppa|tanssi|dance/.test(
      haystack
    )
  ) {
    return 'sports';
  }
  if (
    /luonto|nature|puisto|park|ulkoilu|outdoor|retki|excursion|vaellus|aurora|revontul|ranta|beach|meri|saaristo|sadonkorjuu/.test(
      haystack
    )
  ) {
    return 'nature';
  }
  if (
    /perhe|family|kids|laps|children|nuor|youth|youths|taapero|vauva|leikkipuisto|seikkailu|leikki|muumi|moomin|satutunti|satutuokio|koululais/.test(
      haystack
    )
  ) {
    return 'family';
  }
  return 'culture';
}

function buildReittiopasUrl(
  cityId: CityId,
  venueName: string,
  coordinates: [number, number]
): string {
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

export function normalizeLinkedEvent(
  raw: RawLinkedEvent,
  cityId: CityId,
  index: number,
  referenceCoords?: [number, number]
): NormalizedEvent | null {
  const coords = raw.location?.position?.coordinates;
  let validCoords: [number, number];

  if (
    Array.isArray(coords) &&
    coords.length === 2 &&
    Number.isFinite(coords[0]) &&
    Number.isFinite(coords[1])
  ) {
    validCoords = [coords[0], coords[1]];
  } else {
    const base = CITIES[cityId].coordinates;
    const angle = (index * 137.5 * Math.PI) / 180;
    const radius = 0.004 + (index % 7) * 0.0022;
    validCoords = [
      Number((base[0] + Math.cos(angle) * radius * 1.8).toFixed(6)),
      Number((base[1] + Math.sin(angle) * radius).toFixed(6)),
    ];
  }

  const now = new Date();
  const occurrenceDates: NormalizedOccurrence[] = [];

  if (Array.isArray(raw.occurrence_dates) && raw.occurrence_dates.length > 0) {
    for (const occ of raw.occurrence_dates) {
      const s = new Date(occ.start);
      if (Number.isNaN(s.getTime())) continue;
      const e = occ.end
        ? new Date(occ.end)
        : new Date(s.getTime() + 2.5 * 3600 * 1000);
      occurrenceDates.push({
        start: s,
        end: Number.isNaN(e.getTime()) || e <= s ? new Date(s.getTime() + 2.5 * 3600 * 1000) : e,
        dateKey: toDateKey(s),
      });
    }
  }

  let startTime: Date;
  let endTime: Date;

  if (occurrenceDates.length > 0) {
    // Pick current or next upcoming occurrence
    const upcoming =
      occurrenceDates.find((o) => o.end >= now) || occurrenceDates[0];
    startTime = upcoming.start;
    endTime = upcoming.end;
  } else if (typeof raw._demo_offset_hours === 'number') {
    const dayOffset =
      typeof raw._demo_day_offset === 'number' ? raw._demo_day_offset : 0;
    const durationHours =
      typeof raw._demo_duration_hours === 'number'
        ? raw._demo_duration_hours
        : 3;
    const totalOffsetMs =
      (dayOffset * 24 + raw._demo_offset_hours) * 3600 * 1000;
    startTime = new Date(now.getTime() + totalOffsetMs);
    endTime = new Date(startTime.getTime() + durationHours * 3600 * 1000);
  } else {
    startTime = raw.start_time
      ? new Date(raw.start_time)
      : new Date(now.getTime() - 1800 * 1000);
    if (Number.isNaN(startTime.getTime())) {
      startTime = new Date();
    }
    endTime = raw.end_time
      ? new Date(raw.end_time)
      : new Date(startTime.getTime() + 2.5 * 3600 * 1000);
    if (Number.isNaN(endTime.getTime()) || endTime <= startTime) {
      endTime = new Date(startTime.getTime() + 2.5 * 3600 * 1000);
    }
  }

  if (occurrenceDates.length === 0) {
    occurrenceDates.push({
      start: startTime,
      end: endTime,
      dateKey: toDateKey(startTime),
    });
  }

  const diffFromStartHours =
    (now.getTime() - startTime.getTime()) / (3600 * 1000);
  const diffUntilStartHours =
    (startTime.getTime() - now.getTime()) / (3600 * 1000);

  const isLiveNow =
    (now >= startTime && now <= endTime) ||
    occurrenceDates.some((o) => now >= o.start && now <= o.end);
  const isStartingSoon =
    !isLiveNow && diffUntilStartHours > 0 && diffUntilStartHours <= 4;

  const todayKey = toDateKey(now);
  const isSameDay =
    toDateKey(startTime) === todayKey ||
    occurrenceDates.some((o) => o.dateKey === todayKey);

  const isTonight =
    isLiveNow ||
    isStartingSoon ||
    isSameDay ||
    (diffUntilStartHours >= 0 && diffUntilStartHours <= 18);

  const dayOfWeek = startTime.getDay();
  const isThisWeekend =
    isLiveNow ||
    dayOfWeek === 0 ||
    dayOfWeek === 5 ||
    dayOfWeek === 6 ||
    occurrenceDates.some((o) => {
      const d = o.start.getDay();
      const hrs = (o.start.getTime() - now.getTime()) / (3600 * 1000);
      return hrs >= -6 && hrs <= 120 && (d === 0 || d === 5 || d === 6);
    });

  const category = classifyTopic(raw);
  const topicMeta = TOPICS.find((t) => t.id === category) || TOPICS[0];

  const title = pickLocalizedText(raw.name, 'Untitled Event');
  const shortDescription = pickLocalizedText(
    raw.short_description,
    'Tap to view full event details, venue location, and transit directions.'
  );
  const descriptionHtml = pickLocalizedText(
    raw.description,
    `<p>${shortDescription}</p>`
  );

  const venueName = pickLocalizedText(
    raw.location?.name,
    `${CITIES[cityId].name} Venue`
  );
  const streetAddress = pickLocalizedText(
    raw.location?.street_address,
    CITIES[cityId].name
  );
  const venueId =
    raw.location?.id ||
    `${cityId}:${validCoords[0].toFixed(4)},${validCoords[1].toFixed(4)}`;

  const primaryImage = raw.images?.[0] || null;
  const imageUrl = getSafeEventImageUrl(raw, raw.id);
  const imageAlt = primaryImage?.alt_text || title;
  const attribution = buildLicenseAttribution(raw, primaryImage);

  const firstOffer = raw.offers?.[0];
  const isFree = firstOffer ? Boolean(firstOffer.is_free) : true;
  const rawPrice = pickLocalizedText(firstOffer?.price, '');
  const priceText = isFree ? 'Free Entry' : rawPrice || 'Ticketed';

  const infoUrl =
    pickLocalizedText(raw.info_url, '') ||
    pickLocalizedText(firstOffer?.info_url, '') ||
    pickLocalizedText(raw.location?.info_url, '') ||
    null;

  const reittiopasUrl = buildReittiopasUrl(cityId, venueName, validCoords);

  const refPoint = referenceCoords || CITIES[cityId].coordinates;
  const distanceKm = calculateDistanceKm(refPoint, validCoords);

  const heatWeight = isLiveNow
    ? 1.0
    : isStartingSoon
      ? 0.85
      : isTonight
        ? 0.68
        : diffFromStartHours < 24
          ? 0.5
          : 0.38;

  return {
    id: raw.id,
    cityId,
    title,
    shortDescription,
    descriptionHtml,
    startTime,
    endTime,
    dateKey: toDateKey(startTime),
    occurrenceDates,
    isLiveNow,
    isStartingSoon,
    isTonight,
    isThisWeekend,
    category,
    categoryEmoji: topicMeta.emoji,
    categoryLabel: topicMeta.label,
    venueId,
    venueName,
    streetAddress,
    coordinates: validCoords,
    distanceKm,
    imageUrl,
    imageAlt,
    attribution,
    isFree,
    priceText,
    infoUrl,
    reittiopasUrl,
    heatWeight,
    raw,
  };
}

/**
 * Deduplicates recurring sub-events that share the exact same title and venue
 * by combining their occurrence dates into a single NormalizedEvent.
 */
function consolidateRecurringEvents(
  events: NormalizedEvent[]
): NormalizedEvent[] {
  const byTitleAndVenue = new Map<string, NormalizedEvent>();

  for (const ev of events) {
    const key = `${ev.cityId}:${ev.title.toLowerCase().trim()}:${ev.coordinates[0].toFixed(4)},${ev.coordinates[1].toFixed(4)}`;
    const existing = byTitleAndVenue.get(key);
    if (!existing) {
      byTitleAndVenue.set(key, ev);
    } else {
      for (const occ of ev.occurrenceDates) {
        if (!existing.occurrenceDates.some((o) => o.dateKey === occ.dateKey)) {
          existing.occurrenceDates.push(occ);
        }
      }
      existing.isLiveNow = existing.isLiveNow || ev.isLiveNow;
      existing.isStartingSoon = existing.isStartingSoon || ev.isStartingSoon;
      existing.isTonight = existing.isTonight || ev.isTonight;
      existing.isThisWeekend = existing.isThisWeekend || ev.isThisWeekend;
      if (!existing.imageUrl && ev.imageUrl) {
        existing.imageUrl = ev.imageUrl;
      }
    }
  }

  return Array.from(byTitleAndVenue.values());
}

export interface CityEventsResult {
  cityId: CityId;
  events: NormalizedEvent[];
  source: 'live-api' | 'indexeddb-cache' | 'static-feed' | 'offline-fallback';
  fetchedAt: Date;
}

export async function fetchCityEvents(
  cityId: CityId,
  forceRefresh = false,
  targetDateKey: string | null = null
): Promise<CityEventsResult> {
  const cityConfig = CITIES[cityId];
  const cacheKey = targetDateKey ? `${cityId}:${targetDateKey}` : cityId;

  if (!forceRefresh) {
    const cached = await readCachedFeed(cacheKey);
    if (cached && Array.isArray(cached.payload?.data)) {
      const normalized = cached.payload.data
        .map((raw, idx) => normalizeLinkedEvent(raw, cityId, idx))
        .filter((e): e is NormalizedEvent => e !== null);
      const events = consolidateRecurringEvents(normalized);
      if (events.length > 0) {
        return {
          cityId,
          events,
          source:
            cityConfig.dataMechanism === 'live-api'
              ? 'indexeddb-cache'
              : 'static-feed',
          fetchedAt: new Date(cached.timestamp),
        };
      }
    }
  }

  // Always resolve static feeds with Vite's built-in import.meta.env.BASE_URL
  const staticFeedUrl = `${import.meta.env.BASE_URL}feeds/${cityId}.json`;

  if (cityConfig.dataMechanism === 'live-api') {
    try {
      // Load both bundled 300-event snapshot AND live API pages for maximum coverage
      const dateQuery = targetDateKey
        ? `start=${targetDateKey}&end=${targetDateKey}&sort=end_time&page_size=100`
        : `start=now&sort=end_time&page_size=100`;

      const page1Url = `https://api.hel.fi/linkedevents/v1/event/?division=${cityId}&include=location,keywords&${dateQuery}&page=1`;
      const page2Url = `https://api.hel.fi/linkedevents/v1/event/?division=${cityId}&include=location,keywords&${dateQuery}&page=2`;

      const [res1, res2, staticRes] = await Promise.allSettled([
        fetch(page1Url, { headers: { Accept: 'application/json' } }),
        fetch(page2Url, { headers: { Accept: 'application/json' } }),
        !targetDateKey
          ? fetch(staticFeedUrl, { headers: { Accept: 'application/json' } })
          : Promise.reject(new Error('skip static on custom date')),
      ]);

      const combinedRaw: RawLinkedEvent[] = [];
      const seenIds = new Set<string>();

      for (const settled of [res1, res2, staticRes]) {
        if (settled.status === 'fulfilled' && settled.value.ok) {
          const json = (await settled.value.json()) as LinkedEventsApiResponse;
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

      if (combinedRaw.length > 0) {
        const payload: LinkedEventsApiResponse = {
          meta: { count: combinedRaw.length, next: null, previous: null },
          data: combinedRaw,
        };
        await writeCachedFeed({
          cacheKey,
          cityId,
          timestamp: Date.now(),
          source: 'live-api',
          payload,
        });

        const normalized = combinedRaw
          .map((raw, idx) => normalizeLinkedEvent(raw, cityId, idx))
          .filter((e): e is NormalizedEvent => e !== null);
        const events = consolidateRecurringEvents(normalized);

        return {
          cityId,
          events,
          source: 'live-api',
          fetchedAt: new Date(),
        };
      }
    } catch (err) {
      console.warn(
        `[linkedEventsClient] Live API fetch failed for ${cityId}, falling back to bundled feed:`,
        err
      );
    }
  }

  // Static JSON-LD feed (Turku 450 events, Tampere 450 events, Oulu 450 events, or Capital fallback)
  const fallbackRes = await fetch(staticFeedUrl, {
    headers: { Accept: 'application/json' },
  });
  if (!fallbackRes.ok) {
    throw new Error(`Failed to load static feed ${staticFeedUrl}`);
  }
  const payload = (await fallbackRes.json()) as LinkedEventsApiResponse;
  await writeCachedFeed({
    cacheKey,
    cityId,
    timestamp: Date.now(),
    source:
      cityConfig.dataMechanism === 'static-jsonld'
        ? 'static-feed'
        : 'offline-fallback',
    payload,
  });

  const normalized = (payload.data || [])
    .map((raw, idx) => normalizeLinkedEvent(raw, cityId, idx))
    .filter((e): e is NormalizedEvent => e !== null);

  const events = consolidateRecurringEvents(normalized);

  if (
    targetDateKey &&
    !events.some((ev) => doesEventOccurOnDate(ev, targetDateKey))
  ) {
    const targetDay = parseDateKey(targetDateKey);
    const projected = events.slice(0, 12).map((ev, idx) => {
      const start = new Date(
        targetDay.getFullYear(),
        targetDay.getMonth(),
        targetDay.getDate(),
        12 + (idx % 8),
        0,
        0
      );
      const end = new Date(start.getTime() + 3 * 3600 * 1000);
      return {
        ...ev,
        id: `${ev.id}-${targetDateKey}`,
        startTime: start,
        endTime: end,
        dateKey: targetDateKey,
      };
    });
    events.push(...projected);
  }

  return {
    cityId,
    events,
    source:
      cityConfig.dataMechanism === 'static-jsonld'
        ? 'static-feed'
        : 'offline-fallback',
    fetchedAt: new Date(),
  };
}

export function groupEventsByVenue(
  events: NormalizedEvent[]
): VenueStoryGroup[] {
  const map = new Map<string, VenueStoryGroup>();

  for (const ev of events) {
    const coordKey = `${ev.coordinates[0].toFixed(4)},${ev.coordinates[1].toFixed(4)}`;
    const groupKey = `${ev.cityId}:${coordKey}`;

    const existing = map.get(groupKey);
    if (!existing) {
      map.set(groupKey, {
        venueId: ev.venueId,
        venueName: ev.venueName,
        streetAddress: ev.streetAddress,
        cityId: ev.cityId,
        coordinates: ev.coordinates,
        distanceKm: ev.distanceKm,
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
      existing.distanceKm = Math.min(existing.distanceKm, ev.distanceKm);
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
