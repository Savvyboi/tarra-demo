import React, { useMemo, useState } from 'react';
import {
  Bookmark,
  Flame,
  MapPin,
} from 'lucide-react';
import { CITIES, TOPICS } from '../../config/cities';
import {
  CityId,
  ListSortMode,
  NormalizedEvent,
} from '../../types/linkedEvents';
import { formatDistance } from '../../utils/distanceUtils';
import { getSafeEventImageUrl } from '../../utils/licenseGuard';

interface EventListViewProps {
  activeCity: CityId;
  events: NormalizedEvent[];
  savedEventIds: string[];
  onToggleSaveEvent: (eventId: string) => void;
  onPlayStory: (event: NormalizedEvent) => void;
  onResetFilters: () => void;
}

const POLE_ANGLES = [
  -3.2, 2.7, -1.9, 3.4, -2.6, 1.8, -3.5, 2.3, -1.4, 3.1, -2.8, 2.1,
];

const POLE_OFFSETS_X = [
  -8, 9, -5, 11, -10, 6, -7, 8, -11, 5, -6, 10,
];

const POLE_RADII = [
  '14px 4px 12px 5px',
  '5px 15px 4px 13px',
  '12px 6px 16px 4px',
  '4px 12px 6px 15px',
  '16px 5px 10px 6px',
  '6px 14px 5px 12px',
];

function hashEventId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export const EventListView: React.FC<EventListViewProps> = ({
  activeCity,
  events,
  savedEventIds,
  onToggleSaveEvent,
  onPlayStory,
  onResetFilters,
}) => {
  const [sortMode, setSortMode] = useState<ListSortMode>('distance');

  const cityMeta = CITIES[activeCity];

  const sortedEvents = useMemo(() => {
    const list = [...events];
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
  }, [events, sortMode]);

  const dateFmt = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <main
      aria-label={`${cityMeta.name} Pole Sticker Feed`}
      className="relative w-full h-full overflow-y-auto overflow-x-hidden street-box-bg px-3 sm:px-6 pt-16 pb-20"
    >
      {/* Continuous Vertical Galvanized Steel Pole Spine running behind the stickers */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-1/2 -translate-x-1/2 w-20 sm:w-32 md:w-44 galvanized-pole-spine z-0 flex flex-col justify-between py-24"
      >
        <div className="pole-clamp-band h-5 w-full flex items-center justify-between px-2">
          <span className="w-2 h-2 rounded-full bg-[#1a1d22] border border-[#bbc4d0]" />
          <span className="font-mono-stamp text-[8px] font-bold tracking-widest text-[#111317] uppercase hidden sm:inline">
            {cityMeta.id.toUpperCase()}
          </span>
          <span className="w-2 h-2 rounded-full bg-[#1a1d22] border border-[#bbc4d0]" />
        </div>
        <div className="pole-clamp-band h-5 w-full flex items-center justify-between px-2">
          <span className="w-2 h-2 rounded-full bg-[#1a1d22] border border-[#bbc4d0]" />
          <span className="w-2 h-2 rounded-full bg-[#1a1d22] border border-[#bbc4d0]" />
        </div>
        <div className="pole-clamp-band h-5 w-full flex items-center justify-between px-2">
          <span className="w-2 h-2 rounded-full bg-[#1a1d22] border border-[#bbc4d0]" />
          <span className="w-2 h-2 rounded-full bg-[#1a1d22] border border-[#bbc4d0]" />
        </div>
      </div>

      <div className="relative z-10 max-w-3xl mx-auto">
        {/* Minimal Organic Sort Slaps directly on the Pole (no system box) */}
        <div className="flex items-center justify-center gap-2.5 mb-6 flex-wrap">
          {(
            [
              {
                id: 'distance',
                label: '📍 Nearest',
                rot: '-3.5deg',
                rad: '12px 4px 10px 5px',
              },
              {
                id: 'time',
                label: '⏰ Soonest',
                rot: '2.4deg',
                rad: '5px 13px 4px 11px',
              },
              {
                id: 'live',
                label: '🔥 Live',
                rot: '-2.1deg',
                rad: '10px 5px 14px 4px',
              },
            ] as const
          ).map((opt) => {
            const active = sortMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSortMode(opt.id)}
                style={
                  {
                    '--slap-rot': opt.rot,
                    '--slap-radius': opt.rad,
                  } as React.CSSProperties
                }
                className={`organic-slap-btn px-3 py-1 font-display-slap text-xs uppercase tracking-tight cursor-pointer border-2 ${
                  active
                    ? 'bg-[#ffe600] text-[#0d0e11] border-[#0d0e11] outline-2 outline-[#f4f1ea]'
                    : 'bg-[#181b20]/90 text-[#d5d2c8] hover:text-white border-[#f4f1ea]/60'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Chaotic Stickers Slapped onto the Pole */}
        {sortedEvents.length === 0 ? (
          <div
            style={
              {
                '--slap-rot': '-1.8deg',
                '--slap-radius': '14px 5px 12px 6px',
              } as React.CSSProperties
            }
            className="pole-sticker-slap tarra-paper-slap p-6 text-center space-y-3 max-w-sm mx-auto mt-8"
          >
            <p className="font-display-slap text-base uppercase text-[#0d0e11]">
              Nothing slapped here yet
            </p>
            <button
              type="button"
              onClick={onResetFilters}
              style={
                {
                  '--slap-rot': '2deg',
                  '--slap-radius': '8px 3px 10px 4px',
                } as React.CSSProperties
              }
              className="organic-slap-btn px-3.5 py-1.5 bg-[#ff2a85] text-white border-2 border-[#0d0e11] font-display-slap text-xs uppercase cursor-pointer"
            >
              Peel Back Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6 px-1 sm:px-2">
            {sortedEvents.map((ev, index) => {
              const isSaved = savedEventIds.includes(ev.id);
              const safeImg = getSafeEventImageUrl(ev.raw, ev.id);
              const topicMeta =
                TOPICS.find((t) => t.id === ev.category) || TOPICS[0];

              const h = hashEventId(ev.id);
              const rot = POLE_ANGLES[(h + index) % POLE_ANGLES.length];
              const offsetX = POLE_OFFSETS_X[(h + index) % POLE_OFFSETS_X.length];
              const radius = POLE_RADII[(h + index) % POLE_RADII.length];
              const variant = (h + index) % 4;

              // Variant 1 is wheatpaste paper white; others are dark or colored vinyl slaps
              const isPaperVariant = variant === 1;
              const isPostalVariant = variant === 3;

              // Modern Web Guidance (defer-rendering-heavy-content):
              // Only apply content-visibility: auto to items outside the initial viewport fold (index >= 8)
              const deferredClass = index >= 8 ? 'event-card-deferred' : '';

              return (
                <article
                  key={ev.id}
                  style={
                    {
                      '--slap-rot': `${rot}deg`,
                      '--slap-x': `${offsetX}px`,
                      '--slap-radius': radius,
                    } as React.CSSProperties
                  }
                  className={`${deferredClass} pole-sticker-slap relative overflow-hidden cursor-pointer select-none ${
                    isPaperVariant
                      ? 'bg-[#f4f1ea] text-[#0d0e11] border-[2.5px] border-[#0d0e11] outline-2 outline-[#f4f1ea]'
                      : 'bg-[#171a20] text-[#f4f1ea] border-[2.5px] border-[#f4f1ea]'
                  }`}
                  onClick={() => onPlayStory(ev)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open event flyer for ${ev.title} at ${ev.venueName}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onPlayStory(ev);
                    }
                  }}
                >
                  {/* Optional top postal stripe on variant 3 */}
                  {isPostalVariant && (
                    <div aria-hidden="true" className="h-1.5 w-full postal-stripe-bar" />
                  )}

                  {/* Quick Corner Save/Stash Slap */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSaveEvent(ev.id);
                    }}
                    aria-label={
                      isSaved
                        ? `Remove ${ev.title} from saved stash`
                        : `Save ${ev.title} to stash`
                    }
                    className={`absolute top-2 right-2 z-20 w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-115 cursor-pointer border-[1.5px] ${
                      isSaved
                        ? 'bg-[#ff2a85] text-white border-[#f4f1ea] rotate-6'
                        : isPaperVariant
                          ? 'bg-[#0d0e11]/10 hover:bg-[#0d0e11]/20 text-[#0d0e11] border-[#0d0e11]/30 -rotate-6'
                          : 'bg-[#0d0e11]/70 hover:bg-[#0d0e11] text-[#f4f1ea] border-[#f4f1ea]/40 -rotate-6'
                    }`}
                  >
                    <Bookmark
                      aria-hidden="true"
                      className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`}
                    />
                  </button>

                  <div className="flex gap-3 p-3">
                    {/* Framed Crooked Thumbnail or Graphic Stamp */}
                    <div
                      className={`relative w-20 h-20 rounded-md overflow-hidden shrink-0 border-2 ${
                        isPaperVariant ? 'border-[#0d0e11]' : 'border-[#f4f1ea]'
                      } -rotate-2`}
                      style={{
                        backgroundColor: topicMeta.slapBg,
                        color: topicMeta.slapText,
                      }}
                    >
                      {safeImg ? (
                        <img
                          src={safeImg}
                          alt={ev.imageAlt}
                          width="80"
                          height="80"
                          loading={index < 6 ? 'eager' : 'lazy'}
                          className="w-full h-full object-cover contrast-110"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-1.5 text-center">
                          <span className="text-2xl leading-none">
                            {ev.categoryEmoji}
                          </span>
                          <span className="mt-1 font-display-slap text-[8px] uppercase tracking-tighter leading-none">
                            {ev.categoryLabel.split(' ')[0]}
                          </span>
                        </div>
                      )}

                      {ev.isLiveNow && (
                        <span className="absolute bottom-0 inset-x-0 bg-[#ff2a85] text-white font-mono-stamp text-[8px] font-bold uppercase text-center leading-tight flex items-center justify-center gap-0.5">
                          <Flame aria-hidden="true" className="w-2.5 h-2.5" />
                          LIVE
                        </span>
                      )}
                    </div>

                    {/* Minimal, High-Impact Flyer Copy */}
                    <div className="flex-1 min-w-0 pr-5 flex flex-col justify-between">
                      <div>
                        {/* Tilted Category + Free Stamp */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span
                            className="px-1.5 py-[1px] rounded-xs font-display-slap text-[9px] uppercase tracking-tight border border-[#0d0e11] -rotate-1"
                            style={{
                              backgroundColor: topicMeta.slapBg,
                              color: topicMeta.slapText,
                            }}
                          >
                            {ev.categoryEmoji} {ev.categoryLabel.split(' ')[0]}
                          </span>

                          {ev.isFree && (
                            <span className="px-1.5 py-[1px] rounded-xs bg-[#22c55e] text-[#0d0e11] border border-[#0d0e11] font-mono-stamp text-[9px] font-bold uppercase rotate-1">
                              FREE
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <h3
                          className={`text-sm font-extrabold line-clamp-2 leading-snug ${
                            isPaperVariant ? 'text-[#0d0e11]' : 'text-[#f6f3ec]'
                          }`}
                        >
                          {ev.title}
                        </h3>
                      </div>

                      {/* Hand-stamped Venue + Time + Distance line */}
                      <div className="mt-2 flex items-center justify-between gap-2 font-mono-stamp text-[10px]">
                        <span
                          className={`truncate font-bold uppercase ${
                            isPaperVariant ? 'text-[#1f232a]' : 'text-[#d5d2c8]'
                          }`}
                        >
                          {ev.venueName}
                        </span>

                        <span
                          className={`shrink-0 font-bold flex items-center gap-1 ${
                            isPaperVariant
                              ? 'text-[#0d0e11] bg-[#ffe600] px-1.5 py-[1px] border border-[#0d0e11]'
                              : 'text-[#ffe600]'
                          }`}
                        >
                          <MapPin aria-hidden="true" className="w-2.5 h-2.5" />
                          {formatDistance(ev.distanceKm)}
                        </span>
                      </div>

                      <div
                        className={`font-mono-stamp text-[10px] font-bold ${
                          isPaperVariant ? 'text-[#475569]' : 'text-[#9e9a8e]'
                        }`}
                      >
                        {dateFmt.format(ev.startTime)} • {timeFmt.format(ev.startTime)}
                      </div>
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
