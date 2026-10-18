import { NormalizedEvent } from '../types/linkedEvents';

/**
 * Formats a Date object as local YYYY-MM-DD string.
 */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses a YYYY-MM-DD string into a local Date at 00:00:00.
 */
export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Checks if an event takes place on the given YYYY-MM-DD date.
 * Checks individual occurrenceDates first, then falls back to startTime..endTime span.
 */
export function doesEventOccurOnDate(
  event: Pick<NormalizedEvent, 'startTime' | 'endTime' | 'dateKey' | 'occurrenceDates'>,
  targetDateKey: string
): boolean {
  if (event.dateKey === targetDateKey) return true;

  if (Array.isArray(event.occurrenceDates) && event.occurrenceDates.length > 0) {
    return event.occurrenceDates.some((occ) => occ.dateKey === targetDateKey);
  }

  const dayStart = parseDateKey(targetDateKey);
  const dayEnd = new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    dayStart.getDate(),
    23,
    59,
    59,
    999
  );
  return event.startTime <= dayEnd && event.endTime >= dayStart;
}

export interface CalendarDayCell {
  date: Date;
  dateKey: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  eventCount: number;
  hasLive: boolean;
}

/**
 * Builds a 6-week (42-day, Monday-first) calendar grid for the given year & month (0-indexed),
 * annotated with event counts and live indicators.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  events: NormalizedEvent[]
): CalendarDayCell[] {
  const todayKey = toDateKey(new Date());
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStartDate = new Date(year, month, 1 - startOffset);

  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(
      gridStartDate.getFullYear(),
      gridStartDate.getMonth(),
      gridStartDate.getDate() + i
    );
    const dateKey = toDateKey(cellDate);
    const matching = events.filter((ev) => doesEventOccurOnDate(ev, dateKey));
    const dayOfWeek = cellDate.getDay();

    cells.push({
      date: cellDate,
      dateKey,
      dayNumber: cellDate.getDate(),
      isCurrentMonth: cellDate.getMonth() === month,
      isToday: dateKey === todayKey,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      eventCount: matching.length,
      hasLive: matching.some((e) => e.isLiveNow),
    });
  }

  return cells;
}

/**
 * Generates a 14-day quick-pick strip starting from today.
 */
export function buildUpcomingDaysStrip(
  daysCount: number,
  events: NormalizedEvent[]
): Array<{
  date: Date;
  dateKey: string;
  weekdayShort: string;
  dayMonthLabel: string;
  isToday: boolean;
  isTomorrow: boolean;
  eventCount: number;
}> {
  const now = new Date();
  const todayKey = toDateKey(now);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);

  const weekdayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
  const dayMonthFmt = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  });

  const strip = [];
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dateKey = toDateKey(d);
    const matching = events.filter((ev) => doesEventOccurOnDate(ev, dateKey));
    strip.push({
      date: d,
      dateKey,
      weekdayShort:
        dateKey === todayKey
          ? 'Today'
          : dateKey === tomorrowKey
            ? 'Tmrw'
            : weekdayFmt.format(d),
      dayMonthLabel: dayMonthFmt.format(d),
      isToday: dateKey === todayKey,
      isTomorrow: dateKey === tomorrowKey,
      eventCount: matching.length,
    });
  }
  return strip;
}

function formatIcsTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Builds a Google Calendar deep-link URL for an event.
 */
export function buildGoogleCalendarUrl(event: NormalizedEvent): string {
  const dates = `${formatIcsTimestamp(event.startTime)}/${formatIcsTimestamp(
    event.endTime
  )}`;
  const details = `${event.shortDescription}\n\nTransit Directions: ${event.reittiopasUrl}\nSource: ${event.attribution.badgeText}`;
  const location = `${event.venueName}, ${event.streetAddress}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Triggers an .ics iCalendar file download for Apple/Outlook/Mobile calendars.
 */
export function downloadEventIcs(event: NormalizedEvent): void {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SnapEvents 6Aika//Event Calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@snapevents.demo`,
    `DTSTAMP:${formatIcsTimestamp(new Date())}`,
    `DTSTART:${formatIcsTimestamp(event.startTime)}`,
    `DTEND:${formatIcsTimestamp(event.endTime)}`,
    `SUMMARY:${event.title.replace(/[,;\\]/g, ' ')}`,
    `DESCRIPTION:${event.shortDescription.replace(/\r?\n/g, '\\n')}\\n\\nReittiopas: ${event.reittiopasUrl}`,
    `LOCATION:${`${event.venueName}, ${event.streetAddress}`.replace(/[,;\\]/g, ' ')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blob = new Blob([lines.join('\r\n')], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.id.replace(/[^a-z0-9-_]/gi, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
