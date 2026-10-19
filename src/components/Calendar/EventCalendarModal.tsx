import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Flame,
  RotateCcw,
  X,
} from 'lucide-react';
import { NormalizedEvent } from '../../types/linkedEvents';
import {
  buildMonthGrid,
  isValidDateKey,
  safeParseDateKey,
  toDateKey,
} from '../../utils/calendarUtils';

interface EventCalendarModalProps {
  isOpen: boolean;
  selectedDate: string | null;
  cityName: string;
  events: NormalizedEvent[];
  now?: Date;
  coverageStart?: string | null;
  coverageEnd?: string | null;
  onSelectDate: (dateKey: string | null) => void;
  onClose: () => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const EventCalendarModal: React.FC<EventCalendarModalProps> = ({
  isOpen,
  selectedDate,
  cityName,
  events,
  now: propNow,
  coverageStart,
  coverageEnd,
  onSelectDate,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const now = useMemo(() => propNow || new Date(), [propNow]);
  const initialDate = useMemo(
    () => (selectedDate ? safeParseDateKey(selectedDate, now) : now),
    [selectedDate, now]
  );

  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  // Sync displayed month whenever selectedDate changes or modal opens
  useEffect(() => {
    if (!isOpen) return;
    const target = selectedDate ? safeParseDateKey(selectedDate, now) : now;
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());
  }, [selectedDate, isOpen, now]);

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

  const cells = useMemo(
    () => buildMonthGrid(viewYear, viewMonth, events, now),
    [viewYear, viewMonth, events, now]
  );

  const monthTitle = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(viewYear, viewMonth, 1));

  const fullDateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    []
  );

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
    const target = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offsetDays
    );
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());
    onSelectDate(toDateKey(target));
    dialogRef.current?.close();
  };

  const handleThisSaturday = () => {
    const day = now.getDay();
    const daysUntilSat = (6 - day + 7) % 7;
    handleQuickPick(daysUntilSat);
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="calendar-modal-title"
      className="m-auto w-[calc(100vw-24px)] max-w-md max-h-[90dvh] overflow-y-auto rounded-xl bg-[#16191f] border-[3px] border-[#f4f1ea] shadow-[6px_8px_0px_#07080a] p-4 sm:p-5 text-[#f4f1ea] space-y-4 outline-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-[#f4f1ea]/20 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-md bg-[#ffe600] text-[#0d0e11] border-2 border-[#0d0e11] shadow-[2px_2px_0px_#07080a] flex items-center justify-center shrink-0">
            <CalendarIcon aria-hidden="true" className="w-5 h-5" />
          </div>
          <div>
            <h2
              id="calendar-modal-title"
              className="text-sm font-extrabold uppercase tracking-tight"
            >
              {cityName} Date Slap Calendar
            </h2>
            <p className="text-[11px] text-[#b8b4a8]">
              Pick any date to filter events ({'Europe/Helsinki'} time)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close calendar"
          title="Close calendar (Esc)"
          className="p-2 rounded-md bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border border-[#0d0e11] cursor-pointer"
        >
          <X aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Date Presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => handleQuickPick(0)}
          className="px-2.5 py-1 rounded-md bg-[#ffe600] text-[#0d0e11] border border-[#0d0e11] shadow-[2px_2px_0px_#07080a] text-xs font-bold uppercase cursor-pointer"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => handleQuickPick(1)}
          className="px-2.5 py-1 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-white/20 text-[#f4f1ea] text-xs font-bold uppercase cursor-pointer"
        >
          Tomorrow
        </button>
        <button
          type="button"
          onClick={handleThisSaturday}
          className="px-2.5 py-1 rounded-md bg-[#ff2a85] text-white border border-[#f4f1ea] shadow-[2px_2px_0px_#07080a] text-xs font-bold uppercase cursor-pointer"
        >
          This Saturday
        </button>
        {selectedDate && (
          <button
            type="button"
            onClick={() => {
              onSelectDate(null);
              dialogRef.current?.close();
            }}
            className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#ff5500] text-white border border-[#f4f1ea] text-xs font-bold uppercase cursor-pointer"
          >
            <RotateCcw aria-hidden="true" className="w-3 h-3" />
            <span>All Dates</span>
          </button>
        )}
      </div>

      {/* Month Navigation Bar */}
      <div className="flex items-center justify-between bg-[#111317] px-3 py-2 rounded-lg border-2 border-[#f4f1ea]/30">
        <button
          type="button"
          onClick={goPrevMonth}
          aria-label="Previous month"
          className="p-1.5 rounded-md hover:bg-white/10 text-[#f4f1ea] cursor-pointer"
        >
          <ChevronLeft aria-hidden="true" className="w-4 h-4" />
        </button>
        <span
          aria-live="polite"
          className="font-grotesk text-sm font-extrabold uppercase tracking-tight text-[#ffe600]"
        >
          {monthTitle}
        </span>
        <button
          type="button"
          onClick={goNextMonth}
          aria-label="Next month"
          className="p-1.5 rounded-md hover:bg-white/10 text-[#f4f1ea] cursor-pointer"
        >
          <ChevronRight aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday Headers + 42 Day Cells */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="font-mono-stamp text-[10px] font-bold uppercase tracking-wider text-[#a8a498] py-1"
          >
            {day}
          </div>
        ))}

        {cells.map((cell) => {
          const isSelected = selectedDate === cell.dateKey;
          const fullLabel = `${fullDateFmt.format(cell.date)}, ${
            cell.eventCount === 1
              ? '1 event'
              : `${cell.eventCount} events`
          }${cell.hasLive ? ', live now' : ''}`;

          return (
            <button
              key={cell.dateKey}
              type="button"
              aria-label={fullLabel}
              aria-pressed={isSelected}
              aria-current={cell.isToday ? 'date' : undefined}
              onClick={() => {
                onSelectDate(cell.dateKey);
                dialogRef.current?.close();
              }}
              className={`relative h-11 sm:h-12 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer border ${
                isSelected
                  ? 'bg-[#ffe600] text-[#0d0e11] border-2 border-[#0d0e11] outline-2 outline-[#f4f1ea] font-black shadow-[2px_3px_0px_#07080a] scale-105 z-10'
                  : cell.isToday
                    ? 'bg-[#22262e] border-2 border-[#ffe600] text-[#ffe600] font-bold hover:bg-[#2e333d]'
                    : cell.isCurrentMonth
                      ? 'bg-[#111317] border-white/15 text-[#f4f1ea] hover:bg-[#22262e] hover:border-white/40'
                      : 'bg-[#111317]/40 border-transparent text-[#68665e] hover:bg-white/5'
              }`}
            >
              <span className="font-mono-stamp text-xs leading-none">
                {cell.dayNumber}
              </span>

              {/* Event Activity Count Slap */}
              {cell.eventCount > 0 ? (
                <span
                  aria-hidden="true"
                  className={`mt-1 px-1.5 py-[1px] rounded-sm font-mono-stamp text-[9px] font-bold leading-tight flex items-center gap-0.5 ${
                    isSelected
                      ? 'bg-[#0d0e11] text-[#ffe600]'
                      : cell.hasLive
                        ? 'bg-[#ff2a85] text-white'
                        : 'bg-[#262b33] text-[#ffe600]'
                  }`}
                >
                  {cell.hasLive && <Flame className="w-2.5 h-2.5" />}
                  <span>{cell.eventCount}</span>
                </span>
              ) : (
                <span aria-hidden="true" className="mt-1 h-2.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Native Date Input Jump + Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/15 font-mono-stamp text-[11px] text-[#b8b4a8]">
        <div className="flex items-center gap-2">
          <label htmlFor="calendar-date-jump" className="font-bold">
            JUMP TO DATE:
          </label>
          <input
            id="calendar-date-jump"
            type="date"
            value={selectedDate || toDateKey(now)}
            onChange={(e) => {
              if (isValidDateKey(e.target.value)) {
                onSelectDate(e.target.value);
                dialogRef.current?.close();
              }
            }}
            className="px-2 py-1 rounded-md bg-[#111317] border border-[#f4f1ea]/40 text-xs text-[#f4f1ea] focus:outline-none focus:border-[#ffe600]"
          />
        </div>
        <span className="text-[10px]">
          {coverageStart && coverageEnd
            ? `Loaded: ${coverageStart} – ${coverageEnd}`
            : 'Numbers = Events on day'}
        </span>
      </div>
    </dialog>
  );
};

