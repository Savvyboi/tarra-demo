import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  Suspense,
} from 'react';
import {
  LocateFixed,
  RefreshCw,
  Search,
  Share2,
  Check,
  Calendar as CalendarIcon,
  Bookmark,
  Ticket,
  X,
  Map as MapIcon,
  LayoutList,
  ListOrdered,
  ChevronDown,
  SlidersHorizontal,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import {
  CITIES,
  CITY_LIST,
  CITY_REGION_GROUPS,
  SOURCE_REGISTRY,
  TOPICS,
} from './config/cities';
import {
  CityId,
  ListSortMode,
  MapStyleId,
  NormalizedEvent,
  TimeFilter,
  TopicCategory,
  VenueStoryGroup,
  ViewMode,
} from './types/linkedEvents';
import {
  CityEventsResult,
  computeCoverageBounds,
  fetchCityEvents,
  groupEventsByVenue,
   refreshEventTemporalState,
} from './services/linkedEventsClient';
import {
  doesEventOccurOnDate,
  FINLAND_TIMEZONE,
  hasUpcomingOrActiveOccurrence,
  isValidDateKey,
  parseDateKey,
  resolveEventForDate,
} from './utils/calendarUtils';
import { calculateDistanceKm } from './utils/distanceUtils';
import { getCitySourceAttribution } from './utils/licenseGuard';
import { StoryPlayerModal } from './components/Story/StoryPlayerModal';
import { EventCalendarModal } from './components/Calendar/EventCalendarModal';
import { DayAgendaDrawer } from './components/Agenda/DayAgendaDrawer';
import {
  EventListView,
  sortEventsForList,
} from './components/List/EventListView';

const SnapMap = React.lazy(() => import('./components/Map/SnapMap'));

const SAVED_EVENTS_STORAGE_KEY = 'tarra_saved_event_ids_v1';
const LEGACY_SAVED_EVENTS_KEY = 'snapevents_saved_event_ids_v1';
const SAVED_EVENTS_SNAPSHOT_KEY = 'tarra_saved_events_snapshot_v1';

interface SerializedNormalizedEvent
  extends Omit<
    NormalizedEvent,
    'startTime' | 'endTime' | 'occurrenceDates'
  > {
  startTime: string;
  endTime: string;
  occurrenceDates: Array<{
    start: string;
    end: string;
    dateKey: string;
    infoUrl?: string | null;
    sourceEventId?: string;
  }>;
}

// Hoisted formatter for selected date badge in Europe/Helsinki (`BUG-07`, `PERF-02`)
const selectedDateChipFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINLAND_TIMEZONE,
  day: 'numeric',
  month: 'short',
});

function serializeSavedEventsMap(
  cache: Record<string, NormalizedEvent>,
  savedIds: string[]
): string {
  const subset: Record<string, SerializedNormalizedEvent> = {};
  for (const id of savedIds) {
    const ev = cache[id];
    if (!ev) continue;
    subset[id] = {
      ...ev,
      startTime: ev.startTime.toISOString(),
      endTime: ev.endTime.toISOString(),
      occurrenceDates: ev.occurrenceDates.map((occ) => ({
        start: occ.start.toISOString(),
        end: occ.end.toISOString(),
        dateKey: occ.dateKey,
        infoUrl: occ.infoUrl ?? null,
        sourceEventId: occ.sourceEventId,
      })),
    };
  }
  return JSON.stringify(subset);
}

function loadSavedEventsSnapshot(): Record<string, NormalizedEvent> {
  try {
    const raw = localStorage.getItem(SAVED_EVENTS_SNAPSHOT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<
      string,
      SerializedNormalizedEvent
    >;
    const hydrated: Record<string, NormalizedEvent> = {};
    for (const [id, item] of Object.entries(parsed)) {
      if (!item || !item.id || !item.startTime) continue;
      const startTime = new Date(item.startTime);
      const endTime = new Date(item.endTime || item.startTime);
      if (Number.isNaN(startTime.getTime())) continue;
      const ev: NormalizedEvent = {
        ...item,
        aliasIds: Array.isArray(item.aliasIds) ? item.aliasIds : [item.id],
        categories: Array.isArray(item.categories)
          ? item.categories
          : item.category
            ? [item.category]
            : ['culture'],
        priceStatus:
          item.priceStatus || (item.isFree ? 'free' : 'unknown'),
        hasExactCoordinates: Boolean(
          item.hasExactCoordinates ?? item.coordinates
        ),
        isOnline: Boolean(item.isOnline),
        startTime,
        endTime: Number.isNaN(endTime.getTime()) ? startTime : endTime,
        occurrenceDates: Array.isArray(item.occurrenceDates)
          ? item.occurrenceDates
              .map((occ) => ({
                start: new Date(occ.start),
                end: new Date(occ.end || occ.start),
                dateKey: occ.dateKey,
                infoUrl: occ.infoUrl ?? null,
                sourceEventId: occ.sourceEventId,
              }))
              .filter((occ) => !Number.isNaN(occ.start.getTime()))
          : [
              {
                start: startTime,
                end: Number.isNaN(endTime.getTime()) ? startTime : endTime,
                dateKey: '',
              },
            ],
      };
      hydrated[id] = ev;
      hydrated[ev.id] = ev;
      for (const aliasId of ev.aliasIds) {
        hydrated[aliasId] = ev;
      }
    }
    return hydrated;
  } catch {
    return {};
  }
}

/**
 * Maps saved event IDs (`turku:...`, `hel:...`, `ks:...`, `se:...`, `ep:...`) to only the
 * matching city feeds instead of fetching all 28 cities sequentially (`PERF-07`).
 */
function getCandidateCitiesForSavedIds(
  ids: string[],
  activeCity: CityId
): CityId[] {
  const candidates = new Set<CityId>();
  let hasUnknownPrefix = false;

  for (const id of ids) {
    const prefix = id.split(':')[0]?.trim().toLowerCase() || '';
    if (Object.hasOwn(CITIES, prefix)) {
      candidates.add(prefix as CityId);
    } else if (
      prefix === 'hel' ||
      prefix === 'kulke' ||
      prefix === 'helmet' ||
      prefix === 'varaamo'
    ) {
      for (const c of SOURCE_REGISTRY.hel_linkedevents.cities) {
        candidates.add(c);
      }
    } else if (prefix === 'espoo_le') {
      candidates.add('espoo');
    } else if (prefix === 'vantaa_le') {
      candidates.add('vantaa');
    } else if (prefix === 'ks') {
      for (const c of SOURCE_REGISTRY.keskisuomi_linkedevents.cities) {
        candidates.add(c);
      }
    } else if (prefix === 'se' || prefix === 'sk') {
      for (const c of SOURCE_REGISTRY.satakunta_linkedevents.cities) {
        candidates.add(c);
      }
    } else if (prefix === 'ep') {
      for (const c of SOURCE_REGISTRY.ep_linkedevents.cities) {
        candidates.add(c);
      }
    } else {
      hasUnknownPrefix = true;
    }
  }

  if (hasUnknownPrefix && candidates.size === 0) {
    candidates.add(activeCity);
  }

  return Array.from(candidates);
}

function normalizeSearchToken(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('fi-FI')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export interface ParsedUrlState {
  city: CityId;
  view: ViewMode;
  time: TimeFilter;
  date: string | null;
  topic: TopicCategory;
  freeOnly: boolean;
  eventId: string | null;
  q: string;
  sort: ListSortMode;
  style: MapStyleId;
}

export function parseUrlParams(search = window.location.search): ParsedUrlState {
  const params = new URLSearchParams(search);
  const rawCity = (params.get('city') || 'turku').trim().toLowerCase();
  const city: CityId = Object.hasOwn(CITIES, rawCity)
    ? (rawCity as CityId)
    : 'turku';

  const rawView = (params.get('view') || 'map').trim().toLowerCase();
  const view: ViewMode = rawView === 'list' ? 'list' : 'map';

  const dateParam = params.get('date')?.trim() || null;
  const validDate = isValidDateKey(dateParam) ? dateParam : null;

  const rawTime = (params.get('time') || 'all').trim().toLowerCase() as TimeFilter;
  const validTimes: TimeFilter[] = [
    'all',
    'live',
    'tonight',
    'weekend',
    'custom-date',
  ];
  const time: TimeFilter = validDate
    ? 'custom-date'
    : validTimes.includes(rawTime) && rawTime !== 'custom-date'
      ? rawTime
      : 'all';

  const rawTopic = (params.get('topic') || 'all')
    .trim()
    .toLowerCase() as TopicCategory;
  const validTopics = TOPICS.map((t) => t.id);
  const topic: TopicCategory = validTopics.includes(rawTopic)
    ? rawTopic
    : 'all';

  const freeOnly = params.get('free') === '1';
  const eventId = params.get('event')?.trim() || null;
  const q = params.get('q') || '';

  const rawSort = (params.get('sort') || 'distance').trim().toLowerCase();
  const sort: ListSortMode =
    rawSort === 'time' || rawSort === 'live' || rawSort === 'distance'
      ? rawSort
      : 'distance';

  const rawStyle = (params.get('style') || 'neon').trim().toLowerCase();
  const style: MapStyleId =
    rawStyle === 'midnight' || rawStyle === 'daylight' || rawStyle === 'neon'
      ? rawStyle
      : 'neon';

  return {
    city,
    view,
    time,
    date: validDate,
    topic,
    freeOnly,
    eventId,
    q,
    sort,
    style,
  };
}

interface MapErrorBoundaryProps {
  onSwitchToList: () => void;
  onError?: (message: string) => void;
  children: React.ReactNode;
}

interface MapErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

class MapErrorBoundary extends React.Component<
  MapErrorBoundaryProps,
  MapErrorBoundaryState
> {
  constructor(props: MapErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: unknown): MapErrorBoundaryState {
    return {
      hasError: true,
      errorMessage:
        error instanceof Error
          ? error.message
          : 'The interactive map encountered a rendering error.',
    };
  }

  componentDidCatch(error: unknown) {
    const msg =
      error instanceof Error
        ? error.message
        : 'The interactive map encountered a rendering error.';
    this.props.onError?.(msg);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="relative w-full h-full bg-[#0c0d10] flex items-center justify-center p-6">
          <div className="max-w-md w-full p-6 rounded-2xl bg-[#14171c] border-3 border-[#f4f1ea] shadow-[6px_8px_0px_#07080a] text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-xl bg-[#ff2a85] text-[#0d0e11] border-2 border-[#0d0e11] flex items-center justify-center shadow-[3px_3px_0px_#07080a]">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="font-display-slap text-lg uppercase tracking-tight text-[#ffe600]">
              Map View Unavailable
            </h2>
            <p className="font-mono-stamp text-xs text-[#d5d2c8] leading-relaxed">
              {this.state.errorMessage ||
                'WebGL or map initialization failed in this browser.'}{' '}
              You can browse all events, filter dates, and view saved stickers in
              the Street Pole Feed.
            </p>
            <button
              type="button"
              onClick={this.props.onSwitchToList}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border-2 border-[#0d0e11] shadow-[3px_3px_0px_#07080a] font-grotesk font-extrabold text-xs uppercase cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f4f1ea] focus-visible:outline-offset-2"
            >
              <LayoutList className="w-4 h-4" />
              <span>Open Street Pole Feed</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface FlyerSessionState {
  venueGroup: VenueStoryGroup;
  initialEventId: string | null;
  source: 'map' | 'list' | 'saved' | 'deep-link';
}

const MAP_SURFACE_OPTIONS: ReadonlyArray<{
  id: MapStyleId;
  label: string;
}> = [
  { id: 'neon', label: 'Street' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'daylight', label: 'Daylight' },
];

export const App: React.FC = () => {
  const initial = useMemo(() => parseUrlParams(), []);

  const [activeCity, setActiveCity] = useState<CityId>(initial.city);
  const [viewMode, setViewMode] = useState<ViewMode>(initial.view);
  const [hasVisitedMap, setHasVisitedMap] = useState<boolean>(
    () => initial.view === 'map'
  );
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(initial.time);
  const [selectedDate, setSelectedDate] = useState<string | null>(initial.date);
  const [topicFilter, setTopicFilter] = useState<TopicCategory>(initial.topic);
  const [freeOnly, setFreeOnly] = useState<boolean>(initial.freeOnly);
  const [searchQuery, setSearchQuery] = useState<string>(initial.q);
  const [listSortBy, setListSortBy] = useState<ListSortMode>(initial.sort);
  const [mapStyle, setMapStyle] = useState<MapStyleId>(initial.style);

  // Application clock so LIVE / Starting Soon / Tonight / Weekend stay accurate
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Snap Map-style minimal popover states + refs for Escape / outside-pointerdown dismissal (`BUG-11`)
  const [searchOpen, setSearchOpen] = useState(() => Boolean(initial.q));
  const [filterTrayOpen, setFilterTrayOpen] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [cityFilterQuery, setCityFilterQuery] = useState('');
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);

  const searchContainerRef = useRef<HTMLElement | null>(null);
  const searchBtnRef = useRef<HTMLButtonElement | null>(null);
  const filterBtnRef = useRef<HTMLButtonElement | null>(null);
  const cityContainerRef = useRef<HTMLDivElement | null>(null);
  const cityBtnRef = useRef<HTMLButtonElement | null>(null);
  const moreToolsContainerRef = useRef<HTMLDivElement | null>(null);
  const moreToolsBtnRef = useRef<HTMLButtonElement | null>(null);

  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [agendaDrawerOpen, setAgendaDrawerOpen] = useState(false);
  const [agendaInitialTab, setAgendaInitialTab] = useState<
    'schedule' | 'saved'
  >('saved');

  const [focusCoordinates, setFocusCoordinates] = useState<
    [number, number] | null
  >(null);
  const [highlightedVenueId, setHighlightedVenueId] = useState<string | null>(
    null
  );

  const [cityFeedState, setCityFeedState] = useState<{
    cityId: CityId;
    events: NormalizedEvent[];
    meta: CityEventsResult | null;
    error: string | null;
    loading: boolean;
  }>({
    cityId: initial.city,
    events: [],
    meta: null,
    error: null,
    loading: true,
  });

  const dateFetchKey =
    selectedDate && CITIES[activeCity].dataMechanism === 'live-api'
      ? `${activeCity}:${selectedDate}`
      : '';
  const [dateEventsState, setDateEventsState] = useState<{
    key: string;
    events: NormalizedEvent[];
  }>({ key: '', events: [] });

  const isCurrentCityLoaded = cityFeedState.cityId === activeCity;
  const baseCityEvents = useMemo(
    () => (isCurrentCityLoaded ? cityFeedState.events : []),
    [isCurrentCityLoaded, cityFeedState.events]
  );
  const feedMeta = isCurrentCityLoaded ? cityFeedState.meta : null;
  const feedError = isCurrentCityLoaded ? cityFeedState.error : null;
  const baseLoading = !isCurrentCityLoaded || cityFeedState.loading;

  const dateSpecificEvents = useMemo(
    () =>
      dateFetchKey && dateEventsState.key === dateFetchKey
        ? dateEventsState.events
        : [],
    [dateFetchKey, dateEventsState]
  );
  const dateLoading = Boolean(
    dateFetchKey && dateEventsState.key !== dateFetchKey
  );

  const loading = baseLoading || dateLoading;

  const [savedEventIds, setSavedEventIds] = useState<string[]>(() => {
    try {
      const raw =
        localStorage.getItem(SAVED_EVENTS_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_SAVED_EVENTS_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [savedEventsCache, setSavedEventsCache] = useState<
    Record<string, NormalizedEvent>
  >(() => loadSavedEventsSnapshot());
  const [savedLoading, setSavedLoading] = useState(false);
  const attemptedSavedIdsRef = useRef<Set<string>>(new Set());

  // Separate pending external deep-link trigger (`?event=` on load/popstate) from URL sync state (`BUG-01`)
  const [flyerState, setFlyerState] = useState<FlyerSessionState | null>(null);
  const [pendingDeepLinkEventId, setPendingDeepLinkEventId] = useState<
    string | null
  >(initial.eventId);
  const [urlEventId, setUrlEventId] = useState<string | null>(initial.eventId);
  const [missingDeepLinkNotice, setMissingDeepLinkNotice] = useState<
    string | null
  >(null);

  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null
  );
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [shareBarCopied, setShareBarCopied] = useState(false);
  const [shareFallbackUrl, setShareFallbackUrl] = useState<string | null>(null);

  // Track request generation to prevent out-of-order responses from overwriting current city
  const cityRequestGenRef = useRef(0);
  const cityAbortRef = useRef<AbortController | null>(null);
  const isPopStateUpdateRef = useRef(false);
  const lastNavKeyRef = useRef('');

  // Lookup of loaded raw city/date events independent of the 60s `now` clock (`PERF-06`)
  const baseEventsLookup = useMemo(() => {
    const lookup = new Map<string, NormalizedEvent>();
    for (const ev of baseCityEvents) {
      lookup.set(ev.id, ev);
      for (const aliasId of ev.aliasIds) {
        lookup.set(aliasId, ev);
      }
    }
    for (const ev of dateSpecificEvents) {
      lookup.set(ev.id, ev);
      for (const aliasId of ev.aliasIds) {
        lookup.set(aliasId, ev);
      }
    }
    return lookup;
  }, [baseCityEvents, dateSpecificEvents]);

  const resolvedSavedEventsMap = useMemo(() => {
    if (savedEventIds.length === 0) return savedEventsCache;
    let mutated = false;
    const next: Record<string, NormalizedEvent> = { ...savedEventsCache };
    for (const id of savedEventIds) {
      if (next[id]) continue;
      const loaded = baseEventsLookup.get(id);
      if (loaded) {
        next[id] = loaded;
        next[loaded.id] = loaded;
        mutated = true;
      }
    }
    return mutated ? next : savedEventsCache;
  }, [savedEventIds, savedEventsCache, baseEventsLookup]);

  // Persist saved event snapshot ONLY when savedEventIds or resolvedSavedEventsMap changes (`PERF-06`)
  useEffect(() => {
    try {
      localStorage.setItem(
        SAVED_EVENTS_SNAPSHOT_KEY,
        serializeSavedEventsMap(resolvedSavedEventsMap, savedEventIds)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [resolvedSavedEventsMap, savedEventIds]);

  const unresolvedSavedIds = useMemo(
    () => savedEventIds.filter((id) => !resolvedSavedEventsMap[id]),
    [savedEventIds, resolvedSavedEventsMap]
  );

  // Resolve missing saved IDs ONLY from candidate city feeds & at most once per ID (`PERF-07`)
  useEffect(() => {
    const idsToAttempt = unresolvedSavedIds.filter(
      (id) => !attemptedSavedIdsRef.current.has(id)
    );
    if (idsToAttempt.length === 0) {
      return;
    }

    for (const id of idsToAttempt) {
      attemptedSavedIdsRef.current.add(id);
    }

    let cancelled = false;
    const candidateCities = getCandidateCitiesForSavedIds(
      idsToAttempt,
      activeCity
    );

    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setSavedLoading(true);
      const found: Record<string, NormalizedEvent> = {};
      try {
        for (const cityId of candidateCities) {
          if (cancelled) break;
          try {
            const res = await fetchCityEvents(cityId, false, null);
            for (const ev of res.events) {
              if (idsToAttempt.includes(ev.id)) {
                found[ev.id] = ev;
              }
              for (const aliasId of ev.aliasIds) {
                if (idsToAttempt.includes(aliasId)) {
                  found[aliasId] = ev;
                }
              }
            }
            if (idsToAttempt.every((id) => Boolean(found[id]))) break;
          } catch {
            // Ignore individual city resolution errors
          }
        }
        if (!cancelled && Object.keys(found).length > 0) {
          setSavedEventsCache((prev) => ({ ...prev, ...found }));
        }
      } finally {
        if (!cancelled) {
          setSavedLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [unresolvedSavedIds, activeCity]);

  // Listen to browser Back/Forward navigation
  useEffect(() => {
    const onPopState = () => {
      isPopStateUpdateRef.current = true;
      const parsed = parseUrlParams(window.location.search);
      setActiveCity(parsed.city);
      setViewMode(parsed.view);
      if (parsed.view === 'map') {
        setHasVisitedMap(true);
      }
      setTimeFilter(parsed.time);
      setSelectedDate(parsed.date);
      setTopicFilter(parsed.topic);
      setFreeOnly(parsed.freeOnly);
      setSearchQuery(parsed.q);
      setListSortBy(parsed.sort);
      setMapStyle(parsed.style);
      setUrlEventId(parsed.eventId);
      setPendingDeepLinkEventId(parsed.eventId);
      if (!parsed.eventId) {
        setFlyerState(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Sync application state into URL Search Params
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('city', activeCity);
    if (viewMode === 'list') params.set('view', 'list');
    if (selectedDate) {
      params.set('date', selectedDate);
    } else if (timeFilter !== 'all') {
      params.set('time', timeFilter);
    }
    if (topicFilter !== 'all') params.set('topic', topicFilter);
    if (freeOnly) params.set('free', '1');
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (listSortBy !== 'distance') params.set('sort', listSortBy);
    if (mapStyle !== 'neon') params.set('style', mapStyle);
    if (urlEventId) params.set('event', urlEventId);

    const newSearch = `?${params.toString()}`;
    const newRelativeUrl = `${window.location.pathname}${newSearch}`;
    const navKey = `${activeCity}|${viewMode}|${selectedDate || timeFilter}|${topicFilter}|${freeOnly ? '1' : '0'}|${urlEventId || ''}`;

    if (isPopStateUpdateRef.current) {
      isPopStateUpdateRef.current = false;
      lastNavKeyRef.current = navKey;
      return;
    }

    if (window.location.search === newSearch) {
      lastNavKeyRef.current = navKey;
      return;
    }

    if (lastNavKeyRef.current && lastNavKeyRef.current !== navKey) {
      window.history.pushState(null, '', newRelativeUrl);
    } else {
      window.history.replaceState(null, '', newRelativeUrl);
    }
    lastNavKeyRef.current = navKey;
  }, [
    activeCity,
    viewMode,
    timeFilter,
    selectedDate,
    topicFilter,
    freeOnly,
    searchQuery,
    listSortBy,
    mapStyle,
    urlEventId,
  ]);

  // Load base city events with stale-while-revalidate snapshot (`PERF-08`) and honest timeout error handling (`BUG-05`)
  const runCityLoad = useCallback(
    async (cityId: CityId, forceRefresh = false) => {
      cityRequestGenRef.current += 1;
      const requestGen = cityRequestGenRef.current;

      if (cityAbortRef.current) {
        cityAbortRef.current.abort();
      }
      const controller = new AbortController();
      cityAbortRef.current = controller;

      try {
        const result = await fetchCityEvents(
          cityId,
          forceRefresh,
          null,
          controller.signal,
          {
            onSnapshot: (snapResult) => {
              if (
                requestGen !== cityRequestGenRef.current ||
                controller.signal.aborted
              ) {
                return;
              }
              setCityFeedState((prev) => {
                if (prev.cityId === cityId && prev.events.length > 0) {
                  return prev;
                }
                return {
                  cityId,
                  events: snapResult.events,
                  meta: snapResult,
                  error: null,
                  loading: false,
                };
              });
            },
          }
        );
        if (requestGen !== cityRequestGenRef.current) return;
        setCityFeedState({
          cityId,
          events: result.events,
          meta: result,
          error: null,
          loading: false,
        });
      } catch (err) {
        if (requestGen !== cityRequestGenRef.current) return;
        if (controller.signal.aborted) return;
        console.error('[tarra] Failed to load events for', cityId, err);
        const errMsg =
          err instanceof Error
            ? err.message
            : `Could not load ${CITIES[cityId].name} event feed.`;
        setCityFeedState((prev) => ({
          cityId,
          events: prev.cityId === cityId ? prev.events : [],
          meta: prev.cityId === cityId ? prev.meta : null,
          error: errMsg,
          loading: false,
        }));
      }
    },
    []
  );

  const reloadActiveCity = useCallback(() => {
    setCityFeedState((prev) => ({
      cityId: activeCity,
      events: prev.cityId === activeCity ? prev.events : [],
      meta: prev.cityId === activeCity ? prev.meta : null,
      error: null,
      loading: true,
    }));
    void runCityLoad(activeCity, true);
  }, [activeCity, runCityLoad]);

  useEffect(() => {
    void runCityLoad(activeCity, false);
  }, [activeCity, runCityLoad]);

  // When a specific calendar date is chosen on a live-api city, fetch date-targeted events
  useEffect(() => {
    if (!dateFetchKey || !selectedDate) return;

    const controller = new AbortController();
    let cancelled = false;

    fetchCityEvents(activeCity, false, selectedDate, controller.signal)
      .then((res) => {
        if (!cancelled) {
          setDateEventsState({ key: dateFetchKey, events: res.events });
        }
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        console.warn('[tarra] Date-specific fetch warning:', err);
        setDateEventsState({ key: dateFetchKey, events: [] });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeCity, selectedDate, dateFetchKey]);

  // Merge base city events + date-specific events, refresh temporal flags, and compute distanceKm
  const events = useMemo(() => {
    const refCoords = userLocation || CITIES[activeCity].coordinates;
    const map = new Map<string, NormalizedEvent>();

    const upsert = (ev: NormalizedEvent) => {
      const refreshed = refreshEventTemporalState(ev, now, selectedDate);
      const resolved = selectedDate
        ? resolveEventForDate(refreshed, selectedDate, now)
        : refreshed;
      map.set(ev.id, {
        ...resolved,
        distanceKm:
          resolved.hasExactCoordinates && resolved.coordinates
            ? calculateDistanceKm(refCoords, resolved.coordinates)
            : null,
      });
    };

    for (const ev of baseCityEvents) {
      upsert(ev);
    }
    for (const ev of dateSpecificEvents) {
      upsert(ev);
    }
    return Array.from(map.values());
  }, [
    baseCityEvents,
    dateSpecificEvents,
    userLocation,
    activeCity,
    now,
    selectedDate,
  ]);

  // Recompute coverage bounds accurately when date-specific events are merged (`BUG-03`)
  const coverageBounds = useMemo(() => {
    if (!feedMeta && events.length === 0) {
      return { coverageStart: null, coverageEnd: null };
    }
    if (dateSpecificEvents.length === 0 && feedMeta) {
      return {
        coverageStart: feedMeta.coverageStart,
        coverageEnd: feedMeta.coverageEnd,
      };
    }
    return computeCoverageBounds(events, {
      now,
      targetDateKey: selectedDate,
      metaCoverageStart: feedMeta?.coverageStart,
      metaCoverageEnd: feedMeta?.coverageEnd,
    });
  }, [feedMeta, events, dateSpecificEvents.length, now, selectedDate]);

  const handleToggleSaveEvent = useCallback(
    (eventId: string, eventObj?: NormalizedEvent) => {
      const aliasSet = new Set<string>([
        eventId,
        ...(eventObj?.aliasIds || []),
        ...(eventObj ? [eventObj.id] : []),
      ]);

      setSavedEventIds((prev) => {
        const exists = prev.some((id) => aliasSet.has(id));
        const next = exists
          ? prev.filter((id) => !aliasSet.has(id))
          : [...prev, eventObj?.id || eventId];
        try {
          localStorage.setItem(SAVED_EVENTS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage quota errors
        }

        setSavedEventsCache((prevCache) => {
          const nextCache = { ...prevCache };
          if (exists) {
            for (const key of aliasSet) {
              delete nextCache[key];
            }
          } else if (eventObj) {
            nextCache[eventId] = eventObj;
            nextCache[eventObj.id] = eventObj;
            for (const aliasId of eventObj.aliasIds) {
              nextCache[aliasId] = eventObj;
            }
          }
          return nextCache;
        });

        return next;
      });
    },
    []
  );

  const allSavedEvents = useMemo(() => {
    const seen = new Set<string>();
    const list: NormalizedEvent[] = [];
    for (const id of savedEventIds) {
      const ev = resolvedSavedEventsMap[id];
      if (!ev || seen.has(ev.id)) continue;
      seen.add(ev.id);
      list.push(refreshEventTemporalState(ev, now, selectedDate));
    }
    return list.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [savedEventIds, resolvedSavedEventsMap, now, selectedDate]);

  // Events matching active topic / freeOnly / searchQuery (used by Month Calendar so cell counts match active filters, `BUG-12`)
  const calendarEvents = useMemo(() => {
    const normalizedQuery = normalizeSearchToken(searchQuery);
    return events.filter((ev) => {
      if (
        topicFilter !== 'all' &&
        ev.category !== topicFilter &&
        !ev.categories.includes(topicFilter)
      ) {
        return false;
      }
      if (freeOnly && ev.priceStatus !== 'free') {
        return false;
      }
      if (normalizedQuery) {
        const haystack = normalizeSearchToken(
          `${ev.title} ${ev.venueName} ${ev.streetAddress} ${ev.shortDescription}`
        );
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [events, topicFilter, freeOnly, searchQuery]);

  // Filter events by calendar date, time preset, and upcoming/active guard (`BUG-02`)
  const filteredEvents = useMemo(() => {
    return calendarEvents.filter((ev) => {
      if (selectedDate) {
        return doesEventOccurOnDate(ev, selectedDate);
      }
      if (!hasUpcomingOrActiveOccurrence(ev, now)) {
        return false;
      }
      if (timeFilter === 'live' && !ev.isLiveNow && !ev.isStartingSoon) {
        return false;
      }
      if (timeFilter === 'tonight' && !ev.isTonight) {
        return false;
      }
      if (timeFilter === 'weekend' && !ev.isThisWeekend) {
        return false;
      }
      return true;
    });
  }, [calendarEvents, selectedDate, timeFilter, now]);

  // Sorted list events matching EventListView order (`UI-05`)
  const listSortedEvents = useMemo(
    () => sortEventsForList(filteredEvents, listSortBy, now, selectedDate),
    [filteredEvents, listSortBy, now, selectedDate]
  );

  // Mapped venue groups for the 2D Map (always filtered!)
  const venueGroups = useMemo(
    () => groupEventsByVenue(filteredEvents, { includeUnmapped: false }),
    [filteredEvents]
  );

  // Filtered venue groups including unmapped/online events (`BUG-01`, `UI-05`)
  const filteredAllVenueGroups = useMemo(
    () => groupEventsByVenue(filteredEvents, { includeUnmapped: true }),
    [filteredEvents]
  );

  // Unfiltered fallback venue groups strictly for resolving direct shared `?event=` deep links
  const allVenueGroups = useMemo(
    () => groupEventsByVenue(events, { includeUnmapped: true }),
    [events]
  );

  // Pure deep-link resolution for `?event=...` (`BUG-01`)
  const deepLinkResolution = useMemo<{
    session: FlyerSessionState | null;
    missingNotice: string | null;
  }>(() => {
    if (!pendingDeepLinkEventId || loading) {
      return { session: null, missingNotice: null };
    }

    const matchingFiltered = filteredAllVenueGroups.find((vg) =>
      vg.events.some(
        (e) =>
          e.id === pendingDeepLinkEventId ||
          e.aliasIds.includes(pendingDeepLinkEventId)
      )
    );
    const matchingAny =
      matchingFiltered ||
      allVenueGroups.find((vg) =>
        vg.events.some(
          (e) =>
            e.id === pendingDeepLinkEventId ||
            e.aliasIds.includes(pendingDeepLinkEventId)
        )
      );

    if (matchingAny) {
      return {
        session: {
          venueGroup: matchingAny,
          initialEventId: pendingDeepLinkEventId,
          source: 'deep-link',
        },
        missingNotice: null,
      };
    }

    return {
      session: null,
      missingNotice:
        'The shared event is no longer available or is outside the current feed window.',
    };
  }, [
    pendingDeepLinkEventId,
    loading,
    filteredAllVenueGroups,
    allVenueGroups,
  ]);

  const effectiveFlyerState = flyerState ?? deepLinkResolution.session;
  const effectiveMissingDeepLinkNotice =
    missingDeepLinkNotice || deepLinkResolution.missingNotice;

  // Dismiss popovers on Escape (restoring focus to trigger) and outside pointerdown (`BUG-11`)
  const anyPopoverOpen =
    searchOpen || filterTrayOpen || cityPickerOpen || moreToolsOpen;

  useEffect(() => {
    if (!anyPopoverOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (calendarModalOpen || agendaDrawerOpen || effectiveFlyerState) return;

      e.preventDefault();
      if (searchOpen) {
        setSearchOpen(false);
        searchBtnRef.current?.focus();
      } else if (filterTrayOpen) {
        setFilterTrayOpen(false);
        filterBtnRef.current?.focus();
      } else if (cityPickerOpen) {
        setCityPickerOpen(false);
        cityBtnRef.current?.focus();
      } else if (moreToolsOpen) {
        setMoreToolsOpen(false);
        moreToolsBtnRef.current?.focus();
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (
        (searchOpen || filterTrayOpen) &&
        searchContainerRef.current &&
        !searchContainerRef.current.contains(target)
      ) {
        setSearchOpen(false);
        setFilterTrayOpen(false);
      }
      if (
        cityPickerOpen &&
        cityContainerRef.current &&
        !cityContainerRef.current.contains(target)
      ) {
        setCityPickerOpen(false);
      }
      if (
        moreToolsOpen &&
        moreToolsContainerRef.current &&
        !moreToolsContainerRef.current.contains(target)
      ) {
        setMoreToolsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [
    anyPopoverOpen,
    searchOpen,
    filterTrayOpen,
    cityPickerOpen,
    moreToolsOpen,
    calendarModalOpen,
    agendaDrawerOpen,
    effectiveFlyerState,
  ]);

  // Keep opened flyer's temporal badges fresh on 60s ticks without altering venueGroup identity/events (`BUG-01`)
  const liveFlyerVenueGroup = useMemo<VenueStoryGroup | null>(() => {
    if (!effectiveFlyerState) return null;
    const byId = new Map(events.map((e) => [e.id, e]));
    const refreshedEvents = effectiveFlyerState.venueGroup.events.map(
      (oldEv) =>
        byId.get(oldEv.id) ??
        refreshEventTemporalState(oldEv, now, selectedDate)
    );
    return {
      ...effectiveFlyerState.venueGroup,
      events: refreshedEvents,
      hasLiveEvent: refreshedEvents.some((e) => e.isLiveNow),
      hasStartingSoon: refreshedEvents.some((e) => e.isStartingSoon),
    };
  }, [effectiveFlyerState, events, now, selectedDate]);

  const handleCitySelect = (cityId: CityId) => {
    setFlyerState(null);
    setPendingDeepLinkEventId(null);
    setUrlEventId(null);
    setMissingDeepLinkNotice(null);
    setFocusCoordinates(null);
    setHighlightedVenueId(null);
    setActiveCity(cityId);
    setCityPickerOpen(false);
    setCityFilterQuery('');
  };

  const handleSelectDate = useCallback((dateKey: string | null) => {
    if (dateKey && !isValidDateKey(dateKey)) return;
    setSelectedDate(dateKey);
    if (dateKey) {
      setTimeFilter('custom-date');
    } else {
      setTimeFilter('all');
    }
  }, []);

  const handleOpenVenueGroup = useCallback((group: VenueStoryGroup) => {
    const firstId = group.events[0]?.id ?? null;
    setPendingDeepLinkEventId(null);
    setMissingDeepLinkNotice(null);
    setFlyerState({
      venueGroup: group,
      initialEventId: firstId,
      source: 'map',
    });
    setHighlightedVenueId(group.venueId);
    setUrlEventId(firstId);
  }, []);

  const handleSelectListEvent = useCallback(
    (ev: NormalizedEvent) => {
      if (ev.cityId !== activeCity) {
        setActiveCity(ev.cityId);
      }
      const group =
        filteredAllVenueGroups.find((vg) =>
          vg.events.some(
            (e) => e.id === ev.id || e.aliasIds.includes(ev.id)
          )
        ) || groupEventsByVenue([ev], { includeUnmapped: true })[0];
      if (group) {
        setPendingDeepLinkEventId(null);
        setMissingDeepLinkNotice(null);
        setFlyerState({
          venueGroup: group,
          initialEventId: ev.id,
          source: 'list',
        });
        setHighlightedVenueId(group.venueId);
        setUrlEventId(ev.id);
      }
    },
    [activeCity, filteredAllVenueGroups]
  );

  const handleSelectAgendaEvent = useCallback(
    (ev: NormalizedEvent) => {
      if (ev.cityId !== activeCity) {
        setActiveCity(ev.cityId);
      }
      const group =
        (ev.cityId === activeCity
          ? filteredAllVenueGroups.find((vg) =>
              vg.events.some(
                (e) => e.id === ev.id || e.aliasIds.includes(ev.id)
              )
            )
          : null) || groupEventsByVenue([ev], { includeUnmapped: true })[0];
      if (group) {
        setPendingDeepLinkEventId(null);
        setMissingDeepLinkNotice(null);
        setFlyerState({
          venueGroup: group,
          initialEventId: ev.id,
          source: 'saved',
        });
        setHighlightedVenueId(group.venueId);
        setUrlEventId(ev.id);
      }
    },
    [activeCity, filteredAllVenueGroups]
  );

  const handleShowEventOnMap = useCallback(
    (ev: NormalizedEvent) => {
      if (!ev.hasExactCoordinates || !ev.coordinates) return;
      if (ev.cityId !== activeCity) {
        setActiveCity(ev.cityId);
      }
      setHighlightedVenueId(ev.venueId);
      setFocusCoordinates([ev.coordinates[0], ev.coordinates[1]]);
      setHasVisitedMap(true);
      setViewMode('map');
    },
    [activeCity]
  );

  const handleCloseModal = useCallback(() => {
    setFlyerState(null);
    setPendingDeepLinkEventId(null);
    setUrlEventId(null);
  }, []);

  const handleActiveEventChange = useCallback((eventId: string) => {
    setUrlEventId(eventId);
  }, []);

  const handleShareDeepLink = useCallback(
    async (
      event?: NormalizedEvent
    ): Promise<{ ok: boolean; url: string }> => {
      const params = new URLSearchParams();
      params.set('city', event ? event.cityId : activeCity);
      if (viewMode === 'list') params.set('view', 'list');
      if (selectedDate) {
        params.set('date', selectedDate);
      } else if (timeFilter !== 'all') {
        params.set('time', timeFilter);
      }
      if (topicFilter !== 'all') params.set('topic', topicFilter);
      if (freeOnly) params.set('free', '1');
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (listSortBy !== 'distance') params.set('sort', listSortBy);
      if (mapStyle !== 'neon') params.set('style', mapStyle);
      if (event) params.set('event', event.id);

      const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        return { ok: true, url: shareUrl };
      } catch {
        return { ok: false, url: shareUrl };
      }
    },
    [
      activeCity,
      viewMode,
      selectedDate,
      timeFilter,
      topicFilter,
      freeOnly,
      searchQuery,
      listSortBy,
      mapStyle,
    ]
  );

  const handleNearMe = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsError('Geolocation is not supported in this browser.');
      return;
    }
    setLocating(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setGpsError(null);
        const coords: [number, number] = [
          pos.coords.longitude,
          pos.coords.latitude,
        ];
        setUserLocation(coords);

        let nearestCity: CityId = activeCity;
        let minDistance = Infinity;
        for (const city of CITY_LIST) {
          const dist =
            calculateDistanceKm(coords, city.coordinates) ?? Infinity;
          if (dist < minDistance) {
            minDistance = dist;
            nearestCity = city.id;
          }
        }
        if (nearestCity !== activeCity) {
          setActiveCity(nearestCity);
        } else {
          setFocusCoordinates(coords);
        }
      },
      () => {
        setLocating(false);
        setGpsError(
          `Location access was denied or unavailable. Distances are measured from ${CITIES[activeCity].name} centre.`
        );
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }, [activeCity]);

  // Step through sorted list cards (including unmapped/online!) when opened from list, or map venues when opened from map (`UI-05`)
  const handleNextVenue = useCallback(() => {
    if (!effectiveFlyerState) {
      handleCloseModal();
      return;
    }

    if (effectiveFlyerState.source === 'list') {
      if (listSortedEvents.length <= 1) {
        handleCloseModal();
        return;
      }
      const currentIds = new Set(
        effectiveFlyerState.venueGroup.events.map((e) => e.id)
      );
      const activeIdx = urlEventId
        ? listSortedEvents.findIndex((e) => e.id === urlEventId)
        : 0;
      const startPos = activeIdx >= 0 ? activeIdx : 0;

      for (let offset = 1; offset <= listSortedEvents.length; offset++) {
        const candidate =
          listSortedEvents[(startPos + offset) % listSortedEvents.length];
        if (!currentIds.has(candidate.id) || offset === listSortedEvents.length) {
          handleSelectListEvent(candidate);
          return;
        }
      }
      handleCloseModal();
      return;
    }

    if (venueGroups.length <= 1) {
      handleCloseModal();
      return;
    }
    const idx = venueGroups.findIndex(
      (g) => g.venueId === effectiveFlyerState.venueGroup.venueId
    );
    if (idx < 0) {
      handleCloseModal();
      return;
    }
    const nextGroup = venueGroups[(idx + 1) % venueGroups.length];
    handleOpenVenueGroup(nextGroup);
  }, [
    effectiveFlyerState,
    listSortedEvents,
    urlEventId,
    venueGroups,
    handleCloseModal,
    handleSelectListEvent,
    handleOpenVenueGroup,
  ]);

  const handlePrevVenue = useCallback(() => {
    if (!effectiveFlyerState) return;

    if (effectiveFlyerState.source === 'list') {
      if (listSortedEvents.length <= 1) return;
      const currentIds = new Set(
        effectiveFlyerState.venueGroup.events.map((e) => e.id)
      );
      const activeIdx = urlEventId
        ? listSortedEvents.findIndex((e) => e.id === urlEventId)
        : 0;
      const startPos = activeIdx >= 0 ? activeIdx : 0;

      for (let offset = 1; offset <= listSortedEvents.length; offset++) {
        const candidate =
          listSortedEvents[
            (startPos - offset + listSortedEvents.length) %
              listSortedEvents.length
          ];
        if (!currentIds.has(candidate.id) || offset === listSortedEvents.length) {
          handleSelectListEvent(candidate);
          return;
        }
      }
      return;
    }

    if (venueGroups.length <= 1) return;
    const idx = venueGroups.findIndex(
      (g) => g.venueId === effectiveFlyerState.venueGroup.venueId
    );
    if (idx < 0) return;
    const prevGroup =
      venueGroups[(idx - 1 + venueGroups.length) % venueGroups.length];
    handleOpenVenueGroup(prevGroup);
  }, [
    effectiveFlyerState,
    listSortedEvents,
    urlEventId,
    venueGroups,
    handleSelectListEvent,
    handleOpenVenueGroup,
  ]);

  const cityMeta = CITIES[activeCity];
  const citySourceAttribution = getCitySourceAttribution(activeCity);
  const activeTopicMeta =
    TOPICS.find((t) => t.id === topicFilter) || TOPICS[0];

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate || !isValidDateKey(selectedDate)) return null;
    return selectedDateChipFormatter.format(parseDateKey(selectedDate));
  }, [selectedDate]);

  const hasActiveFilters =
    Boolean(selectedDate) ||
    timeFilter !== 'all' ||
    topicFilter !== 'all' ||
    freeOnly ||
    Boolean(searchQuery.trim());

  const resetAllFilters = useCallback(() => {
    setSelectedDate(null);
    setTimeFilter('all');
    setTopicFilter('all');
    setFreeOnly(false);
    setSearchQuery('');
  }, []);

  const shouldMountMap = hasVisitedMap || viewMode === 'map';

  return (
    <div className="relative w-full h-dvh overflow-hidden bg-[#121417] text-[#f5f3eb]">
      {/* =====================================================================
          100% FULL-BLEED CONTENT CANVAS (Persistent 2D Map + Street Pole Feed)
          ===================================================================== */}
      {shouldMountMap && (
        <MapErrorBoundary onSwitchToList={() => setViewMode('list')}>
          <Suspense
            fallback={
              viewMode === 'map' ? (
                <div className="w-full h-full bg-[#0c0d10] flex items-center justify-center">
                  <div className="px-4 py-2 rounded-lg bg-[#14171c] border-2 border-[#f4f1ea] font-mono-stamp text-xs text-[#ffe600] uppercase">
                    Loading street map...
                  </div>
                </div>
              ) : null
            }
          >
            <SnapMap
              activeCity={activeCity}
              venueGroups={venueGroups}
              selectedVenueId={
                effectiveFlyerState?.venueGroup.venueId || highlightedVenueId
              }
              focusCoordinates={focusCoordinates}
              mapStyle={mapStyle}
              userLocation={userLocation}
              isVisible={viewMode === 'map'}
              onSelectVenueGroup={handleOpenVenueGroup}
              onSwitchToList={() => setViewMode('list')}
            />
          </Suspense>
        </MapErrorBoundary>
      )}

      {viewMode === 'list' && (
        <EventListView
          activeCity={activeCity}
          events={filteredEvents}
          now={now}
          loading={loading}
          feedError={feedError}
          selectedDate={selectedDate}
          coverageStart={coverageBounds.coverageStart}
          coverageEnd={coverageBounds.coverageEnd}
          isStale={feedMeta?.isStale}
          generatedAt={feedMeta?.generatedAt}
          totalUpstream={feedMeta?.totalUpstream}
          loadedCount={events.length}
          sortMode={listSortBy}
          onSortModeChange={setListSortBy}
          savedEventIds={savedEventIds}
          onToggleSaveEvent={handleToggleSaveEvent}
          onPlayStory={handleSelectListEvent}
          onResetFilters={resetAllFilters}
          onClearDate={() => handleSelectDate(null)}
          onRetry={reloadActiveCity}
        />
      )}

      {/* =====================================================================
          FLOATING STATUS / ERROR BANNERS (Above mobile dock on <sm; the dock itself
          sits above the 2-3 line data credit at the very bottom, `UI-04`)
          ===================================================================== */}
      <div className="pointer-events-none fixed bottom-34 sm:bottom-8 left-1/2 -translate-x-1/2 z-35 flex flex-col items-center gap-2 max-w-[92vw] sm:max-w-md">
        {viewMode === 'map' && loading && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto px-3.5 py-1.5 rounded-full bg-[#14171c]/95 border-2 border-[#ffe600] text-[#ffe600] font-mono-stamp text-[11px] font-bold flex items-center gap-2 shadow-[3px_4px_0px_#07080a]"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Loading {cityMeta.name} events...</span>
          </div>
        )}

        {viewMode === 'map' && feedError && !loading && (
          <div
            role="alert"
            className="pointer-events-auto px-3.5 py-2 rounded-lg bg-[#14171c]/95 border-2 border-[#ff2a85] text-[#f4f1ea] font-mono-stamp text-[11px] flex items-center gap-2.5 shadow-[3px_4px_0px_#07080a]"
          >
            <AlertTriangle className="w-4 h-4 text-[#ff2a85] shrink-0" />
            <span className="truncate">{feedError}</span>
            <button
              type="button"
              onClick={reloadActiveCity}
              className="px-2 py-0.5 rounded-xs bg-[#ffe600] text-[#0d0e11] font-bold uppercase cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#f4f1ea]"
            >
              Retry
            </button>
          </div>
        )}

        {feedMeta?.isStale && !loading && (
          <div
            role="status"
            className="pointer-events-auto px-3 py-1 rounded-md bg-[#14171c]/95 border border-[#ffe600]/60 text-[#ffe600] font-mono-stamp text-[11px] flex items-center gap-2 shadow"
          >
            <span>Showing cached offline data for {cityMeta.name}</span>
            <button
              type="button"
              onClick={reloadActiveCity}
              className="underline font-bold cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600]"
            >
              Refresh
            </button>
          </div>
        )}

        {gpsError && (
          <div
            role="alert"
            className="pointer-events-auto px-3.5 py-2 rounded-lg bg-[#14171c]/95 border-2 border-[#ffe600] text-[#f4f1ea] font-mono-stamp text-[11px] flex items-center gap-2 shadow-[3px_4px_0px_#07080a]"
          >
            <span>{gpsError}</span>
            <button
              type="button"
              onClick={() => setGpsError(null)}
              aria-label="Dismiss GPS notice"
              className="text-[#c7c4b8] hover:text-white cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#ffe600]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {effectiveMissingDeepLinkNotice && (
          <div
            role="status"
            className="pointer-events-auto px-3.5 py-2 rounded-lg bg-[#14171c]/95 border-2 border-[#ff5500] text-[#f4f1ea] font-mono-stamp text-[11px] flex items-center gap-2 shadow-[3px_4px_0px_#07080a]"
          >
            <span>{effectiveMissingDeepLinkNotice}</span>
            <button
              type="button"
              onClick={() => {
                setMissingDeepLinkNotice(null);
                setPendingDeepLinkEventId(null);
                setUrlEventId(null);
              }}
              aria-label="Dismiss missing event notice"
              className="text-[#c7c4b8] hover:text-white cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#ffe600]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {shareFallbackUrl && (
          <div className="pointer-events-auto p-2 rounded-lg bg-[#14171c]/95 border-2 border-[#ffe600] flex items-center gap-2 shadow-[3px_4px_0px_#07080a]">
            <input
              type="text"
              readOnly
              value={shareFallbackUrl}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Shareable view URL"
              className="bg-transparent font-mono-stamp text-[11px] text-[#f4f1ea] w-52 sm:w-64 focus-visible:outline-2 focus-visible:outline-[#ffe600] rounded-xs"
            />
            <button
              type="button"
              onClick={() => setShareFallbackUrl(null)}
              aria-label="Close share link box"
              className="text-[#c7c4b8] hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* =====================================================================
          TOP-LEFT: Search Slap Button + Filter Palette Slap Button (`UI-01`, `BUG-11`)
          ===================================================================== */}
      <search
        ref={searchContainerRef}
        aria-label="Event search and filter controls"
        className={`pointer-events-none fixed top-3 left-3 ${
          searchOpen || filterTrayOpen ? 'z-50' : 'z-30'
        } flex flex-col items-start gap-2`}
      >
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Search Icon Button */}
          <button
            ref={searchBtnRef}
            type="button"
            onClick={() => {
              setSearchOpen((v) => !v);
              setFilterTrayOpen(false);
              setCityPickerOpen(false);
              setMoreToolsOpen(false);
            }}
            aria-label="Toggle search input"
            aria-expanded={searchOpen}
            style={
              {
                '--slap-rot': '-5deg',
                '--slap-radius': '54% 46% 48% 52% / 48% 54% 46% 52%',
              } as React.CSSProperties
            }
            className={`organic-slap-btn w-10 h-10 flex items-center justify-center border-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
              searchOpen || searchQuery.trim()
                ? 'bg-[#ffe600] text-[#0d0e11] border-[#0d0e11] outline-2 outline-[#f4f1ea]'
                : 'bg-[#14171c]/90 hover:bg-[#1f242c] text-[#f4f1ea] border-[#f4f1ea]'
            }`}
          >
            <Search aria-hidden="true" className="w-4 h-4" />
          </button>

          {/* Filter Palette Slap Button */}
          <button
            ref={filterBtnRef}
            type="button"
            onClick={() => {
              setFilterTrayOpen((v) => !v);
              setSearchOpen(false);
              setCityPickerOpen(false);
              setMoreToolsOpen(false);
            }}
            aria-label="Toggle sticker filters"
            aria-expanded={filterTrayOpen}
            style={
              {
                '--slap-rot': '6deg',
                '--slap-radius': '46% 54% 52% 48% / 52% 46% 54% 48%',
              } as React.CSSProperties
            }
            className={`organic-slap-btn relative w-10 h-10 flex items-center justify-center border-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
              filterTrayOpen || hasActiveFilters
                ? 'bg-[#ff2a85] text-[#0d0e11] border-[#0d0e11] outline-1 outline-[#f4f1ea]'
                : 'bg-[#14171c]/90 hover:bg-[#1f242c] text-[#f4f1ea] border-[#f4f1ea]'
            }`}
          >
            <SlidersHorizontal aria-hidden="true" className="w-4 h-4" />
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#ffe600] border border-[#0d0e11]" />
            )}
          </button>
        </div>

        {/* Floating Search Input Slap (opens cleanly below top bar so it never collides with City Pill) */}
        {searchOpen && (
          <div
            style={
              {
                '--slap-rot': '0.8deg',
                '--slap-radius': '10px 4px 12px 5px',
              } as React.CSSProperties
            }
            className="pointer-events-auto organic-slap-btn flex items-center bg-[#14171c]/95 border-2 border-[#f4f1ea] px-3 py-1.5 shadow-[4px_5px_0px_#07080a] animate-fade-in"
          >
            <input
              type="search"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Find in ${cityMeta.name}...`}
              aria-label={`Search events in ${cityMeta.name}`}
              className="bg-transparent font-mono-stamp text-xs text-[#f4f1ea] placeholder:text-[#9e9a8e] focus-visible:outline-2 focus-visible:outline-[#ffe600] rounded-xs w-52 sm:w-60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search query"
                className="ml-1.5 text-[#ff2a85] hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600]"
              >
                <X aria-hidden="true" className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Floating Chaotic Sticker Filter Palette */}
        {filterTrayOpen && (
          <div className="pointer-events-auto max-w-[300px] sm:max-w-xs p-3 rounded-[14px_6px_16px_8px] bg-[#14171c]/95 border-2 border-[#f4f1ea] shadow-[4px_5px_0px_#07080a] space-y-2.5 animate-fade-in -rotate-1">
            {/* Time & Free Slaps */}
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: 'All', rot: '-2deg' },
                  { id: 'live', label: '🔥 Live', rot: '2.5deg' },
                  { id: 'tonight', label: '🌙 Tonight', rot: '-1.8deg' },
                  { id: 'weekend', label: '🎉 Weekend', rot: '1.9deg' },
                ] as const
              ).map((tf) => {
                const active = !selectedDate && timeFilter === tf.id;
                return (
                  <button
                    key={tf.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedDate(null);
                      setTimeFilter(tf.id);
                    }}
                    style={
                      {
                        '--slap-rot': tf.rot,
                        '--slap-radius': '8px 3px 9px 4px',
                      } as React.CSSProperties
                    }
                    className={`organic-slap-btn px-2 py-1 font-mono-stamp text-[11px] font-bold uppercase cursor-pointer border focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
                      active
                        ? 'bg-[#ff5500] text-[#0d0e11] border-[#0d0e11] outline-1 outline-[#f4f1ea]'
                        : 'bg-[#1d2128] text-[#d5d2c8] border-white/25 hover:text-white'
                    }`}
                  >
                    {tf.label}
                  </button>
                );
              })}

              <button
                type="button"
                aria-pressed={freeOnly}
                onClick={() => setFreeOnly((f) => !f)}
                style={
                  {
                    '--slap-rot': '-3deg',
                    '--slap-radius': '4px 10px 5px 9px',
                  } as React.CSSProperties
                }
                className={`organic-slap-btn px-2 py-1 font-mono-stamp text-[11px] font-bold uppercase flex items-center gap-1 cursor-pointer border focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
                  freeOnly
                    ? 'bg-[#22c55e] text-[#0d0e11] border-[#0d0e11] outline-1 outline-[#f4f1ea]'
                    : 'bg-[#1d2128] text-[#22c55e] border-[#22c55e]/45'
                }`}
              >
                <Ticket aria-hidden="true" className="w-3 h-3" />
                <span>Free</span>
              </button>
            </div>

            {/* Category Slaps */}
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/15">
              {TOPICS.map((topic, i) => {
                const active = topicFilter === topic.id;
                const rot = i % 2 === 0 ? '-2.2deg' : '2.4deg';
                return (
                  <button
                    key={topic.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTopicFilter(topic.id)}
                    style={
                      {
                        '--slap-rot': rot,
                        '--slap-radius': '9px 4px 10px 5px',
                        ...(active
                          ? {
                              backgroundColor: topic.slapBg,
                              color: topic.slapText,
                            }
                          : {}),
                      } as React.CSSProperties
                    }
                    className={`organic-slap-btn px-2 py-1 font-grotesk text-[11px] font-extrabold uppercase tracking-tight flex items-center gap-1 cursor-pointer border focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
                      active
                        ? 'border-[#0d0e11] outline-1 outline-[#f4f1ea]'
                        : 'bg-[#1d2128] text-[#d5d2c8] border-white/20 hover:text-white'
                    }`}
                  >
                    <span>{topic.emoji}</span>
                    <span>{topic.label.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>

            {hasActiveFilters && (
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-2.5 py-1 rounded-xs bg-[#ff2a85] text-[#0d0e11] border border-[#0d0e11] font-mono-stamp text-[11px] font-bold uppercase cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600]"
                >
                  Peel All Filters
                </button>
              </div>
            )}
          </div>
        )}
      </search>

      {/* =====================================================================
          TOP-RIGHT (<sm) / TOP-CENTER (sm+): Compact City Slap Pill (`UI-01`, `BUG-11`)
          ===================================================================== */}
      <div
        ref={cityContainerRef}
        className={`pointer-events-none fixed top-3 right-3 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 ${
          cityPickerOpen ? 'z-50' : 'z-30'
        } flex flex-col items-end sm:items-center`}
      >
        <button
          ref={cityBtnRef}
          type="button"
          onClick={() => {
            setCityPickerOpen((v) => !v);
            setFilterTrayOpen(false);
            setSearchOpen(false);
            setMoreToolsOpen(false);
          }}
          aria-label={`Current city: ${cityMeta.name}. Switch city.`}
          aria-expanded={cityPickerOpen}
          style={
            {
              '--slap-rot': '-1.5deg',
              '--slap-radius': '14px 6px 12px 5px',
            } as React.CSSProperties
          }
          className={`pointer-events-auto organic-slap-btn max-w-[calc(100vw-116px)] sm:max-w-none px-3.5 py-1.5 ${cityMeta.badgeColor} border-2 border-[#0d0e11] outline-2 outline-[#f4f1ea] font-display-slap text-xs sm:text-sm uppercase tracking-tight flex items-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2`}
        >
          <span className="truncate">{cityMeta.name}</span>
          {topicFilter !== 'all' && (
            <span className="text-xs leading-none shrink-0">
              {activeTopicMeta.emoji}
            </span>
          )}
          {selectedDateLabel && (
            <span className="px-1.5 py-[1px] rounded-xs bg-[#0d0e11] text-[#ffe600] font-mono-stamp text-[11px] font-bold shrink-0">
              {selectedDateLabel}
            </span>
          )}
          <ChevronDown
            aria-hidden="true"
            className="w-3.5 h-3.5 opacity-80 shrink-0"
          />
        </button>

        {/* Floating Grouped & Searchable 28-City Slap Picker (never overlaps right rail or mobile dock, `UI-01`) */}
        {cityPickerOpen && (
          <nav
            aria-label="City Switcher"
            className="pointer-events-auto mt-2 p-2.5 rounded-[12px_5px_14px_6px] bg-[#14171c]/95 border-2 border-[#f4f1ea] shadow-[4px_5px_0px_#07080a] w-[calc(100vw-24px)] sm:w-[min(calc(100vw-160px),350px)] max-h-[min(64dvh,500px)] flex flex-col gap-2.5 animate-fade-in"
          >
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-[#0d0e11] border border-[#f4f1ea]/45">
              <Search
                aria-hidden="true"
                className="w-3.5 h-3.5 text-[#ffe600] shrink-0"
              />
              <input
                type="search"
                autoFocus
                value={cityFilterQuery}
                onChange={(e) => setCityFilterQuery(e.target.value)}
                placeholder={`Filter ${CITY_LIST.length} cities...`}
                aria-label="Filter cities"
                className="w-full bg-transparent font-mono-stamp text-xs text-[#f4f1ea] placeholder:text-[#9e9a8e] focus-visible:outline-2 focus-visible:outline-[#ffe600] rounded-xs"
              />
              {cityFilterQuery && (
                <button
                  type="button"
                  onClick={() => setCityFilterQuery('')}
                  aria-label="Clear city filter"
                  className="text-[#ff2a85] hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600]"
                >
                  <X aria-hidden="true" className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="overflow-y-auto pr-1 space-y-2.5">
              {(() => {
                const normCityQuery = normalizeSearchToken(cityFilterQuery);
                const matchingGroups = CITY_REGION_GROUPS.map((group) => ({
                  ...group,
                  cities: CITY_LIST.filter(
                    (c) =>
                      c.regionGroup === group.id &&
                      (!normCityQuery ||
                        normalizeSearchToken(
                          `${c.name} ${c.nativeName} ${c.regionLabel} ${group.label}`
                        ).includes(normCityQuery))
                  ),
                })).filter((g) => g.cities.length > 0);

                if (matchingGroups.length === 0) {
                  return (
                    <p className="py-3 text-center font-mono-stamp text-xs text-[#c7c4b8]">
                      No matching cities found.
                    </p>
                  );
                }

                return matchingGroups.map((group) => (
                  <div key={group.id} className="space-y-1.5">
                    <div className="font-mono-stamp text-[11px] font-bold uppercase tracking-wider text-[#c7c4b8] px-1">
                      {group.label}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.cities.map((c, idx) => {
                        const isSelected = c.id === activeCity;
                        const angle = idx % 2 === 0 ? '-2.2deg' : '2.1deg';
                        return (
                          <button
                            key={c.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => handleCitySelect(c.id)}
                            style={
                              {
                                '--slap-rot': angle,
                                '--slap-radius': '10px 4px 11px 5px',
                              } as React.CSSProperties
                            }
                            className={`organic-slap-btn px-2.5 py-1 font-display-slap text-xs uppercase tracking-tight cursor-pointer border-2 focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
                              isSelected
                                ? `${c.badgeColor} border-[#0d0e11] outline-1 outline-[#f4f1ea]`
                                : 'bg-[#1d2128] text-[#f4f1ea] border-white/25 hover:border-white'
                            }`}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </nav>
        )}
      </div>

      {/* =====================================================================
          MOBILE BOTTOM DOCK (<sm) / DESKTOP RIGHT RAIL (sm+): Quick Actions (`UI-01`, `UI-05`)
          ===================================================================== */}
      <aside
        aria-label="Map and Pole quick actions"
        className={`pointer-events-none fixed bottom-16 inset-x-0 mx-auto w-fit sm:inset-x-auto sm:mx-0 sm:bottom-auto sm:top-3 sm:right-3 ${
          moreToolsOpen ? 'z-50' : 'z-30'
        } flex flex-row sm:flex-col items-center gap-2`}
      >
        <div
          ref={moreToolsContainerRef}
          className="pointer-events-auto relative flex flex-row sm:flex-col items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:p-1.5 rounded-[22px_18px_24px_16px] bg-[#14171c]/90 backdrop-blur-xs border border-white/20 shadow-[3px_4px_0px_#07080a]"
        >
          {/* 1. Switch Map <-> Pole Feed */}
          <button
            type="button"
            onClick={() =>
              setViewMode((v) => {
                const next = v === 'map' ? 'list' : 'map';
                if (next === 'map') {
                  setHasVisitedMap(true);
                }
                return next;
              })
            }
            aria-label={
              viewMode === 'map'
                ? 'Switch to Street Pole Feed'
                : 'Switch to 2D Street Map'
            }
            title={
              viewMode === 'map'
                ? 'Switch to Street Pole Feed'
                : 'Switch to 2D Street Map'
            }
            style={
              {
                '--slap-rot': '5deg',
                '--slap-radius': '48% 52% 55% 45% / 53% 47% 53% 47%',
              } as React.CSSProperties
            }
            className="organic-slap-btn w-10 h-10 flex items-center justify-center bg-[#ffe600] text-[#0d0e11] border-2 border-[#0d0e11] outline-1 outline-[#f4f1ea] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f4f1ea] focus-visible:outline-offset-2"
          >
            {viewMode === 'map' ? (
              <LayoutList aria-hidden="true" className="w-4 h-4" />
            ) : (
              <MapIcon aria-hidden="true" className="w-4 h-4" />
            )}
          </button>

          {/* 2. Month Calendar Picker Icon Button */}
          <button
            type="button"
            onClick={() => setCalendarModalOpen(true)}
            aria-label="Open Month Calendar"
            title="Open Month Calendar"
            style={
              {
                '--slap-rot': '-6deg',
                '--slap-radius': '53% 47% 46% 54% / 47% 53% 47% 53%',
              } as React.CSSProperties
            }
            className={`organic-slap-btn relative w-9 h-9 flex items-center justify-center border-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
              selectedDate
                ? 'bg-[#ff5500] text-[#0d0e11] border-[#0d0e11] outline-1 outline-[#f4f1ea]'
                : 'bg-[#1d2128] hover:bg-[#282d37] text-[#f4f1ea] border-[#f4f1ea]/80'
            }`}
          >
            <CalendarIcon aria-hidden="true" className="w-4 h-4" />
            {selectedDate && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#ffe600] border border-[#0d0e11]" />
            )}
          </button>

          {/* 3. Dedicated Pole Schedule Drawer Button (`UI-05`) */}
          <button
            type="button"
            onClick={() => {
              setAgendaInitialTab('schedule');
              setAgendaDrawerOpen(true);
            }}
            aria-label="Open Pole Schedule"
            title="Open Pole Schedule"
            style={
              {
                '--slap-rot': '-3deg',
                '--slap-radius': '50% 50% 45% 55% / 48% 52% 48% 52%',
              } as React.CSSProperties
            }
            className="organic-slap-btn w-9 h-9 flex items-center justify-center bg-[#1d2128] hover:bg-[#282d37] text-[#ffe600] border-2 border-[#f4f1ea]/80 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
          >
            <ListOrdered aria-hidden="true" className="w-4 h-4" />
          </button>

          {/* 4. Saved Sticker Stash Drawer Button (`PERF-01`) */}
          <button
            type="button"
            onClick={() => {
              setAgendaInitialTab('saved');
              setAgendaDrawerOpen(true);
            }}
            aria-label={`Open Saved Sticker Stash (${savedEventIds.length} saved)`}
            title={`Saved Sticker Stash (${savedEventIds.length})`}
            style={
              {
                '--slap-rot': '4deg',
                '--slap-radius': '46% 54% 50% 50% / 52% 48% 52% 48%',
              } as React.CSSProperties
            }
            className={`organic-slap-btn relative w-9 h-9 flex items-center justify-center border-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
              savedEventIds.length > 0
                ? 'bg-[#ff2a85] text-[#0d0e11] border-[#0d0e11] outline-1 outline-[#f4f1ea]'
                : 'bg-[#1d2128] hover:bg-[#282d37] text-[#f4f1ea] border-[#f4f1ea]/80'
            }`}
          >
            <Bookmark aria-hidden="true" className="w-4 h-4" />
            {savedEventIds.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 px-1 rounded-full bg-[#ffe600] text-[#0d0e11] border border-[#0d0e11] font-mono-stamp text-[11px] font-bold leading-tight">
                {savedEventIds.length}
              </span>
            )}
          </button>

          {/* 5. GPS Near Me Icon Button */}
          <button
            type="button"
            onClick={handleNearMe}
            aria-label="Center on my GPS location"
            title="Near Me (GPS)"
            style={
              {
                '--slap-rot': '-4deg',
                '--slap-radius': '52% 48% 46% 54% / 48% 52% 48% 52%',
              } as React.CSSProperties
            }
            className={`organic-slap-btn w-9 h-9 flex items-center justify-center border-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
              userLocation
                ? 'bg-[#22c55e] text-[#0d0e11] border-[#0d0e11] outline-1 outline-[#f4f1ea]'
                : 'bg-[#1d2128] hover:bg-[#282d37] text-[#22c55e] border-[#f4f1ea]/80'
            }`}
          >
            <LocateFixed
              aria-hidden="true"
              className={`w-4 h-4 ${locating ? 'animate-spin' : ''}`}
            />
          </button>

          {/* 6. More Tools Popover Trigger (Map Surface, Share Link, Refresh) */}
          <button
            ref={moreToolsBtnRef}
            type="button"
            onClick={() => {
              setMoreToolsOpen((v) => !v);
              setSearchOpen(false);
              setFilterTrayOpen(false);
              setCityPickerOpen(false);
            }}
            aria-label={moreToolsOpen ? 'Hide map and share tools' : 'More tools'}
            aria-expanded={moreToolsOpen}
            title="Map surface, share link & refresh"
            className={`w-8 h-8 rounded-full flex items-center justify-center border cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
              moreToolsOpen
                ? 'bg-[#ffe600] text-[#0d0e11] border-[#0d0e11]'
                : 'bg-[#1d2128] hover:bg-[#282d37] text-[#d5d2c8] hover:text-white border-[#f4f1ea]/50'
            }`}
          >
            <Layers aria-hidden="true" className="w-3.5 h-3.5" />
          </button>

          {/* Readable Secondary Tools Menu (`UI-05`, `A11Y-04`, `BUG-11`) */}
          {moreToolsOpen && (
            <div className="absolute bottom-full mb-2.5 right-0 sm:bottom-auto sm:mb-0 sm:top-0 sm:right-full sm:mr-2.5 w-48 p-2.5 rounded-xl bg-[#14171c]/98 border-2 border-[#f4f1ea] shadow-[4px_5px_0px_#07080a] space-y-2.5 animate-fade-in">
              {viewMode === 'map' && (
                <div className="space-y-1">
                  <div className="font-mono-stamp text-[11px] font-bold uppercase text-[#c7c4b8]">
                    Map Surface
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {MAP_SURFACE_OPTIONS.map((opt) => {
                      const active = mapStyle === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setMapStyle(opt.id)}
                          className={`px-2.5 py-1 rounded-md text-left font-grotesk text-xs font-bold uppercase cursor-pointer border focus-visible:outline-2 focus-visible:outline-[#ffe600] ${
                            active
                              ? 'bg-[#ffe600] text-[#0d0e11] border-[#0d0e11]'
                              : 'bg-[#1d2128] text-[#f4f1ea] border-white/20 hover:border-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5 pt-1 border-t border-white/15">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await handleShareDeepLink();
                    if (res.ok) {
                      setShareFallbackUrl(null);
                      setShareBarCopied(true);
                      setTimeout(() => setShareBarCopied(false), 2200);
                    } else {
                      setShareFallbackUrl(res.url);
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-md bg-[#1d2128] hover:bg-[#282d37] text-[#f4f1ea] border border-white/25 font-mono-stamp text-[11px] font-bold flex items-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600]"
                >
                  {shareBarCopied ? (
                    <>
                      <Check
                        aria-hidden="true"
                        className="w-3.5 h-3.5 text-[#22c55e]"
                      />
                      <span>Copied Link!</span>
                    </>
                  ) : (
                    <>
                      <Share2 aria-hidden="true" className="w-3.5 h-3.5" />
                      <span>Share View Link</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={reloadActiveCity}
                  className="px-2.5 py-1.5 rounded-md bg-[#1d2128] hover:bg-[#282d37] text-[#f4f1ea] border border-white/25 font-mono-stamp text-[11px] font-bold flex items-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600]"
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 ${
                      loading ? 'animate-spin text-[#ffe600]' : ''
                    }`}
                  />
                  <span>Refresh Feed</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* BOTTOM-LEFT ATTRIBUTION BAR IN LIST VIEW ONLY (Map view uses unified MapLibre AttributionControl, `UI-04`) */}
      {viewMode === 'list' && (
        <footer className="pointer-events-auto fixed bottom-1.5 left-2.5 z-20 px-2 py-0.5 rounded-sm bg-[#121417]/90 border border-white/15 font-mono-stamp text-[11px] text-[#c7c4b8] hover:text-[#f4f1ea] transition-colors flex items-center gap-1.5">
          <a
            href={citySourceAttribution.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline focus-visible:outline-2 focus-visible:outline-[#ffe600]"
          >
            {citySourceAttribution.text}
          </a>
          <span>•</span>
          <a
            href="https://openfreemap.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline focus-visible:outline-2 focus-visible:outline-[#ffe600]"
          >
            OpenFreeMap
          </a>
        </footer>
      )}

      {/* INTERACTIVE MONTH CALENDAR MODAL */}
      <EventCalendarModal
        isOpen={calendarModalOpen}
        selectedDate={selectedDate}
        now={now}
        cityName={cityMeta.name}
        events={calendarEvents}
        coverageStart={coverageBounds.coverageStart}
        coverageEnd={coverageBounds.coverageEnd}
        onSelectDate={handleSelectDate}
        onClose={() => setCalendarModalOpen(false)}
      />

      {/* DAY SCHEDULE & SAVED STICKER STASH DRAWER */}
      <DayAgendaDrawer
        isOpen={agendaDrawerOpen}
        initialTab={agendaInitialTab}
        cityName={cityMeta.name}
        selectedDate={selectedDate}
        now={now}
        events={filteredEvents}
        savedEventIds={savedEventIds}
        allSavedEvents={allSavedEvents}
        unresolvedSavedIds={unresolvedSavedIds}
        resolvingSavedIds={savedLoading}
        onToggleSaveEvent={handleToggleSaveEvent}
        onSelectEvent={handleSelectAgendaEvent}
        onClose={() => setAgendaDrawerOpen(false)}
      />

      {/* 9:16 VERTICAL STREET FLYER / STORY PLAYER MODAL */}
      <StoryPlayerModal
        venueGroup={liveFlyerVenueGroup}
        initialEventId={effectiveFlyerState?.initialEventId}
        selectedDate={selectedDate}
        now={now}
        savedEventIds={savedEventIds}
        onToggleSaveEvent={handleToggleSaveEvent}
        onShowOnMap={handleShowEventOnMap}
        onClose={handleCloseModal}
        onActiveEventChange={handleActiveEventChange}
        onShareDeepLink={handleShareDeepLink}
        onNextVenue={handleNextVenue}
        onPrevVenue={handlePrevVenue}
      />
    </div>
  );
};
