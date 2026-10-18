import React, { useState } from 'react';
import {
  Bookmark,
  CalendarPlus,
  Clock,
  ExternalLink,
  MapPin,
  Navigation,
  Ticket,
  X,
} from 'lucide-react';
import { NormalizedEvent } from '../../types/linkedEvents';
import {
  buildGoogleCalendarUrl,
  downloadEventIcs,
  parseDateKey,
} from '../../utils/calendarUtils';
import { formatDistance } from '../../utils/distanceUtils';

interface DayAgendaDrawerProps {
  isOpen: boolean;
  cityName: string;
  selectedDate: string | null;
  events: NormalizedEvent[];
  savedEventIds: string[];
  allSavedEvents: NormalizedEvent[];
  onToggleSaveEvent: (eventId: string) => void;
  onSelectEvent: (event: NormalizedEvent) => void;
  onClose: () => void;
}

export const DayAgendaDrawer: React.FC<DayAgendaDrawerProps> = ({
  isOpen,
  cityName,
  selectedDate,
  events,
  savedEventIds,
  allSavedEvents,
  onToggleSaveEvent,
  onSelectEvent,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'schedule' | 'saved'>('schedule');

  if (!isOpen) return null;

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
      }).format(parseDateKey(selectedDate))
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

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#0a0c0e]/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <aside
        aria-label="Day Schedule & Saved Sticker Stash"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full bg-[#15181d] border-l-[3px] border-[#f4f1ea] shadow-2xl flex flex-col text-[#f4f1ea]"
      >
        {/* Drawer Header */}
        <div className="p-4 bg-[#111317] border-b-2 border-[#f4f1ea]/20 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-[#ffe600] text-[#0d0e11] font-mono-stamp text-[10px] font-bold uppercase">
                STASH
              </span>
              <h2 className="text-base font-extrabold uppercase tracking-tight">
                {formattedDateHeader}
              </h2>
            </div>
            <p className="text-xs text-[#b8b4a8] mt-0.5">
              Tap any event sticker to open its flyer & jump to the venue
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close schedule drawer"
            className="p-2 rounded-md bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border border-[#0d0e11] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs: Day Schedule vs Saved Sticker Stash */}
        <div className="px-4 pt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={`flex-1 py-2 rounded-lg font-grotesk text-xs font-extrabold uppercase tracking-tight transition-all cursor-pointer border-2 ${
              activeTab === 'schedule'
                ? 'bg-[#ffe600] text-[#0d0e11] border-[#0d0e11] shadow-[2px_2px_0px_#07080a]'
                : 'bg-[#111317] text-[#d5d2c8] border-white/15 hover:border-white/40'
            }`}
          >
            📅 Pole Schedule ({events.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={`flex-1 py-2 rounded-lg font-grotesk text-xs font-extrabold uppercase tracking-tight transition-all cursor-pointer flex items-center justify-center gap-1.5 border-2 ${
              activeTab === 'saved'
                ? 'bg-[#ff2a85] text-white border-[#f4f1ea] shadow-[2px_2px_0px_#07080a]'
                : 'bg-[#111317] text-[#d5d2c8] border-white/15 hover:border-white/40'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Saved Stash ({allSavedEvents.length})</span>
          </button>
        </div>

        {/* Chronological Event Stickers */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {listToRender.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-xl bg-[#111317] border-2 border-[#f4f1ea]/30 space-y-2">
              <p className="text-sm font-bold text-[#f4f1ea]">
                {activeTab === 'saved'
                  ? 'No stickers saved in your stash yet'
                  : 'No event stickers match this date or filter'}
              </p>
              <p className="text-xs text-[#b8b4a8]">
                {activeTab === 'saved'
                  ? 'Tap the bookmark icon on any event sticker or flyer to build your personal city lineup.'
                  : 'Pick another date on the calendar or reset your active filters.'}
              </p>
            </div>
          ) : (
            listToRender.map((ev) => {
              const isSaved = savedEventIds.includes(ev.id);
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
                        onClose();
                      }}
                      className="text-left flex-1 min-w-0 cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm">{ev.categoryEmoji}</span>
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
                        <span className="px-2 py-[1px] rounded-sm bg-[#22c55e] text-[#0d0e11] font-mono-stamp text-[10px] font-bold flex items-center gap-1">
                          <Ticket className="w-2.5 h-2.5" />
                          {ev.priceText}
                        </span>
                      </div>

                      <h3 className="mt-1 text-sm font-bold text-[#f4f1ea] group-hover:text-[#ffe600] transition-colors">
                        {ev.title}
                      </h3>

                      <p className="mt-0.5 text-xs text-[#d5d2c8] flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-[#ff2a85] shrink-0" />
                        <span className="font-mono-stamp font-bold text-[#ffe600] shrink-0">
                          {formatDistance(ev.distanceKm)}
                        </span>
                        <span className="truncate">
                          • {ev.venueName} • {ev.streetAddress}
                        </span>
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleSaveEvent(ev.id)}
                      aria-label={
                        isSaved ? 'Remove from saved stash' : 'Save sticker'
                      }
                      className={`p-2 rounded-md border transition-colors cursor-pointer shrink-0 ${
                        isSaved
                          ? 'bg-[#ff2a85] border-[#f4f1ea] text-white'
                          : 'bg-[#111317] border-white/20 text-[#b8b4a8] hover:text-white'
                      }`}
                    >
                      <Bookmark
                        className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`}
                      />
                    </button>
                  </div>

                  {/* Quick Calendar Export & Transit Actions */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-dashed border-white/20 font-mono-stamp text-[11px]">
                    <button
                      type="button"
                      onClick={() => downloadEventIcs(ev)}
                      className="px-2.5 py-1 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-white/15 text-[#f4f1ea] font-bold inline-flex items-center gap-1 cursor-pointer"
                      title="Download .ics file for Apple/Outlook Calendar"
                    >
                      <CalendarPlus className="w-3 h-3 text-[#ffe600]" />
                      <span>.ICS</span>
                    </button>

                    <a
                      href={buildGoogleCalendarUrl(ev)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-white/15 text-[#f4f1ea] font-bold inline-flex items-center gap-1"
                      title="Add to Google Calendar"
                    >
                      <Clock className="w-3 h-3 text-[#ff5500]" />
                      <span>G-Cal</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                    </a>

                    <a
                      href={ev.reittiopasUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto px-2.5 py-1 rounded-md bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border border-[#0d0e11] font-bold inline-flex items-center gap-1"
                    >
                      <Navigation className="w-3 h-3" />
                      <span>Transit</span>
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
};

