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
  CC_BY_4_URL,
  LINKED_EVENTS_CREDIT_TEXT,
} from './utils/licenseGuard';
import { SnapMap } from './components/Map/SnapMap';
import { StoryPlayerModal } from './components/Story/StoryPlayerModal';

function parseInitialParams(): {
  city: CityId;
  time: TimeFilter;
  topic: TopicCategory;
  eventId: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  const rawCity = (params.get('city') || 'helsinki').toLowerCase() as CityId;
  const city: CityId = rawCity in CITIES ? rawCity : 'helsinki';

  const rawTime = (params.get('time') || 'all').toLowerCase() as TimeFilter;
  const validTimes: TimeFilter[] = ['all', 'live', 'tonight', 'weekend'];
  const time: TimeFilter = validTimes.includes(rawTime) ? rawTime : 'all';

  const rawTopic = (params.get('topic') || 'all').toLowerCase() as TopicCategory;
  const validTopics = TOPICS.map((t) => t.id);
  const topic: TopicCategory = validTopics.includes(rawTopic) ? rawTopic : 'all';

  const eventId = params.get('event') || null;
  return { city, time, topic, eventId };
}

export const App: React.FC = () => {
  const initial = useMemo(() => parseInitialParams(), []);

  const [activeCity, setActiveCity] = useState<CityId>(initial.city);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(initial.time);
  const [topicFilter, setTopicFilter] = useState<TopicCategory>(initial.topic);
  const [searchQuery, setSearchQuery] = useState('');

  const [mapStyle, setMapStyle] = useState<MapStyleId>('neon');
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [show3DBuildings, setShow3DBuildings] = useState(true);

  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [dataSourceType, setDataSourceType] = useState<
    'live-api' | 'indexeddb-cache' | 'static-feed' | 'offline-fallback'
  >('live-api');
  const [loading, setLoading] = useState(true);

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

  // Sync application state into URL Search Params (?city=...&time=...&topic=...&event=...)
  const syncUrlParams = useCallback(
    (
      city: CityId,
      time: TimeFilter,
      topic: TopicCategory,
      eventId: string | null
    ) => {
      const params = new URLSearchParams();
      params.set('city', city);
      if (time !== 'all') params.set('time', time);
      if (topic !== 'all') params.set('topic', topic);
      if (eventId) params.set('event', eventId);

      const newRelativeUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, '', newRelativeUrl);
    },
    []
  );

  // Load city events whenever activeCity changes
  const loadCity = useCallback(
    async (cityId: CityId, forceRefresh = false) => {
      setLoading(true);
      try {
        const result = await fetchCityEvents(cityId, forceRefresh);
        setEvents(result.events);
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

  // Filter events by time, topic, and search query
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (timeFilter === 'live' && !ev.isLiveNow && !ev.isStartingSoon) {
        return false;
      }
      if (timeFilter === 'tonight' && !ev.isTonight) {
        return false;
      }
      if (timeFilter === 'weekend' && !ev.isThisWeekend) {
        return false;
      }
      if (topicFilter !== 'all' && ev.category !== topicFilter) {
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
  }, [events, timeFilter, topicFilter, searchQuery]);

  // Group filtered events into Venue Story Bubbles
  const venueGroups = useMemo(
    () => groupEventsByVenue(filteredEvents),
    [filteredEvents]
  );

  // All venue groups in the city (unfiltered fallback if a deep-linked event is outside current filter)
  const allVenueGroups = useMemo(
    () => groupEventsByVenue(events),
    [events]
  );

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
    syncUrlParams(activeCity, timeFilter, topicFilter, deepLinkedEventId);
  }, [activeCity, timeFilter, topicFilter, deepLinkedEventId, syncUrlParams]);

  const handleCitySelect = (cityId: CityId) => {
    setSelectedVenueGroup(null);
    setDeepLinkedEventId(null);
    setActiveCity(cityId);
  };

  const handleOpenVenueGroup = useCallback((group: VenueStoryGroup) => {
    setSelectedVenueGroup(group);
    if (group.events[0]) {
      setDeepLinkedEventId(group.events[0].id);
    }
  }, []);

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
      if (timeFilter !== 'all') params.set('time', timeFilter);
      if (topicFilter !== 'all') params.set('topic', topicFilter);
      if (event) params.set('event', event.id);

      const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        return true;
      } catch {
        return false;
      }
    },
    [activeCity, timeFilter, topicFilter]
  );

  // Browser "Near Me" Geolocation handler
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

        // Find nearest of the 6 cities
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
        // If user denies permission on desktop, center on active city with a demo beacon
        setUserLocation(CITIES[activeCity].coordinates);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  // Navigate to next/prev venue story group when a venue's stories finish
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

      {/* TOP FLOATING HUD: Brand + 6-City Switcher + Filters + Map Style Customizer */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 md:p-4 flex flex-col gap-2.5">
        {/* Row 1: Brand Identity, 6-City Pills & Data Source Badge */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Brand Logo + Live Status */}
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
                    title={
                      c.dataMechanism === 'live-api'
                        ? 'Live Browser Fetch (api.hel.fi)'
                        : 'Static JSON-LD Feed'
                    }
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

        {/* Row 2: Time Filter Pills + Topic Filter Carousel + Search Input */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Time Filter Pills */}
          <div className="pointer-events-auto flex items-center gap-1 p-1 rounded-2xl bg-slate-950/80 border border-white/15 backdrop-blur-xl shadow-xl">
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
                onClick={() => setTimeFilter(tf.id)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                  timeFilter === tf.id
                    ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Topic Filter Pills */}
          <div className="pointer-events-auto flex items-center gap-1 p-1 rounded-2xl bg-slate-950/80 border border-white/15 backdrop-blur-xl shadow-xl overflow-x-auto no-scrollbar max-w-full">
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
          </div>

          {/* Search & Share View Button */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${cityMeta.name}...`}
                className="pl-8 pr-3 py-1.5 rounded-2xl bg-slate-950/85 border border-white/15 backdrop-blur-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-cyan-400 w-40 sm:w-48"
              />
            </div>

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
              title="Copy shareable deep-link URL for current map view"
            >
              {shareBarCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Share View</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* BOTTOM SNAP STORY TRAY + MANDATORY CC BY 4.0 ATTRIBUTION BAR */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 md:p-4 flex flex-col gap-2">
        {/* Horizontal Venue Story Ring Dock */}
        <div className="pointer-events-auto flex items-center gap-3 overflow-x-auto no-scrollbar py-1.5 px-3 rounded-3xl bg-slate-950/80 border border-white/15 backdrop-blur-xl shadow-2xl">
          <div className="shrink-0 pr-2 border-r border-white/10 hidden sm:flex flex-col">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-400">
              {cityMeta.name} Stories
            </span>
            <span className="text-[11px] font-semibold text-slate-300">
              {venueGroups.length} Active Venues
            </span>
          </div>

          {venueGroups.length === 0 ? (
            <div className="py-2 px-3 text-xs text-slate-300 flex items-center gap-2">
              <span>No events match this filter in {cityMeta.name}.</span>
              <button
                type="button"
                onClick={() => {
                  setTimeFilter('all');
                  setTopicFilter('all');
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

      {/* 9:16 VERTICAL SNAP STORY PLAYER MODAL */}
      <StoryPlayerModal
        venueGroup={selectedVenueGroup}
        initialEventId={deepLinkedEventId}
        onClose={handleCloseModal}
        onActiveEventChange={handleActiveEventChange}
        onShareDeepLink={handleShareDeepLink}
        onNextVenue={handleNextVenue}
        onPrevVenue={handlePrevVenue}
      />
    </div>
  );
};
