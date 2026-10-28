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
  addCalendarDays,
  hasUpcomingOrActiveOccurrence,
  isAllDayInterval,
  isEventOccurringTonight,
  isEventOnUpcomingWeekend,
  isLongSpanInterval,
  isValidDateKey,
  parseHelsinkiTimestamp,
  resolveEventOccurrence,
  toDateKey,
} from '../utils/calendarUtils';
import { calculateDistanceKm } from '../utils/distanceUtils';
import {
  buildLicenseAttribution,
  getSafeEventImageUrl,
  pickLocalizedText,
} from '../utils/licenseGuard';

const DB_NAME = 'tarra_linkedevents_cache_v5';
const STORE_NAME = 'city_feeds';
export const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const FETCH_TIMEOUT_MS = 6500;
const LIVE_HORIZON_DAYS = 21;
const MAX_LIVE_API_PAGES = 6;

export interface CachedFeedRecord {
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

/**
 * Determines whether an IndexedDB cache record can be served as fresh (`BUG-06`).
 * Records saved as `'offline-fallback'` are NEVER treated as fresh so reloads retry
 * the live API and keep the offline banner visible until live data succeeds.
 */
export function isCachedRecordFresh(
  record: Pick<CachedFeedRecord, 'source' | 'timestamp'>,
  nowMs = Date.now()
): boolean {
  if (record.source === 'offline-fallback') {
    return false;
  }
  return nowMs - record.timestamp <= CACHE_TTL_MS;
}

// In-memory normalized result cache per cacheKey (`PERF-03`)
const memoryResultCache = new Map<
  string,
  { timestamp: number; result: CityEventsResult }
>();

export function clearEventClientMemoryCache(): void {
  memoryResultCache.clear();
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
        const isFresh = isCachedRecordFresh(record);
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

/**
 * Fetches `url` with a distinct `TimeoutError` on timeout so caller cancellation
 * (`AbortError` from `externalSignal`) is never confused with a slow network (`BUG-05`).
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
  externalSignal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  let timedOut = false;
  const controller = new AbortController();
  const onExternalAbort = () => {
    controller.abort(
      externalSignal?.reason ?? new DOMException('Request aborted', 'AbortError')
    );
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort(
      new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError')
    );
  }, timeoutMs);

  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut && !externalSignal?.aborted) {
      throw new DOMException(
        `Request timed out after ${timeoutMs}ms`,
        'TimeoutError'
      );
    }
    throw err;
  } finally {
    globalThis.clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

function isCallerAbort(err: unknown, externalSignal?: AbortSignal): boolean {
  if (externalSignal?.aborted) return true;
  if (externalSignal) return false;
  return (err as { name?: string })?.name === 'AbortError';
}

// Finnish YSO ontology keyword mappings (`DATA-02`)
const YSO_CATEGORY_MAP: Record<string, Exclude<TopicCategory, 'all'>> = {
  // Music
  p1808: 'music', // musiikki
  p11185: 'music', // konsertit
  p20421: 'music', // musiikkiklubit
  p4484: 'music', // jazz
  p29932: 'music', // elävä musiikki
  p1882: 'music', // laulu
  p2841: 'music', // ooppera
  p10405: 'music', // popmusiikki
  p3067: 'music', // rock
  p13050: 'music', // klassinen musiikki
  p15520: 'music', // kuoromusiikki
  // Culture & Performing/Visual Arts (including dance = yso:p1278)
  p360: 'culture', // kulttuuritapahtumat
  p5121: 'culture', // näyttelyt
  p2625: 'culture', // teatteri
  p2850: 'culture', // esittävä taide
  p2739: 'culture', // kuvataide
  p4934: 'culture', // museot
  p2787: 'culture', // kirjastot
  p1278: 'culture', // tanssi
  p10218: 'culture', // nykytanssi
  p16327: 'culture', // elokuva
  p14004: 'culture', // keskustelutilaisuudet
  p15875: 'culture', // luennot
  p2149: 'culture', // opastus
  // Sports & Fitness
  p916: 'sports', // liikunta
  p965: 'sports', // urheilu
  p1963: 'sports', // liikuntatapahtumat
  p6409: 'sports', // jalkapallo
  p12687: 'sports', // jääkiekko
  p3927: 'sports', // jooga
  p8783: 'sports', // kuntoilu
  p26619: 'sports', // ryhmäliikunta
  // Family & Youth
  p4354: 'family', // lapset
  p11617: 'family', // nuoret
  p4363: 'family', // perheet
  p16485: 'family', // koululaiset
  p15937: 'family', // vauvat
  p20513: 'family', // lapsiperheet
  // Food & Markets
  p3670: 'food', // ruoka
  p2824: 'food', // markkinat
  p5529: 'food', // myyjäiset
  p9062: 'food', // kahvilat
  p10037: 'food', // ravintolat
  p6062: 'food', // ruokakulttuuri
  // Nature & Outdoors
  p13084: 'nature', // luonto
  p2771: 'nature', // ulkoilu
  p1103: 'nature', // retkeily
  p8109: 'nature', // puistot
  p25261: 'nature', // luontoretket
};

/**
 * Detects season passes, ticket bundles, and gift cards so non-events are skipped (`DATA-06`).
 */
export function isNonEventListingTitle(title: string): boolean {
  if (!title) return false;
  return /(?<!\p{L})(?:kausikortti|kausikortit|kotipassi|sarjakortti|lahjakortti|vuosikortti|season\s+ticket|season\s+pass)(?!\p{L})/iu.test(
    title
  );
}

/**
 * Classifies an event into one or more TopicCategories using upstream YSO keyword IDs first,
 * followed by Unicode-boundary-aware (`\p{L}`) Finnish/Swedish/English token matching (`DATA-02`).
 */
export function classifyTopics(
  raw: RawLinkedEvent
): Array<Exclude<TopicCategory, 'all'>> {
  const title = pickLocalizedText(raw.name, '').toLowerCase();
  const shortDesc = pickLocalizedText(raw.short_description, '').toLowerCase();
  const keywords = raw.keywords || [];
  const kwText = keywords
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

  // 1. Upstream YSO keyword IDs (`yso:pXXXX`)
  for (const kw of keywords) {
    const rawId = `${kw.id || ''} ${kw['@id'] || ''}`;
    const ysoMatches = rawId.matchAll(/yso:(p\d+)/gi);
    for (const m of ysoMatches) {
      const code = m[1].toLowerCase();
      const mapped = YSO_CATEGORY_MAP[code];
      if (mapped) {
        addCategory(mapped);
      }
    }
  }

  const isGuidedTourOrExhibition =
    /(?<!\p{L})(?:kierros|kierrokset|erikoiskierros|kummituskierros|kävelykierros|teatterikierros\p{L}*|opastus|opastettu|näyttelyopastu\p{L}*|guided\s+tour|true\s+crime|näyttely\p{L}*|exhibition\p{L}*|museo\p{L}*|museum\p{L}*|lukupiiri|kirjakerho|luento\p{L}*|lecture\p{L}*|kirppis\p{L}*|kirpputori\p{L}*|second\s*hand)(?!\p{L})/iu.test(
      fullHaystack
    );

  const isClassicalOrConcert =
    /(?<!\p{L})(?:barokk\p{L}*|barokin|baroque|sinfonia\p{L}*|symphon\p{L}*|orkesteri\p{L}*|orchestra|kamarimusiik\p{L}*|konsert\p{L}*|concert\p{L}*|resitaali\p{L}*|kuoro\p{L}*|choir|ooppera\p{L}*|opera)(?!\p{L})/iu.test(
      fullHaystack
    );

  if (isClassicalOrConcert) {
    addCategory('music');
  }

  if (isGuidedTourOrExhibition && !isClassicalOrConcert) {
    addCategory('culture');
  }

  // Music & Gigs — Unicode-aware boundaries; excludes "pop up" / "pop-up" / "popcorn" / "pop art" (`DATA-02`)
  if (
    /(?<!\p{L})(?:musiik\p{L}*|music|konsert\p{L}*|concert\p{L}*|gigs?|jazz\p{L}*|rock|popmusiik\p{L}*|suomipop|indiepop|synthpop|electropop|pop(?!\s*(?:[-–]\s*|\s+)(?:up|corn|art|taide))|sinfonia\p{L}*|symphon\p{L}*|choir|kuoro\p{L}*|keikka|keikat|synth\p{L}*|vinyl|opera|ooppera\p{L}*|karaoke\p{L}*|swing\p{L}*|barokk\p{L}*|barokin|baroque|blues|metal|punk|folk|live\s+music)(?!\p{L})/iu.test(
      fullHaystack
    ) &&
    !/miljoonakeikka/iu.test(title)
  ) {
    addCategory('music');
  }

  // Nightlife & Clubs
  if (
    /(?<!\p{L})(?:yöelämä\p{L}*|yökerho\p{L}*|clubbing|nightlife|dj|dj-ilta|bileet|afterglow|afterparty|rave|techno|disco|disko|klubi-ilta|club\s+night)(?!\p{L})/iu.test(
      fullHaystack
    ) &&
    !isClassicalOrConcert &&
    !/kirjakerho|lukupiiri|business\s+club/iu.test(title)
  ) {
    addCategory('nightlife');
  }

  // Food & Markets
  if (
    /(?<!\p{L})(?:ruoka\p{L}*|food|markets?|markkinat|myyjäiset|kahvila\p{L}*|cafe|wine|viini\p{L}*|panimo\p{L}*|street\s+food|glögi\p{L}*|tasting|ravintola\p{L}*|cooking|brunssi\p{L}*|brunch)(?!\p{L})/iu.test(
      fullHaystack
    )
  ) {
    addCategory('food');
  }

  // Fitness dance vs Performing dance (`DATA-02`)
  const isFitnessDance =
    /(?<!\p{L})(?:tanssiliikun\p{L}*|tanssijumppa\p{L}*|zumba\p{L}*|bailatino\p{L}*|lavistanssi\p{L}*)(?!\p{L})/iu.test(
      fullHaystack
    );
  const isPerformingDance =
    !isFitnessDance &&
    /(?<!\p{L})(?:tanssiesity\p{L}*|nykytanssi\p{L}*|tanssiteatteri\p{L}*|baletti\p{L}*|ballet|koreografi\p{L}*|tanssi\p{L}*|dance)(?!\p{L})/iu.test(
      fullHaystack
    );

  if (isPerformingDance) {
    addCategory('culture');
  }

  // Sports & Action
  if (
    (isFitnessDance ||
      /(?<!\p{L})(?:liikunta\p{L}*|urheilu\p{L}*|sports?|spectator\s+sports|competitions|fitness|kuntosali\p{L}*|gym|juoksu\p{L}*|jooga\p{L}*|yoga|hockey|jääkiekko\p{L}*|runkosarja|ilves|tappara|kärpät|kiipeily\p{L}*|boulder\p{L}*|basketball|koripallo\p{L}*|uinti\p{L}*|vesijumppa\p{L}*|tuoli-?jumppa\p{L}*|jumppa\p{L}*)(?!\p{L})/iu.test(
        fullHaystack
      )) &&
    !/business\s+club/iu.test(title)
  ) {
    addCategory('sports');
  }

  // Nature & Outdoors
  if (
    /(?<!\p{L})(?:luonto\p{L}*|nature|puisto\p{L}*|park|ulkoilu\p{L}*|outdoor|retki|retkeily\p{L}*|excursion|vaellus\p{L}*|aurora|revontul\p{L}*|rantareitti|saaristo\p{L}*|sadonkorjuu\p{L}*)(?!\p{L})/iu.test(
      fullHaystack
    ) &&
    !/teatterikierros|kummituskierros|true\s+crime/iu.test(text)
  ) {
    addCategory('nature');
  }

  // Family & Youth
  if (
    /(?<!\p{L})(?:perhe\p{L}*|family|kids\s+and\s+family|kids?|lapsille|lasten|lapset|children|nuorille|nuorten|youths?|taapero\p{L}*|vauva\p{L}*|leikkipuisto\p{L}*|muumi\p{L}*|moomin\p{L}*|satutunti\p{L}*|satutuokio\p{L}*|koululais\p{L}*|vanhempainilta)(?!\p{L})/iu.test(
      fullHaystack
    )
  ) {
    addCategory('family');
  }

  // Culture & Theatre explicit fallback
  if (
    /(?<!\p{L})(?:kulttuuri\p{L}*|culture|teatteri\p{L}*|theat(?:er|re)|visual\s+arts|kuvataide\p{L}*|performance|sirkus|circus|comedy|komedia\p{L}*|elokuva\p{L}*|film|kirjasto\p{L}*|library)(?!\p{L})/iu.test(
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
        /^(0\s*€|0,00\s*€|vapaa\s*pääsy|maksuton|ilmainen|free|free\s*entry)$/iu.test(
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
      const isLegacyLocalhubEvent =
        raw.data_source === 'turku' ||
        raw.data_source === 'tampere' ||
        raw.data_source === 'oulu';
      if (isLegacyLocalhubEvent && !rawPriceText) {
        if (hasPaidVendorLink) {
          hasExplicitPaid = true;
        }
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

const KNOWN_LINKED_EVENTS_HOSTS = new Set([
  'epkalenteri.linkedevents.fi',
  'keskisuomievents.fi',
  'satakuntaevents.fi',
  'api.hel.fi',
]);

/**
 * Upgrades HTTP pagination or resource URLs to HTTPS for known Linked Events hosts
 * and verifies the host before following (EP Kalenteri implementation requirement).
 */
export function upgradeKnownLinkedEventsUrl(
  rawUrl: string | null | undefined
): string | null {
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

/**
 * Decodes common HTML entities in event titles and double-encoded descriptions.
 */
export function decodeHtmlEntities(input: string): string {
  if (!input || !input.includes('&')) return input;
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

/**
 * Validates venue coordinates against Finland's geographic bounding box
 * (lon 18.0..32.5, lat 59.0..70.5) and corrects swapped [lat, lon] pairs.
 */
export function validateAndNormalizeFinlandCoordinates(
  rawCoords: unknown
): {
  coordinates: [number, number] | null;
  swapped: boolean;
} {
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
  const isNormalFinland =
    first >= 18.0 && first <= 32.5 && second >= 59.0 && second <= 70.5;
  if (isNormalFinland) {
    return { coordinates: [first, second], swapped: false };
  }

  const isSwappedFinland =
    first >= 59.0 && first <= 70.5 && second >= 18.0 && second <= 32.5;
  if (isSwappedFinland) {
    return { coordinates: [second, first], swapped: true };
  }

  return { coordinates: null, swapped: false };
}

/**
 * Detects online/virtual events with Unicode-aware boundaries (`DATA-02`),
 * avoiding false matches on bare English words like "teams" or "stream" in titles.
 */
export function detectIsOnlineEvent(raw: RawLinkedEvent): boolean {
  if (raw.is_virtualevent || raw.virtualevent_url) return true;
  const locId = (raw.location?.id || '').toLowerCase();
  if (locId.includes('internet') || locId.includes('virtual')) return true;

  const rawLocName = pickLocalizedText(raw.location?.name, '').trim();
  const rawStreet = pickLocalizedText(raw.location?.street_address, '').trim();
  const rawExtra = pickLocalizedText(raw.location_extra_info, '').trim();
  const title = pickLocalizedText(raw.name, '').trim();

  const locationContext = `${rawLocName} ${rawStreet} ${rawExtra}`;
  const fullContext = `${locationContext} ${title}`;

  if (
    /^(?:microsoft\s+teams|teams|zoom|discord|google\s+meet|youtube(?:\s+live)?|verkossa|online|etänä)$/iu.test(
      rawLocName
    )
  ) {
    return true;
  }

  if (
    /(?<!\p{L})(?:verkossa|verkkotapahtuma\p{L}*|verkkoluento\p{L}*|online|etänä|etätapahtuma\p{L}*|etäyhtey\p{L}*|webinaari\p{L}*|webinar\p{L}*|livestream\p{L}*|live-stream\p{L}*|striimi\p{L}*|suoratoisto\p{L}*|microsoft\s+teams|teams-(?:kokou\p{L}*|tapahtuma\p{L}*|luento\p{L}*|webinaari\p{L}*|linjoil\p{L}*|link\p{L}*)|teamsissa|teamsin\s+kautta|zoom-(?:kokou\p{L}*|luento\p{L}*|tapahtuma\p{L}*|webinaari\p{L}*)|zoomissa)(?!\p{L})/iu.test(
      fullContext
    )
  ) {
    return true;
  }

  return false;
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
  const rawLocName = pickLocalizedText(raw.location?.name, '');
  const rawStreet = pickLocalizedText(raw.location?.street_address, '');
  const locId = raw.location?.id || '';
  const isOnline = detectIsOnlineEvent(raw);

  const { coordinates: validCoords } = validateAndNormalizeFinlandCoordinates(
    raw.location?.position?.coordinates
  );
  if (!validCoords) {
    return { coordinates: null, hasExactCoordinates: false, isOnline };
  }

  const [lon, lat] = validCoords;
  const cityNameLower = CITIES[cityId].name.toLowerCase();

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
 * Recomputes temporal flags (`isLiveNow`, `isOngoingLongSpan`, `isStartingSoon`, `isTonight`,
 * `isThisWeekend`, `heatWeight`) and representative `startTime`/`endTime`/`dateKey` against `now`
 * and optional `selectedDate` (`DATA-03`, `BUG-07`).
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

  // Only timed events <= 24h (non-all-day) get the pulsing LIVE badge (`DATA-03`)
  const isLiveNow = occurrences.some(
    (o) =>
      !isLongSpanInterval(o.start, o.end) &&
      !isAllDayInterval(o.start, o.end, event.raw?.all_day) &&
      nowMs >= o.start.getTime() &&
      nowMs <= o.end.getTime()
  );

  const isOngoingLongSpan =
    !isLiveNow &&
    occurrences.some(
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
        : isOngoingLongSpan
          ? 0.45
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
    isOngoingLongSpan,
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
  if (!raw || !raw.id || raw.deleted === true) return null;

  const baseTitle = decodeHtmlEntities(
    pickLocalizedText(raw.name, 'Untitled Event')
  );
  // Skip season tickets / gift cards / passes (`DATA-06`)
  if (isNonEventListingTitle(baseTitle)) {
    return null;
  }

  const { coordinates, hasExactCoordinates, isOnline } =
    extractGenuineCoordinates(raw, cityId);

  const externalLinkUrl =
    (Array.isArray(raw.external_links)
      ? raw.external_links
          .map((l) => (typeof l?.link === 'string' ? l.link.trim() : ''))
          .find((url) => /^https?:\/\//i.test(url))
      : '') ||
    pickLocalizedText(raw.provider_link, '') ||
    (typeof raw.virtualevent_url === 'string' &&
    /^https?:\/\//i.test(raw.virtualevent_url.trim())
      ? raw.virtualevent_url.trim()
      : '');

  const defaultInfoUrl =
    pickLocalizedText(raw.info_url, '') ||
    pickLocalizedText(raw.offers?.[0]?.info_url, '') ||
    externalLinkUrl ||
    pickLocalizedText(raw.location?.info_url, '') ||
    null;

  const occurrenceDates: NormalizedOccurrence[] = [];

  if (Array.isArray(raw.occurrence_dates) && raw.occurrence_dates.length > 0) {
    for (const occ of raw.occurrence_dates) {
      if (!occ?.start) continue;
      const trimmedOccStart = occ.start.trim();
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmedOccStart);
      const s = parseHelsinkiTimestamp(trimmedOccStart, 'start');
      if (!s) continue;

      const trimmedOccEnd = occ.end?.trim() || '';
      const isEndDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmedOccEnd);
      const parsedEnd = trimmedOccEnd
        ? parseHelsinkiTimestamp(trimmedOccEnd, 'end')
        : null;

      let e: Date;
      if (parsedEnd && parsedEnd >= s) {
        if (
          parsedEnd.getTime() === s.getTime() &&
          (raw.all_day || isDateOnly || isEndDateOnly)
        ) {
          e =
            parseHelsinkiTimestamp(toDateKey(s), 'end') ||
            new Date(s.getTime() + 24 * 3600 * 1000 - 1000);
        } else {
          e = parsedEnd;
        }
      } else if (raw.all_day || isDateOnly) {
        e =
          parseHelsinkiTimestamp(toDateKey(s), 'end') ||
          new Date(s.getTime() + 24 * 3600 * 1000 - 1000);
      } else {
        e = new Date(s.getTime() + 2 * 3600 * 1000);
      }

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
      occurrenceDates[occurrenceDates.length - 1];
    startTime = upcoming.start;
    endTime = upcoming.end;
  } else if (raw.start_time) {
    const trimmedStart = raw.start_time.trim();
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmedStart);
    const parsedStart = parseHelsinkiTimestamp(trimmedStart, 'start');
    if (!parsedStart) {
      return null;
    }
    startTime = parsedStart;

    const trimmedEnd = raw.end_time?.trim() || '';
    const isEndDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmedEnd);
    const parsedEnd = trimmedEnd
      ? parseHelsinkiTimestamp(trimmedEnd, 'end')
      : null;

    if (parsedEnd && parsedEnd >= startTime) {
      if (
        parsedEnd.getTime() === startTime.getTime() &&
        (raw.all_day || isDateOnly || isEndDateOnly)
      ) {
        endTime =
          parseHelsinkiTimestamp(toDateKey(startTime), 'end') ||
          new Date(startTime.getTime() + 24 * 3600 * 1000 - 1000);
      } else {
        endTime = parsedEnd;
      }
    } else if (raw.all_day || isDateOnly) {
      endTime =
        parseHelsinkiTimestamp(toDateKey(startTime), 'end') ||
        new Date(startTime.getTime() + 24 * 3600 * 1000 - 1000);
    } else {
      endTime = new Date(startTime.getTime() + 2 * 3600 * 1000);
    }

    occurrenceDates.push({
      start: startTime,
      end: endTime,
      dateKey: toDateKey(startTime),
      infoUrl: defaultInfoUrl,
      sourceEventId: raw.id,
    });
  } else {
    return null;
  }

  const categories = classifyTopics(raw);
  const category = categories[0];
  const topicMeta = TOPICS.find((t) => t.id === category) || TOPICS[0];

  const isCancelled = raw.event_status === 'EventCancelled';
  const title =
    isCancelled &&
    !/(?<!\p{L})(?:peruutettu|peruttu|cancelled|canceled|inställt)(?!\p{L})/iu.test(
      baseTitle
    )
      ? `[Cancelled] ${baseTitle}`
      : baseTitle;

  const shortDescription = decodeHtmlEntities(
    pickLocalizedText(
      raw.short_description,
      'Open flyer for event details and schedule.'
    )
  );
  const rawDesc = pickLocalizedText(raw.description, '');
  const descriptionHtml = rawDesc
    ? decodeHtmlEntities(rawDesc)
    : `<p>${shortDescription}</p>`;

  const rawVenueName = decodeHtmlEntities(
    pickLocalizedText(raw.location?.name, '')
  );
  const rawExtraVenue = decodeHtmlEntities(
    pickLocalizedText(raw.location_extra_info, '')
  );
  const rawStreetAddress = decodeHtmlEntities(
    pickLocalizedText(raw.location?.street_address, '')
  );
  const cityNameLower = CITIES[cityId].name.toLowerCase();

  const preferredVenueName =
    rawVenueName && rawVenueName.trim().toLowerCase() !== cityNameLower
      ? rawVenueName
      : rawExtraVenue || rawVenueName;

  const venueName =
    preferredVenueName ||
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
  const imageAlt = decodeHtmlEntities(
    pickLocalizedText(primaryImage?.alt_text, title)
  );
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
    isOngoingLongSpan: false,
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
 * or share the same venue and title.
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

const MAX_SHORT_COVERAGE_SPAN_MS = 35 * 24 * 3600 * 1000;

/**
 * Computes honest calendar coverage bounds `[coverageStart, coverageEnd]` (`BUG-02`, `BUG-03`):
 * - Uses explicit `metaCoverageStart` / `metaCoverageEnd` when recorded by sync/live horizon.
 * - Clamps default start to `>= todayKey` (unless a past `targetDateKey` was explicitly fetched)
 *   so multi-year exhibitions that opened in 2024 never report `"Coverage: 2024-..."`.
 * - Prevents lone multi-year exhibitions (`2029-12-31`) from claiming distant un-fetched years
 *   are covered when timed events end much earlier.
 */
export function computeCoverageBounds(
  events: NormalizedEvent[],
  options?: {
    now?: Date;
    targetDateKey?: string | null;
    metaCoverageStart?: string | null;
    metaCoverageEnd?: string | null;
  }
): {
  coverageStart: string | null;
  coverageEnd: string | null;
} {
  const now = options?.now ?? new Date();
  const nowMs = now.getTime();
  const todayKey = toDateKey(now);
  const targetDateKey =
    options?.targetDateKey && isValidDateKey(options.targetDateKey)
      ? options.targetDateKey
      : null;

  let minMs = Infinity;
  let maxTimedMs = -Infinity;
  let maxAnyMs = -Infinity;

  for (const ev of events) {
    for (const occ of ev.occurrenceDates) {
      const s = occ.start.getTime();
      const e = occ.end.getTime();
      if (Number.isNaN(s) || Number.isNaN(e)) continue;
      if (!targetDateKey && e < nowMs) continue;

      const effectiveStartMs = !targetDateKey ? Math.max(s, nowMs) : s;
      if (effectiveStartMs < minMs) minMs = effectiveStartMs;
      if (e > maxAnyMs) maxAnyMs = e;

      if (s > maxTimedMs) maxTimedMs = s;
      if (e - s <= MAX_SHORT_COVERAGE_SPAN_MS && e > maxTimedMs) {
        maxTimedMs = e;
      }
    }
  }

  let coverageStart =
    options?.metaCoverageStart && isValidDateKey(options.metaCoverageStart)
      ? options.metaCoverageStart
      : Number.isFinite(minMs)
        ? toDateKey(new Date(minMs))
        : null;

  if (coverageStart && !targetDateKey && coverageStart < todayKey) {
    coverageStart = todayKey;
  }

  let coverageEnd =
    options?.metaCoverageEnd && isValidDateKey(options.metaCoverageEnd)
      ? options.metaCoverageEnd
      : Number.isFinite(maxTimedMs)
        ? toDateKey(new Date(maxTimedMs))
        : Number.isFinite(maxAnyMs)
          ? toDateKey(new Date(maxAnyMs))
          : null;

  if (targetDateKey) {
    if (!coverageStart || targetDateKey < coverageStart) {
      coverageStart = targetDateKey;
    }
    if (!coverageEnd || targetDateKey > coverageEnd) {
      coverageEnd = targetDateKey;
    }
  }

  return { coverageStart, coverageEnd };
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

export interface FetchCityEventsOptions {
  onSnapshot?: (snapshot: CityEventsResult) => void;
}

function buildResultFromPayload(
  cityId: CityId,
  payload: LinkedEventsApiResponse,
  source: CityEventsResult['source'],
  fetchedAt: Date,
  isStale: boolean,
  targetDateKey: string | null = null
): CityEventsResult {
  const now = new Date();
  const normalized = (payload.data || [])
    .map((raw, idx) => normalizeLinkedEvent(raw, cityId, idx, undefined, now))
    .filter((e): e is NormalizedEvent => e !== null);
  const consolidated = consolidateRecurringEvents(normalized, now);
  // Drop events whose occurrences have all ended unless a specific date was requested (`BUG-02`)
  const events = targetDateKey
    ? consolidated
    : consolidated.filter((ev) => hasUpcomingOrActiveOccurrence(ev, now));

  const { coverageStart, coverageEnd } = computeCoverageBounds(events, {
    now,
    targetDateKey,
    metaCoverageStart: payload.meta?.coverage_start ?? null,
    metaCoverageEnd: payload.meta?.coverage_end ?? null,
  });

  return {
    cityId,
    events,
    source,
    fetchedAt,
    generatedAt: payload.meta?.generated_at || null,
    totalUpstream:
      typeof payload.meta?.total_upstream === 'number'
        ? payload.meta.total_upstream
        : typeof payload.meta?.capped_from === 'number'
          ? payload.meta.capped_from
          : typeof payload.meta?.count === 'number'
            ? payload.meta.count
            : null,
    isStale,
    coverageStart,
    coverageEnd,
  };
}

/**
 * Fetches live 6Aika pages for a Capital Region city across an explicit upcoming horizon
 * (`sort=start_time` + `end`), following `meta.next` up to `MAX_LIVE_API_PAGES` (`BUG-03`).
 */
async function fetchCapitalLivePages(
  cityId: CityId,
  targetDateKey: string | null,
  horizonEndKey: string,
  signal?: AbortSignal
): Promise<{
  items: RawLinkedEvent[];
  upstreamCount: number | undefined;
  anyFulfilled: boolean;
}> {
  const dateQuery = targetDateKey
    ? `start=${targetDateKey}&end=${targetDateKey}&sort=start_time&page_size=100`
    : `start=now&end=${horizonEndKey}&sort=start_time&page_size=100`;

  const baseEndpoint = `https://api.hel.fi/linkedevents/v1/event/?division=${cityId}&include=location,keywords&${dateQuery}`;
  const items: RawLinkedEvent[] = [];
  const seenIds = new Set<string>();
  let upstreamCount: number | undefined;
  let anyFulfilled = false;

  // Batch 1: pages 1..3 in parallel for low latency (page 1 alone for single custom date)
  const initialPages = targetDateKey ? [1] : [1, 2, 3];
  const batch1 = await Promise.allSettled(
    initialPages.map((p) =>
      fetchWithTimeout(
        `${baseEndpoint}&page=${p}`,
        { headers: { Accept: 'application/json' } },
        FETCH_TIMEOUT_MS,
        signal
      )
    )
  );

  if (signal?.aborted) {
    throw new DOMException('Request aborted', 'AbortError');
  }

  let nextUrl: string | null = null;
  for (let i = 0; i < batch1.length; i++) {
    const settled = batch1[i];
    if (settled.status === 'fulfilled' && settled.value.ok) {
      anyFulfilled = true;
      const json = (await settled.value.json()) as LinkedEventsApiResponse;
      if (
        typeof json.meta?.count === 'number' &&
        upstreamCount === undefined
      ) {
        upstreamCount = json.meta.count;
      }
      if (Array.isArray(json.data)) {
        for (const raw of json.data) {
          if (raw?.id && !seenIds.has(raw.id)) {
            seenIds.add(raw.id);
            items.push(raw);
          }
        }
      }
      if (i === batch1.length - 1) {
        nextUrl = upgradeKnownLinkedEventsUrl(json.meta?.next);
      }
    }
  }

  // Follow meta.next up to MAX_LIVE_API_PAGES when more pages exist
  let pagesFetched = initialPages.length;
  while (nextUrl && pagesFetched < MAX_LIVE_API_PAGES) {
    if (signal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError');
    }
    const res = await fetchWithTimeout(
      nextUrl,
      { headers: { Accept: 'application/json' } },
      FETCH_TIMEOUT_MS,
      signal
    );
    pagesFetched++;
    if (!res.ok) break;
    anyFulfilled = true;
    const json = (await res.json()) as LinkedEventsApiResponse;
    if (Array.isArray(json.data)) {
      for (const raw of json.data) {
        if (raw?.id && !seenIds.has(raw.id)) {
          seenIds.add(raw.id);
          items.push(raw);
        }
      }
    }
    nextUrl = upgradeKnownLinkedEventsUrl(json.meta?.next);
  }

  return { items, upstreamCount, anyFulfilled };
}

export async function fetchCityEvents(
  cityId: CityId,
  forceRefresh = false,
  targetDateKey: string | null = null,
  signal?: AbortSignal,
  options?: FetchCityEventsOptions
): Promise<CityEventsResult> {
  const cityConfig = CITIES[cityId];
  const cacheKey =
    cityConfig.dataMechanism === 'live-api' && targetDateKey
      ? `${cityId}:${targetDateKey}`
      : cityId;

  // 1. Fast in-memory normalized result cache (`PERF-03`)
  if (!forceRefresh) {
    const memHit = memoryResultCache.get(cacheKey);
    if (memHit && Date.now() - memHit.timestamp <= CACHE_TTL_MS) {
      const now = new Date();
      const refreshedEvents = memHit.result.events
        .map((ev) => refreshEventTemporalState(ev, now, targetDateKey))
        .filter(
          (ev) => Boolean(targetDateKey) || hasUpcomingOrActiveOccurrence(ev, now)
        );
      return {
        ...memHit.result,
        events: refreshedEvents,
      };
    }
  }

  const cachedLookup = await readCachedFeed(cacheKey);

  // 2. IndexedDB cache hit — `isFresh` is false for `'offline-fallback'` (`BUG-06`)
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
      false,
      targetDateKey
    );
    if (result.events.length > 0 || targetDateKey) {
      memoryResultCache.set(cacheKey, {
        timestamp: cachedLookup.record.timestamp,
        result,
      });
      return result;
    }
  }

  const baseUrl =
    typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? import.meta.env.BASE_URL
      : '/';
  const staticFeedUrl = `${baseUrl}feeds/${cityId}.json`;

  if (cityConfig.dataMechanism === 'live-api') {
    let bundledSnapshotPayload: LinkedEventsApiResponse | null = null;

    // Stale-while-revalidate (`PERF-08`): serve bundled snapshot (or stale cache) immediately
    // while live `api.hel.fi` requests are in flight.
    const snapshotPromise = !targetDateKey
      ? fetchWithTimeout(
          staticFeedUrl,
          { headers: { Accept: 'application/json' } },
          FETCH_TIMEOUT_MS,
          signal
        )
          .then(async (res) => {
            if (!res.ok) return null;
            const json = (await res.json()) as LinkedEventsApiResponse;
            bundledSnapshotPayload = json;
            if (options?.onSnapshot && !signal?.aborted) {
              const snapResult = buildResultFromPayload(
                cityId,
                json,
                'static-feed',
                new Date(),
                false,
                null
              );
              if (snapResult.events.length > 0) {
                options.onSnapshot(snapResult);
              }
            }
            return json;
          })
          .catch(() => null)
      : Promise.resolve(null);

    try {
      const todayKey = toDateKey(new Date());
      const horizonEndKey = addCalendarDays(todayKey, LIVE_HORIZON_DAYS);

      const [liveOutcome, staticPayload] = await Promise.all([
        fetchCapitalLivePages(cityId, targetDateKey, horizonEndKey, signal),
        snapshotPromise,
      ]);

      if (signal?.aborted) {
        throw new DOMException('Request aborted', 'AbortError');
      }

      if (liveOutcome.anyFulfilled) {
        const combinedRaw: RawLinkedEvent[] = [];
        const seenIds = new Set<string>();

        for (const item of liveOutcome.items) {
          if (item?.id && !seenIds.has(item.id)) {
            seenIds.add(item.id);
            combinedRaw.push(item);
          }
        }

        // Merge multi-week synced snapshot items when not querying a custom date (`BUG-03`)
        if (!targetDateKey && Array.isArray(staticPayload?.data)) {
          for (const item of staticPayload.data) {
            if (item?.id && !seenIds.has(item.id)) {
              seenIds.add(item.id);
              combinedRaw.push(item);
            }
          }
        }

        const snapshotCovEnd = !targetDateKey
          ? staticPayload?.meta?.coverage_end
          : null;
        const effectiveCovEnd = targetDateKey
          ? targetDateKey
          : snapshotCovEnd && snapshotCovEnd > horizonEndKey
            ? snapshotCovEnd
            : horizonEndKey;

        const payload: LinkedEventsApiResponse = {
          meta: {
            count: combinedRaw.length,
            total_upstream: liveOutcome.upstreamCount ?? combinedRaw.length,
            coverage_start: targetDateKey || todayKey,
            coverage_end: effectiveCovEnd,
            next: null,
            previous: null,
            generated_at: new Date().toISOString(),
          },
          data: combinedRaw,
        };

        const ts = Date.now();
        await writeCachedFeed({
          cacheKey,
          cityId,
          timestamp: ts,
          source: 'live-api',
          payload,
        });

        const built = buildResultFromPayload(
          cityId,
          payload,
          'live-api',
          new Date(ts),
          false,
          targetDateKey
        );
        memoryResultCache.set(cacheKey, { timestamp: ts, result: built });
        return built;
      }
    } catch (err) {
      if (isCallerAbort(err, signal)) throw err;
      console.warn(
        `[linkedEventsClient] Live API fetch failed for ${cityId}, falling back:`,
        err
      );
    }

    // Reuse already-downloaded bundled snapshot if live API failed
    if (bundledSnapshotPayload && Array.isArray(bundledSnapshotPayload.data)) {
      await writeCachedFeed({
        cacheKey: cityId,
        cityId,
        timestamp: Date.now(),
        source: 'offline-fallback',
        payload: bundledSnapshotPayload,
      });
      return buildResultFromPayload(
        cityId,
        bundledSnapshotPayload,
        'offline-fallback',
        new Date(),
        true,
        targetDateKey
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
    const isOfflineFallback = cityConfig.dataMechanism === 'live-api';
    const ts = Date.now();
    await writeCachedFeed({
      cacheKey: cityId,
      cityId,
      timestamp: ts,
      source: isOfflineFallback ? 'offline-fallback' : 'static-feed',
      payload,
    });

    const built = buildResultFromPayload(
      cityId,
      payload,
      isOfflineFallback ? 'offline-fallback' : 'static-feed',
      new Date(ts),
      isOfflineFallback,
      targetDateKey
    );
    if (!isOfflineFallback) {
      memoryResultCache.set(cacheKey, { timestamp: ts, result: built });
    }
    return built;
  } catch (err) {
    if (isCallerAbort(err, signal)) throw err;

    // Serve stale IndexedDB cached records when offline or network times out (`BUG-05`, `BUG-06`)
    const staleLookup =
      cachedLookup || (targetDateKey ? await readCachedFeed(cityId) : null);
    if (staleLookup && Array.isArray(staleLookup.record.payload?.data)) {
      return buildResultFromPayload(
        cityId,
        staleLookup.record.payload,
        'offline-fallback',
        new Date(staleLookup.record.timestamp),
        true,
        targetDateKey
      );
    }
    throw err;
  }
}

/**
 * Groups events into VenueStoryGroups for map markers and flyer stories.
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

    const coords: [number, number] =
      ev.coordinates || CITIES[ev.cityId].coordinates;
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
