import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
  doesEventOccurOnDate,
  parseDateKey,
} from './utils/calendarUtils';
import { calculateDistanceKm } from './utils/distanceUtils';
import { CC_BY_4_URL } from './utils/licenseGuard';
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

  // Snap Map-style ultra-minimal popover states (closed by default so < 5% screen is UI)
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterTrayOpen, setFilterTrayOpen] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);

  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [agendaDrawerOpen, setAgendaDrawerOpen] = useState(false);

  const [mapStyle, setMapStyle] = useState<MapStyleId>('neon');
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
    setCityPickerOpen(false);
  };

  const handleSelectDate = useCallback((dateKey: string | null) => {
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

  const cityMeta = CITIES[activeCity];
  const activeTopicMeta =
    TOPICS.find((t) => t.id === topicFilter) || TOPICS[0];

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return null;
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
        />
      ) : (
        <EventListView
          activeCity={activeCity}
          events={filteredEvents}
          savedEventIds={savedEventIds}
          onToggleSaveEvent={handleToggleSaveEvent}
          onPlayStory={handleSelectSingleEvent}
          onResetFilters={resetAllFilters}
        />
      )}

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

      {/* TOP-CENTER: Compact City Slap Pill (like "Snap Map" center header) */}
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
            <span className="text-xs leading-none">{activeTopicMeta.emoji}</span>
          )}
          {selectedDateLabel && (
            <span className="px-1.5 py-[1px] rounded-xs bg-[#0d0e11] text-[#ffe600] font-mono-stamp text-[9px] font-bold">
              {selectedDateLabel}
            </span>
          )}
          <ChevronDown aria-hidden="true" className="w-3.5 h-3.5 opacity-80" />
        </button>

        {/* Floating Chaotic 6-City Slap Picker */}
        {cityPickerOpen && (
          <nav
            aria-label="6-City Switcher"
            className="pointer-events-auto mt-2 p-2 rounded-[12px_5px_14px_6px] bg-[#14171c]/95 border-2 border-[#f4f1ea] shadow-[4px_5px_0px_#07080a] flex flex-wrap justify-center gap-1.5 max-w-[260px] animate-fade-in rotate-1"
          >
            {CITY_LIST.map((c, idx) => {
              const isSelected = c.id === activeCity;
              const angle = idx % 2 === 0 ? '-3deg' : '2.8deg';
              return (
                <button
                  key={c.id}
                  type="button"
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
          </nav>
        )}
      </div>

      {/* RIGHT RAIL: Vertical Stack of Small Organic Sticker Icons (Snap Map Style) */}
      <aside
        aria-label="Map and Pole quick actions"
        className="pointer-events-none fixed top-3 right-3 z-30 flex flex-col items-center gap-2"
      >
        <div className="pointer-events-auto flex flex-col items-center gap-2 p-1.5 rounded-[22px_18px_24px_16px] bg-[#14171c]/75 backdrop-blur-xs border border-white/15">
          {/* 1. Switch Map <-> Pole Feed (Hazard Yellow Icon Button, like Snap Map's yellow card icon) */}
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
            onClick={() => setAgendaDrawerOpen(true)}
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
                  const ok = await handleShareDeepLink();
                  if (ok) {
                    setShareBarCopied(true);
                    setTimeout(() => setShareBarCopied(false), 2200);
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
                  <Check aria-hidden="true" className="w-3.5 h-3.5 text-[#22c55e]" />
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

          {/* 5. Bottom Chevron Expand/Collapse Pill (Just like Snap Map's right rail chevron) */}
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

      {/* BOTTOM-LEFT MICRO ATTRIBUTION WATERMARK (No bar background, < 0.3% area) */}
      <footer className="pointer-events-auto fixed bottom-1.5 left-2.5 z-20 font-mono-stamp text-[9px] text-[#d5d2c8]/55 hover:text-[#f4f1ea] transition-colors flex items-center gap-1">
        <a
          href={CC_BY_4_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          6Aika CC BY 4.0
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
