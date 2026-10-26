import React, { useEffect, useRef, useState } from 'react';
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
  buildGoogleCalendarUrl,
  downloadEventIcs,
  safeParseDateKey,
} from '../../utils/calendarUtils';
import { formatDistance } from '../../utils/distanceUtils';

interface DayAgendaDrawerProps {
  isOpen: boolean;
  initialTab?: 'schedule' | 'saved';
  cityName: string;
  selectedDate: string | null;
  events: NormalizedEvent[];
  savedEventIds: string[];
  allSavedEvents: NormalizedEvent[];
  unresolvedSavedIds?: string[];
  resolvingSavedIds?: boolean;
  onToggleSaveEvent: (eventId: string, event?: NormalizedEvent) => void;
  onSelectEvent: (event: NormalizedEvent) => void;
  onClose: () => void;
}

export const DayAgendaDrawer: React.FC<DayAgendaDrawerProps> = ({
  isOpen,
  initialTab = 'saved',
  cityName,
  selectedDate,
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
  const [activeTab, setActiveTab] = useState<'schedule' | 'saved'>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Open/close native <dialog> using showModal() with focus restoration & light-dismiss fallback (Finding 14)
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

    // Fallback for browsers without declarative <dialog closedby="any"> support
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

  const listToRender =
    activeTab === 'schedule'
      ? [...events].sort(
          (a, b) => a.startTime.getTime() - b.startTime.getTime()
        )
      : allSavedEvents;

  const formattedDateHeader = selectedDate
    ? new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(safeParseDateKey(selectedDate))
    : `${cityName} Pole Schedule`;

  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const shortDateFmt = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const savedBadgeCount = Math.max(savedEventIds.length, allSavedEvents.length);

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="agenda-drawer-title"
      className="m-0 ml-auto w-full max-w-md h-dvh max-h-dvh bg-[#15181d] border-l-[3px] border-[#f4f1ea] shadow-2xl p-0 text-[#f4f1ea] outline-none"
    >
      <div className="w-full h-full flex flex-col">
        {/* Drawer Header */}
        <div className="p-4 bg-[#111317] border-b-2 border-[#f4f1ea]/20 flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-[#ffe600] text-[#0d0e11] font-mono-stamp text-[10px] font-bold uppercase">
                STASH
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
            className="p-2 rounded-md bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border border-[#0d0e11] cursor-pointer shrink-0"
          >
            <X aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs: Saved Sticker Stash vs Day Schedule */}
        <div
          role="tablist"
          aria-label="Stash and schedule tabs"
          className="px-4 pt-3 flex items-center gap-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'saved'}
            onClick={() => setActiveTab('saved')}
            className={`flex-1 py-2 rounded-lg font-grotesk text-xs font-extrabold uppercase tracking-tight transition-all cursor-pointer flex items-center justify-center gap-1.5 border-2 ${
              activeTab === 'saved'
                ? 'bg-[#ff2a85] text-white border-[#f4f1ea] shadow-[2px_2px_0px_#07080a]'
                : 'bg-[#111317] text-[#d5d2c8] border-white/15 hover:border-white/40'
            }`}
          >
            <Bookmark aria-hidden="true" className="w-3.5 h-3.5" />
            <span>Saved Stash ({savedBadgeCount})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'schedule'}
            onClick={() => setActiveTab('schedule')}
            className={`flex-1 py-2 rounded-lg font-grotesk text-xs font-extrabold uppercase tracking-tight transition-all cursor-pointer border-2 ${
              activeTab === 'schedule'
                ? 'bg-[#ffe600] text-[#0d0e11] border-[#0d0e11] shadow-[2px_2px_0px_#07080a]'
                : 'bg-[#111317] text-[#d5d2c8] border-white/15 hover:border-white/40'
            }`}
          >
            📅 Pole Schedule ({events.length})
          </button>
        </div>

        {/* Chronological Event Stickers */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
              {listToRender.map((ev) => {
                const isSaved =
                  savedEventIds.includes(ev.id) ||
                  ev.aliasIds.some((id) => savedEventIds.includes(id));
                const exportDateKey =
                  activeTab === 'schedule' ? selectedDate : null;
                const evCityName = CITIES[ev.cityId]?.name || ev.cityId;

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
                        className="text-left flex-1 min-w-0 cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm">{ev.categoryEmoji}</span>
                          <span className="px-1.5 py-[1px] rounded-xs bg-[#262b33] text-[#f4f1ea] font-mono-stamp text-[9px] font-bold uppercase">
                            {evCityName}
                          </span>
                          <span className="font-mono-stamp text-[10px] font-bold uppercase tracking-tight text-[#ffe600]">
                            {shortDateFmt.format(ev.startTime)} •{' '}
                            {timeFmt.format(ev.startTime)}–
                            {timeFmt.format(ev.endTime)}
                          </span>
                          {ev.isLiveNow && (
                            <span className="px-1.5 py-[1px] rounded-sm bg-[#ff2a85] font-mono-stamp text-[9px] font-bold uppercase text-white">
                              ● LIVE
                            </span>
                          )}
                          <span
                            className={`px-2 py-[1px] rounded-sm font-mono-stamp text-[10px] font-bold flex items-center gap-1 ${
                              ev.priceStatus === 'free'
                                ? 'bg-[#22c55e] text-[#0d0e11]'
                                : ev.priceStatus === 'paid'
                                  ? 'bg-[#ffe600] text-[#0d0e11]'
                                  : 'bg-[#262b33] text-[#d5d2c8]'
                            }`}
                          >
                            <Ticket aria-hidden="true" className="w-2.5 h-2.5" />
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
                        className={`p-2 rounded-md border transition-colors cursor-pointer shrink-0 ${
                          isSaved
                            ? 'bg-[#ff2a85] border-[#f4f1ea] text-white'
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
                        className="px-2.5 py-1 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-white/15 text-[#f4f1ea] font-bold inline-flex items-center gap-1 cursor-pointer"
                        title="Download .ics file for Apple/Outlook Calendar"
                      >
                        <CalendarPlus
                          aria-hidden="true"
                          className="w-3 h-3 text-[#ffe600]"
                        />
                        <span>.ICS</span>
                      </button>

                      <a
                        href={buildGoogleCalendarUrl(ev, exportDateKey)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-white/15 text-[#f4f1ea] font-bold inline-flex items-center gap-1"
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
                          className="ml-auto px-2.5 py-1 rounded-md bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border border-[#0d0e11] font-bold inline-flex items-center gap-1"
                        >
                          <Navigation aria-hidden="true" className="w-3 h-3" />
                          <span>Transit</span>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Unresolved / Loading Cross-City Saved Items (Finding 08) */}
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
                      <p className="font-mono-stamp text-[10px] text-[#9e9a8e] truncate mt-0.5">
                        ID: {rawId}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleSaveEvent(rawId)}
                      aria-label={`Remove unavailable saved event ${rawId}`}
                      title="Remove from stash"
                      className="p-2 rounded-md bg-[#22262e] hover:bg-[#ff2a85] text-[#f4f1ea] hover:text-white border border-white/20 cursor-pointer shrink-0"
                    >
                      <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
};

