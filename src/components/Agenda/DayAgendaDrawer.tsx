import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  CalendarPlus,
  Clock,
  ExternalLink,
  MapPin,
  Navigation,
  RefreshCw,
  Ticket,
  Trash2,
  X,
} from 'lucide-react';
import { CITIES } from '../../config/cities';
import { NormalizedEvent } from '../../types/linkedEvents';
import {
  FINLAND_TIMEZONE,
  buildGoogleCalendarUrl,
  downloadEventIcs,
  formatEventTimeLabel,
  safeParseDateKey,
} from '../../utils/calendarUtils';
import { formatDistance } from '../../utils/distanceUtils';

interface DayAgendaDrawerProps {
  isOpen: boolean;
  initialTab?: 'schedule' | 'saved';
  cityName: string;
  selectedDate: string | null;
  now?: Date;
  events: NormalizedEvent[];
  savedEventIds: string[];
  allSavedEvents: NormalizedEvent[];
  unresolvedSavedIds?: string[];
  resolvingSavedIds?: boolean;
  onToggleSaveEvent: (eventId: string, event?: NormalizedEvent) => void;
  onSelectEvent: (event: NormalizedEvent) => void;
  onClose: () => void;
}

const INITIAL_DRAWER_BATCH = 30;
const DRAWER_BATCH_STEP = 30;

const longDateHeaderFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINLAND_TIMEZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export const DayAgendaDrawer: React.FC<DayAgendaDrawerProps> = ({
  isOpen,
  initialTab = 'saved',
  cityName,
  selectedDate,
  now: propNow,
  events,
  savedEventIds,
  allSavedEvents,
  unresolvedSavedIds = [],
  resolvingSavedIds = false,
  onToggleSaveEvent,
  onSelectEvent,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const savedTabRef = useRef<HTMLButtonElement | null>(null);
  const scheduleTabRef = useRef<HTMLButtonElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  const now = useMemo(() => propNow ?? new Date(), [propNow]);

  const tabSessionKey = `${isOpen ? '1' : '0'}|${initialTab}`;
  const [tabState, setTabState] = useState<{
    key: string;
    tab: 'schedule' | 'saved';
  }>({
    key: tabSessionKey,
    tab: initialTab,
  });
  const activeTab =
    tabState.key === tabSessionKey ? tabState.tab : initialTab;
  const setActiveTab = (tab: 'schedule' | 'saved') =>
    setTabState({ key: tabSessionKey, tab });

  const limitSessionKey = `${isOpen ? '1' : '0'}|${activeTab}|${selectedDate ?? ''}|${cityName}`;
  const [limitState, setLimitState] = useState<{
    key: string;
    limit: number;
  }>({
    key: limitSessionKey,
    limit: INITIAL_DRAWER_BATCH,
  });
  const visibleLimit =
    limitState.key === limitSessionKey
      ? limitState.limit
      : INITIAL_DRAWER_BATCH;

  // Open/close native <dialog> using showModal() with focus restoration & light-dismiss fallback
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (document.activeElement instanceof HTMLElement) {
        previousFocusRef.current = document.activeElement;
      }
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
      previousFocusRef.current?.focus?.();
    }

    const handleNativeClose = () => {
      onClose();
      previousFocusRef.current?.focus?.();
    };

    const handleBackdropClick = (event: MouseEvent) => {
      if ('closedBy' in HTMLDialogElement.prototype) return;
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (isDialogContent) return;
      dialog.close();
    };

    dialog.addEventListener('close', handleNativeClose);
    dialog.addEventListener('click', handleBackdropClick);

    return () => {
      dialog.removeEventListener('close', handleNativeClose);
      dialog.removeEventListener('click', handleBackdropClick);
    };
  }, [isOpen, onClose]);

  const listToRender = useMemo(() => {
    if (!isOpen) return [];
    if (activeTab === 'schedule') {
      return [...events].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime()
      );
    }
    return allSavedEvents;
  }, [isOpen, activeTab, events, allSavedEvents]);

  const visibleItems = useMemo(
    () => listToRender.slice(0, visibleLimit),
    [listToRender, visibleLimit]
  );
  const hasMoreItems = visibleItems.length < listToRender.length;

  useEffect(() => {
    if (!isOpen || !hasMoreItems) return;
    const node = loadMoreSentinelRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLimitState((prev) => ({
            key: limitSessionKey,
            limit:
              (prev.key === limitSessionKey
                ? prev.limit
                : INITIAL_DRAWER_BATCH) + DRAWER_BATCH_STEP,
          }));
        }
      },
      { rootMargin: '240px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isOpen, hasMoreItems, visibleItems.length, limitSessionKey]);

  const formattedDateHeader = selectedDate
    ? longDateHeaderFormatter.format(safeParseDateKey(selectedDate, now))
    : `${cityName} Pole Schedule`;

  const savedBadgeCount = Math.max(savedEventIds.length, allSavedEvents.length);

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      e.key !== 'ArrowLeft' &&
      e.key !== 'ArrowRight' &&
      e.key !== 'Home' &&
      e.key !== 'End'
    ) {
      return;
    }
    e.preventDefault();
    let nextTab: 'saved' | 'schedule';
    if (e.key === 'Home') {
      nextTab = 'saved';
    } else if (e.key === 'End') {
      nextTab = 'schedule';
    } else {
      nextTab = activeTab === 'saved' ? 'schedule' : 'saved';
    }
    setActiveTab(nextTab);
    if (nextTab === 'saved') {
      savedTabRef.current?.focus();
    } else {
      scheduleTabRef.current?.focus();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="agenda-drawer-title"
      className="m-0 ml-auto w-full max-w-md h-dvh max-h-dvh bg-[#15181d] border-l-[3px] border-[#f4f1ea] shadow-2xl p-0 text-[#f4f1ea] outline-none"
    >
      {/* Mount drawer body ONLY when open (`PERF-01`) */}
      {isOpen && (
        <div className="w-full h-full flex flex-col">
          {/* Drawer Header */}
          <div className="p-4 bg-[#111317] border-b-2 border-[#f4f1ea]/20 flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-[#ffe600] text-[#0d0e11] font-mono-stamp text-[11px] font-bold uppercase">
                  {activeTab === 'saved' ? 'STASH' : 'SCHEDULE'}
                </span>
                <h2
                  id="agenda-drawer-title"
                  className="text-base font-extrabold uppercase tracking-tight"
                >
                  {activeTab === 'saved'
                    ? 'Saved Sticker Stash'
                    : formattedDateHeader}
                </h2>
              </div>
              <p className="text-xs text-[#b8b4a8] mt-0.5">
                Tap any event sticker to open its flyer & jump to the venue
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Close schedule drawer"
              title="Close drawer (Esc)"
              className="p-2 rounded-md bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border border-[#0d0e11] cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
            >
              <X aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>

          {/* WAI-ARIA Tabs: Saved Sticker Stash vs Day Schedule (`A11Y-05`) */}
          <div
            role="tablist"
            aria-label="Stash and schedule tabs"
            onKeyDown={handleTabKeyDown}
            className="px-4 pt-3 flex items-center gap-2"
          >
            <button
              ref={savedTabRef}
              id="agenda-tab-saved"
              type="button"
              role="tab"
              aria-selected={activeTab === 'saved'}
              aria-controls="agenda-panel-saved"
              tabIndex={activeTab === 'saved' ? 0 : -1}
              onClick={() => setActiveTab('saved')}
              className={`flex-1 py-2 rounded-lg font-grotesk text-xs font-extrabold uppercase tracking-tight transition-all cursor-pointer flex items-center justify-center gap-1.5 border-2 focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
                activeTab === 'saved'
                  ? 'bg-[#ff2a85] text-[#0d0e11] border-[#f4f1ea] shadow-[2px_2px_0px_#07080a]'
                  : 'bg-[#111317] text-[#d5d2c8] border-white/15 hover:border-white/40'
              }`}
            >
              <Bookmark aria-hidden="true" className="w-3.5 h-3.5" />
              <span>Saved Stash ({savedBadgeCount})</span>
            </button>
            <button
              ref={scheduleTabRef}
              id="agenda-tab-schedule"
              type="button"
              role="tab"
              aria-selected={activeTab === 'schedule'}
              aria-controls="agenda-panel-schedule"
              tabIndex={activeTab === 'schedule' ? 0 : -1}
              onClick={() => setActiveTab('schedule')}
              className={`flex-1 py-2 rounded-lg font-grotesk text-xs font-extrabold uppercase tracking-tight transition-all cursor-pointer border-2 focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
                activeTab === 'schedule'
                  ? 'bg-[#ffe600] text-[#0d0e11] border-[#0d0e11] shadow-[2px_2px_0px_#07080a]'
                  : 'bg-[#111317] text-[#d5d2c8] border-white/15 hover:border-white/40'
              }`}
            >
              📅 Pole Schedule ({events.length})
            </button>
          </div>

          {/* Tabpanel (`A11Y-05`) */}
          <div
            id={
              activeTab === 'saved'
                ? 'agenda-panel-saved'
                : 'agenda-panel-schedule'
            }
            role="tabpanel"
            aria-labelledby={
              activeTab === 'saved'
                ? 'agenda-tab-saved'
                : 'agenda-tab-schedule'
            }
            tabIndex={0}
            className="flex-1 overflow-y-auto p-4 space-y-3 focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-[-2px]"
          >
            {listToRender.length === 0 &&
            (activeTab !== 'saved' || unresolvedSavedIds.length === 0) ? (
              <div className="text-center py-12 px-4 rounded-xl bg-[#111317] border-2 border-[#f4f1ea]/30 space-y-2">
                <p className="text-sm font-bold text-[#f4f1ea]">
                  {activeTab === 'saved'
                    ? 'No stickers saved in your stash yet'
                    : 'No event stickers match this date or filter'}
                </p>
                <p className="text-xs text-[#b8b4a8]">
                  {activeTab === 'saved'
                    ? 'Tap the bookmark icon on any event sticker or flyer to build your personal multi-city lineup.'
                    : 'Pick another date on the calendar or clear your active filters.'}
                </p>
              </div>
            ) : (
              <>
                {visibleItems.map((ev) => {
                  const isSaved =
                    savedEventIds.includes(ev.id) ||
                    ev.aliasIds.some((id) => savedEventIds.includes(id));
                  const exportDateKey =
                    activeTab === 'schedule' ? selectedDate : null;
                  const evCityName = CITIES[ev.cityId]?.name || ev.cityId;
                  const timeLabel = formatEventTimeLabel(ev, {
                    selectedDate: exportDateKey,
                    now,
                    includeEndTime: true,
                  });

                  return (
                    <div
                      key={ev.id}
                      className="group rounded-xl bg-[#1a1d23] border-2 border-[#f4f1ea] shadow-[3px_4px_0px_#07080a] p-3.5 transition-all space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectEvent(ev);
                            dialogRef.current?.close();
                          }}
                          className="text-left flex-1 min-w-0 cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm">{ev.categoryEmoji}</span>
                            <span className="px-1.5 py-[1px] rounded-xs bg-[#262b33] text-[#f4f1ea] font-mono-stamp text-[11px] font-bold uppercase">
                              {evCityName}
                            </span>
                            <span className="font-mono-stamp text-[11px] font-bold uppercase tracking-tight text-[#ffe600]">
                              {timeLabel}
                            </span>
                            {ev.isLiveNow ? (
                              <span className="px-1.5 py-[1px] rounded-sm bg-[#ff2a85] font-mono-stamp text-[11px] font-extrabold uppercase text-[#0d0e11]">
                                ● LIVE
                              </span>
                            ) : ev.isOngoingLongSpan ? (
                              <span className="px-1.5 py-[1px] rounded-sm bg-[#1f2630] border border-[#38bdf8]/50 font-mono-stamp text-[11px] font-bold uppercase text-[#38bdf8]">
                                ON NOW
                              </span>
                            ) : null}
                            <span
                              className={`px-2 py-[1px] rounded-sm font-mono-stamp text-[11px] font-bold flex items-center gap-1 ${
                                ev.priceStatus === 'free'
                                  ? 'bg-[#22c55e] text-[#0d0e11]'
                                  : ev.priceStatus === 'paid'
                                    ? 'bg-[#ffe600] text-[#0d0e11]'
                                    : 'bg-[#262b33] text-[#d5d2c8]'
                              }`}
                            >
                              <Ticket aria-hidden="true" className="w-3 h-3" />
                              {ev.priceText}
                            </span>
                          </div>

                          <h3 className="mt-1 text-sm font-bold text-[#f4f1ea] group-hover:text-[#ffe600] transition-colors">
                            {ev.title}
                          </h3>

                          <p className="mt-0.5 text-xs text-[#d5d2c8] flex items-center gap-1 truncate">
                            <MapPin
                              aria-hidden="true"
                              className="w-3 h-3 text-[#ff2a85] shrink-0"
                            />
                            {ev.distanceKm !== null && (
                              <span className="font-mono-stamp font-bold text-[#ffe600] shrink-0">
                                {formatDistance(ev.distanceKm)} •
                              </span>
                            )}
                            <span className="truncate">
                              {ev.venueName}
                              {ev.hasExactCoordinates
                                ? ` • ${ev.streetAddress}`
                                : ''}
                            </span>
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => onToggleSaveEvent(ev.id, ev)}
                          aria-label={
                            isSaved
                              ? `Remove ${ev.title} from saved stash`
                              : `Save ${ev.title}`
                          }
                          title={
                            isSaved ? 'Remove from Saved Stash' : 'Save Sticker'
                          }
                          className={`p-2 rounded-md border transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2 ${
                            isSaved
                              ? 'bg-[#ff2a85] border-[#f4f1ea] text-[#0d0e11]'
                              : 'bg-[#111317] border-white/20 text-[#b8b4a8] hover:text-white'
                          }`}
                        >
                          <Bookmark
                            aria-hidden="true"
                            className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`}
                          />
                        </button>
                      </div>

                      {/* Quick Calendar Export & Transit Actions */}
                      <div className="flex items-center gap-1.5 pt-2 border-t border-dashed border-white/20 font-mono-stamp text-[11px]">
                        <button
                          type="button"
                          onClick={() => downloadEventIcs(ev, exportDateKey)}
                          className="px-2.5 py-1 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-white/15 text-[#f4f1ea] font-bold inline-flex items-center gap-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
                          title="Download .ics file for Apple/Outlook Calendar"
                        >
                          <CalendarPlus
                            aria-hidden="true"
                            className="w-3 h-3 text-[#ffe600]"
                          />
                          <span>.ICS</span>
                        </button>

                        <a
                          href={buildGoogleCalendarUrl(ev, exportDateKey, now)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-white/15 text-[#f4f1ea] font-bold inline-flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
                          title="Add to Google Calendar"
                        >
                          <Clock
                            aria-hidden="true"
                            className="w-3 h-3 text-[#ff5500]"
                          />
                          <span>G-Cal</span>
                          <ExternalLink
                            aria-hidden="true"
                            className="w-2.5 h-2.5 opacity-70"
                          />
                        </a>

                        {ev.reittiopasUrl && (
                          <a
                            href={ev.reittiopasUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto px-2.5 py-1 rounded-md bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border border-[#0d0e11] font-bold inline-flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
                          >
                            <Navigation aria-hidden="true" className="w-3 h-3" />
                            <span>Transit</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}

                {hasMoreItems && (
                  <div
                    ref={loadMoreSentinelRef}
                    className="pt-2 pb-1 flex justify-center"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setLimitState((prev) => ({
                          key: limitSessionKey,
                          limit:
                            (prev.key === limitSessionKey
                              ? prev.limit
                              : INITIAL_DRAWER_BATCH) + DRAWER_BATCH_STEP,
                        }))
                      }
                      className="px-4 py-2 rounded-lg bg-[#22262e] hover:bg-[#2e333d] border-2 border-[#f4f1ea] text-xs font-extrabold uppercase text-[#ffe600] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
                    >
                      Show more ({listToRender.length - visibleItems.length}{' '}
                      remaining)
                    </button>
                  </div>
                )}

                {/* Unresolved / Loading Cross-City Saved Items */}
                {activeTab === 'saved' &&
                  unresolvedSavedIds.map((rawId) => (
                    <div
                      key={rawId}
                      className="rounded-xl bg-[#111317] border-2 border-dashed border-[#f4f1ea]/40 p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-mono-stamp text-xs font-bold text-[#ffe600] flex items-center gap-1.5">
                          {resolvingSavedIds && (
                            <RefreshCw
                              aria-hidden="true"
                              className="w-3.5 h-3.5 animate-spin"
                            />
                          )}
                          <span>
                            {resolvingSavedIds
                              ? 'Loading saved event details...'
                              : 'Saved event unavailable in current feed'}
                          </span>
                        </p>
                        <p className="font-mono-stamp text-[11px] text-[#b8b4a8] truncate mt-0.5">
                          ID: {rawId}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleSaveEvent(rawId)}
                        aria-label={`Remove unavailable saved event ${rawId}`}
                        title="Remove from stash"
                        className="p-2 rounded-md bg-[#22262e] hover:bg-[#ff2a85] text-[#f4f1ea] hover:text-[#0d0e11] border border-white/20 cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
                      >
                        <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
              </>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
};
