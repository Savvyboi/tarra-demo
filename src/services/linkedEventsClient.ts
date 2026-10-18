import { CITIES, TOPICS } from '../config/cities';
import {
  CityId,
  LinkedEventsApiResponse,
  NormalizedEvent,
  RawLinkedEvent,
  TopicCategory,
  VenueStoryGroup,
} from '../types/linkedEvents';
import {
  doesEventOccurOnDate,
  parseDateKey,
  toDateKey,
} from '../utils/calendarUtils';
import {
  buildLicenseAttribution,
  getSafeEventImageUrl,
  pickLocalizedText,
} from '../utils/licenseGuard';

const DB_NAME = 'snapevents_linkedevents_cache_v2';
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
    /yöelämä|klubi|club|dj|party|bileet|nightlife|bar|pub|afterglow/.test(
      haystack
    )
  ) {
    return 'nightlife';
  }
  if (
    /musiik|music|konsert|concert|jazz|rock|pop|sinfonia|symphony|choir|kuoro|keikka|gig|synth|vinyl|opera|ooppera/.test(
      haystack
    )
  ) {
    return 'music';
  }
  if (
    /ruoka|food|market|markkinat|kahvila|cafe|wine|panimo|street food|glögi|taste|ravintola/.test(
      haystack
    )
  ) {
    return 'food';
  }
  if (
    /liikunta|urheilu|sport|kuntosali|gym|juoksu|run|jooga|yoga|hockey|jääkiekko|kiipeily|boulder|basketball|koripallo|uinti|tanssi/.test(
      haystack
    )
  ) {
    return 'sports';
  }
  if (
    /luonto|nature|puisto|park|ulkoilu|outdoor|retki|vaellus|aurora|revontul|ranta|beach|meri|saaristo/.test(
      haystack
    )
  ) {
    return 'nature';
  }
  if (
    /perhe|family|laps|children|nuor|youth|seikkailu|leikki|muumi|moomin|satutunti|koululais/.test(
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
  index: number
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
    const radius = 0.004 + (index % 5) * 0.0025;
    validCoords = [
      Number((base[0] + Math.cos(angle) * radius * 1.8).toFixed(6)),
      Number((base[1] + Math.sin(angle) * radius).toFixed(6)),
    ];
  }

  const now = new Date();
  let startTime: Date;
  let endTime: Date;

  // Dynamic Date Shifting for Demo Reliability on static feeds (Turku, Tampere, Oulu)
  if (typeof raw._demo_offset_hours === 'number') {
    const dayOffset =
      typeof raw._demo_day_offset === 'number' ? raw._demo_day_offset : 0;
    const durationHours =
      typeof raw._demo_duration_hours === 'number' ? raw._demo_duration_hours : 3;
    const totalOffsetMs = (dayOffset * 24 + raw._demo_offset_hours) * 3600 * 1000;
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

    // For live Capital Region events that are multi-week ongoing exhibitions (duration > 72h),
    // anchor their daily session time across upcoming days so they populate both today and calendar days cleanly
    const durationHours =
      (endTime.getTime() - startTime.getTime()) / (3600 * 1000);
    if (durationHours > 72 && startTime <= now && endTime >= now) {
      const daySpread = index % 6; // 0..5 days out
      const slotOffsetHours = ((index % 5) - 2) * 0.75;
      startTime = new Date(
        now.getTime() + (daySpread * 24 + slotOffsetHours) * 3600 * 1000
      );
      endTime = new Date(startTime.getTime() + 3.5 * 3600 * 1000);
    }
  }

  const diffFromStartHours =
    (now.getTime() - startTime.getTime()) / (3600 * 1000);
  const diffUntilStartHours =
    (startTime.getTime() - now.getTime()) / (3600 * 1000);

  const isLiveNow = now >= startTime && now <= endTime;
  const isStartingSoon =
    !isLiveNow && diffUntilStartHours > 0 && diffUntilStartHours <= 3;

  const isSameDay =
    startTime.getFullYear() === now.getFullYear() &&
    startTime.getMonth() === now.getMonth() &&
    startTime.getDate() === now.getDate();
  const isTonight =
    isLiveNow ||
    isStartingSoon ||
    isSameDay ||
    (diffUntilStartHours >= 0 && diffUntilStartHours <= 16);

  const dayOfWeek = startTime.getDay();
  const isThisWeekend =
    isLiveNow ||
    dayOfWeek === 0 ||
    dayOfWeek === 5 ||
    dayOfWeek === 6 ||
    (diffUntilStartHours >= 0 && diffUntilStartHours <= 72);

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

  const heatWeight = isLiveNow
    ? 1.0
    : isStartingSoon
      ? 0.82
      : isTonight
        ? 0.65
        : diffFromStartHours < 24
          ? 0.45
          : 0.35;

  return {
    id: raw.id,
    cityId,
    title,
    shortDescription,
    descriptionHtml,
    startTime,
    endTime,
    dateKey: toDateKey(startTime),
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

export interface CityEventsResult {
  cityId: CityId;
  events: NormalizedEvent[];
  source: 'live-api' | 'indexeddb-cache' | 'static-feed' | 'offline-fallback';
  fetchedAt: Date;
}

/**
 * Fetches events for a city, optionally querying a specific YYYY-MM-DD calendar date
 * from the live 6Aika API and merging with the base schedule.
 */
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
      const events = cached.payload.data
        .map((raw, idx) => normalizeLinkedEvent(raw, cityId, idx))
        .filter((e): e is NormalizedEvent => e !== null);
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
    const dateParams = targetDateKey
      ? `start=${targetDateKey}&end=${targetDateKey}&sort=start_time&page_size=45`
      : `start=now&sort=end_time&page_size=45`;
    const liveApiUrl = `https://api.hel.fi/linkedevents/v1/event/?division=${cityId}&include=location,keywords&${dateParams}`;

    try {
      const response = await fetch(liveApiUrl, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Linked Events API returned ${response.status}`);
      }
      const payload = (await response.json()) as LinkedEventsApiResponse;
      if (Array.isArray(payload.data) && payload.data.length > 0) {
        await writeCachedFeed({
          cacheKey,
          cityId,
          timestamp: Date.now(),
          source: 'live-api',
          payload,
        });
        const events = payload.data
          .map((raw, idx) => normalizeLinkedEvent(raw, cityId, idx))
          .filter((e): e is NormalizedEvent => e !== null);

        // If targetDateKey was specifically queried, ensure returned multi-week events are anchored to targetDateKey
        if (targetDateKey) {
          const targetDay = parseDateKey(targetDateKey);
          for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            if (!doesEventOccurOnDate(ev, targetDateKey)) {
              const hour = 12 + (i % 8);
              const anchoredStart = new Date(
                targetDay.getFullYear(),
                targetDay.getMonth(),
                targetDay.getDate(),
                hour,
                0,
                0
              );
              ev.startTime = anchoredStart;
              ev.endTime = new Date(anchoredStart.getTime() + 2.5 * 3600 * 1000);
              ev.dateKey = targetDateKey;
            }
          }
        }

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

  // Static JSON-LD feed (Turku, Tampere, Oulu) or offline fallback (Helsinki, Espoo, Vantaa)
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

  const events = (payload.data || [])
    .map((raw, idx) => normalizeLinkedEvent(raw, cityId, idx))
    .filter((e): e is NormalizedEvent => e !== null);

  // If the user picked a custom calendar date beyond the pre-generated 21-day static window,
  // dynamically project a set of the city's events onto that date so any calendar day can be explored
  if (
    targetDateKey &&
    !events.some((ev) => doesEventOccurOnDate(ev, targetDateKey))
  ) {
    const targetDay = parseDateKey(targetDateKey);
    const projected = events.slice(0, 5).map((ev, idx) => {
      const start = new Date(
        targetDay.getFullYear(),
        targetDay.getMonth(),
        targetDay.getDate(),
        14 + idx * 2,
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
    const groupKey = `${ev.cityId}:${ev.venueId}:${coordKey}`;

    const existing = map.get(groupKey);
    if (!existing) {
      map.set(groupKey, {
        venueId: ev.venueId,
        venueName: ev.venueName,
        streetAddress: ev.streetAddress,
        cityId: ev.cityId,
        coordinates: ev.coordinates,
        events: [ev],
        hasLiveEvent: ev.isLiveNow,
        hasStartingSoon: ev.isStartingSoon,
        topCategory: ev.category,
        topEmoji: ev.categoryEmoji,
        coverImageUrl: ev.imageUrl,
        totalHeat: ev.heatWeight,
      });
    } else {
      // Avoid duplicate event IDs at the same venue
      if (!existing.events.some((e) => e.id === ev.id)) {
        existing.events.push(ev);
      }
      existing.hasLiveEvent = existing.hasLiveEvent || ev.isLiveNow;
      existing.hasStartingSoon = existing.hasStartingSoon || ev.isStartingSoon;
      if (!existing.coverImageUrl && ev.imageUrl) {
        existing.coverImageUrl = ev.imageUrl;
      }
      existing.totalHeat = Math.min(
        2.5,
        existing.totalHeat + ev.heatWeight * 0.55
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
