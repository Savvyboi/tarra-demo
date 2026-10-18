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
  { label: 'All', maxKm: null },
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
    : `${cityMeta.name} Street Pole`;

  return (
    <main
      aria-label={`${cityMeta.name} Pole Sticker Feed`}
      className="relative w-full h-full overflow-y-auto street-box-bg px-3 sm:px-6 pt-4 pb-24"
    >
      {/* Continuous Vertical Galvanized Steel Pole Spine running behind the stickers */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-1/2 -translate-x-1/2 w-16 sm:w-28 md:w-36 galvanized-pole-spine z-0 flex flex-col justify-between py-20"
      >
        <div className="pole-clamp-band h-5 w-full flex items-center justify-between px-2">
          <span className="w-2 h-2 rounded-full bg-[#1a1d22] border border-[#bbc4d0]" />
          <span className="font-mono-stamp text-[8px] font-bold tracking-widest text-[#111317] uppercase hidden sm:inline">
            POLE // {cityMeta.id.toUpperCase()}
          </span>
          <span className="w-2 h-2 rounded-full bg-[#1a1d22] border border-[#bbc4d0]" />
        </div>
        <div className="pole-clamp-band h-5 w-full flex items-center justify-between px-2">
          <span className="w-2 h-2 rounded-full bg-[#1a1d22] border border-[#bbc4d0]" />
          <span className="font-mono-stamp text-[8px] font-bold tracking-widest text-[#111317] uppercase hidden sm:inline">
            6AIKA // LINKED
          </span>
          <span className="w-2 h-2 rounded-full bg-[#1a1d22] border border-[#bbc4d0]" />
        </div>
        <div className="pole-clamp-band h-5 w-full flex items-center justify-between px-2">
          <span className="w-2 h-2 rounded-full bg-[#1a1d22] border border-[#bbc4d0]" />
          <span className="w-2 h-2 rounded-full bg-[#1a1d22] border border-[#bbc4d0]" />
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto space-y-5">
        {/* Bolted Street Sign / Distance & Sort Control Plate */}
        <section className="relative rounded-xl bg-[#181b20] border-[2.5px] border-[#f4f1ea] p-3.5 sm:p-4 shadow-[4px_5px_0px_#07080a] flex flex-col gap-3">
          {/* Corner Sign Bolts */}
          <span
            aria-hidden="true"
            className="absolute top-2 left-2 w-2 h-2 rounded-full bg-[#687382] border border-[#0d0e11]"
          />
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#687382] border border-[#0d0e11]"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pl-2 pr-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 bg-[#ffe600] text-[#0d0e11] border border-[#0d0e11] font-mono-stamp text-[10px] font-bold uppercase tracking-wider">
                  POLE FEED
                </span>
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-[#f4f1ea] uppercase">
                  {activeDateHeader}
                </h2>
                <span className="px-2 py-0.5 rounded-sm bg-[#262b33] border border-[#f4f1ea]/40 font-mono-stamp text-xs font-bold text-[#ffe600]">
                  {sortedAndFiltered.length} SLAPS
                </span>
              </div>

              <p className="text-xs text-[#c7c4b8] mt-1 flex items-center gap-1.5 flex-wrap">
                <Compass className="w-3.5 h-3.5 text-[#ffe600] shrink-0" />
                {userLocation ? (
                  <span>
                    Distances measured from your{' '}
                    <strong className="text-[#22c55e]">live GPS position</strong>
                  </span>
                ) : (
                  <span>
                    Distances measured from{' '}
                    <strong className="text-[#ffe600]">
                      {cityMeta.name} center
                    </strong>
                  </span>
                )}
              </p>
            </div>

            {/* GPS Location Slap Button */}
            <button
              type="button"
              onClick={onRequestUserLocation}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-transform active:translate-y-0.5 cursor-pointer border-2 shadow-[3px_3px_0px_#07080a] ${
                userLocation
                  ? 'bg-[#22c55e] text-[#0d0e11] border-[#0d0e11]'
                  : 'bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border-[#0d0e11]'
              }`}
            >
              <LocateFixed
                className={`w-4 h-4 ${locating ? 'animate-spin' : ''}`}
              />
              <span className="font-grotesk uppercase tracking-tight">
                {userLocation ? 'GPS Active (Update)' : 'Use My GPS Distance'}
              </span>
            </button>
          </div>

          {/* Sort Mode & Distance Radius Filter Row */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-white/15">
            {/* Sort Options */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono-stamp text-[10px] font-bold uppercase tracking-wider text-[#a8a498] flex items-center gap-1 mr-1">
                <ArrowUpDown className="w-3 h-3 text-[#ffe600]" />
                <span>Order:</span>
              </span>
              {(
                [
                  { id: 'distance', label: '📍 Nearest' },
                  { id: 'time', label: '⏰ Soonest' },
                  { id: 'live', label: '🔥 Live First' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSortMode(opt.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer border ${
                    sortMode === opt.id
                      ? 'bg-[#f4f1ea] text-[#0d0e11] border-[#0d0e11] shadow-[2px_2px_0px_#07080a]'
                      : 'bg-[#111317] text-[#d5d2c8] hover:text-white border-white/20'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Max Distance Radius Filter */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-mono-stamp text-[10px] font-bold uppercase tracking-wider text-[#a8a498] mr-1">
                Radius:
              </span>
              {RADIUS_OPTIONS.map((rad) => {
                const active = maxRadiusKm === rad.maxKm;
                return (
                  <button
                    key={rad.label}
                    type="button"
                    onClick={() => setMaxRadiusKm(rad.maxKm)}
                    className={`px-2 py-1 rounded-md font-mono-stamp text-[11px] font-bold transition-all cursor-pointer border ${
                      active
                        ? 'bg-[#ff5500] text-white border-[#f4f1ea] shadow-[2px_2px_0px_#07080a]'
                        : 'bg-[#111317] text-[#d5d2c8] hover:text-white border-white/20'
                    }`}
                  >
                    {rad.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Events Sticker Grid Slapped onto the Pole */}
        {sortedAndFiltered.length === 0 ? (
          <div className="tarra-sticker-card rounded-xl p-8 text-center space-y-3 max-w-lg mx-auto">
            <div className="inline-block px-3 py-1 bg-[#ffe600] text-[#0d0e11] font-mono-stamp text-xs font-bold uppercase border-2 border-[#0d0e11]">
              EMPTY POLE SECTION
            </div>
            <p className="text-base font-bold text-[#f4f1ea]">
              No event stickers match your current filters or radius
            </p>
            <p className="text-xs text-[#b8b4a8] max-w-md mx-auto">
              Expand the distance radius or peel back your active date/topic filters to see all slaps in {cityMeta.name}.
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              {maxRadiusKm !== null && (
                <button
                  type="button"
                  onClick={() => setMaxRadiusKm(null)}
                  className="px-3.5 py-2 rounded-lg bg-[#ff5500] text-white border-2 border-[#f4f1ea] shadow-[3px_3px_0px_#07080a] text-xs font-bold uppercase cursor-pointer"
                >
                  All Distances
                </button>
              )}
              <button
                type="button"
                onClick={onResetFilters}
                className="px-3.5 py-2 rounded-lg bg-[#ffe600] text-[#0d0e11] border-2 border-[#0d0e11] shadow-[3px_3px_0px_#07080a] text-xs font-bold uppercase cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
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
                  className={`${deferredClass} tarra-sticker-card rounded-xl overflow-hidden flex flex-col justify-between`}
                >
                  {/* Top Sticker Slap Bar (Category + Distance + Price + Bookmark) */}
                  <div className="px-3 py-2 bg-[#111317] border-b-2 border-[#f4f1ea]/20 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="px-2 py-0.5 rounded-sm font-grotesk text-[11px] font-extrabold uppercase tracking-tight border border-[#0d0e11] shadow-[1px_2px_0px_#07080a]"
                        style={{
                          backgroundColor: topicMeta.slapBg,
                          color: topicMeta.slapText,
                        }}
                      >
                        {ev.categoryEmoji} {ev.categoryLabel}
                      </span>

                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-[#22262e] border border-white/20 font-mono-stamp text-[11px] font-bold text-[#ffe600]">
                        <MapPin className="w-3 h-3 text-[#ffe600] shrink-0" />
                        <span>{formatDistance(ev.distanceKm)}</span>
                        <span className="text-[10px] font-normal text-[#d5d2c8] hidden sm:inline">
                          • {formatTravelEstimate(ev.distanceKm)}
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded-sm font-mono-stamp text-[10px] font-bold uppercase border flex items-center gap-1 ${
                          ev.isFree
                            ? 'bg-[#22c55e] text-[#0d0e11] border-[#0d0e11]'
                            : 'bg-[#262b33] text-[#f4f1ea] border-white/25'
                        }`}
                      >
                        <Ticket className="w-2.5 h-2.5" />
                        {ev.priceText}
                      </span>

                      <button
                        type="button"
                        onClick={() => onToggleSaveEvent(ev.id)}
                        aria-label={
                          isSaved
                            ? 'Remove from saved stash'
                            : 'Save sticker to stash'
                        }
                        className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                          isSaved
                            ? 'bg-[#ff2a85] border-[#f4f1ea] text-white shadow-[2px_2px_0px_#07080a]'
                            : 'bg-[#22262e] border-white/20 text-[#b8b4a8] hover:text-white'
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

                  {/* Main Sticker Body */}
                  <div className="flex gap-3.5 p-3.5">
                    {/* Framed Die-Cut Thumbnail or Graphic Slap */}
                    <div className="relative w-24 sm:w-28 h-28 sm:h-30 rounded-lg overflow-hidden bg-[#111317] shrink-0 border-2 border-[#f4f1ea] shadow-[2px_3px_0px_#07080a]">
                      {safeImg ? (
                        <img
                          src={safeImg}
                          alt={ev.imageAlt}
                          loading={index < 6 ? 'eager' : 'lazy'}
                          className="w-full h-full object-cover contrast-105"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex flex-col items-center justify-center p-2 text-center"
                          style={{
                            backgroundColor: topicMeta.slapBg,
                            color: topicMeta.slapText,
                          }}
                        >
                          <span className="text-3xl leading-none">
                            {ev.categoryEmoji}
                          </span>
                          <span className="mt-1 font-display-slap text-[9px] uppercase tracking-tighter leading-tight">
                            {cityMeta.name}
                          </span>
                        </div>
                      )}

                      {ev.isLiveNow && (
                        <span className="absolute top-1 left-1 px-1.5 py-[1px] bg-[#ff2a85] text-white border border-[#f4f1ea] font-mono-stamp text-[9px] font-bold uppercase tracking-tighter shadow flex items-center gap-0.5">
                          <Flame className="w-2.5 h-2.5" />
                          LIVE
                        </span>
                      )}
                    </div>

                    {/* Event Details */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        {/* Title */}
                        <h3 className="text-sm sm:text-base font-extrabold text-[#f6f3ec] line-clamp-2 leading-snug">
                          {ev.title}
                        </h3>

                        {/* Date & Time Stamp */}
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap font-mono-stamp text-[11px] text-[#ffe600] font-bold">
                          <Clock className="w-3.5 h-3.5 text-[#ffe600] shrink-0" />
                          <span>
                            {dateFmt.format(ev.startTime)} •{' '}
                            {timeFmt.format(ev.startTime)}–
                            {timeFmt.format(ev.endTime)}
                          </span>
                          {extraDatesCount > 0 && (
                            <span className="px-1.5 py-[1px] rounded-sm bg-[#ffe600]/15 border border-[#ffe600]/40 text-[10px] font-bold text-[#ffe600]">
                              +{extraDatesCount} dates
                            </span>
                          )}
                        </div>

                        {/* Venue & Address */}
                        <p className="mt-1.5 text-xs text-[#d5d2c8] truncate">
                          <strong className="text-white uppercase font-grotesk tracking-tight">
                            {ev.venueName}
                          </strong>{' '}
                          • {ev.streetAddress}
                        </p>

                        {/* Short description preview */}
                        <p className="mt-1 text-[11px] text-[#9e9a8e] line-clamp-1">
                          {ev.shortDescription}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Perforated Tear-Off Ticket Stub Footer */}
                  <div className="px-3.5 py-2.5 bg-[#121418] border-t-2 border-dashed border-[#f4f1ea]/25 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onPlayStory(ev)}
                        className="px-3 py-1.5 rounded-md bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border-2 border-[#0d0e11] shadow-[2px_2px_0px_#07080a] font-grotesk font-extrabold text-xs uppercase tracking-tight inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Open Flyer</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onShowOnMap(ev)}
                        className="px-2.5 py-1.5 rounded-md bg-[#22262e] hover:bg-[#2e333d] text-[#f4f1ea] border border-[#f4f1ea]/40 font-grotesk font-bold text-xs uppercase tracking-tight inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <MapIcon className="w-3.5 h-3.5 text-[#ffe600]" />
                        <span>On Map</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => downloadEventIcs(ev)}
                        title="Download .ICS for Calendar"
                        className="p-1.5 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-white/15 text-[#f4f1ea] cursor-pointer"
                      >
                        <CalendarPlus className="w-3.5 h-3.5 text-[#ffe600]" />
                      </button>

                      <a
                        href={buildGoogleCalendarUrl(ev)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Add to Google Calendar"
                        className="p-1.5 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-white/15 text-[#f4f1ea]"
                      >
                        <Calendar className="w-3.5 h-3.5 text-[#ff5500]" />
                      </a>

                      <a
                        href={ev.reittiopasUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-white/20 text-[#f4f1ea] font-mono-stamp font-bold text-[11px] inline-flex items-center gap-1"
                        title="Transit route via Digitransit / Reittiopas"
                      >
                        <Navigation className="w-3 h-3 text-[#38bdf8]" />
                        <span>Transit</span>
                      </a>

                      {ev.infoUrl && (
                        <a
                          href={ev.infoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Official Event / Tickets Page"
                          className="p-1.5 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-white/15 text-[#d5d2c8]"
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

