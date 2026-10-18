import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Flame,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { NormalizedEvent } from '../../types/linkedEvents';
import {
  buildMonthGrid,
  parseDateKey,
  toDateKey,
} from '../../utils/calendarUtils';

interface EventCalendarModalProps {
  isOpen: boolean;
  selectedDate: string | null;
  cityName: string;
  events: NormalizedEvent[];
  onSelectDate: (dateKey: string | null) => void;
  onClose: () => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const EventCalendarModal: React.FC<EventCalendarModalProps> = ({
  isOpen,
  selectedDate,
  cityName,
  events,
  onSelectDate,
  onClose,
}) => {
  const initialDate = useMemo(
    () => (selectedDate ? parseDateKey(selectedDate) : new Date()),
    [selectedDate]
  );

  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  const cells = useMemo(
    () => buildMonthGrid(viewYear, viewMonth, events),
    [viewYear, viewMonth, events]
  );

  if (!isOpen) return null;

  const monthTitle = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(viewYear, viewMonth, 1));

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleQuickPick = (offsetDays: number) => {
    const now = new Date();
    const target = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offsetDays
    );
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());
    onSelectDate(toDateKey(target));
    onClose();
  };

  const handleThisSaturday = () => {
    const now = new Date();
    const day = now.getDay();
    const daysUntilSat = (6 - day + 7) % 7;
    handleQuickPick(daysUntilSat);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Event Calendar for ${cityName}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-slate-900/95 border border-white/15 shadow-[0_0_60px_rgba(0,0,0,0.85)] p-5 text-white space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-cyan-400 to-fuchsia-500 text-slate-950 flex items-center justify-center shadow">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold tracking-tight">
                {cityName} Event Calendar
              </h2>
              <p className="text-[11px] text-slate-400">
                Pick any date to filter or fetch live 6Aika events for that day
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close calendar"
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Date Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleQuickPick(0)}
            className="px-2.5 py-1 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-bold cursor-pointer"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => handleQuickPick(1)}
            className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold cursor-pointer"
          >
            Tomorrow
          </button>
          <button
            type="button"
            onClick={handleThisSaturday}
            className="px-2.5 py-1 rounded-xl bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-400/40 text-fuchsia-200 text-xs font-bold cursor-pointer"
          >
            This Saturday
          </button>
          {selectedDate && (
            <button
              type="button"
              onClick={() => {
                onSelectDate(null);
                onClose();
              }}
              className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 text-xs font-bold cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>All Dates</span>
            </button>
          )}
        </div>

        {/* Month Navigation Bar */}
        <div className="flex items-center justify-between bg-slate-950/70 px-3 py-2 rounded-2xl border border-white/10">
          <button
            type="button"
            onClick={goPrevMonth}
            aria-label="Previous month"
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-200 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-extrabold tracking-tight text-white">
            {monthTitle}
          </span>
          <button
            type="button"
            onClick={goNextMonth}
            aria-label="Next month"
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-200 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-1"
            >
              {day}
            </div>
          ))}

          {/* 42 Day Cells */}
          {cells.map((cell) => {
            const isSelected = selectedDate === cell.dateKey;
            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => {
                  onSelectDate(cell.dateKey);
                  onClose();
                }}
                className={`relative h-12 rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-gradient-to-br from-cyan-400 to-blue-600 text-slate-950 border-white font-black shadow-lg scale-105 z-10'
                    : cell.isToday
                      ? 'bg-cyan-500/15 border-cyan-400/60 text-cyan-200 font-bold hover:bg-cyan-500/25'
                      : cell.isCurrentMonth
                        ? 'bg-slate-950/60 border-white/5 text-white hover:bg-white/10 hover:border-white/20'
                        : 'bg-slate-950/25 border-transparent text-slate-600 hover:bg-white/5'
                }`}
              >
                <span className="text-xs leading-none">{cell.dayNumber}</span>

                {/* Event Activity Dot / Count Badge */}
                {cell.eventCount > 0 ? (
                  <span
                    className={`mt-1 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold leading-tight flex items-center gap-0.5 ${
                      isSelected
                        ? 'bg-slate-950 text-cyan-300'
                        : cell.hasLive
                          ? 'bg-rose-500/30 text-rose-300 border border-rose-400/40'
                          : 'bg-cyan-500/20 text-cyan-300'
                    }`}
                  >
                    {cell.hasLive && <Flame className="w-2.5 h-2.5" />}
                    <span>{cell.eventCount}</span>
                  </span>
                ) : (
                  <span className="mt-1 h-2.5" />
                )}
              </button>
            );
          })}
        </div>

        {/* Native Date Input Jump + Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10 text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Jump to date:</span>
            <input
              type="date"
              value={selectedDate || toDateKey(new Date())}
              onChange={(e) => {
                if (e.target.value) {
                  onSelectDate(e.target.value);
                  onClose();
                }
              }}
              className="px-2 py-1 rounded-xl bg-slate-950 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
            />
          </div>
          <span className="text-[10px] text-slate-400">
            Badges show scheduled events
          </span>
        </div>
      </div>
    </div>
  );
};
