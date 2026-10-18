import React, { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Bookmark,
  Calendar,
  CalendarPlus,
  Clock,
  Compass,
  ExternalLink,
  Flame,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Navigation,
  Play,
  Sparkles,
  Ticket,
} from 'lucide-react';
import { CITIES, TOPICS } from '../../config/cities';
import {
  CityId,
  ListSortMode,
  NormalizedEvent,
} from '../../types/linkedEvents';
import {
  buildGoogleCalendarUrl,
  downloadEventIcs,
  parseDateKey,
} from '../../utils/calendarUtils';
import {
  formatDistance,
  formatTravelEstimate,
} from '../../utils/distanceUtils';
import { getSafeEventImageUrl } from '../../utils/licenseGuard';

interface EventListViewProps {
  activeCity: CityId;
  events: NormalizedEvent[];
  selectedDate: string | null;
  userLocation: [number, number] | null;
  locating: boolean;
  savedEventIds: string[];
  onRequestUserLocation: () => void;
  onToggleSaveEvent: (eventId: string) => void;
  onPlayStory: (event: NormalizedEvent) => void;
  onShowOnMap: (event: NormalizedEvent) => void;
  onResetFilters: () => void;
}

const RADIUS_OPTIONS: Array<{ label: string; maxKm: number | null }> = [
  { label: 'All Distances', maxKm: null },
  { label: '≤ 1 km', maxKm: 1 },
  { label: '≤ 3 km', maxKm: 3 },
  { label: '≤ 5 km', maxKm: 5 },
  { label: '≤ 15 km', maxKm: 15 },
];

export const EventListView: React.FC<EventListViewProps> = ({
  activeCity,
  events,
  selectedDate,
  userLocation,
  locating,
  savedEventIds,
  onRequestUserLocation,
  onToggleSaveEvent,
  onPlayStory,
  onShowOnMap,
  onResetFilters,
}) => {
  const [sortMode, setSortMode] = useState<ListSortMode>('distance');
  const [maxRadiusKm, setMaxRadiusKm] = useState<number | null>(null);

  const cityMeta = CITIES[activeCity];

  const sortedAndFiltered = useMemo(() => {
    const list =
      maxRadiusKm !== null
        ? events.filter((e) => e.distanceKm <= maxRadiusKm)
        : [...events];

    list.sort((a, b) => {
      if (sortMode === 'distance') {
        return a.distanceKm - b.distanceKm;
      }
      if (sortMode === 'live') {
        if (a.isLiveNow !== b.isLiveNow) return a.isLiveNow ? -1 : 1;
        return a.distanceKm - b.distanceKm;
      }
      return a.startTime.getTime() - b.startTime.getTime();
    });

    return list;
  }, [events, maxRadiusKm, sortMode]);

  const dateFmt = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const activeDateHeader = selectedDate
    ? new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(parseDateKey(selectedDate))
    : `All Upcoming Events in ${cityMeta.name}`;

  return (
    <main
      aria-label={`${cityMeta.name} Events List View`}
      className="relative w-full h-full overflow-y-auto bg-slate-950 pt-36 sm:pt-40 pb-28 px-3 sm:px-6"
    >
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Distance Reference & Sorting Control Bar */}
        <section className="rounded-3xl bg-slate-900/90 border border-white/15 p-4 shadow-2xl backdrop-blur-xl flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                  {activeDateHeader}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-xs font-extrabold text-cyan-300">
                  {sortedAndFiltered.length} events
                </span>
              </div>

              <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <Compass className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                {userLocation ? (
                  <span>
                    Distances measured from your{' '}
                    <strong className="text-emerald-300">
                      live GPS location
                    </strong>
                  </span>
                ) : (
                  <span>
                    Distances measured from{' '}
                    <strong className="text-cyan-300">
                      {cityMeta.name} city center
                    </strong>
                  </span>
                )}
              </p>
            </div>

            {/* Use My GPS Location Button */}
            <button
              type="button"
              onClick={onRequestUserLocation}
              className={`px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border shadow-lg ${
                userLocation
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                  : 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 border-transparent hover:from-cyan-300 hover:to-blue-400'
              }`}
            >
              <LocateFixed
                className={`w-4 h-4 ${locating ? 'animate-spin' : ''}`}
              />
              <span>
                {userLocation
                  ? 'GPS Distance Active (Update)'
                  : 'Use My GPS for Exact Distance'}
              </span>
            </button>
          </div>

          {/* Sort Mode & Distance Radius Filter Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
            {/* Sort Options */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mr-1">
                <ArrowUpDown className="w-3 h-3 text-cyan-400" />
                <span>Sort:</span>
              </span>
              {(
                [
                  { id: 'distance', label: '📍 Nearest Distance' },
                  { id: 'time', label: '⏰ Soonest Time' },
                  { id: 'live', label: '🔥 Live First' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSortMode(opt.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    sortMode === opt.id
                      ? 'bg-cyan-400 text-slate-950 shadow'
                      : 'bg-slate-950/70 text-slate-300 hover:text-white border border-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Max Distance Radius Filter */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                Radius:
              </span>
              {RADIUS_OPTIONS.map((rad) => {
                const active = maxRadiusKm === rad.maxKm;
                return (
                  <button
                    key={rad.label}
                    type="button"
                    onClick={() => setMaxRadiusKm(rad.maxKm)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'bg-fuchsia-500 text-white font-bold shadow'
                        : 'bg-slate-950/70 text-slate-300 hover:text-white border border-white/10'
                    }`}
                  >
                    {rad.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Events Grid / List */}
        {sortedAndFiltered.length === 0 ? (
          <div className="rounded-3xl bg-slate-900/70 border border-white/10 p-10 text-center space-y-3">
            <p className="text-base font-bold text-white">
              No events match your current filters or distance radius
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Try expanding the distance radius filter or resetting the date and
              category filters.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              {maxRadiusKm !== null && (
                <button
                  type="button"
                  onClick={() => setMaxRadiusKm(null)}
                  className="px-4 py-2 rounded-2xl bg-fuchsia-500 text-white text-xs font-bold cursor-pointer"
                >
                  Show All Distances
                </button>
              )}
              <button
                type="button"
                onClick={onResetFilters}
                className="px-4 py-2 rounded-2xl bg-cyan-400 text-slate-950 text-xs font-bold cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {sortedAndFiltered.map((ev, index) => {
              const isSaved = savedEventIds.includes(ev.id);
              const safeImg = getSafeEventImageUrl(ev.raw, ev.id);
              const topicMeta =
                TOPICS.find((t) => t.id === ev.category) || TOPICS[0];
              const extraDatesCount = Math.max(
                0,
                ev.occurrenceDates.length - 1
              );

              // Modern Web Guidance (defer-rendering-heavy-content):
              // Only apply content-visibility: auto to items outside the initial viewport fold (index >= 8)
              const deferredClass = index >= 8 ? 'event-card-deferred' : '';

              return (
                <article
                  key={ev.id}
                  className={`${deferredClass} group rounded-3xl bg-slate-900/90 hover:bg-slate-900 border border-white/10 hover:border-cyan-400/45 overflow-hidden shadow-xl transition-all flex flex-col justify-between`}
                >
                  <div className="flex gap-3.5 p-3.5">
                    {/* Thumbnail or Category Aura */}
                    <div className="relative w-24 sm:w-28 h-28 sm:h-32 rounded-2xl overflow-hidden bg-slate-950 shrink-0 border border-white/10">
                      {safeImg ? (
                        <img
                          src={safeImg}
                          alt={ev.imageAlt}
                          loading={index < 6 ? 'eager' : 'lazy'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div
                          className={`w-full h-full bg-gradient-to-br ${topicMeta.ringGradient} flex items-center justify-center text-3xl`}
                        >
                          {ev.categoryEmoji}
                        </div>
                      )}

                      {ev.isLiveNow && (
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-rose-500 text-[9px] font-black uppercase tracking-wider text-white shadow flex items-center gap-0.5">
                          <Flame className="w-2.5 h-2.5" />
                          LIVE
                        </span>
                      )}

                      <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full bg-slate-950/85 border border-white/15 text-[10px] font-bold text-white backdrop-blur-md">
                        {ev.categoryEmoji} {ev.categoryLabel}
                      </span>
                    </div>

                    {/* Event Details & Distance Badge */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        {/* Distance & Travel Estimate Pill Row */}
                        <div className="flex items-center justify-between gap-1.5 flex-wrap">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-xs font-extrabold">
                            <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                            <span>{formatDistance(ev.distanceKm)}</span>
                            <span className="text-[10px] font-medium text-cyan-300/90">
                              • {formatTravelEstimate(ev.distanceKm)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                              <Ticket className="w-2.5 h-2.5" />
                              {ev.priceText}
                            </span>

                            <button
                              type="button"
                              onClick={() => onToggleSaveEvent(ev.id)}
                              aria-label={
                                isSaved
                                  ? 'Remove from saved lineup'
                                  : 'Save event to lineup'
                              }
                              className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                                isSaved
                                  ? 'bg-fuchsia-500/25 border-fuchsia-400 text-fuchsia-300'
                                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                              }`}
                            >
                              <Bookmark
                                className={`w-3.5 h-3.5 ${
                                  isSaved ? 'fill-current' : ''
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        {/* Title */}
                        <h3 className="mt-1.5 text-sm sm:text-base font-extrabold text-white line-clamp-2 leading-snug group-hover:text-cyan-300 transition-colors">
                          {ev.title}
                        </h3>

                        {/* Date & Time + Multi-date indicator */}
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap text-xs text-amber-200 font-semibold">
                          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>
                            {dateFmt.format(ev.startTime)} •{' '}
                            {timeFmt.format(ev.startTime)}–
                            {timeFmt.format(ev.endTime)}
                          </span>
                          {extraDatesCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 border border-amber-400/30 text-[10px] font-bold text-amber-300">
                              +{extraDatesCount} dates
                            </span>
                          )}
                        </div>

                        {/* Venue & Address */}
                        <p className="mt-1 text-xs text-slate-300 truncate">
                          <strong className="text-white">{ev.venueName}</strong>{' '}
                          • {ev.streetAddress}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Action Bar */}
                  <div className="px-3.5 py-2.5 bg-slate-950/60 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onPlayStory(ev)}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs inline-flex items-center gap-1.5 shadow cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>9:16 Story</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onShowOnMap(ev)}
                        className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <MapIcon className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Show on Map</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => downloadEventIcs(ev)}
                        title="Download .ICS for Calendar"
                        className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-slate-200 cursor-pointer"
                      >
                        <CalendarPlus className="w-3.5 h-3.5 text-cyan-400" />
                      </button>

                      <a
                        href={buildGoogleCalendarUrl(ev)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Add to Google Calendar"
                        className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-slate-200"
                      >
                        <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      </a>

                      <a
                        href={ev.reittiopasUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-200 font-bold text-xs inline-flex items-center gap-1"
                        title="Transit route via Digitransit / Reittiopas"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>Transit</span>
                      </a>

                      {ev.infoUrl && (
                        <a
                          href={ev.infoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Official Event / Tickets Page"
                          className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
};
