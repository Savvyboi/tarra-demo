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
  FINLAND_TIMEZONE,
  addCalendarDays,
  buildMonthGrid,
  formatHelsinkiMonthYear,
  getHelsinkiParts,
  isValidDateKey,
  safeParseDateKey,
  toDateKey,
} from '../../utils/calendarUtils';

interface EventCalendarModalProps {
  isOpen: boolean;
  selectedDate: string | null;
  cityName: string;
  events: NormalizedEvent[];
  activeFiltersNote?: string | null;
  now?: Date;
  coverageStart?: string | null;
  coverageEnd?: string | null;
  onSelectDate: (dateKey: string | null) => void;
  onClose: () => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const fullDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINLAND_TIMEZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export const EventCalendarModal: React.FC<EventCalendarModalProps> = ({
  isOpen,
  selectedDate,
  cityName,
  events,
  activeFiltersNote,
  now: propNow,
  coverageStart,
  coverageEnd,
  onSelectDate,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const now = useMemo(() => propNow ?? new Date(), [propNow]);
  const todayKey = toDateKey(now);

  const defaultParts = useMemo(() => {
    const target = selectedDate ? safeParseDateKey(selectedDate, now) : now;
    return (
      getHelsinkiParts(target) || {
        year: 2026,
        month: 10,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
      }
    );
  }, [selectedDate, now]);

  const modalKey = `${isOpen ? '1' : '0'}|${selectedDate ?? ''}`;
  const [navState, setNavState] = useState<{
    key: string;
    year: number;
    month: number;
    draft: string;
  }>({
    key: modalKey,
    year: defaultParts.year,
    month: defaultParts.month - 1,
    draft: selectedDate || todayKey,
  });

  const viewYear =
    navState.key === modalKey ? navState.year : defaultParts.year;
  const viewMonth =
    navState.key === modalKey ? navState.month : defaultParts.month - 1;
  const jumpDateDraft =
    navState.key === modalKey ? navState.draft : selectedDate || todayKey;

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

  // Skip grid computation completely while closed (`PERF-04`)
  const cells = useMemo(() => {
    if (!isOpen) return [];
    return buildMonthGrid(viewYear, viewMonth, events, now, {
      start: coverageStart,
      end: coverageEnd,
    });
  }, [isOpen, viewYear, viewMonth, events, now, coverageStart, coverageEnd]);

  const monthTitle = useMemo(
    () => (isOpen ? formatHelsinkiMonthYear(viewYear, viewMonth) : ''),
    [isOpen, viewYear, viewMonth]
  );

  const goPrevMonth = () => {
    setNavState({
      key: modalKey,
      year: viewMonth === 0 ? viewYear - 1 : viewYear,
      month: viewMonth === 0 ? 11 : viewMonth - 1,
      draft: jumpDateDraft,
    });
  };

  const goNextMonth = () => {
    setNavState({
      key: modalKey,
      year: viewMonth === 11 ? viewYear + 1 : viewYear,
      month: viewMonth === 11 ? 0 : viewMonth + 1,
      draft: jumpDateDraft,
    });
  };

  const handleQuickPick = (offsetDays: number) => {
    const targetKey = addCalendarDays(todayKey, offsetDays);
    if (!targetKey) return;
    const [ty, tm] = targetKey.split('-').map(Number);
    setNavState({
      key: modalKey,
      year: ty,
      month: tm - 1,
      draft: targetKey,
    });
    onSelectDate(targetKey);
    dialogRef.current?.close();
  };

  const handleThisSaturday = () => {
    const [y, m, d] = todayKey.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
    const daysUntilSat = (6 - dow + 7) % 7;
    handleQuickPick(daysUntilSat);
  };

  const commitJumpDate = (candidate: string) => {
    if (!isValidDateKey(candidate)) return;
    if (candidate === (selectedDate || '')) return;
    onSelectDate(candidate);
    dialogRef.current?.close();
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="calendar-modal-title"
      className="m-auto w-[calc(100vw-24px)] max-w-md max-h-[90dvh] overflow-y-auto rounded-xl bg-[#16191f] border-[3px] border-[#f4f1ea] shadow-[6px_8px_0px_#07080a] p-4 sm:p-5 text-[#f4f1ea] space-y-4 outline-none"
    >
      {isOpen && (
        <>
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
                <p className="text-xs text-[#b8b4a8]">
                  Pick any date ({FINLAND_TIMEZONE} time)
                  {activeFiltersNote ? ` • ${activeFiltersNote}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Close calendar"
              title="Close calendar (Esc)"
              className="p-2 rounded-md bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border border-[#0d0e11] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
            >
              <X aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleQuickPick(0)}
              className="px-2.5 py-1 rounded-md bg-[#ffe600] text-[#0d0e11] border border-[#0d0e11] shadow-[2px_2px_0px_#07080a] text-xs font-bold uppercase cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleQuickPick(1)}
              className="px-2.5 py-1 rounded-md bg-[#22262e] hover:bg-[#2e333d] border border-white/20 text-[#f4f1ea] text-xs font-bold uppercase cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={handleThisSaturday}
              className="px-2.5 py-1 rounded-md bg-[#ff2a85] text-[#0d0e11] border border-[#f4f1ea] shadow-[2px_2px_0px_#07080a] text-xs font-extrabold uppercase cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
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
                className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#ff5500] text-[#0d0e11] border border-[#f4f1ea] text-xs font-extrabold uppercase cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
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
              className="p-1.5 rounded-md hover:bg-white/10 text-[#f4f1ea] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
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
              className="p-1.5 rounded-md hover:bg-white/10 text-[#f4f1ea] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
            >
              <ChevronRight aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Headers + 42 Day Cells */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="font-mono-stamp text-[11px] font-bold uppercase tracking-wider text-[#b8b4a8] py-1"
              >
                {day}
              </div>
            ))}

            {cells.map((cell) => {
              const isSelected = selectedDate === cell.dateKey;
              const statusSummary = !cell.isCovered
                ? 'not loaded (select to fetch)'
                : cell.eventCount === 1
                  ? '1 event'
                  : `${cell.eventCount} events`;
              const fullLabel = `${fullDateFormatter.format(cell.date)}, ${statusSummary}${
                cell.hasLive ? ', live now' : ''
              }`;

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
                  className={`relative h-12 sm:h-13 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer border focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-1 ${
                    isSelected
                      ? 'bg-[#ffe600] text-[#0d0e11] border-2 border-[#0d0e11] outline-2 outline-[#f4f1ea] font-black shadow-[2px_3px_0px_#07080a] scale-105 z-10'
                      : cell.isToday
                        ? 'bg-[#22262e] border-2 border-[#ffe600] text-[#ffe600] font-bold hover:bg-[#2e333d]'
                        : cell.isCurrentMonth
                          ? cell.isCovered
                            ? 'bg-[#111317] border-white/15 text-[#f4f1ea] hover:bg-[#22262e] hover:border-white/40'
                            : 'bg-[#111317]/65 border-dashed border-white/15 text-[#b8b4a8] hover:bg-[#22262e]'
                          : 'bg-[#111317]/40 border-transparent text-[#8a867c] hover:bg-white/5'
                  }`}
                >
                  <span className="font-mono-stamp text-xs leading-none">
                    {cell.dayNumber}
                  </span>

                  {/* Event Activity Count or Not-Loaded Indicator (`BUG-03`, `A11Y-03`, `A11Y-04`) */}
                  {!cell.isCovered ? (
                    <span
                      aria-hidden="true"
                      title="Not loaded yet"
                      className={`mt-1 px-1 rounded-sm font-mono-stamp text-[11px] leading-none ${
                        isSelected
                          ? 'text-[#0d0e11]'
                          : 'text-[#8a867c]'
                      }`}
                    >
                      —
                    </span>
                  ) : cell.eventCount > 0 ? (
                    <span
                      aria-hidden="true"
                      className={`mt-1 px-1.5 py-[1px] rounded-sm font-mono-stamp text-[11px] font-bold leading-tight flex items-center gap-0.5 ${
                        isSelected
                          ? 'bg-[#0d0e11] text-[#ffe600]'
                          : cell.hasLive
                            ? 'bg-[#ff2a85] text-[#0d0e11]'
                            : 'bg-[#262b33] text-[#ffe600]'
                      }`}
                    >
                      {cell.hasLive && <Flame className="w-2.5 h-2.5" />}
                      <span>{cell.eventCount}</span>
                    </span>
                  ) : (
                    <span aria-hidden="true" className="mt-1 h-3.5" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Native Date Input Jump + Coverage Legend (`BUG-12`, `BUG-03`) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/15 font-mono-stamp text-xs text-[#d5d2c8]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                commitJumpDate(jumpDateDraft);
              }}
              className="flex items-center gap-1.5"
            >
              <label htmlFor="calendar-date-jump" className="font-bold text-[11px]">
                JUMP TO:
              </label>
              <input
                id="calendar-date-jump"
                type="date"
                value={jumpDateDraft}
                min={coverageStart || undefined}
                max={coverageEnd || undefined}
                onChange={(e) =>
                  setNavState({
                    key: modalKey,
                    year: viewYear,
                    month: viewMonth,
                    draft: e.target.value,
                  })
                }
                onBlur={(e) => {
                  if (
                    isValidDateKey(e.target.value) &&
                    e.target.value !== (selectedDate || todayKey)
                  ) {
                    commitJumpDate(e.target.value);
                  }
                }}
                className="px-2 py-1 rounded-md bg-[#111317] border border-[#f4f1ea]/40 text-xs text-[#f4f1ea] focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
              />
              <button
                type="submit"
                className="px-2 py-1 rounded-md bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border border-[#0d0e11] text-[11px] font-extrabold uppercase cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2"
              >
                Go
              </button>
            </form>
            <span className="text-[11px] text-[#b8b4a8]">
              {coverageStart && coverageEnd
                ? `Loaded: ${coverageStart} – ${coverageEnd} (— = not loaded)`
                : 'Numbers = matching events'}
            </span>
          </div>
        </>
      )}
    </dialog>
  );
};
