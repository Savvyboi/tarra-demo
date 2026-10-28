import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Flame,
  Globe,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { CITIES, TOPICS } from '../../config/cities';
import {
  CityId,
  ListSortMode,
  NormalizedEvent,
} from '../../types/linkedEvents';
import {
  FINLAND_TIMEZONE,
  formatEventTimeLabel,
  safeParseDateKey,
} from '../../utils/calendarUtils';
import { formatDistance } from '../../utils/distanceUtils';
import { getSafeEventImageUrl } from '../../utils/licenseGuard';

export interface EventListViewProps {
  activeCity: CityId;
  events: NormalizedEvent[];
  savedEventIds: string[];
  now?: Date;
  loading?: boolean;
  feedError?: string | null;
  selectedDate?: string | null;
  coverageStart?: string | null;
  coverageEnd?: string | null;
  isStale?: boolean;
  generatedAt?: string | null;
  totalUpstream?: number | null;
  loadedCount?: number;
  sortMode?: ListSortMode;
  onSortModeChange?: (mode: ListSortMode) => void;
  onToggleSaveEvent: (eventId: string, event?: NormalizedEvent) => void;
  onPlayStory: (event: NormalizedEvent) => void;
  onResetFilters: () => void;
  onClearDate?: () => void;
  onRetry?: () => void;
}

const INITIAL_VISIBLE_CARDS = 40;
const VISIBLE_CARDS_STEP = 40;

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

// Hoisted Europe/Helsinki formatters (`PERF-02`, `BUG-07`)
const selectedDateBannerFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINLAND_TIMEZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const generatedDateOnlyFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINLAND_TIMEZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const generatedDateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINLAND_TIMEZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function hashEventId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function compareChronological(
  a: NormalizedEvent,
  b: NormalizedEvent,
  nowMs: number,
  selectedDate?: string | null
): number {
  const aNext = !selectedDate
    ? Math.max(a.startTime.getTime(), nowMs)
    : a.startTime.getTime();
  const bNext = !selectedDate
    ? Math.max(b.startTime.getTime(), nowMs)
    : b.startTime.getTime();
  if (aNext !== bNext) return aNext - bNext;
  if (Boolean(a.isOngoingLongSpan) !== Boolean(b.isOngoingLongSpan)) {
    return a.isOngoingLongSpan ? 1 : -1;
  }
  const aDur = a.endTime.getTime() - a.startTime.getTime();
  const bDur = b.endTime.getTime() - b.startTime.getTime();
  if (aDur !== bDur) return aDur - bDur;
  return a.startTime.getTime() - b.startTime.getTime();
}

function compareNullableDistance(
  a: NormalizedEvent,
  b: NormalizedEvent,
  nowMs: number,
  selectedDate?: string | null
): number {
  const aHas = a.distanceKm !== null && Number.isFinite(a.distanceKm);
  const bHas = b.distanceKm !== null && Number.isFinite(b.distanceKm);
  if (aHas && bHas) {
    const diff = (a.distanceKm as number) - (b.distanceKm as number);
    if (diff !== 0) return diff;
  }
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  return compareChronological(a, b, nowMs, selectedDate);
}

/**
 * Shared sort order for Pole Feed cards and Flyer navigation when opened from the list (`UI-05`).
 */
export function sortEventsForList(
  events: NormalizedEvent[],
  sortMode: ListSortMode,
  now: Date = new Date(),
  selectedDate?: string | null
): NormalizedEvent[] {
  const nowMs = now.getTime();
  const list = [...events];
  list.sort((a, b) => {
    if (sortMode === 'distance') {
      return compareNullableDistance(a, b, nowMs, selectedDate);
    }
    if (sortMode === 'live') {
      if (a.isLiveNow !== b.isLiveNow) return a.isLiveNow ? -1 : 1;
      if (a.isStartingSoon !== b.isStartingSoon) {
        return a.isStartingSoon ? -1 : 1;
      }
      return compareNullableDistance(a, b, nowMs, selectedDate);
    }
    return compareChronological(a, b, nowMs, selectedDate);
  });
  return list;
}

export const EventListView: React.FC<EventListViewProps> = ({
  activeCity,
  events,
  savedEventIds,
  now: nowProp,
  loading = false,
  feedError = null,
  selectedDate = null,
  coverageStart = null,
  coverageEnd = null,
  isStale = false,
  generatedAt = null,
  totalUpstream = null,
  loadedCount,
  sortMode: controlledSortMode,
  onSortModeChange,
  onToggleSaveEvent,
  onPlayStory,
  onResetFilters,
  onClearDate,
  onRetry,
}) => {
  const now = useMemo(() => nowProp ?? new Date(), [nowProp]);
  const [internalSortMode, setInternalSortMode] =
    useState<ListSortMode>('distance');
  const sortMode = controlledSortMode ?? internalSortMode;

  const paginationKey = `${activeCity}|${selectedDate ?? ''}|${sortMode}`;
  const [paginationState, setPaginationState] = useState<{
    key: string;
    count: number;
  }>({
    key: paginationKey,
    count: INITIAL_VISIBLE_CARDS,
  });

  const visibleCount =
    paginationState.key === paginationKey
      ? paginationState.count
      : INITIAL_VISIBLE_CARDS;

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleSortChange = (mode: ListSortMode) => {
    if (onSortModeChange) {
      onSortModeChange(mode);
    } else {
      setInternalSortMode(mode);
    }
  };

  const cityMeta = CITIES[activeCity];

  const sortedEvents = useMemo(
    () => sortEventsForList(events, sortMode, now, selectedDate),
    [events, sortMode, now, selectedDate]
  );

  const visibleEvents = useMemo(
    () => sortedEvents.slice(0, visibleCount),
    [sortedEvents, visibleCount]
  );

  const hasMoreCards = sortedEvents.length > visibleCount;

  useEffect(() => {
    if (!hasMoreCards) return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPaginationState((prev) => {
            const current =
              prev.key === paginationKey ? prev.count : INITIAL_VISIBLE_CARDS;
            return {
              key: paginationKey,
              count: Math.min(sortedEvents.length, current + VISIBLE_CARDS_STEP),
            };
          });
        }
      },
      { rootMargin: '480px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreCards, paginationKey, sortedEvents.length]);

  const savedIdSet = useMemo(() => new Set(savedEventIds), [savedEventIds]);

  const isDateOutsideCoverage = useMemo(() => {
    if (!selectedDate) return false;
    if (coverageStart && selectedDate < coverageStart) return true;
    if (coverageEnd && selectedDate > coverageEnd) return true;
    return false;
  }, [selectedDate, coverageStart, coverageEnd]);

  const formattedSelectedDate = useMemo(() => {
    if (!selectedDate) return null;
    return selectedDateBannerFmt.format(safeParseDateKey(selectedDate));
  }, [selectedDate]);

  const formattedGeneratedDateOnly = useMemo(() => {
    if (!generatedAt) return null;
    const d = new Date(generatedAt);
    return Number.isNaN(d.getTime()) ? null : generatedDateOnlyFmt.format(d);
  }, [generatedAt]);

  const formattedGeneratedDateTime = useMemo(() => {
    if (!generatedAt) return null;
    const d = new Date(generatedAt);
    return Number.isNaN(d.getTime()) ? null : generatedDateTimeFmt.format(d);
  }, [generatedAt]);

  return (
    <main
      aria-label={`${cityMeta.name} Pole Sticker Feed`}
      aria-busy={loading}
      className="relative w-full h-full overflow-y-auto overflow-x-hidden street-box-bg px-3.5 sm:pl-6 sm:pr-20 lg:px-6 pt-16 pb-28 sm:pb-20"
    >
      {/* Continuous Vertical Galvanized Steel Pole Spine running behind the stickers */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-1/2 -translate-x-1/2 w-20 sm:w-32 md:w-44 galvanized-pole-spine z-0 flex flex-col justify-between py-24"
      >
        <div className="pole-clamp-band h-5 w-full flex items-center justify-between px-2">
          <span className="w-2 h-2 rounded-full bg-[#1a1d22] border border-[#bbc4d0]" />
          <span className="font-mono-stamp text-[11px] font-bold tracking-widest text-[#111317] uppercase hidden sm:inline">
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
        {/* Minimal Organic Sort Slaps directly on the Pole */}
        <div
          role="group"
          aria-label="Sort events"
          className="flex items-center justify-center gap-2.5 mt-1 mb-5 flex-wrap"
        >
          {(
            [
              {
                id: 'distance',
                label: '📍 Nearest',
                title: 'Sort by closest known venue distance',
                rot: '-3.5deg',
                rad: '12px 4px 10px 5px',
              },
              {
                id: 'time',
                label: '⏰ Soonest',
                title: 'Sort chronologically by upcoming start time',
                rot: '2.4deg',
                rad: '5px 13px 4px 11px',
              },
              {
                id: 'live',
                label: '🔥 Live first',
                title: 'Sort currently live events to the top',
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
                aria-pressed={active}
                title={opt.title}
                onClick={() => handleSortChange(opt.id)}
                style={
                  {
                    '--slap-rot': opt.rot,
                    '--slap-radius': opt.rad,
                  } as React.CSSProperties
                }
                className={`organic-slap-btn px-3 py-1 font-display-slap text-xs uppercase tracking-tight cursor-pointer border-2 focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
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

        {/* Stale / Offline or Coverage Info Strip */}
        {(isStale || (feedError && sortedEvents.length > 0)) && (
          <div
            role="status"
            className="mb-4 px-3 py-2 rounded-lg bg-[#16191f]/95 border-2 border-[#ffe600] text-xs text-[#f4f1ea] flex items-center justify-between gap-2 max-w-lg mx-auto shadow"
          >
            <span className="font-mono-stamp text-[11px]">
              {feedError
                ? `⚠️ Live update failed (${feedError}). Showing cached stickers.`
                : `⚠️ Showing cached / snapshot feed${
                    formattedGeneratedDateOnly
                      ? ` (updated ${formattedGeneratedDateOnly})`
                      : ''
                  }.`}
            </span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="px-2 py-0.5 rounded-xs bg-[#ffe600] text-[#0d0e11] font-mono-stamp text-[11px] font-bold uppercase cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#f4f1ea] focus-visible:outline-offset-2"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Distinct Loading, Error, No-Coverage, and No-Match States */}
        {loading && sortedEvents.length === 0 ? (
          <div
            role="status"
            aria-live="polite"
            style={
              {
                '--slap-rot': '-1.2deg',
                '--slap-radius': '14px 5px 12px 6px',
              } as React.CSSProperties
            }
            className="pole-sticker-slap tarra-paper-slap p-6 text-center space-y-3 max-w-sm mx-auto mt-8"
          >
            <div className="flex items-center justify-center gap-2 text-[#0d0e11]">
              <RefreshCw
                aria-hidden="true"
                className="w-5 h-5 animate-spin text-[#ff2a85]"
              />
              <p className="font-display-slap text-base uppercase">
                Loading {cityMeta.name} Events...
              </p>
            </div>
            <p className="font-mono-stamp text-xs text-[#334155]">
              Fetching verified event stickers for {cityMeta.name}.
            </p>
          </div>
        ) : feedError && sortedEvents.length === 0 ? (
          <div
            role="alert"
            style={
              {
                '--slap-rot': '1.5deg',
                '--slap-radius': '14px 5px 12px 6px',
              } as React.CSSProperties
            }
            className="pole-sticker-slap tarra-paper-slap p-6 text-center space-y-3 max-w-sm mx-auto mt-8"
          >
            <div className="flex items-center justify-center gap-2 text-[#e11d48]">
              <AlertTriangle aria-hidden="true" className="w-5 h-5" />
              <p className="font-display-slap text-base uppercase text-[#0d0e11]">
                Could Not Load Event Feed
              </p>
            </div>
            <p className="font-mono-stamp text-xs text-[#334155]">
              {feedError}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                style={
                  {
                    '--slap-rot': '-1.5deg',
                    '--slap-radius': '8px 3px 10px 4px',
                  } as React.CSSProperties
                }
                className="organic-slap-btn inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#ffe600] text-[#0d0e11] border-2 border-[#0d0e11] font-display-slap text-xs uppercase cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0d0e11] focus-visible:outline-offset-2"
              >
                <RefreshCw aria-hidden="true" className="w-3.5 h-3.5" />
                <span>Retry Fetch</span>
              </button>
            )}
          </div>
        ) : sortedEvents.length === 0 ? (
          <div
            role="status"
            aria-live="polite"
            style={
              {
                '--slap-rot': '-1.8deg',
                '--slap-radius': '14px 5px 12px 6px',
              } as React.CSSProperties
            }
            className="pole-sticker-slap tarra-paper-slap p-6 text-center space-y-3 max-w-sm mx-auto mt-8"
          >
            <p className="font-display-slap text-base uppercase text-[#0d0e11]">
              {selectedDate && isDateOutsideCoverage
                ? 'Date outside loaded coverage'
                : selectedDate
                  ? 'No events available for this date'
                  : 'No events match your filters'}
            </p>
            <p className="font-mono-stamp text-xs text-[#334155]">
              {selectedDate && isDateOutsideCoverage
                ? `The loaded ${cityMeta.name} snapshot covers ${coverageStart || 'current dates'} through ${coverageEnd || 'upcoming dates'}. No events are fabricated for uncovered dates.`
                : selectedDate
                  ? `No verified events take place on ${formattedSelectedDate || selectedDate} with the active filters.`
                  : 'Try clearing your search query or active category/time filters.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {selectedDate && onClearDate && (
                <button
                  type="button"
                  onClick={onClearDate}
                  style={
                    {
                      '--slap-rot': '-1.5deg',
                      '--slap-radius': '8px 3px 10px 4px',
                    } as React.CSSProperties
                  }
                  className="organic-slap-btn px-3.5 py-1.5 bg-[#ffe600] text-[#0d0e11] border-2 border-[#0d0e11] font-display-slap text-xs uppercase cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0d0e11] focus-visible:outline-offset-2"
                >
                  Show All Dates
                </button>
              )}
              <button
                type="button"
                onClick={onResetFilters}
                style={
                  {
                    '--slap-rot': '2deg',
                    '--slap-radius': '8px 3px 10px 4px',
                  } as React.CSSProperties
                }
                className="organic-slap-btn px-3.5 py-1.5 bg-[#ff2a85] text-[#0d0e11] border-2 border-[#0d0e11] font-display-slap text-xs uppercase cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0d0e11] focus-visible:outline-offset-2"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6 px-1 sm:px-2">
              {visibleEvents.map((ev, index) => {
                const isSaved =
                  savedIdSet.has(ev.id) ||
                  ev.aliasIds.some((id) => savedIdSet.has(id));
                const safeImg = getSafeEventImageUrl(
                  ev.raw,
                  ev.id,
                  ev.aliasIds
                );
                const topicMeta =
                  TOPICS.find((t) => t.id === ev.category) || TOPICS[0];

                const h = hashEventId(ev.id);
                const rot = POLE_ANGLES[(h + index) % POLE_ANGLES.length];
                const offsetX =
                  POLE_OFFSETS_X[(h + index) % POLE_OFFSETS_X.length];
                const radius = POLE_RADII[(h + index) % POLE_RADII.length];
                const variant = (h + index) % 4;

                // Variant 1 is wheatpaste paper white; others are dark vinyl slaps
                const isPaperVariant = variant === 1;
                const isPostalVariant = variant === 3;

                // Modern Web Guidance (defer-rendering-heavy-content):
                // Only apply content-visibility: auto to items outside the initial viewport fold (index >= 8)
                const deferredClass = index >= 8 ? 'event-card-deferred' : '';

                const scheduleLabel = formatEventTimeLabel(ev, {
                  selectedDate,
                  now,
                });

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
                    className={`${deferredClass} pole-sticker-slap relative overflow-hidden ${
                      isPaperVariant
                        ? 'bg-[#f4f1ea] text-[#0d0e11] border-[2.5px] border-[#0d0e11] outline-2 outline-[#f4f1ea]'
                        : 'bg-[#171a20] text-[#f4f1ea] border-[2.5px] border-[#f4f1ea]'
                    }`}
                  >
                    {/* Optional top postal stripe on variant 3 */}
                    {isPostalVariant && (
                      <div
                        aria-hidden="true"
                        className="h-1.5 w-full postal-stripe-bar"
                      />
                    )}

                    {/* Quick Corner Save/Stash Slap (sibling control above stretched primary button, `A11Y-01`) */}
                    <button
                      type="button"
                      onClick={() => onToggleSaveEvent(ev.id, ev)}
                      title={
                        isSaved
                          ? 'Remove from Saved Stash'
                          : 'Save event to Stash'
                      }
                      aria-pressed={isSaved}
                      aria-label={
                        isSaved
                          ? `Remove ${ev.title} from saved stash`
                          : `Save ${ev.title} to stash`
                      }
                      className={`absolute top-2 right-2 z-20 w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-115 cursor-pointer border-[1.5px] focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
                        isSaved
                          ? 'bg-[#ff2a85] text-[#0d0e11] border-[#0d0e11] rotate-6'
                          : isPaperVariant
                            ? 'bg-[#0d0e11]/10 hover:bg-[#0d0e11]/20 text-[#0d0e11] border-[#0d0e11]/40 -rotate-6'
                            : 'bg-[#0d0e11]/75 hover:bg-[#0d0e11] text-[#f4f1ea] border-[#f4f1ea]/50 -rotate-6'
                      }`}
                    >
                      <Bookmark
                        aria-hidden="true"
                        className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`}
                      />
                    </button>

                    <div className="flex gap-3 p-3">
                      {/* Framed Crooked Thumbnail or Graphic Stamp */}
                      <div
                        title={ev.attribution.badgeText}
                        className={`relative w-20 h-20 rounded-md overflow-hidden shrink-0 border-2 ${
                          isPaperVariant
                            ? 'border-[#0d0e11]'
                            : 'border-[#f4f1ea]'
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
                            title={ev.attribution.badgeText}
                            width="80"
                            height="80"
                            loading={index < 6 ? 'eager' : 'lazy'}
                            className="w-full h-full object-cover contrast-110"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-1.5 text-center">
                            <span className="text-2xl leading-none select-none">
                              {ev.categoryEmoji}
                            </span>
                            <span className="mt-1 font-display-slap text-[11px] uppercase tracking-tighter leading-none">
                              {ev.categoryLabel.split(' ')[0]}
                            </span>
                          </div>
                        )}

                        {ev.isLiveNow ? (
                          <span className="absolute bottom-0 inset-x-0 bg-[#ff2a85] text-[#0d0e11] font-mono-stamp text-[11px] font-bold uppercase text-center leading-tight flex items-center justify-center gap-0.5">
                            <Flame aria-hidden="true" className="w-2.5 h-2.5" />
                            LIVE
                          </span>
                        ) : ev.isOngoingLongSpan ? (
                          <span className="absolute bottom-0 inset-x-0 bg-[#121418]/90 text-[#ffe600] font-mono-stamp text-[11px] font-bold uppercase text-center leading-tight">
                            ON NOW
                          </span>
                        ) : null}
                      </div>

                      {/* Minimal, High-Impact Flyer Copy */}
                      <div className="flex-1 min-w-0 pr-7 flex flex-col justify-between">
                        <div>
                          {/* Tilted Category + Honest Price Stamp (`DATA-05`, `A11Y-04`) */}
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span
                              className="px-1.5 py-[1px] rounded-xs font-display-slap text-[11px] uppercase tracking-tight border border-[#0d0e11] -rotate-1"
                              style={{
                                backgroundColor: topicMeta.slapBg,
                                color: topicMeta.slapText,
                              }}
                            >
                              {ev.categoryEmoji}{' '}
                              {ev.categoryLabel.split(' ')[0]}
                            </span>

                            {ev.priceStatus === 'free' ? (
                              <span className="px-1.5 py-[1px] rounded-xs bg-[#22c55e] text-[#0d0e11] border border-[#0d0e11] font-mono-stamp text-[11px] font-bold uppercase rotate-1">
                                FREE
                              </span>
                            ) : ev.priceStatus === 'paid' ? (
                              <span
                                className={`px-1.5 py-[1px] rounded-xs font-mono-stamp text-[11px] font-bold rotate-1 border ${
                                  isPaperVariant
                                    ? 'bg-[#0d0e11] text-[#ffe600] border-[#0d0e11]'
                                    : 'bg-[#262b33] text-[#ffe600] border-white/25'
                                }`}
                              >
                                {ev.priceText}
                              </span>
                            ) : (
                              <span
                                className={`px-1.5 py-[1px] rounded-xs font-mono-stamp text-[11px] rotate-1 border ${
                                  isPaperVariant
                                    ? 'bg-[#e2ded3] text-[#334155] border-[#0d0e11]/35'
                                    : 'bg-[#1f242c] text-[#c7c4b8] border-white/20'
                                }`}
                              >
                                {ev.priceText || 'Price not provided'}
                              </span>
                            )}
                          </div>

                          {/* Title with stretched primary button (`A11Y-01` Modern Web Guidance `card` pattern) */}
                          <h3
                            className={`text-sm font-extrabold line-clamp-2 leading-snug ${
                              isPaperVariant
                                ? 'text-[#0d0e11]'
                                : 'text-[#f6f3ec]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => onPlayStory(ev)}
                              aria-label={`Open event flyer for ${ev.title} at ${ev.venueName}`}
                              className="card-primary-btn text-left cursor-pointer"
                            >
                              {ev.title}
                            </button>
                          </h3>
                        </div>

                        {/* Hand-stamped Venue + Honest Distance/Location line */}
                        <div className="mt-2 flex items-center justify-between gap-2 font-mono-stamp text-[11px]">
                          <span
                            className={`truncate font-bold uppercase ${
                              isPaperVariant
                                ? 'text-[#1f232a]'
                                : 'text-[#d5d2c8]'
                            }`}
                          >
                            {ev.venueName}
                          </span>

                          {ev.distanceKm !== null ? (
                            <span
                              className={`shrink-0 font-bold flex items-center gap-1 ${
                                isPaperVariant
                                  ? 'text-[#0d0e11] bg-[#ffe600] px-1.5 py-[1px] border border-[#0d0e11]'
                                  : 'text-[#ffe600]'
                              }`}
                            >
                              <MapPin
                                aria-hidden="true"
                                className="w-3 h-3"
                              />
                              {formatDistance(ev.distanceKm)}
                            </span>
                          ) : (
                            <span
                              className={`shrink-0 font-bold flex items-center gap-1 ${
                                isPaperVariant
                                  ? 'text-[#334155]'
                                  : 'text-[#b8b4a8]'
                              }`}
                            >
                              {ev.isOnline ? (
                                <>
                                  <Globe
                                    aria-hidden="true"
                                    className="w-3 h-3"
                                  />
                                  <span>Online</span>
                                </>
                              ) : (
                                <span>No map pin</span>
                              )}
                            </span>
                          )}
                        </div>

                        <div
                          className={`font-mono-stamp text-[11px] font-bold ${
                            isPaperVariant
                              ? 'text-[#334155]'
                              : 'text-[#c7c4b8]'
                          }`}
                        >
                          {scheduleLabel}
                          {ev.occurrenceDates.length > 1 && (
                            <span className="ml-1.5 text-[11px]">
                              ({ev.occurrenceDates.length} dates)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {hasMoreCards && (
              <div
                ref={sentinelRef}
                className="mt-6 flex flex-col items-center justify-center gap-2"
              >
                <button
                  type="button"
                  onClick={() =>
                    setPaginationState((prev) => {
                      const current =
                        prev.key === paginationKey
                          ? prev.count
                          : INITIAL_VISIBLE_CARDS;
                      return {
                        key: paginationKey,
                        count: Math.min(
                          sortedEvents.length,
                          current + VISIBLE_CARDS_STEP
                        ),
                      };
                    })
                  }
                  style={
                    {
                      '--slap-rot': '-1.4deg',
                      '--slap-radius': '10px 4px 12px 5px',
                    } as React.CSSProperties
                  }
                  className="organic-slap-btn px-4 py-2 bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border-2 border-[#0d0e11] font-display-slap text-xs uppercase cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f4f1ea] focus-visible:outline-offset-2"
                >
                  Show more stickers ({sortedEvents.length - visibleCount}{' '}
                  remaining)
                </button>
              </div>
            )}
          </>
        )}

        {/* Feed Coverage & Freshness Footer */}
        {(loadedCount !== undefined || coverageStart) && (
          <div className="mt-8 text-center font-mono-stamp text-[11px] text-[#c7c4b8] space-y-0.5">
            <p>
              Showing {visibleEvents.length} of {sortedEvents.length} matching (
              {loadedCount ?? events.length} loaded events
              {totalUpstream && totalUpstream > (loadedCount ?? events.length)
                ? `, snapshot from ${totalUpstream} upstream records`
                : ''}
              )
              {coverageStart && coverageEnd
                ? ` • Coverage: ${coverageStart} – ${coverageEnd}`
                : ''}
            </p>
            {formattedGeneratedDateTime && (
              <p>Feed snapshot updated: {formattedGeneratedDateTime}</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
};
