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
  ListOrdered,
  Bookmark,
  Ticket,
  X,
} from 'lucide-react';
import { CITIES, CITY_LIST, TOPICS } from './config/cities';
import {
  CityId,
  MapStyleId,
  NormalizedEvent,
  TimeFilter,
  TopicCategory,
  VenueStoryGroup,
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
  CC_BY_4_URL,
  LINKED_EVENTS_CREDIT_TEXT,
} from './utils/licenseGuard';
import { SnapMap } from './components/Map/SnapMap';
import { StoryPlayerModal } from './components/Story/StoryPlayerModal';
import { EventCalendarModal } from './components/Calendar/EventCalendarModal';
import { DayAgendaDrawer } from './components/Agenda/DayAgendaDrawer';

const SAVED_EVENTS_STORAGE_KEY = 'snapevents_saved_event_ids_v1';

function parseInitialParams(): {
  city: CityId;
  time: TimeFilter;
  date: string | null;
  topic: TopicCategory;
  freeOnly: boolean;
  eventId: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  const rawCity = (params.get('city') || 'helsinki').toLowerCase() as CityId;
  const city: CityId = rawCity in CITIES ? rawCity : 'helsinki';

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
  return { city, time, date: validDate, topic, freeOnly, eventId };
}

export const App: React.FC = () => {
  const initial = useMemo(() => parseInitialParams(), []);

  const [activeCity, setActiveCity] = useState<CityId>(initial.city);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(initial.time);
  const [selectedDate, setSelectedDate] = useState<string | null>(initial.date);
  const [topicFilter, setTopicFilter] = useState<TopicCategory>(initial.topic);
  const [freeOnly, setFreeOnly] = useState<boolean>(initial.freeOnly);
  const [searchQuery, setSearchQuery] = useState('');

  const [showDateStrip, setShowDateStrip] = useState<boolean>(
    Boolean(initial.date)
  );
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [agendaDrawerOpen, setAgendaDrawerOpen] = useState(false);

  const [mapStyle, setMapStyle] = useState<MapStyleId>('neon');
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [show3DBuildings, setShow3DBuildings] = useState(true);

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
      const raw = localStorage.getItem(SAVED_EVENTS_STORAGE_KEY);
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

  // Sync application state into URL Search Params (?city=...&date=...&time=...&topic=...&free=1&event=...)
  const syncUrlParams = useCallback(
    (
      city: CityId,
      time: TimeFilter,
      date: string | null,
      topic: TopicCategory,
      free: boolean,
      eventId: string | null
    ) => {
      const params = new URLSearchParams();
      params.set('city', city);
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

  // Load base city events (for overview + month calendar badges)
  const loadCity = useCallback(
    async (cityId: CityId, forceRefresh = false) => {
      setLoading(true);
      try {
        const result = await fetchCityEvents(cityId, forceRefresh, null);
        setBaseCityEvents(result.events);
        setDataSourceType(result.source);
      } catch (err) {
        console.error('[App] Failed to load events for', cityId, err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadCity(activeCity);
  }, [activeCity, loadCity]);

  // When a specific calendar date is chosen, also fetch date-targeted events from 6Aika API
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
        console.warn('[App] Date-specific fetch warning:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCity, selectedDate]);

  // Merge base city events + date-specific events (deduplicated by ID)
  const events = useMemo(() => {
    const map = new Map<string, NormalizedEvent>();
    for (const ev of baseCityEvents) {
      map.set(ev.id, ev);
    }
    for (const ev of dateSpecificEvents) {
      map.set(ev.id, ev);
    }
    return Array.from(map.values());
  }, [baseCityEvents, dateSpecificEvents]);

  // Cache normalized event objects for any savedEventIds so Saved Lineup works across cities
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

  // Group filtered events into Venue Story Bubbles
  const venueGroups = useMemo(
    () => groupEventsByVenue(filteredEvents),
    [filteredEvents]
  );

  const allVenueGroups = useMemo(() => groupEventsByVenue(events), [events]);

  // Automatically open 9:16 Story Player if ?event=... is present in URL on initial load
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
      timeFilter,
      selectedDate,
      topicFilter,
      freeOnly,
      deepLinkedEventId
    );
  }, [
    activeCity,
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
        setDeepLinkedEventId(ev.id);
      }
    },
    [activeCity, allVenueGroups]
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
    [activeCity, selectedDate, timeFilter, topicFilter, freeOnly]
  );

  const handleNearMe = () => {
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
  };

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

  return (
    <div className="relative w-screen h-dvh overflow-hidden bg-slate-950 select-none">
      {/* FULL-SCREEN WEBGL SNAP MAP */}
      <SnapMap
        activeCity={activeCity}
        venueGroups={venueGroups}
        selectedVenueId={selectedVenueGroup?.venueId || null}
        mapStyle={mapStyle}
        show3DBuildings={show3DBuildings}
        showHeatmap={showHeatmap}
        userLocation={userLocation}
        onSelectVenueGroup={handleOpenVenueGroup}
      />

      {/* TOP FLOATING HUD */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 md:p-4 flex flex-col gap-2">
        {/* Row 1: Brand Identity, 6-City Pills & Map Style Customizer */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-950/85 border border-white/15 backdrop-blur-xl shadow-2xl">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-400 via-fuchsia-500 to-amber-400 text-slate-950 font-black text-sm shadow-md">
              <span>⚡</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black tracking-tight text-white">
                  SnapEvents <span className="text-cyan-400">6Aika</span>
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-[10px] font-bold text-rose-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                  {liveCount} LIVE
                </span>
              </div>
              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                {dataSourceType === 'live-api' ? (
                  <>
                    <Radio className="w-3 h-3 text-emerald-400" />
                    <span>Live CORS API (api.hel.fi)</span>
                  </>
                ) : dataSourceType === 'indexeddb-cache' ? (
                  <>
                    <Database className="w-3 h-3 text-cyan-400" />
                    <span>IndexedDB Cache (15m TTL)</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Static 6Aika JSON-LD Feed</span>
                  </>
                )}
                <span>• {filteredEvents.length} events</span>
              </p>
            </div>
          </div>

          {/* 6-City Switcher Bar */}
          <nav
            aria-label="6-City Switcher"
            className="pointer-events-auto flex items-center gap-1 p-1 rounded-2xl bg-slate-950/85 border border-white/15 backdrop-blur-xl shadow-2xl overflow-x-auto no-scrollbar max-w-full"
          >
            {CITY_LIST.map((c) => {
              const isSelected = c.id === activeCity;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleCitySelect(c.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    isSelected
                      ? `bg-gradient-to-r ${c.badgeColor} text-slate-950 shadow-lg scale-[1.02]`
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span>{c.name}</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      c.dataMechanism === 'live-api'
                        ? isSelected
                          ? 'bg-slate-950'
                          : 'bg-emerald-400'
                        : isSelected
                          ? 'bg-slate-950'
                          : 'bg-amber-400'
                    }`}
                  />
                </button>
              );
            })}
          </nav>

          {/* Map Style Customizer + Layer Toggles + Geolocation */}
          <div className="pointer-events-auto flex items-center gap-1.5 p-1 rounded-2xl bg-slate-950/85 border border-white/15 backdrop-blur-xl shadow-2xl">
            {(
              [
                { id: 'midnight', label: '🌒 Midnight' },
                { id: 'neon', label: '⚡ Nordic Neon' },
                { id: 'daylight', label: '☀️ Daylight' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setMapStyle(st.id)}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  mapStyle === st.id
                    ? 'bg-white text-slate-950 shadow'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                {st.label}
              </button>
            ))}

            <div className="h-4 w-px bg-white/15 mx-0.5" />

            <button
              type="button"
              onClick={() => setShowHeatmap((v) => !v)}
              title="Toggle GPU Thermal Heatmap Layer"
              className={`p-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                showHeatmap
                  ? 'bg-rose-500/25 border-rose-400/50 text-rose-200'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[10px]">Thermal</span>
            </button>

            <button
              type="button"
              onClick={() => setShow3DBuildings((v) => !v)}
              title="Toggle 3D Extruded Buildings (zoom >= 14.5)"
              className={`p-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                show3DBuildings
                  ? 'bg-cyan-500/25 border-cyan-400/50 text-cyan-200'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[10px]">3D</span>
            </button>

            <button
              type="button"
              onClick={handleNearMe}
              title="Near Me Browser Geolocation"
              className="p-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 cursor-pointer"
            >
              <LocateFixed
                className={`w-3.5 h-3.5 ${locating ? 'animate-spin' : ''}`}
              />
            </button>

            <button
              type="button"
              onClick={() => loadCity(activeCity, true)}
              title="Refresh City Feed"
              className="p-1.5 rounded-xl hover:bg-white/10 text-slate-300 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Row 2: Time Filter Pills + Calendar Button + Topic Filter Carousel + Search & Lineup */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Time Filter Pills + Interactive Calendar Button */}
          <div className="pointer-events-auto flex items-center gap-1 p-1 rounded-2xl bg-slate-950/85 border border-white/15 backdrop-blur-xl shadow-xl">
            {(
              [
                { id: 'all', label: '✨ All Times' },
                { id: 'live', label: '🔥 Live Now' },
                { id: 'tonight', label: '🌙 Tonight' },
                { id: 'weekend', label: '🎉 Weekend' },
              ] as const
            ).map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => {
                  setSelectedDate(null);
                  setTimeFilter(tf.id);
                }}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                  !selectedDate && timeFilter === tf.id
                    ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {tf.label}
              </button>
            ))}

            <div className="h-4 w-px bg-white/15 mx-0.5" />

            {/* Calendar Picker Trigger Button */}
            <button
              type="button"
              onClick={() => setCalendarModalOpen(true)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                selectedDate
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow'
                  : 'bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-200'
              }`}
              title="Open Month Calendar to search events by specific date"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>{selectedDateLabel || 'Calendar'}</span>
            </button>

            {selectedDate && (
              <button
                type="button"
                onClick={() => handleSelectDate(null)}
                aria-label="Clear selected calendar date"
                className="p-1 rounded-lg hover:bg-white/15 text-slate-300 cursor-pointer"
                title="Clear date filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowDateStrip((s) => !s)}
              className={`px-2 py-1 rounded-xl text-[10px] font-bold transition-colors cursor-pointer ${
                showDateStrip
                  ? 'bg-white/15 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Toggle 14-day quick date strip"
            >
              14d Strip
            </button>
          </div>

          {/* Topic Filter Pills + Free Only Toggle */}
          <div className="pointer-events-auto flex items-center gap-1 p-1 rounded-2xl bg-slate-950/85 border border-white/15 backdrop-blur-xl shadow-xl overflow-x-auto no-scrollbar max-w-full">
            {TOPICS.map((topic) => {
              const active = topicFilter === topic.id;
              return (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => setTopicFilter(topic.id)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                    active
                      ? 'bg-cyan-400 text-slate-950 font-bold shadow'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span>{topic.emoji}</span>
                  <span>{topic.label}</span>
                </button>
              );
            })}

            <div className="h-4 w-px bg-white/15 mx-0.5 shrink-0" />

            <button
              type="button"
              onClick={() => setFreeOnly((f) => !f)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 shrink-0 ${
                freeOnly
                  ? 'bg-emerald-400 text-slate-950 shadow'
                  : 'text-emerald-300 hover:bg-emerald-500/15'
              }`}
              title="Show only free admission events"
            >
              <Ticket className="w-3 h-3" />
              <span>Free Only</span>
            </button>
          </div>

          {/* Search, Day Schedule Drawer & Share View */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${cityMeta.name}...`}
                className="pl-8 pr-3 py-1.5 rounded-2xl bg-slate-950/85 border border-white/15 backdrop-blur-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-cyan-400 w-36 sm:w-44"
              />
            </div>

            <button
              type="button"
              onClick={() => setAgendaDrawerOpen(true)}
              className="px-3 py-1.5 rounded-2xl bg-slate-950/85 hover:bg-slate-900 border border-white/15 backdrop-blur-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer shadow-xl"
              title="Open Chronological Day Schedule & Saved Lineup"
            >
              <ListOrdered className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Schedule</span>
              {savedEventIds.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-fuchsia-500 text-[10px] font-black text-white flex items-center gap-0.5">
                  <Bookmark className="w-2.5 h-2.5 fill-current" />
                  {savedEventIds.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={async () => {
                const ok = await handleShareDeepLink();
                if (ok) {
                  setShareBarCopied(true);
                  setTimeout(() => setShareBarCopied(false), 2200);
                }
              }}
              className="px-3 py-1.5 rounded-2xl bg-slate-950/85 hover:bg-slate-900 border border-white/15 backdrop-blur-xl text-xs font-bold text-cyan-300 flex items-center gap-1.5 cursor-pointer shadow-xl"
              title="Copy shareable deep-link URL for current map view & date"
            >
              {shareBarCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Share</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Row 3 (Collapsible): 14-Day Horizontal Quick-Pick Date Strip */}
        {showDateStrip && (
          <div className="pointer-events-auto flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-950/85 border border-white/15 backdrop-blur-xl shadow-2xl overflow-x-auto no-scrollbar animate-fade-in">
            <button
              type="button"
              onClick={() => setCalendarModalOpen(true)}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Month Grid</span>
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
                  className={`shrink-0 px-3 py-1 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 border-white font-black shadow-md'
                      : 'bg-slate-900/80 hover:bg-white/10 border-white/10 text-white'
                  }`}
                >
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider leading-tight">
                      {dayItem.weekdayShort}
                    </div>
                    <div
                      className={`text-[11px] font-semibold leading-tight ${
                        isSelected ? 'text-slate-950' : 'text-slate-300'
                      }`}
                    >
                      {dayItem.dayMonthLabel}
                    </div>
                  </div>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                      isSelected
                        ? 'bg-slate-950 text-cyan-300'
                        : dayItem.eventCount > 0
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : 'bg-white/5 text-slate-500'
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

      {/* BOTTOM SNAP STORY TRAY + MANDATORY CC BY 4.0 ATTRIBUTION BAR */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 md:p-4 flex flex-col gap-2">
        <div className="pointer-events-auto flex items-center gap-3 overflow-x-auto no-scrollbar py-1.5 px-3 rounded-3xl bg-slate-950/80 border border-white/15 backdrop-blur-xl shadow-2xl">
          <div className="shrink-0 pr-2 border-r border-white/10 hidden sm:flex flex-col">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-400">
              {selectedDateLabel
                ? `${cityMeta.name} • ${selectedDateLabel}`
                : `${cityMeta.name} Stories`}
            </span>
            <span className="text-[11px] font-semibold text-slate-300">
              {venueGroups.length} Active Venues
            </span>
          </div>

          {venueGroups.length === 0 ? (
            <div className="py-2 px-3 text-xs text-slate-300 flex items-center gap-2">
              <span>
                No events match this date/filter in {cityMeta.name}.
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedDate(null);
                  setTimeFilter('all');
                  setTopicFilter('all');
                  setFreeOnly(false);
                  setSearchQuery('');
                }}
                className="px-2.5 py-1 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            venueGroups.slice(0, 18).map((vg) => {
              const lead = vg.events[0];
              return (
                <button
                  key={vg.venueId}
                  type="button"
                  onClick={() => handleOpenVenueGroup(vg)}
                  className="group shrink-0 flex items-center gap-2.5 pr-3 pl-1.5 py-1 rounded-2xl hover:bg-white/10 transition-all cursor-pointer text-left"
                >
                  <div className="relative w-11 h-11 rounded-full p-[2px] bg-gradient-to-tr from-rose-500 via-fuchsia-500 to-cyan-400 shrink-0 group-hover:scale-105 transition-transform">
                    <div className="w-full h-full rounded-full bg-slate-900 overflow-hidden flex items-center justify-center">
                      {vg.coverImageUrl ? (
                        <img
                          src={vg.coverImageUrl}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-lg">{vg.topEmoji}</span>
                      )}
                    </div>
                    {vg.hasLiveEvent && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 py-0.2 rounded bg-rose-500 text-[8px] font-black uppercase text-white">
                        LIVE
                      </span>
                    )}
                  </div>
                  <div className="max-w-[135px]">
                    <p className="text-xs font-bold text-white truncate">
                      {vg.venueName}
                    </p>
                    <p className="text-[10px] text-slate-300 truncate">
                      {lead.title}
                    </p>
                    <p className="text-[9px] text-cyan-300 font-semibold flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5" />
                      <span>
                        {vg.events.length}{' '}
                        {vg.events.length === 1 ? 'story' : 'stories'}
                      </span>
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Mandatory 6Aika CC BY 4.0 & OpenFreeMap Attribution Bar */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 px-3.5 py-1.5 rounded-2xl bg-slate-950/85 border border-white/10 backdrop-blur-md text-[10px] text-slate-400">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>{LINKED_EVENTS_CREDIT_TEXT}</span>
            <span>•</span>
            <a
              href={CC_BY_4_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-300 hover:underline font-semibold"
            >
              CC BY 4.0
            </a>
          </div>
          <div className="flex items-center gap-2">
            <span>
              Vector Tiles:{' '}
              <a
                href="https://openfreemap.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-300 hover:underline"
              >
                OpenFreeMap
              </a>{' '}
              & © OpenStreetMap
            </span>
          </div>
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

      {/* DAY SCHEDULE & SAVED LINEUP DRAWER */}
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

      {/* 9:16 VERTICAL SNAP STORY PLAYER MODAL */}
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
