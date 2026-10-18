import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Flame,
  Box,
  LocateFixed,
  RefreshCw,
  Search,
  Sparkles,
  Share2,
  Database,
  Radio,
  Check,
  MapPin,
  Calendar as CalendarIcon,
  Bookmark,
  Ticket,
  X,
  Map as MapIcon,
  LayoutList,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { CITIES, CITY_LIST, TOPICS } from './config/cities';
import {
  CityId,
  MapStyleId,
  NormalizedEvent,
  TimeFilter,
  TopicCategory,
  VenueStoryGroup,
  ViewMode,
} from './types/linkedEvents';
import {
  fetchCityEvents,
  groupEventsByVenue,
} from './services/linkedEventsClient';
import {
  buildUpcomingDaysStrip,
  doesEventOccurOnDate,
  parseDateKey,
} from './utils/calendarUtils';
import {
  calculateDistanceKm,
  formatDistance,
} from './utils/distanceUtils';
import {
  CC_BY_4_URL,
  LINKED_EVENTS_CREDIT_TEXT,
} from './utils/licenseGuard';
import { SnapMap } from './components/Map/SnapMap';
import { StoryPlayerModal } from './components/Story/StoryPlayerModal';
import { EventCalendarModal } from './components/Calendar/EventCalendarModal';
import { DayAgendaDrawer } from './components/Agenda/DayAgendaDrawer';
import { EventListView } from './components/List/EventListView';

const SAVED_EVENTS_STORAGE_KEY = 'tarra_saved_event_ids_v1';
const LEGACY_SAVED_EVENTS_KEY = 'snapevents_saved_event_ids_v1';

function parseInitialParams(): {
  city: CityId;
  view: ViewMode;
  time: TimeFilter;
  date: string | null;
  topic: TopicCategory;
  freeOnly: boolean;
  eventId: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  const rawCity = (params.get('city') || 'turku').toLowerCase() as CityId;
  const city: CityId = rawCity in CITIES ? rawCity : 'helsinki';

  const rawView = (params.get('view') || 'map').toLowerCase();
  const view: ViewMode = rawView === 'list' ? 'list' : 'map';

  const dateParam = params.get('date');
  const validDate =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;

  const rawTime = (params.get('time') || 'all').toLowerCase() as TimeFilter;
  const validTimes: TimeFilter[] = [
    'all',
    'live',
    'tonight',
    'weekend',
    'custom-date',
  ];
  const time: TimeFilter = validDate
    ? 'custom-date'
    : validTimes.includes(rawTime)
      ? rawTime
      : 'all';

  const rawTopic = (params.get('topic') || 'all').toLowerCase() as TopicCategory;
  const validTopics = TOPICS.map((t) => t.id);
  const topic: TopicCategory = validTopics.includes(rawTopic)
    ? rawTopic
    : 'all';

  const freeOnly = params.get('free') === '1';
  const eventId = params.get('event') || null;
  return { city, view, time, date: validDate, topic, freeOnly, eventId };
}

export const App: React.FC = () => {
  const initial = useMemo(() => parseInitialParams(), []);

  const [activeCity, setActiveCity] = useState<CityId>(initial.city);
  const [viewMode, setViewMode] = useState<ViewMode>(initial.view);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(initial.time);
  const [selectedDate, setSelectedDate] = useState<string | null>(initial.date);
  const [topicFilter, setTopicFilter] = useState<TopicCategory>(initial.topic);
  const [freeOnly, setFreeOnly] = useState<boolean>(initial.freeOnly);
  const [searchQuery, setSearchQuery] = useState('');

  const [showDateStrip, setShowDateStrip] = useState<boolean>(
    Boolean(initial.date)
  );
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [agendaDrawerOpen, setAgendaDrawerOpen] = useState(false);

  const [mapStyle, setMapStyle] = useState<MapStyleId>('neon');
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [show3DBuildings, setShow3DBuildings] = useState(true);
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
  const [dataSourceType, setDataSourceType] = useState<
    'live-api' | 'indexeddb-cache' | 'static-feed' | 'offline-fallback'
  >('live-api');
  const [loading, setLoading] = useState(true);

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
  >({});

  const [selectedVenueGroup, setSelectedVenueGroup] =
    useState<VenueStoryGroup | null>(null);
  const [deepLinkedEventId, setDeepLinkedEventId] = useState<string | null>(
    initial.eventId
  );

  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null
  );
  const [locating, setLocating] = useState(false);
  const [shareBarCopied, setShareBarCopied] = useState(false);

  // Sync application state into URL Search Params
  const syncUrlParams = useCallback(
    (
      city: CityId,
      view: ViewMode,
      time: TimeFilter,
      date: string | null,
      topic: TopicCategory,
      free: boolean,
      eventId: string | null
    ) => {
      const params = new URLSearchParams();
      params.set('city', city);
      if (view === 'list') params.set('view', 'list');
      if (date) {
        params.set('date', date);
      } else if (time !== 'all') {
        params.set('time', time);
      }
      if (topic !== 'all') params.set('topic', topic);
      if (free) params.set('free', '1');
      if (eventId) params.set('event', eventId);

      const newRelativeUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, '', newRelativeUrl);
    },
    []
  );

  // Load base city events
  const loadCity = useCallback(
    async (cityId: CityId, forceRefresh = false) => {
      setLoading(true);
      try {
        const result = await fetchCityEvents(cityId, forceRefresh, null);
        setBaseCityEvents(result.events);
        setDataSourceType(result.source);
      } catch (err) {
        console.error('[tarra] Failed to load events for', cityId, err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadCity(activeCity);
  }, [activeCity, loadCity]);

  // When a specific calendar date is chosen, also fetch date-targeted events
  useEffect(() => {
    if (!selectedDate) {
      setDateSpecificEvents([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchCityEvents(activeCity, false, selectedDate)
      .then((res) => {
        if (!cancelled) {
          setDateSpecificEvents(res.events);
          setDataSourceType(res.source);
        }
      })
      .catch((err) => {
        console.warn('[tarra] Date-specific fetch warning:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCity, selectedDate]);

  // Merge base city events + date-specific events AND dynamically compute distanceKm
  const events = useMemo(() => {
    const refCoords = userLocation || CITIES[activeCity].coordinates;
    const map = new Map<string, NormalizedEvent>();

    for (const ev of baseCityEvents) {
      map.set(ev.id, {
        ...ev,
        distanceKm: calculateDistanceKm(refCoords, ev.coordinates),
      });
    }
    for (const ev of dateSpecificEvents) {
      map.set(ev.id, {
        ...ev,
        distanceKm: calculateDistanceKm(refCoords, ev.coordinates),
      });
    }
    return Array.from(map.values());
  }, [baseCityEvents, dateSpecificEvents, userLocation, activeCity]);

  useEffect(() => {
    if (events.length === 0) return;
    setSavedEventsCache((prev) => {
      const next = { ...prev };
      for (const ev of events) {
        next[ev.id] = ev;
      }
      return next;
    });
  }, [events]);

  const handleToggleSaveEvent = useCallback((eventId: string) => {
    setSavedEventIds((prev) => {
      const exists = prev.includes(eventId);
      const next = exists
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId];
      try {
        localStorage.setItem(SAVED_EVENTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  }, []);

  const allSavedEvents = useMemo(() => {
    return savedEventIds
      .map((id) => savedEventsCache[id])
      .filter((e): e is NormalizedEvent => Boolean(e))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [savedEventIds, savedEventsCache]);

  // Filter events by calendar date, time preset, topic, freeOnly, and search query
  const filteredEvents = useMemo(() => {
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

      if (topicFilter !== 'all' && ev.category !== topicFilter) {
        return false;
      }
      if (freeOnly && !ev.isFree) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          ev.title.toLowerCase().includes(q) ||
          ev.venueName.toLowerCase().includes(q) ||
          ev.streetAddress.toLowerCase().includes(q) ||
          ev.shortDescription.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [events, selectedDate, timeFilter, topicFilter, freeOnly, searchQuery]);

  // 14-day quick-pick strip annotated with counts
  const upcomingDaysStrip = useMemo(
    () => buildUpcomingDaysStrip(14, events),
    [events]
  );

  // Group filtered events into Venue Sticker Groups
  const venueGroups = useMemo(
    () => groupEventsByVenue(filteredEvents),
    [filteredEvents]
  );

  const allVenueGroups = useMemo(() => groupEventsByVenue(events), [events]);

  // Automatically open Flyer Player if ?event=... is present in URL on initial load
  useEffect(() => {
    if (!deepLinkedEventId || events.length === 0) return;
    const matchingGroup = allVenueGroups.find((vg) =>
      vg.events.some((e) => e.id === deepLinkedEventId)
    );
    if (matchingGroup) {
      setSelectedVenueGroup(matchingGroup);
    }
  }, [deepLinkedEventId, events, allVenueGroups]);

  // Keep URL query params updated
  useEffect(() => {
    syncUrlParams(
      activeCity,
      viewMode,
      timeFilter,
      selectedDate,
      topicFilter,
      freeOnly,
      deepLinkedEventId
    );
  }, [
    activeCity,
    viewMode,
    timeFilter,
    selectedDate,
    topicFilter,
    freeOnly,
    deepLinkedEventId,
    syncUrlParams,
  ]);

  const handleCitySelect = (cityId: CityId) => {
    setSelectedVenueGroup(null);
    setDeepLinkedEventId(null);
    setFocusCoordinates(null);
    setHighlightedVenueId(null);
    setActiveCity(cityId);
  };

  const handleSelectDate = useCallback((dateKey: string | null) => {
    setSelectedDate(dateKey);
    if (dateKey) {
      setTimeFilter('custom-date');
      setShowDateStrip(true);
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
        allVenueGroups.find((vg) => vg.events.some((e) => e.id === ev.id)) ||
        groupEventsByVenue([ev])[0];
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
    async (event?: NormalizedEvent): Promise<boolean> => {
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
      if (event) params.set('event', event.id);

      const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        return true;
      } catch {
        return false;
      }
    },
    [activeCity, viewMode, selectedDate, timeFilter, topicFilter, freeOnly]
  );

  const handleNearMe = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const coords: [number, number] = [
          pos.coords.longitude,
          pos.coords.latitude,
        ];
        setUserLocation(coords);

        let nearestCity: CityId = activeCity;
        let minDistance = Infinity;
        for (const city of CITY_LIST) {
          const dx = city.coordinates[0] - coords[0];
          const dy = city.coordinates[1] - coords[1];
          const dist = Math.hypot(dx, dy);
          if (dist < minDistance) {
            minDistance = dist;
            nearestCity = city.id;
          }
        }
        if (nearestCity !== activeCity) {
          setActiveCity(nearestCity);
        }
      },
      () => {
        setLocating(false);
        setUserLocation(CITIES[activeCity].coordinates);
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
    const nextGroup = venueGroups[(idx + 1) % venueGroups.length];
    handleOpenVenueGroup(nextGroup);
  }, [selectedVenueGroup, venueGroups, handleCloseModal, handleOpenVenueGroup]);

  const handlePrevVenue = useCallback(() => {
    if (!selectedVenueGroup || venueGroups.length <= 1) return;
    const idx = venueGroups.findIndex(
      (g) => g.venueId === selectedVenueGroup.venueId
    );
    const prevGroup =
      venueGroups[(idx - 1 + venueGroups.length) % venueGroups.length];
    handleOpenVenueGroup(prevGroup);
  }, [selectedVenueGroup, venueGroups, handleOpenVenueGroup]);

  const liveCount = useMemo(
    () => filteredEvents.filter((e) => e.isLiveNow).length,
    [filteredEvents]
  );

  const cityMeta = CITIES[activeCity];

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return null;
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
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
    <div className="flex flex-col w-full max-w-full h-dvh overflow-hidden bg-[#121417] text-[#f5f3eb] select-none">
      {/* =====================================================================
          TOP STREET-POLE HEADER BAR (Never overlaps map or list content)
          ===================================================================== */}
      <header className="shrink-0 w-full max-w-full min-w-0 z-30 bg-[#15181e] border-b-[2.5px] border-[#f4f1ea] shadow-[0_6px_20px_rgba(0,0,0,0.75)]">
        {/* ROW 1: Brand Slap + View Mode Toggle + 6-City Street Plates + Search/Stash/GPS */}
        <div className="px-2.5 sm:px-4 py-1.5 sm:py-2 flex flex-wrap items-center justify-between gap-2 border-b border-white/15">
          {/* Left: TARRA Brand Sticker + View Switcher */}
          <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3 w-full sm:w-auto">
            {/* Die-cut TARRA Brand Logo Slap */}
            <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 rounded-md bg-[#ffe600] text-[#0d0e11] border-2 border-[#0d0e11] outline-2 outline-[#f4f1ea] shadow-[3px_3px_0px_#07080a] -rotate-1 shrink-0">
              <h1 className="font-display-slap text-base sm:text-lg uppercase tracking-tight leading-none">
                tarra
              </h1>
              <span className="px-1.5 py-[1px] rounded-xs bg-[#0d0e11] text-[#ffe600] font-mono-stamp text-[9px] font-bold uppercase tracking-tighter flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff2a85] animate-ping" />
                {liveCount} LIVE
              </span>
            </div>

            {/* Source / Count Metadata Stamp (visible on xl screens) */}
            <div className="hidden xl:flex flex-col font-mono-stamp text-[10px] text-[#b8b4a8] leading-tight">
              <span className="flex items-center gap-1 text-[#f4f1ea] font-bold">
                {dataSourceType === 'live-api' ? (
                  <>
                    <Radio className="w-3 h-3 text-[#22c55e]" />
                    <span>6AIKA LIVE</span>
                  </>
                ) : dataSourceType === 'indexeddb-cache' ? (
                  <>
                    <Database className="w-3 h-3 text-[#ffe600]" />
                    <span>IDB CACHE</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 text-[#ff5500]" />
                    <span>CITY FEED</span>
                  </>
                )}
              </span>
              <span>
                {filteredEvents.length} slaps • {venueGroups.length} spots
              </span>
            </div>

            {/* Dedicated MAP vs POLE FEED Switcher */}
            <div
              role="tablist"
              aria-label="Switch between Street Map and Pole Feed"
              className="flex items-center p-0.5 rounded-lg bg-[#0d0e11] border-2 border-[#f4f1ea] shadow-[2px_3px_0px_#07080a] shrink-0"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'map'}
                onClick={() => setViewMode('map')}
                className={`px-2.5 py-1 rounded-md font-grotesk text-xs font-extrabold uppercase tracking-tight transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'map'
                    ? 'bg-[#ffe600] text-[#0d0e11] shadow'
                    : 'text-[#d5d2c8] hover:text-white'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Map</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'list'}
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1 rounded-md font-grotesk text-xs font-extrabold uppercase tracking-tight transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'list'
                    ? 'bg-[#ffe600] text-[#0d0e11] shadow'
                    : 'text-[#d5d2c8] hover:text-white'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span>Pole ({filteredEvents.length})</span>
              </button>
            </div>
          </div>

          {/* Center: 6-City Street Sign Switcher */}
          <nav
            aria-label="6-City Switcher"
            className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-fade-right max-w-full min-w-0 py-0.5 order-3 lg:order-2 w-full lg:w-auto"
          >
            {CITY_LIST.map((c) => {
              const isSelected = c.id === activeCity;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleCitySelect(c.id)}
                  className={`px-2.5 py-1 rounded-md font-grotesk text-xs font-extrabold uppercase tracking-tight transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 border shrink-0 ${
                    isSelected
                      ? `${c.badgeColor} border-[#0d0e11] outline-2 outline-[#f4f1ea] shadow-[2px_2px_0px_#07080a]`
                      : 'bg-[#111317] text-[#c7c4b8] border-white/15 hover:border-white/40 hover:text-white'
                  }`}
                >
                  <span>{c.name}</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSelected
                        ? 'bg-current'
                        : c.dataMechanism === 'live-api'
                          ? 'bg-[#22c55e]'
                          : 'bg-[#ffe600]'
                    }`}
                  />
                </button>
              );
            })}
          </nav>

          {/* Right: Search Input + Saved Stash + GPS + Share + Refresh */}
          <div className="flex items-center gap-1.5 order-2 lg:order-3 w-full sm:w-auto min-w-0">
            {/* Search Input */}
            <div className="relative flex items-center flex-1 sm:flex-initial min-w-0">
              <Search className="w-3.5 h-3.5 text-[#a8a498] absolute left-2.5 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${cityMeta.name}...`}
                aria-label={`Search events in ${cityMeta.name}`}
                className="pl-7 pr-2.5 py-1 rounded-md bg-[#0d0e11] border border-[#f4f1ea]/40 font-mono-stamp text-xs text-[#f4f1ea] placeholder:text-[#8a867a] focus:outline-none focus:border-[#ffe600] w-full sm:w-40 min-w-0"
              />
            </div>

            {/* Saved Stash / Schedule Drawer Button */}
            <button
              type="button"
              onClick={() => setAgendaDrawerOpen(true)}
              className="px-2.5 py-1 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-[#f4f1ea]/50 font-grotesk text-xs font-extrabold uppercase tracking-tight text-[#f4f1ea] flex items-center gap-1 cursor-pointer shadow-[2px_2px_0px_#07080a] shrink-0"
              title="Open Saved Sticker Stash & Day Schedule"
            >
              <Bookmark className="w-3.5 h-3.5 text-[#ff2a85]" />
              <span className="hidden sm:inline">Stash</span>
              {savedEventIds.length > 0 && (
                <span className="px-1.5 py-[1px] rounded-xs bg-[#ff2a85] font-mono-stamp text-[10px] font-bold text-white">
                  {savedEventIds.length}
                </span>
              )}
            </button>

            {/* GPS Near Me */}
            <button
              type="button"
              onClick={handleNearMe}
              title="Use My GPS Location for Near Me & Event Distances"
              className={`px-2 py-1 rounded-md border font-mono-stamp text-[11px] font-bold uppercase cursor-pointer flex items-center gap-1 shadow-[2px_2px_0px_#07080a] shrink-0 ${
                userLocation
                  ? 'bg-[#22c55e] border-[#0d0e11] text-[#0d0e11]'
                  : 'bg-[#22262e] hover:bg-[#2e333d] border-[#f4f1ea]/40 text-[#ffe600]'
              }`}
            >
              <LocateFixed
                className={`w-3.5 h-3.5 ${locating ? 'animate-spin' : ''}`}
              />
              <span className="hidden md:inline">
                {userLocation ? 'GPS ON' : 'GPS'}
              </span>
            </button>

            {/* Share View URL */}
            <button
              type="button"
              onClick={async () => {
                const ok = await handleShareDeepLink();
                if (ok) {
                  setShareBarCopied(true);
                  setTimeout(() => setShareBarCopied(false), 2200);
                }
              }}
              className="p-1.5 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-white/20 text-[#f4f1ea] cursor-pointer shrink-0"
              title="Copy shareable link for current view"
              aria-label="Share current view link"
            >
              {shareBarCopied ? (
                <Check className="w-3.5 h-3.5 text-[#22c55e]" />
              ) : (
                <Share2 className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Refresh Feed */}
            <button
              type="button"
              onClick={() => loadCity(activeCity, true)}
              title="Refresh City Feed"
              aria-label="Refresh City Feed"
              className="p-1.5 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-white/20 text-[#d5d2c8] cursor-pointer shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#ffe600]' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* ROW 2: Coherent Single-Row Scrollable Sticker Filter Bar (Time + Calendar + Categories + Free + Map Controls) */}
        <div className="px-2.5 sm:px-4 py-1.5 bg-[#111317] flex items-center justify-between gap-2 overflow-x-auto no-scrollbar scroll-fade-right">
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Time Presets */}
            {(
              [
                { id: 'all', label: 'All Dates' },
                { id: 'live', label: '🔥 Live' },
                { id: 'tonight', label: '🌙 Tonight' },
                { id: 'weekend', label: '🎉 Weekend' },
              ] as const
            ).map((tf) => {
              const active = !selectedDate && timeFilter === tf.id;
              return (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => {
                    setSelectedDate(null);
                    setTimeFilter(tf.id);
                  }}
                  className={`px-2 py-0.5 rounded-sm font-mono-stamp text-[11px] font-bold uppercase transition-all cursor-pointer whitespace-nowrap border ${
                    active
                      ? 'bg-[#ff5500] text-white border-[#f4f1ea] shadow-[2px_2px_0px_#07080a]'
                      : 'bg-[#1a1d23] text-[#c7c4b8] border-white/15 hover:text-white'
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}

            {/* Calendar Modal Trigger */}
            <button
              type="button"
              onClick={() => setCalendarModalOpen(true)}
              className={`px-2 py-0.5 rounded-sm font-mono-stamp text-[11px] font-bold uppercase transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 border ${
                selectedDate
                  ? 'bg-[#ffe600] text-[#0d0e11] border-[#0d0e11] outline-1 outline-[#f4f1ea] shadow-[2px_2px_0px_#07080a]'
                  : 'bg-[#1a1d23] hover:bg-[#262b34] border-[#ffe600]/50 text-[#ffe600]'
              }`}
              title="Open Month Calendar"
            >
              <CalendarIcon className="w-3 h-3" />
              <span>{selectedDateLabel || 'Date'}</span>
            </button>

            {selectedDate && (
              <button
                type="button"
                onClick={() => handleSelectDate(null)}
                aria-label="Clear selected calendar date"
                className="p-0.5 rounded-sm bg-[#ff2a85] text-white cursor-pointer"
                title="Clear date filter"
              >
                <X className="w-3 h-3" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowDateStrip((s) => !s)}
              className={`px-1.5 py-0.5 rounded-sm font-mono-stamp text-[10px] font-bold uppercase transition-colors cursor-pointer border ${
                showDateStrip
                  ? 'bg-[#f4f1ea] text-[#0d0e11] border-[#0d0e11]'
                  : 'bg-[#1a1d23] text-[#a8a498] border-white/15 hover:text-white'
              }`}
              title="Toggle 14-day quick strip"
            >
              14d
            </button>

            <div className="h-4 w-[2px] bg-white/15 mx-0.5 shrink-0" />

            {/* Topic Category Slaps */}
            {TOPICS.map((topic) => {
              const active = topicFilter === topic.id;
              return (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => setTopicFilter(topic.id)}
                  className={`px-2 py-0.5 rounded-sm font-grotesk text-[11px] font-bold uppercase tracking-tight transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 border ${
                    active
                      ? 'border-[#0d0e11] outline-1 outline-[#f4f1ea] shadow-[2px_2px_0px_#07080a]'
                      : 'bg-[#1a1d23] text-[#c7c4b8] border-white/15 hover:text-white'
                  }`}
                  style={
                    active
                      ? {
                          backgroundColor: topic.slapBg,
                          color: topic.slapText,
                        }
                      : undefined
                  }
                >
                  <span>{topic.emoji}</span>
                  <span>{topic.label}</span>
                </button>
              );
            })}

            {/* Free Admission Stamp Toggle */}
            <button
              type="button"
              onClick={() => setFreeOnly((f) => !f)}
              className={`px-2 py-0.5 rounded-sm font-mono-stamp text-[11px] font-bold uppercase transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 border shrink-0 ${
                freeOnly
                  ? 'bg-[#22c55e] text-[#0d0e11] border-[#0d0e11] outline-1 outline-[#f4f1ea] shadow-[2px_2px_0px_#07080a]'
                  : 'bg-[#1a1d23] text-[#22c55e] border-[#22c55e]/40 hover:bg-[#22c55e]/15'
              }`}
              title="Show only free admission events"
            >
              <Ticket className="w-3 h-3" />
              <span>Free</span>
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="px-2 py-0.5 rounded-sm bg-[#ff2a85] text-white font-mono-stamp text-[10px] font-bold uppercase whitespace-nowrap cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          {/* Map-specific surface & layer toggles (compact right side) */}
          {viewMode === 'map' && (
            <div className="flex items-center gap-1 shrink-0 pl-2 border-l border-white/15">
              {(
                [
                  { id: 'midnight', label: 'Asphalt' },
                  { id: 'neon', label: 'Steel' },
                  { id: 'daylight', label: 'Concrete' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setMapStyle(st.id)}
                  className={`px-2 py-0.5 rounded-sm font-mono-stamp text-[10px] font-bold uppercase transition-colors cursor-pointer whitespace-nowrap border ${
                    mapStyle === st.id
                      ? 'bg-[#f4f1ea] text-[#0d0e11] border-[#0d0e11]'
                      : 'bg-[#1a1d23] text-[#b8b4a8] border-white/15 hover:text-white'
                  }`}
                >
                  {st.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setShowHeatmap((v) => !v)}
                title="Toggle Thermal Heatmap Layer"
                className={`p-1 rounded-sm border transition-colors cursor-pointer ${
                  showHeatmap
                    ? 'bg-[#ff5500] border-[#f4f1ea] text-white'
                    : 'bg-[#1a1d23] border-white/15 text-[#9e9a8e] hover:text-white'
                }`}
              >
                <Flame className="w-3 h-3" />
              </button>

              <button
                type="button"
                onClick={() => setShow3DBuildings((v) => !v)}
                title="Toggle 3D Extruded Buildings (zoom >= 14.5)"
                className={`p-1 rounded-sm border transition-colors cursor-pointer ${
                  show3DBuildings
                    ? 'bg-[#ffe600] border-[#0d0e11] text-[#0d0e11]'
                    : 'bg-[#1a1d23] border-white/15 text-[#9e9a8e] hover:text-white'
                }`}
              >
                <Box className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* ROW 3 (Collapsible): 14-Day Horizontal Quick-Pick Date Sticker Strip */}
        {showDateStrip && (
          <div className="px-2.5 sm:px-4 py-1.5 bg-[#0d0e11] border-t border-white/15 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-fade-right animate-fade-in">
            <button
              type="button"
              onClick={() => setCalendarModalOpen(true)}
              className="shrink-0 px-2.5 py-1 rounded-sm bg-[#ffe600] text-[#0d0e11] font-mono-stamp text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer"
            >
              <CalendarIcon className="w-3 h-3" />
              <span>Month</span>
            </button>

            {upcomingDaysStrip.map((dayItem) => {
              const isSelected = selectedDate === dayItem.dateKey;
              return (
                <button
                  key={dayItem.dateKey}
                  type="button"
                  onClick={() =>
                    handleSelectDate(isSelected ? null : dayItem.dateKey)
                  }
                  className={`shrink-0 px-2.5 py-0.5 rounded-sm border text-left transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[#ffe600] text-[#0d0e11] border-[#f4f1ea] font-black shadow-[2px_2px_0px_#07080a]'
                      : 'bg-[#181b20] hover:bg-[#22262e] border-white/15 text-[#f4f1ea]'
                  }`}
                >
                  <div>
                    <div className="font-mono-stamp text-[9px] font-bold uppercase leading-tight">
                      {dayItem.weekdayShort}
                    </div>
                    <div
                      className={`font-grotesk text-[10px] font-bold leading-tight ${
                        isSelected ? 'text-[#0d0e11]' : 'text-[#c7c4b8]'
                      }`}
                    >
                      {dayItem.dayMonthLabel}
                    </div>
                  </div>
                  <span
                    className={`px-1 py-[1px] rounded-xs font-mono-stamp text-[9px] font-bold ${
                      isSelected
                        ? 'bg-[#0d0e11] text-[#ffe600]'
                        : dayItem.eventCount > 0
                          ? 'bg-[#262b33] text-[#ffe600]'
                          : 'bg-white/5 text-[#68665e]'
                    }`}
                  >
                    {dayItem.eventCount}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* =====================================================================
          MAIN VIEWPORT AREA (Map View OR Pole Sticker Feed View)
          ===================================================================== */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden">
        {viewMode === 'map' ? (
          <>
            <SnapMap
              activeCity={activeCity}
              venueGroups={venueGroups}
              selectedVenueId={
                selectedVenueGroup?.venueId || highlightedVenueId
              }
              focusCoordinates={focusCoordinates}
              mapStyle={mapStyle}
              show3DBuildings={show3DBuildings}
              showHeatmap={showHeatmap}
              userLocation={userLocation}
              onSelectVenueGroup={handleOpenVenueGroup}
            />

            {/* Collapsible Bottom Pole Sticker Dock in Map View */}
            <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 px-2.5 sm:px-4 flex flex-col items-start gap-1.5">
              {/* Toggle Pill for Bottom Sticker Strip */}
              <div className="pointer-events-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDockCollapsed((c) => !c)}
                  className="px-2.5 py-1 rounded-md bg-[#121418] border-2 border-[#f4f1ea] shadow-[2px_3px_0px_#07080a] font-mono-stamp text-[10px] font-bold uppercase text-[#ffe600] flex items-center gap-1.5 cursor-pointer"
                >
                  <span>
                    {cityMeta.name} Pole Tray ({venueGroups.length} spots)
                  </span>
                  {dockCollapsed ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="px-2.5 py-1 rounded-md bg-[#ffe600] text-[#0d0e11] border-2 border-[#0d0e11] shadow-[2px_3px_0px_#07080a] font-grotesk text-[11px] font-extrabold uppercase tracking-tight flex items-center gap-1 cursor-pointer"
                >
                  <LayoutList className="w-3 h-3" />
                  <span>Open Full Pole Feed</span>
                </button>
              </div>

              {!dockCollapsed && (
                <div className="pointer-events-auto w-full flex items-center gap-2.5 overflow-x-auto no-scrollbar scroll-fade-right py-2 px-2.5 rounded-xl bg-[#14171c]/95 border-[2.5px] border-[#f4f1ea] shadow-[4px_5px_0px_#07080a]">
                  {venueGroups.length === 0 ? (
                    <div className="py-1.5 px-2 text-xs text-[#d5d2c8] flex items-center gap-2">
                      <span>
                        No event stickers match this filter in {cityMeta.name}.
                      </span>
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="px-2.5 py-1 rounded-md bg-[#ffe600] text-[#0d0e11] border border-[#0d0e11] font-mono-stamp font-bold text-[11px] uppercase cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    </div>
                  ) : (
                    venueGroups.slice(0, 24).map((vg) => {
                      const lead = vg.events[0];
                      const topicMeta =
                        TOPICS.find((t) => t.id === vg.topCategory) ||
                        TOPICS[0];
                      return (
                        <button
                          key={vg.venueId}
                          type="button"
                          onClick={() => handleOpenVenueGroup(vg)}
                          className="group shrink-0 flex items-center gap-2.5 pr-3 pl-1.5 py-1 rounded-lg bg-[#1d2128] hover:bg-[#262b34] border-2 border-[#f4f1ea] shadow-[2px_3px_0px_#07080a] transition-transform hover:-translate-y-0.5 cursor-pointer text-left"
                        >
                          <div className="relative w-10 h-10 rounded-md border-2 border-[#0d0e11] bg-[#111317] overflow-hidden flex items-center justify-center shrink-0">
                            {vg.coverImageUrl ? (
                              <img
                                src={vg.coverImageUrl}
                                alt=""
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center text-base"
                                style={{
                                  backgroundColor: topicMeta.slapBg,
                                  color: topicMeta.slapText,
                                }}
                              >
                                {vg.topEmoji}
                              </div>
                            )}
                            {vg.hasLiveEvent && (
                              <span className="absolute bottom-0 inset-x-0 bg-[#ff2a85] font-mono-stamp text-[7px] font-bold uppercase text-center text-white leading-tight">
                                LIVE
                              </span>
                            )}
                          </div>
                          <div className="max-w-[140px]">
                            <p className="font-grotesk text-[11px] font-extrabold uppercase tracking-tight text-[#ffe600] truncate">
                              {vg.venueName}
                            </p>
                            <p className="text-[10px] text-[#f4f1ea] truncate">
                              {lead.title}
                            </p>
                            <p className="font-mono-stamp text-[9px] text-[#b8b4a8] font-bold flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5 text-[#ff2a85]" />
                              <span>
                                {formatDistance(vg.distanceKm)} •{' '}
                                {vg.events.length}{' '}
                                {vg.events.length === 1 ? 'slap' : 'slaps'}
                              </span>
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <EventListView
            activeCity={activeCity}
            events={filteredEvents}
            selectedDate={selectedDate}
            userLocation={userLocation}
            locating={locating}
            savedEventIds={savedEventIds}
            onRequestUserLocation={handleNearMe}
            onToggleSaveEvent={handleToggleSaveEvent}
            onPlayStory={handleSelectSingleEvent}
            onShowOnMap={handleShowEventOnMap}
            onResetFilters={resetAllFilters}
          />
        )}
      </div>

      {/* =====================================================================
          BOTTOM STENCIL ATTRIBUTION BAR (Mandatory 6Aika CC BY 4.0 & OpenFreeMap)
          ===================================================================== */}
      <footer className="shrink-0 w-full max-w-full min-w-0 overflow-hidden z-30 bg-[#0d0e11] border-t border-white/15 px-3 py-1 font-mono-stamp text-[10px] text-[#9e9a8e] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
          <span className="font-bold text-[#ffe600] shrink-0">TARRA</span>
          <span className="shrink-0">//</span>
          <span className="truncate min-w-0">{LINKED_EVENTS_CREDIT_TEXT}</span>
          <span className="shrink-0">•</span>
          <a
            href={CC_BY_4_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#ffe600] hover:underline font-bold shrink-0"
          >
            CC BY 4.0
          </a>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <span>
            Map:{' '}
            <a
              href="https://openfreemap.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#d5d2c8] hover:underline"
            >
              OpenFreeMap
            </a>{' '}
            & © OpenStreetMap
          </span>
        </div>
      </footer>

      {/* INTERACTIVE MONTH CALENDAR MODAL */}
      <EventCalendarModal
        isOpen={calendarModalOpen}
        selectedDate={selectedDate}
        cityName={cityMeta.name}
        events={events}
        onSelectDate={handleSelectDate}
        onClose={() => setCalendarModalOpen(false)}
      />

      {/* DAY SCHEDULE & SAVED STICKER STASH DRAWER */}
      <DayAgendaDrawer
        isOpen={agendaDrawerOpen}
        cityName={cityMeta.name}
        selectedDate={selectedDate}
        events={filteredEvents}
        savedEventIds={savedEventIds}
        allSavedEvents={allSavedEvents}
        onToggleSaveEvent={handleToggleSaveEvent}
        onSelectEvent={handleSelectSingleEvent}
        onClose={() => setAgendaDrawerOpen(false)}
      />

      {/* 9:16 VERTICAL STREET FLYER / STORY PLAYER MODAL */}
      <StoryPlayerModal
        venueGroup={selectedVenueGroup}
        initialEventId={deepLinkedEventId}
        savedEventIds={savedEventIds}
        onToggleSaveEvent={handleToggleSaveEvent}
        onClose={handleCloseModal}
        onActiveEventChange={handleActiveEventChange}
        onShareDeepLink={handleShareDeepLink}
        onNextVenue={handleNextVenue}
        onPrevVenue={handlePrevVenue}
      />
    </div>
  );
};

