import React, { useState } from 'react';
import {
  Bookmark,
  CalendarPlus,
  Clock,
  ExternalLink,
  MapPin,
  Navigation,
  Sparkles,
  Ticket,
  X,
} from 'lucide-react';
import { NormalizedEvent } from '../../types/linkedEvents';
import {
  buildGoogleCalendarUrl,
  downloadEventIcs,
  parseDateKey,
} from '../../utils/calendarUtils';

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
    : `${cityName} Upcoming Schedule`;

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
      className="fixed inset-0 z-40 flex justify-end bg-slate-950/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <aside
        aria-label="Day Agenda & Saved Lineup"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full bg-slate-950/95 border-l border-white/15 shadow-2xl flex flex-col text-white"
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>{formattedDateHeader}</span>
            </h2>
            <p className="text-xs text-slate-400">
              Tap any event to fly to the venue & play its 9:16 Snap Story
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close schedule drawer"
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs: Day Schedule vs Saved Lineup */}
        <div className="px-4 pt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={`flex-1 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'schedule'
                ? 'bg-cyan-400 text-slate-950 shadow'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            📅 Day Schedule ({events.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={`flex-1 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'saved'
                ? 'bg-fuchsia-400 text-slate-950 shadow'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Saved Lineup ({allSavedEvents.length})</span>
          </button>
        </div>

        {/* Chronological Event Cards */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {listToRender.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-3xl bg-slate-900/60 border border-white/10 space-y-2">
              <p className="text-sm font-bold text-slate-200">
                {activeTab === 'saved'
                  ? 'No saved events in your lineup yet'
                  : 'No events match this date or filter'}
              </p>
              <p className="text-xs text-slate-400">
                {activeTab === 'saved'
                  ? 'Tap the bookmark icon on any event card or 9:16 Story to build your personal festival/city lineup.'
                  : 'Try picking another date on the calendar or clearing topic filters.'}
              </p>
            </div>
          ) : (
            listToRender.map((ev) => {
              const isSaved = savedEventIds.includes(ev.id);
              return (
                <div
                  key={ev.id}
                  className="group rounded-2xl bg-slate-900/90 hover:bg-slate-900 border border-white/10 hover:border-cyan-400/40 p-3.5 transition-all space-y-2.5"
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
                        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                          {shortDateFmt.format(ev.startTime)} •{' '}
                          {timeFmt.format(ev.startTime)}–
                          {timeFmt.format(ev.endTime)}
                        </span>
                        {ev.isLiveNow && (
                          <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-[9px] font-black uppercase text-white">
                            LIVE
                          </span>
                        )}
                        <span className="px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold flex items-center gap-1">
                          <Ticket className="w-2.5 h-2.5" />
                          {ev.priceText}
                        </span>
                      </div>

                      <h3 className="mt-1 text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                        {ev.title}
                      </h3>

                      <p className="mt-0.5 text-xs text-slate-300 flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-fuchsia-400 shrink-0" />
                        <span className="truncate">
                          {ev.venueName} • {ev.streetAddress}
                        </span>
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleSaveEvent(ev.id)}
                      aria-label={
                        isSaved ? 'Remove from saved lineup' : 'Save event'
                      }
                      className={`p-2 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                        isSaved
                          ? 'bg-fuchsia-500/25 border-fuchsia-400 text-fuchsia-300'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Bookmark
                        className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`}
                      />
                    </button>
                  </div>

                  {/* Quick Calendar Export & Transit Actions */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-white/10 text-[11px]">
                    <button
                      type="button"
                      onClick={() => downloadEventIcs(ev)}
                      className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                      title="Download .ics file for Apple/Outlook Calendar"
                    >
                      <CalendarPlus className="w-3 h-3 text-cyan-400" />
                      <span>.ICS</span>
                    </button>

                    <a
                      href={buildGoogleCalendarUrl(ev)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 font-semibold inline-flex items-center gap-1"
                      title="Add to Google Calendar"
                    >
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span>Google Cal</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                    </a>

                    <a
                      href={ev.reittiopasUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto px-2.5 py-1 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-200 font-bold inline-flex items-center gap-1"
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
