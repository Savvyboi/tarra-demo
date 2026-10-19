import type { NormalizedEvent, NormalizedOccurrence } from '../types/linkedEvents';

export const FINLAND_TIMEZONE = 'Europe/Helsinki';

/**
 * Formats a Date object as local YYYY-MM-DD string.
 */
export function toDateKey(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Strictly validates that a YYYY-MM-DD string represents a real calendar date
 * (rejects non-existent dates such as 2026-02-31 instead of rolling over).
 */
export function isValidDateKey(
  dateKey: string | null | undefined
): dateKey is string {
  if (!dateKey || typeof dateKey !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;

  const [y, m, d] = dateKey.split('-').map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return false;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return false;
  }

  const candidate = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(candidate.getTime())) return false;

  return (
    candidate.getFullYear() === y &&
    candidate.getMonth() === m - 1 &&
    candidate.getDate() === d
  );
}

/**
 * Parses a validated YYYY-MM-DD string into a local Date at 00:00:00.
 * Returns an Invalid Date (NaN) if the dateKey is malformed or out-of-range
 * (e.g. 2026-02-31), never silently rolling over to another month.
 */
export function parseDateKey(dateKey: string): Date {
  if (!isValidDateKey(dateKey)) {
    return new Date(NaN);
  }
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Safe wrapper around parseDateKey for UI labels that falls back to `fallback` if invalid.
 */
export function safeParseDateKey(
  dateKey: string | null | undefined,
  fallback: Date = new Date()
): Date {
  if (!dateKey) return fallback;
  const parsed = parseDateKey(dateKey);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * Returns the start (00:00:00.000) and end (23:59:59.999) bounds for a validated YYYY-MM-DD date key.
 */
export function getDayBounds(
  targetDateKey: string
): { dayStart: Date; dayEnd: Date } | null {
  const dayStart = parseDateKey(targetDateKey);
  if (Number.isNaN(dayStart.getTime())) return null;
  const dayEnd = new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    dayStart.getDate(),
    23,
    59,
    59,
    999
  );
  return { dayStart, dayEnd };
}

/**
 * Checks whether a single [start, end] occurrence interval overlaps the given YYYY-MM-DD date.
 * - Multi-day exhibitions (e.g. 1–31 Oct) match every date in their span.
 * - Overnight sessions (e.g. 20 Oct 23:00 -> 21 Oct 02:00) match both 20 Oct and 21 Oct.
 * - Sessions ending at exact midnight 00:00:00.000 of day D (having started before day D)
 *   do NOT spill into day D.
 */
export function doesOccurrenceOverlapDate(
  occ: { start: Date; end: Date },
  targetDateKey: string
): boolean {
  const bounds = getDayBounds(targetDateKey);
  if (!bounds) return false;
  const { dayStart, dayEnd } = bounds;

  const startMs = occ.start.getTime();
  const endMs = occ.end.getTime();
  if (Number.isNaN(startMs)) return false;

  const effectiveEndMs = Number.isNaN(endMs) || endMs < startMs ? startMs : endMs;

  // Point-in-time event (zero duration)
  if (effectiveEndMs === startMs) {
    return startMs >= dayStart.getTime() && startMs <= dayEnd.getTime();
  }

  // Positive duration interval: [startMs, effectiveEndMs) overlaps [dayStart, dayEnd]
  // Using strict `>` against dayStart ensures an event ending at 00:00:00.000 on dayStart
  // does not falsely appear on the following day.
  return startMs <= dayEnd.getTime() && effectiveEndMs > dayStart.getTime();
}

/**
 * Checks if an event takes place on the given YYYY-MM-DD date.
 * Tests each occurrence interval in `occurrenceDates` against the target day's [00:00, 23:59:59.999] interval,
 * falling back to the event's [startTime, endTime] span if `occurrenceDates` is empty.
 */
export function doesEventOccurOnDate(
  event: Pick<
    NormalizedEvent,
    'startTime' | 'endTime' | 'dateKey' | 'occurrenceDates'
  >,
  targetDateKey: string
): boolean {
  if (!isValidDateKey(targetDateKey)) return false;

  if (Array.isArray(event.occurrenceDates) && event.occurrenceDates.length > 0) {
    return event.occurrenceDates.some((occ) =>
      doesOccurrenceOverlapDate(occ, targetDateKey)
    );
  }

  return doesOccurrenceOverlapDate(
    { start: event.startTime, end: event.endTime },
    targetDateKey
  );
}

/**
 * Resolves the specific occurrence of an event that should be displayed and exported
 * when `targetDateKey` is selected (or the active/next upcoming occurrence when no date is selected).
 */
export function resolveEventOccurrence(
  event: Pick<
    NormalizedEvent,
    'startTime' | 'endTime' | 'dateKey' | 'occurrenceDates' | 'infoUrl'
  >,
  targetDateKey?: string | null,
  now: Date = new Date()
): NormalizedOccurrence {
  const occurrences =
    Array.isArray(event.occurrenceDates) && event.occurrenceDates.length > 0
      ? event.occurrenceDates
      : [
          {
            start: event.startTime,
            end: event.endTime,
            dateKey: event.dateKey || toDateKey(event.startTime),
            infoUrl: event.infoUrl,
          },
        ];

  if (targetDateKey && isValidDateKey(targetDateKey)) {
    const matching = occurrences
      .filter((occ) => doesOccurrenceOverlapDate(occ, targetDateKey))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (matching.length > 0) {
      if (targetDateKey === toDateKey(now)) {
        const activeOrUpcoming = matching.find(
          (occ) => occ.end.getTime() >= now.getTime()
        );
        if (activeOrUpcoming) return activeOrUpcoming;
      }
      return matching[0];
    }
  }

  const sorted = [...occurrences].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
  const upcoming =
    sorted.find((occ) => occ.end.getTime() >= now.getTime()) || sorted[0];

  return (
    upcoming || {
      start: event.startTime,
      end: event.endTime,
      dateKey: event.dateKey || toDateKey(event.startTime),
      infoUrl: event.infoUrl,
    }
  );
}

/**
 * Returns a copy of `event` with `startTime`, `endTime`, `dateKey`, and `infoUrl`
 * bound to the occurrence matching `targetDateKey` (Finding 04).
 */
export function resolveEventForDate(
  event: NormalizedEvent,
  targetDateKey?: string | null,
  now: Date = new Date()
): NormalizedEvent {
  if (!targetDateKey || !isValidDateKey(targetDateKey)) {
    return event;
  }
  const occ = resolveEventOccurrence(event, targetDateKey, now);
  return {
    ...event,
    startTime: occ.start,
    endTime: occ.end,
    dateKey: toDateKey(occ.start),
    infoUrl: occ.infoUrl || event.infoUrl,
  };
}

/**
 * Computes the upcoming (or currently active) weekend interval [Friday 00:00, Sunday 23:59:59.999]
 * relative to `now` (Finding 10).
 */
export function getUpcomingWeekendInterval(now: Date = new Date()): {
  start: Date;
  end: Date;
  effectiveStart: Date;
} {
  const day = now.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
  let offsetToFriday: number;
  if (day === 0) {
    offsetToFriday = -2;
  } else if (day === 6) {
    offsetToFriday = -1;
  } else if (day === 5) {
    offsetToFriday = 0;
  } else {
    offsetToFriday = 5 - day;
  }

  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + offsetToFriday,
    0,
    0,
    0,
    0
  );
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 2,
    23,
    59,
    59,
    999
  );
  const effectiveStart = now.getTime() > start.getTime() ? now : start;
  return { start, end, effectiveStart };
}

/**
 * Checks if any occurrence overlaps the current/upcoming weekend and has not yet ended (Finding 10).
 */
export function isEventOnUpcomingWeekend(
  eventOrOccurrences:
    | ReadonlyArray<{ start: Date; end: Date }>
    | Pick<NormalizedEvent, 'occurrenceDates' | 'startTime' | 'endTime'>,
  now: Date = new Date()
): boolean {
  const occurrences: ReadonlyArray<{ start: Date; end: Date }> =
    'occurrenceDates' in eventOrOccurrences
      ? eventOrOccurrences.occurrenceDates.length > 0
        ? eventOrOccurrences.occurrenceDates
        : [
            {
              start: eventOrOccurrences.startTime,
              end: eventOrOccurrences.endTime,
            },
          ]
      : eventOrOccurrences;
  const { end, effectiveStart } = getUpcomingWeekendInterval(now);
  return occurrences.some(
    (occ) =>
      occ.end.getTime() > effectiveStart.getTime() &&
      occ.start.getTime() <= end.getTime()
  );
}

/**
 * Computes tonight's evening/night interval [max(now, 17:00), next day 04:00]
 * and checks whether any un-ended occurrence takes place during tonight's window (Finding 11).
 */
export function isEventOccurringTonight(
  eventOrOccurrences:
    | ReadonlyArray<{ start: Date; end: Date }>
    | Pick<NormalizedEvent, 'occurrenceDates' | 'startTime' | 'endTime'>,
  now: Date = new Date()
): boolean {
  const occurrences: ReadonlyArray<{ start: Date; end: Date }> =
    'occurrenceDates' in eventOrOccurrences
      ? eventOrOccurrences.occurrenceDates.length > 0
        ? eventOrOccurrences.occurrenceDates
        : [
            {
              start: eventOrOccurrences.startTime,
              end: eventOrOccurrences.endTime,
            },
          ]
      : eventOrOccurrences;
  // If between 00:00 and 03:59, include both the active late-night window until 04:00
  // and the upcoming evening 17:00..04:00 window.
  const windows: Array<{ start: Date; end: Date }> = [];

  if (now.getHours() < 4) {
    const earlyNightEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      4,
      0,
      0,
      0
    );
    windows.push({ start: now, end: earlyNightEnd });
  }

  const eveningStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    17,
    0,
    0,
    0
  );
  const nightEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    4,
    0,
    0,
    0
  );
  const effectiveEveningStart =
    now.getTime() > eveningStart.getTime() ? now : eveningStart;

  if (effectiveEveningStart.getTime() < nightEnd.getTime()) {
    windows.push({ start: effectiveEveningStart, end: nightEnd });
  }

  return occurrences.some((occ) => {
    if (occ.end.getTime() <= now.getTime()) return false;
    return windows.some(
      (w) =>
        occ.start.getTime() < w.end.getTime() &&
        occ.end.getTime() > w.start.getTime()
    );
  });
}

/**
 * Checks whether an event is live right now on the specific `dateKey` cell (Finding 12).
 * Past and future calendar dates never show the live indicator.
 */
export function isEventLiveOnDateCell(
  event: Pick<NormalizedEvent, 'startTime' | 'endTime' | 'occurrenceDates'>,
  dateKey: string,
  now: Date = new Date()
): boolean {
  const todayKey = toDateKey(now);
  if (dateKey !== todayKey) return false;

  const nowMs = now.getTime();
  const occurrences =
    Array.isArray(event.occurrenceDates) && event.occurrenceDates.length > 0
      ? event.occurrenceDates
      : [{ start: event.startTime, end: event.endTime }];

  return occurrences.some(
    (occ) =>
      doesOccurrenceOverlapDate(occ, dateKey) &&
      nowMs >= occ.start.getTime() &&
      nowMs <= occ.end.getTime()
  );
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
 * annotated with event counts and today-only live indicators.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  events: NormalizedEvent[],
  now: Date = new Date()
): CalendarDayCell[] {
  const todayKey = toDateKey(now);
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
      hasLive:
        dateKey === todayKey &&
        matching.some((e) => isEventLiveOnDateCell(e, dateKey, now)),
    });
  }

  return cells;
}

/**
 * Generates a 14-day quick-pick strip starting from today.
 */
export function buildUpcomingDaysStrip(
  daysCount: number,
  events: NormalizedEvent[],
  now: Date = new Date()
): Array<{
  date: Date;
  dateKey: string;
  weekdayShort: string;
  dayMonthLabel: string;
  isToday: boolean;
  isTomorrow: boolean;
  eventCount: number;
}> {
  const todayKey = toDateKey(now);
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );
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

export function formatIcsTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escapes text values per RFC 5545 Section 3.3.11 (TEXT).
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Folds an iCalendar content line at 75 UTF-8 octets per RFC 5545 Section 3.1.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  let maxBytes = 75;

  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    if (currentBytes + chBytes > maxBytes && current.length > 0) {
      parts.push(current);
      current = ch;
      currentBytes = chBytes;
      maxBytes = 74; // Continuation lines start with a single space (1 octet)
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current.length > 0) {
    parts.push(current);
  }
  return parts.join('\r\n ');
}

/**
 * Builds a Google Calendar deep-link URL for an event (or its selected occurrence).
 */
export function buildGoogleCalendarUrl(
  event: NormalizedEvent,
  selectedDate?: string | null
): string {
  const occ = resolveEventOccurrence(event, selectedDate);
  const dates = `${formatIcsTimestamp(occ.start)}/${formatIcsTimestamp(
    occ.end
  )}`;
  const detailLines = [event.shortDescription];
  if (occ.infoUrl || event.infoUrl) {
    detailLines.push(`Event Page: ${occ.infoUrl || event.infoUrl}`);
  }
  if (event.reittiopasUrl) {
    detailLines.push(`Transit Directions: ${event.reittiopasUrl}`);
  }
  detailLines.push(`Source: ${event.attribution.badgeText}`);

  const location = event.hasExactCoordinates
    ? `${event.venueName}, ${event.streetAddress}`
    : event.venueName;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates,
    details: detailLines.join('\n\n'),
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Builds a standards-compliant RFC 5545 .ics string for an event (or its selected occurrence).
 */
export function buildEventIcsContent(
  event: NormalizedEvent,
  selectedDate?: string | null,
  dtStamp: Date = new Date()
): string {
  const occ = resolveEventOccurrence(event, selectedDate);
  const startStamp = formatIcsTimestamp(occ.start);
  const endStamp = formatIcsTimestamp(occ.end);

  const descParts = [event.shortDescription];
  if (occ.infoUrl || event.infoUrl) {
    descParts.push(`Official link: ${occ.infoUrl || event.infoUrl}`);
  }
  if (event.reittiopasUrl) {
    descParts.push(`Reittiopas: ${event.reittiopasUrl}`);
  }
  descParts.push(`Source: ${event.attribution.apiAttributionText}`);

  const locationText = event.hasExactCoordinates
    ? `${event.venueName}, ${event.streetAddress}`
    : event.venueName;

  const rawLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//tarra//Street Pole Event Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}-${startStamp}@tarra.events`,
    `DTSTAMP:${formatIcsTimestamp(dtStamp)}`,
    `DTSTART:${startStamp}`,
    `DTEND:${endStamp}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(descParts.join('\n\n'))}`,
    `LOCATION:${escapeIcsText(locationText)}`,
    ...(occ.infoUrl || event.infoUrl
      ? [`URL:${occ.infoUrl || event.infoUrl}`]
      : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return rawLines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/**
 * Triggers an .ics iCalendar file download for Apple/Outlook/Mobile calendars.
 */
export function downloadEventIcs(
  event: NormalizedEvent,
  selectedDate?: string | null
): void {
  const content = buildEventIcsContent(event, selectedDate);
  const occ = resolveEventOccurrence(event, selectedDate);
  const dateSuffix = toDateKey(occ.start);

  const blob = new Blob([content], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.id.replace(/[^a-z0-9-_]/gi, '_')}-${dateSuffix}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
