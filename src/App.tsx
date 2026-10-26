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
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  AlertTriangle,
} from 'lucide-react';
import {
  CITIES,
  CITY_LIST,
  CITY_REGION_GROUPS,
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
  fetchCityEvents,
  groupEventsByVenue,
  refreshEventTemporalState,
} from './services/linkedEventsClient';
import {
  doesEventOccurOnDate,
  isValidDateKey,
  parseDateKey,
  resolveEventForDate,
} from './utils/calendarUtils';
import { calculateDistanceKm } from './utils/distanceUtils';
import { getCitySourceAttribution } from './utils/licenseGuard';
import { StoryPlayerModal } from './components/Story/StoryPlayerModal';
import { EventCalendarModal } from './components/Calendar/EventCalendarModal';
import { DayAgendaDrawer } from './components/Agenda/DayAgendaDrawer';
import { EventListView } from './components/List/EventListView';

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
      hydrated[id] = {
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
    }
    return hydrated;
  } catch {
    return {};
  }
}

function normalizeSearchToken(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('fi-FI')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

interface ParsedUrlState {
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
            <div className="w-12 h-12 mx-auto rounded-xl bg-[#ff2a85] text-white border-2 border-[#f4f1ea] flex items-center justify-center shadow-[3px_3px_0px_#07080a]">
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
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border-2 border-[#0d0e11] shadow-[3px_3px_0px_#07080a] font-grotesk font-extrabold text-xs uppercase cursor-pointer"
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

export const App: React.FC = () => {
  const initial = useMemo(() => parseUrlParams(), []);

  const [activeCity, setActiveCity] = useState<CityId>(initial.city);
  const [viewMode, setViewMode] = useState<ViewMode>(initial.view);
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

  // Snap Map-style minimal popover states
  const [searchOpen, setSearchOpen] = useState(() => Boolean(initial.q));
  const [filterTrayOpen, setFilterTrayOpen] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [cityFilterQuery, setCityFilterQuery] = useState('');
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);

  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [agendaDrawerOpen, setAgendaDrawerOpen] = useState(false);
  const [agendaInitialTab, setAgendaInitialTab] = useState<
    'schedule' | 'saved'
  >('schedule');

  const [focusCoordinates, setFocusCoordinates] = useState<
    [number, number] | null
  >(null);
  const [highlightedVenueId, setHighlightedVenueId] = useState<string | null>(
    null
  );

  const [baseCityEvents, setBaseCityEvents] = useState<NormalizedEvent[]>([]);
  const [dateSpecificEvents, setDateSpecificEvents] = useState<
    NormalizedEvent[]
  >([]);
  const [baseLoading, setBaseLoading] = useState(true);
  const [dateLoading, setDateLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedMeta, setFeedMeta] = useState<CityEventsResult | null>(null);

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

  const [selectedVenueGroup, setSelectedVenueGroup] =
    useState<VenueStoryGroup | null>(null);
  const [deepLinkedEventId, setDeepLinkedEventId] = useState<string | null>(
    initial.eventId
  );
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

  // Persist saved event snapshot whenever savedEventIds or savedEventsCache changes
  useEffect(() => {
    try {
      localStorage.setItem(
        SAVED_EVENTS_SNAPSHOT_KEY,
        serializeSavedEventsMap(savedEventsCache, savedEventIds)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [savedEventsCache, savedEventIds]);

  const unresolvedSavedIds = useMemo(
    () => savedEventIds.filter((id) => !savedEventsCache[id]),
    [savedEventIds, savedEventsCache]
  );

  // Resolve any saved event IDs from other cities that aren't in savedEventsCache yet
  useEffect(() => {
    if (unresolvedSavedIds.length === 0) return;

    let cancelled = false;
    setSavedLoading(true);

    (async () => {
      const found: Record<string, NormalizedEvent> = {};
      const hintedCityIds = new Set<CityId>();
      for (const id of unresolvedSavedIds) {
        const prefix = id.split(':')[0]?.trim().toLowerCase();
        if (prefix && Object.hasOwn(CITIES, prefix)) {
          hintedCityIds.add(prefix as CityId);
        }
      }
      const orderedCities = [
        ...CITY_LIST.filter((c) => hintedCityIds.has(c.id)),
        ...CITY_LIST.filter((c) => !hintedCityIds.has(c.id)),
      ];

      for (const city of orderedCities) {
        if (cancelled) break;
        try {
          const res = await fetchCityEvents(city.id, false, null);
          for (const ev of res.events) {
            if (unresolvedSavedIds.includes(ev.id)) {
              found[ev.id] = ev;
            }
            for (const aliasId of ev.aliasIds) {
              if (unresolvedSavedIds.includes(aliasId)) {
                found[aliasId] = ev;
              }
            }
          }
          if (unresolvedSavedIds.every((id) => Boolean(found[id]))) break;
        } catch {
          // Ignore individual city resolution errors
        }
      }
      if (!cancelled && Object.keys(found).length > 0) {
        setSavedEventsCache((prev) => ({ ...prev, ...found }));
      }
      if (!cancelled) {
        setSavedLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [unresolvedSavedIds]);

  // Listen to browser Back/Forward navigation
  useEffect(() => {
    const onPopState = () => {
      isPopStateUpdateRef.current = true;
      const parsed = parseUrlParams(window.location.search);
      setActiveCity(parsed.city);
      setViewMode(parsed.view);
      setTimeFilter(parsed.time);
      setSelectedDate(parsed.date);
      setTopicFilter(parsed.topic);
      setFreeOnly(parsed.freeOnly);
      setSearchQuery(parsed.q);
      setListSortBy(parsed.sort);
      setMapStyle(parsed.style);
      setDeepLinkedEventId(parsed.eventId);
      if (!parsed.eventId) {
        setSelectedVenueGroup(null);
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
    if (deepLinkedEventId) params.set('event', deepLinkedEventId);

    const newSearch = `?${params.toString()}`;
    const newRelativeUrl = `${window.location.pathname}${newSearch}`;
    const navKey = `${activeCity}|${viewMode}|${selectedDate || timeFilter}|${topicFilter}|${freeOnly ? '1' : '0'}|${deepLinkedEventId || ''}`;

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
    deepLinkedEventId,
  ]);

  // Load base city events with generation token + AbortController
  const loadCity = useCallback(
    async (cityId: CityId, forceRefresh = false) => {
      cityRequestGenRef.current += 1;
      const requestGen = cityRequestGenRef.current;

      if (cityAbortRef.current) {
        cityAbortRef.current.abort();
      }
      const controller = new AbortController();
      cityAbortRef.current = controller;

      setBaseLoading(true);
      setFeedError(null);
      if (!forceRefresh) {
        setBaseCityEvents([]);
        setDateSpecificEvents([]);
        setFeedMeta(null);
      }

      try {
        const result = await fetchCityEvents(
          cityId,
          forceRefresh,
          null,
          controller.signal
        );
        if (requestGen !== cityRequestGenRef.current) return;
        setBaseCityEvents(result.events);
        setFeedMeta(result);
        setFeedError(null);
      } catch (err) {
        if (requestGen !== cityRequestGenRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('[tarra] Failed to load events for', cityId, err);
        setFeedError(
          err instanceof Error
            ? err.message
            : `Could not load ${CITIES[cityId].name} event feed.`
        );
      } finally {
        if (requestGen === cityRequestGenRef.current) {
          setBaseLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void loadCity(activeCity);
  }, [activeCity, loadCity]);

  // When a specific calendar date is chosen on a live-api city, fetch date-targeted events
  useEffect(() => {
    if (!selectedDate) {
      setDateSpecificEvents([]);
      setDateLoading(false);
      return;
    }

    // Static snapshot feeds already include all occurrences in baseCityEvents
    if (CITIES[activeCity].dataMechanism === 'static-jsonld') {
      setDateSpecificEvents([]);
      setDateLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setDateLoading(true);
    setDateSpecificEvents([]);

    fetchCityEvents(activeCity, false, selectedDate, controller.signal)
      .then((res) => {
        if (!cancelled) {
          setDateSpecificEvents(res.events);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.warn('[tarra] Date-specific fetch warning:', err);
      })
      .finally(() => {
        if (!cancelled) setDateLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeCity, selectedDate]);

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

  useEffect(() => {
    if (events.length === 0) return;
    setSavedEventsCache((prev) => {
      const next = { ...prev };
      for (const ev of events) {
        next[ev.id] = ev;
        for (const aliasId of ev.aliasIds) {
          next[aliasId] = ev;
        }
      }
      return next;
    });
  }, [events]);

  const handleToggleSaveEvent = useCallback(
    (eventId: string, eventObj?: NormalizedEvent) => {
      if (eventObj) {
        setSavedEventsCache((prev) => {
          const next = { ...prev, [eventId]: eventObj, [eventObj.id]: eventObj };
          for (const aliasId of eventObj.aliasIds) {
            next[aliasId] = eventObj;
          }
          return next;
        });
      }
      setSavedEventIds((prev) => {
        const aliasSet = new Set<string>([
          eventId,
          ...(eventObj?.aliasIds || []),
          ...(eventObj ? [eventObj.id] : []),
        ]);
        const exists = prev.some((id) => aliasSet.has(id));
        const next = exists
          ? prev.filter((id) => !aliasSet.has(id))
          : [...prev, eventObj?.id || eventId];
        try {
          localStorage.setItem(SAVED_EVENTS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage quota errors
        }
        return next;
      });
    },
    []
  );

  const allSavedEvents = useMemo(() => {
    const seen = new Set<string>();
    const list: NormalizedEvent[] = [];
    for (const id of savedEventIds) {
      const ev = savedEventsCache[id];
      if (!ev || seen.has(ev.id)) continue;
      seen.add(ev.id);
      list.push(refreshEventTemporalState(ev, now, selectedDate));
    }
    return list.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [savedEventIds, savedEventsCache, now, selectedDate]);

  // Filter events by calendar date, time preset, topic, freeOnly, and search query
  const filteredEvents = useMemo(() => {
    const normalizedQuery = normalizeSearchToken(searchQuery);

    return events.filter((ev) => {
      if (selectedDate) {
        if (!doesEventOccurOnDate(ev, selectedDate)) return false;
      } else {
        if (timeFilter === 'live' && !ev.isLiveNow && !ev.isStartingSoon) {
          return false;
        }
        if (timeFilter === 'tonight' && !ev.isTonight) {
          return false;
        }
        if (timeFilter === 'weekend' && !ev.isThisWeekend) {
          return false;
        }
      }

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
  }, [events, selectedDate, timeFilter, topicFilter, freeOnly, searchQuery]);

  // Mapped venue groups for the 2D Map
  const venueGroups = useMemo(
    () => groupEventsByVenue(filteredEvents, { includeUnmapped: false }),
    [filteredEvents]
  );

  // All venue groups (including unmapped/online) so flyers work for every event
  const allVenueGroups = useMemo(
    () => groupEventsByVenue(events, { includeUnmapped: true }),
    [events]
  );

  // Automatically open Flyer Player if ?event=... is present in URL on initial load
  useEffect(() => {
    if (!deepLinkedEventId || loading || events.length === 0) return;
    const matchingGroup = allVenueGroups.find((vg) =>
      vg.events.some(
        (e) =>
          e.id === deepLinkedEventId ||
          e.aliasIds.includes(deepLinkedEventId)
      )
    );
    if (matchingGroup) {
      setSelectedVenueGroup(matchingGroup);
      setMissingDeepLinkNotice(null);
    } else if (!selectedVenueGroup) {
      setMissingDeepLinkNotice(
        'The shared event is no longer available or is outside the current feed window.'
      );
    }
  }, [deepLinkedEventId, loading, events, allVenueGroups, selectedVenueGroup]);

  const handleCitySelect = (cityId: CityId) => {
    setSelectedVenueGroup(null);
    setDeepLinkedEventId(null);
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
    setSelectedVenueGroup(group);
    setHighlightedVenueId(group.venueId);
    if (group.events[0]) {
      setDeepLinkedEventId(group.events[0].id);
    }
  }, []);

  const handleSelectSingleEvent = useCallback(
    (ev: NormalizedEvent) => {
      if (ev.cityId !== activeCity) {
        setActiveCity(ev.cityId);
      }
      const group =
        allVenueGroups.find((vg) =>
          vg.events.some(
            (e) => e.id === ev.id || e.aliasIds.includes(ev.id)
          )
        ) ||
        groupEventsByVenue([ev], { includeUnmapped: true })[0];
      if (group) {
        setSelectedVenueGroup(group);
        setHighlightedVenueId(group.venueId);
        setDeepLinkedEventId(ev.id);
      }
    },
    [activeCity, allVenueGroups]
  );

  const handleShowEventOnMap = useCallback(
    (ev: NormalizedEvent) => {
      if (!ev.hasExactCoordinates || !ev.coordinates) return;
      if (ev.cityId !== activeCity) {
        setActiveCity(ev.cityId);
      }
      setHighlightedVenueId(ev.venueId);
      setFocusCoordinates([ev.coordinates[0], ev.coordinates[1]]);
      setViewMode('map');
    },
    [activeCity]
  );

  const handleCloseModal = useCallback(() => {
    setSelectedVenueGroup(null);
    setDeepLinkedEventId(null);
  }, []);

  const handleActiveEventChange = useCallback((eventId: string) => {
    setDeepLinkedEventId(eventId);
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

  const handleNextVenue = useCallback(() => {
    if (!selectedVenueGroup || venueGroups.length <= 1) {
      handleCloseModal();
      return;
    }
    const idx = venueGroups.findIndex(
      (g) => g.venueId === selectedVenueGroup.venueId
    );
    if (idx < 0) {
      handleCloseModal();
      return;
    }
    const nextGroup = venueGroups[(idx + 1) % venueGroups.length];
    handleOpenVenueGroup(nextGroup);
  }, [selectedVenueGroup, venueGroups, handleCloseModal, handleOpenVenueGroup]);

  const handlePrevVenue = useCallback(() => {
    if (!selectedVenueGroup || venueGroups.length <= 1) return;
    const idx = venueGroups.findIndex(
      (g) => g.venueId === selectedVenueGroup.venueId
    );
    if (idx < 0) return;
    const prevGroup =
      venueGroups[(idx - 1 + venueGroups.length) % venueGroups.length];
    handleOpenVenueGroup(prevGroup);
  }, [selectedVenueGroup, venueGroups, handleOpenVenueGroup]);

  const cityMeta = CITIES[activeCity];
  const citySourceAttribution = getCitySourceAttribution(activeCity);
  const activeTopicMeta =
    TOPICS.find((t) => t.id === topicFilter) || TOPICS[0];

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate || !isValidDateKey(selectedDate)) return null;
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
    }).format(parseDateKey(selectedDate));
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

  return (
    <div className="relative w-full h-dvh overflow-hidden bg-[#121417] text-[#f5f3eb] select-none">
      {/* =====================================================================
          100% FULL-BLEED CONTENT CANVAS (2D Map OR Street Pole Feed)
          ===================================================================== */}
      {viewMode === 'map' ? (
        <MapErrorBoundary onSwitchToList={() => setViewMode('list')}>
          <Suspense
            fallback={
              <div className="w-full h-full bg-[#0c0d10] flex items-center justify-center">
                <div className="px-4 py-2 rounded-lg bg-[#14171c] border-2 border-[#f4f1ea] font-mono-stamp text-xs text-[#ffe600] uppercase">
                  Loading street map...
                </div>
              </div>
            }
          >
            <SnapMap
              activeCity={activeCity}
              venueGroups={venueGroups}
              selectedVenueId={
                selectedVenueGroup?.venueId || highlightedVenueId
              }
              focusCoordinates={focusCoordinates}
              mapStyle={mapStyle}
              userLocation={userLocation}
              onSelectVenueGroup={handleOpenVenueGroup}
              onSwitchToList={() => setViewMode('list')}
            />
          </Suspense>
        </MapErrorBoundary>
      ) : (
        <EventListView
          activeCity={activeCity}
          events={filteredEvents}
          loading={loading}
          feedError={feedError}
          selectedDate={selectedDate}
          coverageStart={feedMeta?.coverageStart}
          coverageEnd={feedMeta?.coverageEnd}
          isStale={feedMeta?.isStale}
          generatedAt={feedMeta?.generatedAt}
          totalUpstream={feedMeta?.totalUpstream}
          loadedCount={events.length}
          sortMode={listSortBy}
          onSortModeChange={setListSortBy}
          savedEventIds={savedEventIds}
          onToggleSaveEvent={handleToggleSaveEvent}
          onPlayStory={handleSelectSingleEvent}
          onResetFilters={resetAllFilters}
          onClearDate={() => handleSelectDate(null)}
          onRetry={() => loadCity(activeCity, true)}
        />
      )}

      {/* =====================================================================
          FLOATING STATUS / ERROR BANNERS (GPS, Deep Link, Offline Stale, Map Loading)
          ===================================================================== */}
      <div className="pointer-events-none fixed bottom-8 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 max-w-[92vw] sm:max-w-md">
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
              onClick={() => loadCity(activeCity, true)}
              className="px-2 py-0.5 rounded-xs bg-[#ffe600] text-[#0d0e11] font-bold uppercase cursor-pointer shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {feedMeta?.isStale && !loading && (
          <div
            role="status"
            className="pointer-events-auto px-3 py-1 rounded-md bg-[#14171c]/95 border border-[#ffe600]/60 text-[#ffe600] font-mono-stamp text-[10px] flex items-center gap-2 shadow"
          >
            <span>Showing cached offline data for {cityMeta.name}</span>
            <button
              type="button"
              onClick={() => loadCity(activeCity, true)}
              className="underline font-bold cursor-pointer"
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
              className="text-[#c7c4b8] hover:text-white cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {missingDeepLinkNotice && (
          <div
            role="status"
            className="pointer-events-auto px-3.5 py-2 rounded-lg bg-[#14171c]/95 border-2 border-[#ff5500] text-[#f4f1ea] font-mono-stamp text-[11px] flex items-center gap-2 shadow-[3px_4px_0px_#07080a]"
          >
            <span>{missingDeepLinkNotice}</span>
            <button
              type="button"
              onClick={() => {
                setMissingDeepLinkNotice(null);
                setDeepLinkedEventId(null);
              }}
              aria-label="Dismiss missing event notice"
              className="text-[#c7c4b8] hover:text-white cursor-pointer shrink-0"
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
              className="bg-transparent font-mono-stamp text-[10px] text-[#f4f1ea] w-52 sm:w-64 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShareFallbackUrl(null)}
              aria-label="Close share link box"
              className="text-[#c7c4b8] hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* =====================================================================
          SNAP-MAP STYLE MINIMAL FLOATING ICONS (< 5% OF SCREEN AREA)
          ===================================================================== */}

      {/* TOP-LEFT: Search Slap Button + Filter Palette Slap Button */}
      <search
        aria-label="Event search and filter controls"
        className="pointer-events-none fixed top-3 left-3 z-30 flex flex-col items-start gap-2"
      >
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Search Icon Button */}
          <button
            type="button"
            onClick={() => {
              setSearchOpen((v) => !v);
              setFilterTrayOpen(false);
              setCityPickerOpen(false);
            }}
            aria-label="Toggle search input"
            aria-expanded={searchOpen}
            style={
              {
                '--slap-rot': '-5deg',
                '--slap-radius': '54% 46% 48% 52% / 48% 54% 46% 52%',
              } as React.CSSProperties
            }
            className={`organic-slap-btn w-10 h-10 flex items-center justify-center border-2 cursor-pointer ${
              searchOpen || searchQuery.trim()
                ? 'bg-[#ffe600] text-[#0d0e11] border-[#0d0e11] outline-2 outline-[#f4f1ea]'
                : 'bg-[#14171c]/90 hover:bg-[#1f242c] text-[#f4f1ea] border-[#f4f1ea]'
            }`}
          >
            <Search aria-hidden="true" className="w-4 h-4" />
          </button>

          {/* Expandable Inline Search Slap */}
          {searchOpen && (
            <div
              style={
                {
                  '--slap-rot': '1.2deg',
                  '--slap-radius': '10px 4px 12px 5px',
                } as React.CSSProperties
              }
              className="organic-slap-btn flex items-center bg-[#14171c]/95 border-2 border-[#f4f1ea] px-2.5 py-1 animate-fade-in"
            >
              <input
                type="search"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Find in ${cityMeta.name}...`}
                aria-label={`Search events in ${cityMeta.name}`}
                className="bg-transparent font-mono-stamp text-xs text-[#f4f1ea] placeholder:text-[#8a867a] focus:outline-none w-36 sm:w-48"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search query"
                  className="ml-1 text-[#ff2a85] hover:text-white cursor-pointer"
                >
                  <X aria-hidden="true" className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Filter Palette Slap Button */}
          <button
            type="button"
            onClick={() => {
              setFilterTrayOpen((v) => !v);
              setSearchOpen(false);
              setCityPickerOpen(false);
            }}
            aria-label="Toggle sticker filters"
            aria-expanded={filterTrayOpen}
            style={
              {
                '--slap-rot': '6deg',
                '--slap-radius': '46% 54% 52% 48% / 52% 46% 54% 48%',
              } as React.CSSProperties
            }
            className={`organic-slap-btn relative w-10 h-10 flex items-center justify-center border-2 cursor-pointer ${
              filterTrayOpen || hasActiveFilters
                ? 'bg-[#ff2a85] text-white border-[#f4f1ea]'
                : 'bg-[#14171c]/90 hover:bg-[#1f242c] text-[#f4f1ea] border-[#f4f1ea]'
            }`}
          >
            <SlidersHorizontal aria-hidden="true" className="w-4 h-4" />
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#ffe600] border border-[#0d0e11]" />
            )}
          </button>
        </div>

        {/* Floating Chaotic Sticker Filter Palette (Only visible when toggled open) */}
        {filterTrayOpen && (
          <div className="pointer-events-auto max-w-[290px] sm:max-w-xs p-3 rounded-[14px_6px_16px_8px] bg-[#14171c]/95 border-2 border-[#f4f1ea] shadow-[4px_5px_0px_#07080a] space-y-2.5 animate-fade-in -rotate-1">
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
                    className={`organic-slap-btn px-2 py-1 font-mono-stamp text-[10px] font-bold uppercase cursor-pointer border ${
                      active
                        ? 'bg-[#ff5500] text-white border-[#f4f1ea]'
                        : 'bg-[#1d2128] text-[#c7c4b8] border-white/20 hover:text-white'
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
                className={`organic-slap-btn px-2 py-1 font-mono-stamp text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer border ${
                  freeOnly
                    ? 'bg-[#22c55e] text-[#0d0e11] border-[#0d0e11] outline-1 outline-[#f4f1ea]'
                    : 'bg-[#1d2128] text-[#22c55e] border-[#22c55e]/40'
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
                    className={`organic-slap-btn px-2 py-1 font-grotesk text-[11px] font-extrabold uppercase tracking-tight flex items-center gap-1 cursor-pointer border ${
                      active
                        ? 'border-[#0d0e11] outline-1 outline-[#f4f1ea]'
                        : 'bg-[#1d2128] text-[#d5d2c8] border-white/15 hover:text-white'
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
                  className="px-2 py-0.5 rounded-xs bg-[#ff2a85] text-white font-mono-stamp text-[10px] font-bold uppercase cursor-pointer"
                >
                  Peel All Filters
                </button>
              </div>
            )}
          </div>
        )}
      </search>

      {/* TOP-CENTER: Compact City Slap Pill */}
      <div className="pointer-events-none fixed top-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center">
        <button
          type="button"
          onClick={() => {
            setCityPickerOpen((v) => !v);
            setFilterTrayOpen(false);
            setSearchOpen(false);
          }}
          aria-label={`Current city: ${cityMeta.name}. Click to switch city.`}
          aria-expanded={cityPickerOpen}
          style={
            {
              '--slap-rot': '-1.5deg',
              '--slap-radius': '14px 6px 12px 5px',
            } as React.CSSProperties
          }
          className={`pointer-events-auto organic-slap-btn px-3.5 py-1.5 ${cityMeta.badgeColor} border-2 border-[#0d0e11] outline-2 outline-[#f4f1ea] font-display-slap text-xs sm:text-sm uppercase tracking-tight flex items-center gap-1.5 cursor-pointer`}
        >
          <span>{cityMeta.name}</span>
          {topicFilter !== 'all' && (
            <span className="text-xs leading-none">
              {activeTopicMeta.emoji}
            </span>
          )}
          {selectedDateLabel && (
            <span className="px-1.5 py-[1px] rounded-xs bg-[#0d0e11] text-[#ffe600] font-mono-stamp text-[9px] font-bold">
              {selectedDateLabel}
            </span>
          )}
          <ChevronDown aria-hidden="true" className="w-3.5 h-3.5 opacity-80" />
        </button>

        {/* Floating Grouped & Searchable 28-City Slap Picker */}
        {cityPickerOpen && (
          <nav
            aria-label="City Switcher"
            className="pointer-events-auto mt-2 p-2.5 rounded-[12px_5px_14px_6px] bg-[#14171c]/95 border-2 border-[#f4f1ea] shadow-[4px_5px_0px_#07080a] w-[min(92vw,350px)] max-h-[72dvh] flex flex-col gap-2.5 animate-fade-in rotate-[0.5deg]"
          >
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#0d0e11] border border-[#f4f1ea]/40">
              <Search
                aria-hidden="true"
                className="w-3.5 h-3.5 text-[#ffe600] shrink-0"
              />
              <input
                type="search"
                value={cityFilterQuery}
                onChange={(e) => setCityFilterQuery(e.target.value)}
                placeholder={`Filter ${CITY_LIST.length} cities...`}
                aria-label="Filter cities"
                className="w-full bg-transparent font-mono-stamp text-xs text-[#f4f1ea] placeholder:text-[#8a867a] focus:outline-none"
              />
              {cityFilterQuery && (
                <button
                  type="button"
                  onClick={() => setCityFilterQuery('')}
                  aria-label="Clear city filter"
                  className="text-[#ff2a85] hover:text-white cursor-pointer"
                >
                  <X aria-hidden="true" className="w-3 h-3" />
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
                    <p className="py-3 text-center font-mono-stamp text-xs text-[#b8b4a8]">
                      No matching cities found.
                    </p>
                  );
                }

                return matchingGroups.map((group) => (
                  <div key={group.id} className="space-y-1.5">
                    <div className="font-mono-stamp text-[9px] font-bold uppercase tracking-wider text-[#b8b4a8] px-1">
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
                            className={`organic-slap-btn px-2.5 py-1 font-display-slap text-xs uppercase tracking-tight cursor-pointer border-2 ${
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

      {/* RIGHT RAIL: Vertical Stack of Small Organic Sticker Icons */}
      <aside
        aria-label="Map and Pole quick actions"
        className="pointer-events-none fixed top-3 right-3 z-30 flex flex-col items-center gap-2"
      >
        <div className="pointer-events-auto flex flex-col items-center gap-2 p-1.5 rounded-[22px_18px_24px_16px] bg-[#14171c]/75 backdrop-blur-xs border border-white/15">
          {/* 1. Switch Map <-> Pole Feed */}
          <button
            type="button"
            onClick={() =>
              setViewMode((v) => (v === 'map' ? 'list' : 'map'))
            }
            aria-label={
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
            className="organic-slap-btn w-10 h-10 flex items-center justify-center bg-[#ffe600] text-[#0d0e11] border-2 border-[#0d0e11] outline-1 outline-[#f4f1ea] cursor-pointer"
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
            style={
              {
                '--slap-rot': '-6deg',
                '--slap-radius': '53% 47% 46% 54% / 47% 53% 47% 53%',
              } as React.CSSProperties
            }
            className={`organic-slap-btn relative w-9 h-9 flex items-center justify-center border-2 cursor-pointer ${
              selectedDate
                ? 'bg-[#ff5500] text-white border-[#f4f1ea]'
                : 'bg-[#1d2128] hover:bg-[#282d37] text-[#f4f1ea] border-[#f4f1ea]/80'
            }`}
          >
            <CalendarIcon aria-hidden="true" className="w-4 h-4" />
            {selectedDate && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#ffe600] border border-[#0d0e11]" />
            )}
          </button>

          {/* 3. Saved Sticker Stash Drawer Button */}
          <button
            type="button"
            onClick={() => {
              setAgendaInitialTab('saved');
              setAgendaDrawerOpen(true);
            }}
            aria-label={`Open Saved Sticker Stash (${savedEventIds.length} saved)`}
            style={
              {
                '--slap-rot': '4deg',
                '--slap-radius': '46% 54% 50% 50% / 52% 48% 52% 48%',
              } as React.CSSProperties
            }
            className={`organic-slap-btn relative w-9 h-9 flex items-center justify-center border-2 cursor-pointer ${
              savedEventIds.length > 0
                ? 'bg-[#ff2a85] text-white border-[#f4f1ea]'
                : 'bg-[#1d2128] hover:bg-[#282d37] text-[#f4f1ea] border-[#f4f1ea]/80'
            }`}
          >
            <Bookmark aria-hidden="true" className="w-4 h-4" />
            {savedEventIds.length > 0 && (
              <span className="absolute -top-1 -right-1 px-1 rounded-full bg-[#ffe600] text-[#0d0e11] border border-[#0d0e11] font-mono-stamp text-[8px] font-bold leading-tight">
                {savedEventIds.length}
              </span>
            )}
          </button>

          {/* 4. GPS Near Me Icon Button */}
          <button
            type="button"
            onClick={handleNearMe}
            aria-label="Center on my GPS location"
            style={
              {
                '--slap-rot': '-4deg',
                '--slap-radius': '52% 48% 46% 54% / 48% 52% 48% 52%',
              } as React.CSSProperties
            }
            className={`organic-slap-btn w-9 h-9 flex items-center justify-center border-2 cursor-pointer ${
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

          {/* Expanded Secondary Tools (Surface Cycle, Share, Refresh) */}
          {moreToolsOpen && (
            <div className="flex flex-col items-center gap-2 pt-1 border-t border-white/15 animate-fade-in">
              {viewMode === 'map' && (
                <button
                  type="button"
                  onClick={() =>
                    setMapStyle((s) =>
                      s === 'neon'
                        ? 'midnight'
                        : s === 'midnight'
                          ? 'daylight'
                          : 'neon'
                    )
                  }
                  aria-label={`Switch map surface style (current: ${mapStyle})`}
                  style={
                    {
                      '--slap-rot': '3deg',
                      '--slap-radius': '8px 4px 9px 5px',
                    } as React.CSSProperties
                  }
                  className="organic-slap-btn w-9 h-7 flex items-center justify-center bg-[#f4f1ea] text-[#0d0e11] border border-[#0d0e11] font-mono-stamp text-[8px] font-bold uppercase cursor-pointer"
                >
                  {mapStyle === 'daylight'
                    ? 'LGT'
                    : mapStyle === 'midnight'
                      ? 'DRK'
                      : 'STL'}
                </button>
              )}

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
                aria-label="Share current view link"
                style={
                  {
                    '--slap-rot': '-5deg',
                    '--slap-radius': '50%',
                  } as React.CSSProperties
                }
                className="organic-slap-btn w-8 h-8 flex items-center justify-center bg-[#1d2128] text-[#f4f1ea] border border-[#f4f1ea]/60 cursor-pointer"
              >
                {shareBarCopied ? (
                  <Check
                    aria-hidden="true"
                    className="w-3.5 h-3.5 text-[#22c55e]"
                  />
                ) : (
                  <Share2 aria-hidden="true" className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => loadCity(activeCity, true)}
                aria-label="Refresh city events"
                style={
                  {
                    '--slap-rot': '4deg',
                    '--slap-radius': '50%',
                  } as React.CSSProperties
                }
                className="organic-slap-btn w-8 h-8 flex items-center justify-center bg-[#1d2128] text-[#d5d2c8] border border-[#f4f1ea]/60 cursor-pointer"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#ffe600]' : ''}`}
                />
              </button>
            </div>
          )}

          {/* 5. Bottom Chevron Expand/Collapse Pill */}
          <button
            type="button"
            onClick={() => setMoreToolsOpen((v) => !v)}
            aria-label={moreToolsOpen ? 'Hide extra tools' : 'More tools'}
            aria-expanded={moreToolsOpen}
            className="w-7 h-5 flex items-center justify-center text-[#d5d2c8] hover:text-white cursor-pointer"
          >
            {moreToolsOpen ? (
              <ChevronUp aria-hidden="true" className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown aria-hidden="true" className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </aside>

      {/* BOTTOM-LEFT MICRO ATTRIBUTION WATERMARK */}
      <footer className="pointer-events-auto fixed bottom-1.5 left-2.5 z-20 font-mono-stamp text-[9px] text-[#d5d2c8]/55 hover:text-[#f4f1ea] transition-colors flex items-center gap-1">
        <a
          href={citySourceAttribution.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {citySourceAttribution.text}
        </a>
        <span>•</span>
        <a
          href="https://openfreemap.org"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          OpenFreeMap
        </a>
      </footer>

      {/* INTERACTIVE MONTH CALENDAR MODAL */}
      <EventCalendarModal
        isOpen={calendarModalOpen}
        selectedDate={selectedDate}
        cityName={cityMeta.name}
        events={events}
        coverageStart={feedMeta?.coverageStart}
        coverageEnd={feedMeta?.coverageEnd}
        onSelectDate={handleSelectDate}
        onClose={() => setCalendarModalOpen(false)}
      />

      {/* DAY SCHEDULE & SAVED STICKER STASH DRAWER */}
      <DayAgendaDrawer
        isOpen={agendaDrawerOpen}
        initialTab={agendaInitialTab}
        cityName={cityMeta.name}
        selectedDate={selectedDate}
        events={filteredEvents}
        savedEventIds={savedEventIds}
        allSavedEvents={allSavedEvents}
        unresolvedSavedIds={unresolvedSavedIds}
        resolvingSavedIds={savedLoading}
        onToggleSaveEvent={handleToggleSaveEvent}
        onSelectEvent={handleSelectSingleEvent}
        onClose={() => setAgendaDrawerOpen(false)}
      />

      {/* 9:16 VERTICAL STREET FLYER / STORY PLAYER MODAL */}
      <StoryPlayerModal
        venueGroup={selectedVenueGroup}
        initialEventId={deepLinkedEventId}
        selectedDate={selectedDate}
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
