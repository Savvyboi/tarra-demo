import type { NormalizedEvent, NormalizedOccurrence } from '../types/linkedEvents';

export const FINLAND_TIMEZONE = 'Europe/Helsinki';
export const LONG_EVENT_SPAN_MS = 24 * 60 * 60 * 1000;

export interface ZonedDateParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour: number; // 0..23
  minute: number; // 0..59
  second: number; // 0..59
}

// Hoisted, reusable Europe/Helsinki Intl.DateTimeFormat instances (`BUG-07`, `PERF-02`)
const helsinkiPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: FINLAND_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const helsinkiClockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINLAND_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const helsinkiWeekdayShortFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINLAND_TIMEZONE,
  weekday: 'short',
});

const helsinkiDayMonthFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINLAND_TIMEZONE,
  day: 'numeric',
  month: 'short',
});

const helsinkiDayMonthYearFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINLAND_TIMEZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const helsinkiWeekdayDayMonthFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINLAND_TIMEZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const helsinkiWeekdayDayMonthYearFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINLAND_TIMEZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const helsinkiMonthYearFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINLAND_TIMEZONE,
  month: 'long',
  year: 'numeric',
});

const helsinkiLongBannerDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: FINLAND_TIMEZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Extracts wall-clock date/time components in `Europe/Helsinki`.
 */
export function getHelsinkiParts(date: Date): ZonedDateParts | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const parts = helsinkiPartsFormatter.formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const p of parts) {
    switch (p.type) {
      case 'year':
        year = Number(p.value);
        break;
      case 'month':
        month = Number(p.value);
        break;
      case 'day':
        day = Number(p.value);
        break;
      case 'hour': {
        const h = Number(p.value);
        hour = h === 24 ? 0 : h;
        break;
      }
      case 'minute':
        minute = Number(p.value);
        break;
      case 'second':
        second = Number(p.value);
        break;
    }
  }

  return { year, month, day, hour, minute, second };
}

/**
 * Converts a wall-clock date/time in `Europe/Helsinki` into an exact UTC-backed `Date`,
 * accurately resolving EET (+02:00) vs EEST (+03:00) across DST transitions (`BUG-07`).
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
): Date {
  const targetAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  if (Number.isNaN(targetAsUtcMs)) {
    return new Date(NaN);
  }

  // Pass 1: initial estimate at UTC+2
  const guess1 = targetAsUtcMs - 2 * 3600 * 1000;
  const p1 = getHelsinkiParts(new Date(guess1));
  if (!p1) return new Date(NaN);
  const obs1 = Date.UTC(
    p1.year,
    p1.month - 1,
    p1.day,
    p1.hour,
    p1.minute,
    p1.second,
    ms
  );
  const offset1 = obs1 - guess1;
  const guess2 = targetAsUtcMs - offset1;

  // Pass 2: refine across DST transition boundaries
  const p2 = getHelsinkiParts(new Date(guess2));
  if (!p2) return new Date(guess2);
  const obs2 = Date.UTC(
    p2.year,
    p2.month - 1,
    p2.day,
    p2.hour,
    p2.minute,
    p2.second,
    ms
  );
  const offset2 = obs2 - guess2;
  return new Date(targetAsUtcMs - offset2);
}

/**
 * Formats a Date object as `YYYY-MM-DD` in `Europe/Helsinki` (`BUG-07`).
 */
export function toDateKey(date: Date): string {
  const p = getHelsinkiParts(date);
  if (!p) return '';
  const y = String(p.year).padStart(4, '0');
  const m = String(p.month).padStart(2, '0');
  const d = String(p.day).padStart(2, '0');
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

  const candidateMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(candidateMs)) return false;
  const candidate = new Date(candidateMs);

  return (
    candidate.getUTCFullYear() === y &&
    candidate.getUTCMonth() === m - 1 &&
    candidate.getUTCDate() === d
  );
}

/**
 * Pure calendar arithmetic on a `YYYY-MM-DD` key, immune to host OS time zone.
 */
export function addCalendarDays(dateKey: string, deltaDays: number): string {
  if (!isValidDateKey(dateKey)) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0, 0));
  const ry = String(shifted.getUTCFullYear()).padStart(4, '0');
  const rm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

function getWeekdayFromDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0)).getUTCDay();
}

/**
 * Parses a validated YYYY-MM-DD string into a `Date` at `00:00:00.000` in `Europe/Helsinki`.
 * Returns an Invalid Date (NaN) if the dateKey is malformed or out-of-range.
 */
export function parseDateKey(dateKey: string): Date {
  if (!isValidDateKey(dateKey)) {
    return new Date(NaN);
  }
  const [y, m, d] = dateKey.split('-').map(Number);
  return zonedWallTimeToUtc(y, m, d, 0, 0, 0, 0);
}

/**
 * Parses a validated `YYYY-MM-DD` string at `00:00:00.000` in `Europe/Helsinki`.
 */
export function parseHelsinkiDateStart(dateKey: string): Date {
  return parseDateKey(dateKey);
}

/**
 * Parses a validated `YYYY-MM-DD` string at `23:59:59.999` in `Europe/Helsinki`,
 * staying strictly inside that calendar day even across 23h/25h DST transitions (`BUG-07`).
 */
export function parseHelsinkiDateEnd(dateKey: string): Date {
  if (!isValidDateKey(dateKey)) {
    return new Date(NaN);
  }
  const [y, m, d] = dateKey.split('-').map(Number);
  return zonedWallTimeToUtc(y, m, d, 23, 59, 59, 999);
}

/**
 * Parses ISO timestamps, date-only strings (`YYYY-MM-DD`), and offsetless local strings
 * (`YYYY-MM-DDTHH:mm:ss` / `YYYY-MM-DD HH:mm:ss`) in `Europe/Helsinki`, while correcting
 * upstream `0026-...` two-digit century typos observed in `api.hel.fi`.
 */
export function parseHelsinkiTimestamp(
  raw: string | null | undefined,
  mode: 'start' | 'end' = 'start'
): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  let trimmed = raw.trim();
  if (!trimmed) return null;

  // Repair upstream 2-digit century typos such as "0026-09-23T11:20:11Z" -> "2026-..."
  if (/^00[2-9]\d-/.test(trimmed)) {
    trimmed = `20${trimmed.slice(2)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d =
      mode === 'end'
        ? parseHelsinkiDateEnd(trimmed)
        : parseHelsinkiDateStart(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const localMatch =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
      trimmed
    );
  if (localMatch) {
    const y = Number(localMatch[1]);
    const mo = Number(localMatch[2]);
    const da = Number(localMatch[3]);
    const hh = Number(localMatch[4]);
    const mm = Number(localMatch[5]);
    const ss = localMatch[6] ? Number(localMatch[6]) : 0;
    const ms = localMatch[7] ? Number(localMatch[7].padEnd(3, '0')) : 0;
    const d = zonedWallTimeToUtc(y, mo, da, hh, mm, ss, ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

const dayBoundsCache = new Map<
  string,
  { dayStart: Date; dayEnd: Date; startMs: number; endMs: number }
>();

/**
 * Returns the start (00:00:00.000) and end (23:59:59.999) bounds in `Europe/Helsinki`
 * for a validated YYYY-MM-DD date key, memoized for fast repeated lookups (`PERF-04`).
 */
export function getDayBounds(
  targetDateKey: string
): { dayStart: Date; dayEnd: Date } | null {
  const cached = dayBoundsCache.get(targetDateKey);
  if (cached) {
    return { dayStart: cached.dayStart, dayEnd: cached.dayEnd };
  }
  if (!isValidDateKey(targetDateKey)) return null;
  const [y, m, d] = targetDateKey.split('-').map(Number);
  const dayStart = zonedWallTimeToUtc(y, m, d, 0, 0, 0, 0);
  const dayEnd = zonedWallTimeToUtc(y, m, d, 23, 59, 59, 999);
  if (Number.isNaN(dayStart.getTime()) || Number.isNaN(dayEnd.getTime())) {
    return null;
  }
  if (dayBoundsCache.size > 2000) {
    dayBoundsCache.clear();
  }
  dayBoundsCache.set(targetDateKey, {
    dayStart,
    dayEnd,
    startMs: dayStart.getTime(),
    endMs: dayEnd.getTime(),
  });
  return { dayStart, dayEnd };
}

function getDayBoundsMs(
  targetDateKey: string
): { startMs: number; endMs: number } | null {
  const cached = dayBoundsCache.get(targetDateKey);
  if (cached) return cached;
  const bounds = getDayBounds(targetDateKey);
  if (!bounds) return null;
  return dayBoundsCache.get(targetDateKey) || {
    startMs: bounds.dayStart.getTime(),
    endMs: bounds.dayEnd.getTime(),
  };
}

/**
 * Checks whether a single [start, end] occurrence interval overlaps the given YYYY-MM-DD date
 * in `Europe/Helsinki`.
 */
export function doesOccurrenceOverlapDate(
  occ: { start: Date; end: Date },
  targetDateKey: string
): boolean {
  const bounds = getDayBoundsMs(targetDateKey);
  if (!bounds) return false;
  const { startMs: dayStartMs, endMs: dayEndMs } = bounds;

  const startMs = occ.start.getTime();
  const endMs = occ.end.getTime();
  if (Number.isNaN(startMs)) return false;

  const effectiveEndMs =
    Number.isNaN(endMs) || endMs < startMs ? startMs : endMs;

  if (effectiveEndMs === startMs) {
    return startMs >= dayStartMs && startMs <= dayEndMs;
  }

  return startMs <= dayEndMs && effectiveEndMs > dayStartMs;
}

/**
 * Checks if an event takes place on the given YYYY-MM-DD date in `Europe/Helsinki`.
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
 * Returns true when at least one occurrence of `event` has not yet ended (`end >= now`) (`BUG-02`).
 */
export function hasUpcomingOrActiveOccurrence(
  event: Pick<NormalizedEvent, 'startTime' | 'endTime' | 'occurrenceDates'>,
  now: Date = new Date()
): boolean {
  const nowMs = now.getTime();
  if (Array.isArray(event.occurrenceDates) && event.occurrenceDates.length > 0) {
    return event.occurrenceDates.some((occ) => occ.end.getTime() >= nowMs);
  }
  return event.endTime.getTime() >= nowMs;
}

/**
 * Returns true if an occurrence spans strictly more than 24 hours (`DATA-03`).
 */
export function isLongSpanInterval(start: Date, end: Date): boolean {
  return end.getTime() - start.getTime() > LONG_EVENT_SPAN_MS;
}

/**
 * Detects all-day events and 00:00 placeholder timestamps in `Europe/Helsinki` (`DATA-03`).
 */
export function isAllDayInterval(
  start: Date,
  end: Date,
  rawAllDay?: boolean
): boolean {
  if (rawAllDay) return true;
  const sp = getHelsinkiParts(start);
  const ep = getHelsinkiParts(end);
  if (!sp || !ep) return false;
  if (sp.hour !== 0 || sp.minute !== 0) return false;
  const durMs = end.getTime() - start.getTime();
  if (durMs <= 0) return true;
  if (ep.hour === 23 && ep.minute >= 59) return true;
  if (ep.hour === 0 && ep.minute === 0) return true;
  return false;
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
  // Fall back to the latest occurrence rather than sorted[0] if all dates have passed (`BUG-02`)
  const upcoming =
    sorted.find((occ) => occ.end.getTime() >= now.getTime()) ||
    sorted[sorted.length - 1];

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
 * in `Europe/Helsinki` relative to `now` (`BUG-07`, Finding 10).
 */
export function getUpcomingWeekendInterval(now: Date = new Date()): {
  start: Date;
  end: Date;
  effectiveStart: Date;
} {
  const todayKey = toDateKey(now);
  const day = getWeekdayFromDateKey(todayKey); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
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

  const fridayKey = addCalendarDays(todayKey, offsetToFriday);
  const sundayKey = addCalendarDays(fridayKey, 2);
  const start = parseHelsinkiDateStart(fridayKey);
  const end = parseHelsinkiDateEnd(sundayKey);
  const effectiveStart = now.getTime() > start.getTime() ? now : start;
  return { start, end, effectiveStart };
}

/**
 * Checks if any occurrence overlaps the current/upcoming weekend in `Europe/Helsinki`
 * and has not yet ended.
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
 * Computes tonight's evening/night interval [max(now, 17:00), next day 04:00] in `Europe/Helsinki`
 * and checks whether any un-ended occurrence takes place during tonight's window (`BUG-07`).
 */
export function isEventOccurringTonight(
  eventOrOccurrences:
    | ReadonlyArray<{ start: Date; end: Date }>
    | Pick<NormalizedEvent, 'occurrenceDates' | 'startTime' | 'endTime'>,
  now: Date = new Date()
): boolean {
  const nowParts = getHelsinkiParts(now);
  if (!nowParts) return false;

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

  const todayKey = toDateKey(now);
  const tomorrowKey = addCalendarDays(todayKey, 1);
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const [ny, nm, nd] = tomorrowKey.split('-').map(Number);

  const windows: Array<{ start: Date; end: Date }> = [];

  if (nowParts.hour < 4) {
    const earlyNightEnd = zonedWallTimeToUtc(ty, tm, td, 4, 0, 0, 0);
    windows.push({ start: now, end: earlyNightEnd });
  }

  const eveningStart = zonedWallTimeToUtc(ty, tm, td, 17, 0, 0, 0);
  const nightEnd = zonedWallTimeToUtc(ny, nm, nd, 4, 0, 0, 0);
  const effectiveEveningStart =
    now.getTime() > eveningStart.getTime() ? now : eveningStart;

  if (effectiveEveningStart.getTime() < nightEnd.getTime()) {
    windows.push({ start: effectiveEveningStart, end: nightEnd });
  }

  return occurrences.some((occ) => {
    // Long multi-day exhibitions (>24h) should not clutter "Tonight" unless timed <=24h
    if (occ.end.getTime() <= now.getTime()) return false;
    return windows.some(
      (w) =>
        occ.start.getTime() < w.end.getTime() &&
        occ.end.getTime() > w.start.getTime()
    );
  });
}

/**
 * Checks whether an event has a timed live session (<= 24h, non-all-day) right now on `dateKey` (`DATA-03`).
 */
export function isEventLiveOnDateCell(
  event: Pick<
    NormalizedEvent,
    'startTime' | 'endTime' | 'occurrenceDates'
  > & { raw?: { all_day?: boolean } },
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
      !isLongSpanInterval(occ.start, occ.end) &&
      !isAllDayInterval(occ.start, occ.end, event.raw?.all_day) &&
      doesOccurrenceOverlapDate(occ, dateKey) &&
      nowMs >= occ.start.getTime() &&
      nowMs <= occ.end.getTime()
  );
}

/**
 * Formats a `Date` clock time (`HH:mm`) in `Europe/Helsinki`.
 */
export function formatHelsinkiTime(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return helsinkiClockFormatter.format(date);
}

/**
 * Formats a `Date` in `Europe/Helsinki`, automatically appending the year when it differs
 * from `currentYear` (`DATA-03`, `BUG-07`).
 */
export function formatHelsinkiDate(
  date: Date,
  options?: {
    includeWeekday?: boolean;
    now?: Date;
    alwaysIncludeYear?: boolean;
  }
): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const parts = getHelsinkiParts(date);
  const nowParts = getHelsinkiParts(options?.now ?? new Date());
  const includeYear =
    options?.alwaysIncludeYear ||
    Boolean(parts && nowParts && parts.year !== nowParts.year);
  const includeWeekday = options?.includeWeekday ?? true;

  if (includeWeekday) {
    return includeYear
      ? helsinkiWeekdayDayMonthYearFormatter.format(date)
      : helsinkiWeekdayDayMonthFormatter.format(date);
  }
  return includeYear
    ? helsinkiDayMonthYearFormatter.format(date)
    : helsinkiDayMonthFormatter.format(date);
}

export function formatHelsinkiMonthYear(year: number, monthIndex0: number): string {
  const anchor = zonedWallTimeToUtc(year, monthIndex0 + 1, 15, 12, 0, 0, 0);
  return helsinkiMonthYearFormatter.format(anchor);
}

export function formatHelsinkiBannerDate(dateKey: string): string {
  const d = safeParseDateKey(dateKey);
  return helsinkiLongBannerDateFormatter.format(d);
}

/**
 * Formats an event's schedule label in `Europe/Helsinki` (`DATA-03`, `BUG-07`):
 * - Spans > 24 h: `"Ongoing · until 7 Nov"` when active, or `"14 Nov – 16 Nov"` when upcoming/past.
 * - Non-current years always include the 4-digit year (e.g. `2024`, `2027`).
 * - Midnight placeholders (`00:00`) and `all_day` events print `"All day"` instead of `00:00`.
 */
export function formatEventTimeLabel(
  event: Pick<
    NormalizedEvent,
    'startTime' | 'endTime' | 'dateKey' | 'occurrenceDates' | 'infoUrl'
  > & { raw?: { all_day?: boolean; end_time?: string | null } },
  options?: {
    selectedDate?: string | null;
    now?: Date;
    includeEndTime?: boolean;
  }
): string {
  const now = options?.now ?? new Date();
  const occ = resolveEventOccurrence(event, options?.selectedDate, now);
  const start = occ.start;
  const end = occ.end;

  if (isLongSpanInterval(start, end)) {
    const endLabel = formatHelsinkiDate(end, {
      includeWeekday: false,
      now,
    });
    if (start.getTime() <= now.getTime() && end.getTime() >= now.getTime()) {
      return `Ongoing · until ${endLabel}`;
    }
    const startLabel = formatHelsinkiDate(start, {
      includeWeekday: false,
      now,
    });
    return `${startLabel} – ${endLabel}`;
  }

  const dateLabel = formatHelsinkiDate(start, {
    includeWeekday: true,
    now,
  });

  const startClock = formatHelsinkiTime(start);
  const allDay =
    isAllDayInterval(start, end, event.raw?.all_day) || startClock === '00:00';

  if (allDay) {
    return `${dateLabel} • All day`;
  }

  if (options?.includeEndTime) {
    const endClock = formatHelsinkiTime(end);
    return `${dateLabel} • ${startClock}–${endClock}`;
  }

  return `${dateLabel} • ${startClock}`;
}

export interface CalendarDayCell {
  date: Date;
  dateKey: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  isCovered: boolean;
  eventCount: number;
  hasLive: boolean;
}

/**
 * Builds a 6-week (42-day, Monday-first) calendar grid for the given year & month (0-indexed)
 * in `Europe/Helsinki`, computing event counts in a single pass (`PERF-04`, `BUG-07`, `BUG-03`).
 */
export function buildMonthGrid(
  year: number,
  month: number,
  events: NormalizedEvent[],
  now: Date = new Date(),
  coverageBounds?: { start?: string | null; end?: string | null }
): CalendarDayCell[] {
  const todayKey = toDateKey(now);
  const firstDateKey = `${String(year).padStart(4, '0')}-${String(
    month + 1
  ).padStart(2, '0')}-01`;
  const firstDow = getWeekdayFromDateKey(firstDateKey); // 0=Sun..6=Sat
  const startOffset = (firstDow + 6) % 7; // Monday = 0
  const gridStartKey = addCalendarDays(firstDateKey, -startOffset);

  const cellMeta: Array<{
    date: Date;
    dateKey: string;
    dayNumber: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    isWeekend: boolean;
    isCovered: boolean;
    startMs: number;
    endMs: number;
  }> = [];

  const counts = new Int32Array(42);
  let todayIndex = -1;
  let todayHasLive = false;

  const covStart =
    coverageBounds?.start && isValidDateKey(coverageBounds.start)
      ? coverageBounds.start
      : null;
  const covEnd =
    coverageBounds?.end && isValidDateKey(coverageBounds.end)
      ? coverageBounds.end
      : null;

  for (let i = 0; i < 42; i++) {
    const dateKey = addCalendarDays(gridStartKey, i);
    const [, mStr, dStr] = dateKey.split('-');
    const cellMonth0 = Number(mStr) - 1;
    const dayNumber = Number(dStr);
    const bounds = getDayBoundsMs(dateKey)!;
    const dow = getWeekdayFromDateKey(dateKey);
    const isToday = dateKey === todayKey;
    if (isToday) todayIndex = i;

    const isCovered =
      (!covStart || dateKey >= covStart) && (!covEnd || dateKey <= covEnd);

    cellMeta.push({
      date: parseHelsinkiDateStart(dateKey),
      dateKey,
      dayNumber,
      isCurrentMonth: cellMonth0 === month,
      isToday,
      isWeekend: dow === 0 || dow === 6,
      isCovered,
      startMs: bounds.startMs,
      endMs: bounds.endMs,
    });
  }

  const gridStartMs = cellMeta[0].startMs;
  const gridEndMs = cellMeta[41].endMs;
  const seenEventStamp = new Int32Array(42).fill(-1);

  for (let evIdx = 0; evIdx < events.length; evIdx++) {
    const ev = events[evIdx];
    const occs =
      Array.isArray(ev.occurrenceDates) && ev.occurrenceDates.length > 0
        ? ev.occurrenceDates
        : [{ start: ev.startTime, end: ev.endTime }];

    for (let oIdx = 0; oIdx < occs.length; oIdx++) {
      const occ = occs[oIdx];
      const sMs = occ.start.getTime();
      const rawEndMs = occ.end.getTime();
      if (Number.isNaN(sMs)) continue;
      const eMs =
        Number.isNaN(rawEndMs) || rawEndMs < sMs ? sMs : rawEndMs;

      if (eMs < gridStartMs || sMs > gridEndMs) continue;

      for (let c = 0; c < 42; c++) {
        if (seenEventStamp[c] === evIdx) continue;
        const cell = cellMeta[c];
        const overlaps =
          eMs === sMs
            ? sMs >= cell.startMs && sMs <= cell.endMs
            : sMs <= cell.endMs && eMs > cell.startMs;
        if (overlaps) {
          seenEventStamp[c] = evIdx;
          counts[c]++;
        }
      }
    }

    if (
      todayIndex >= 0 &&
      !todayHasLive &&
      seenEventStamp[todayIndex] === evIdx &&
      isEventLiveOnDateCell(ev, todayKey, now)
    ) {
      todayHasLive = true;
    }
  }

  return cellMeta.map((c, idx) => ({
    date: c.date,
    dateKey: c.dateKey,
    dayNumber: c.dayNumber,
    isCurrentMonth: c.isCurrentMonth,
    isToday: c.isToday,
    isWeekend: c.isWeekend,
    isCovered: c.isCovered,
    eventCount: counts[idx],
    hasLive: idx === todayIndex ? todayHasLive : false,
  }));
}

/**
 * Generates an upcoming quick-pick strip starting from today in `Europe/Helsinki`.
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
  if (daysCount <= 0) return [];
  const todayKey = toDateKey(now);
  const tomorrowKey = addCalendarDays(todayKey, 1);

  const dayMeta: Array<{
    date: Date;
    dateKey: string;
    startMs: number;
    endMs: number;
  }> = [];

  for (let i = 0; i < daysCount; i++) {
    const dateKey = addCalendarDays(todayKey, i);
    const bounds = getDayBoundsMs(dateKey)!;
    const [y, m, d] = dateKey.split('-').map(Number);
    dayMeta.push({
      date: zonedWallTimeToUtc(y, m, d, 12, 0, 0, 0),
      dateKey,
      startMs: bounds.startMs,
      endMs: bounds.endMs,
    });
  }

  const counts = new Int32Array(daysCount);
  const seenEventStamp = new Int32Array(daysCount).fill(-1);
  const stripStartMs = dayMeta[0].startMs;
  const stripEndMs = dayMeta[daysCount - 1].endMs;

  for (let evIdx = 0; evIdx < events.length; evIdx++) {
    const ev = events[evIdx];
    const occs =
      Array.isArray(ev.occurrenceDates) && ev.occurrenceDates.length > 0
        ? ev.occurrenceDates
        : [{ start: ev.startTime, end: ev.endTime }];

    for (let oIdx = 0; oIdx < occs.length; oIdx++) {
      const occ = occs[oIdx];
      const sMs = occ.start.getTime();
      const rawEndMs = occ.end.getTime();
      if (Number.isNaN(sMs)) continue;
      const eMs =
        Number.isNaN(rawEndMs) || rawEndMs < sMs ? sMs : rawEndMs;
      if (eMs < stripStartMs || sMs > stripEndMs) continue;

      for (let c = 0; c < daysCount; c++) {
        if (seenEventStamp[c] === evIdx) continue;
        const dm = dayMeta[c];
        const overlaps =
          eMs === sMs
            ? sMs >= dm.startMs && sMs <= dm.endMs
            : sMs <= dm.endMs && eMs > dm.startMs;
        if (overlaps) {
          seenEventStamp[c] = evIdx;
          counts[c]++;
        }
      }
    }
  }

  return dayMeta.map((dm, idx) => ({
    date: dm.date,
    dateKey: dm.dateKey,
    weekdayShort:
      dm.dateKey === todayKey
        ? 'Today'
        : dm.dateKey === tomorrowKey
          ? 'Tmrw'
          : helsinkiWeekdayShortFormatter.format(dm.date),
    dayMonthLabel: helsinkiDayMonthFormatter.format(dm.date),
    isToday: dm.dateKey === todayKey,
    isTomorrow: dm.dateKey === tomorrowKey,
    eventCount: counts[idx],
  }));
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
 * Resolves single-day `VALUE=DATE` export bounds (`YYYYMMDD`..`YYYYMMDD` exclusive end)
 * when an event is all-day or spans > 24 hours (`DATA-04`).
 */
function resolveAllDayOrMultiDayExportDates(
  occ: NormalizedOccurrence,
  rawAllDay: boolean | undefined,
  selectedDate?: string | null,
  now: Date = new Date()
): { startDateCompact: string; endDateCompact: string; spanNote: string | null } | null {
  const isLong = isLongSpanInterval(occ.start, occ.end);
  const isAllDay = isAllDayInterval(occ.start, occ.end, rawAllDay);

  if (!isLong && !isAllDay) {
    return null;
  }

  const todayKey = toDateKey(now);
  let targetDayKey: string;
  if (
    selectedDate &&
    isValidDateKey(selectedDate) &&
    doesOccurrenceOverlapDate(occ, selectedDate)
  ) {
    targetDayKey = selectedDate;
  } else if (doesOccurrenceOverlapDate(occ, todayKey)) {
    targetDayKey = todayKey;
  } else if (occ.start.getTime() > now.getTime()) {
    targetDayKey = toDateKey(occ.start);
  } else {
    targetDayKey = toDateKey(occ.end);
  }

  const nextDayKey = addCalendarDays(targetDayKey, 1);
  const startDateCompact = targetDayKey.replace(/-/g, '');
  const endDateCompact = nextDayKey.replace(/-/g, '');
  const spanNote = isLong
    ? `Full run: ${toDateKey(occ.start)} – ${toDateKey(occ.end)}`
    : null;

  return { startDateCompact, endDateCompact, spanNote };
}

/**
 * Builds a Google Calendar deep-link URL for an event (or its selected occurrence).
 * Multi-day exhibitions and all-day events export a single `VALUE=DATE` day (`DATA-04`).
 */
export function buildGoogleCalendarUrl(
  event: NormalizedEvent,
  selectedDate?: string | null,
  now: Date = new Date()
): string {
  const occ = resolveEventOccurrence(event, selectedDate, now);
  const singleDayExport = resolveAllDayOrMultiDayExportDates(
    occ,
    event.raw?.all_day,
    selectedDate,
    now
  );

  const dates = singleDayExport
    ? `${singleDayExport.startDateCompact}/${singleDayExport.endDateCompact}`
    : `${formatIcsTimestamp(occ.start)}/${formatIcsTimestamp(occ.end)}`;

  const detailLines = [event.shortDescription];
  if (singleDayExport?.spanNote) {
    detailLines.push(singleDayExport.spanNote);
  }
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
 * Multi-day exhibitions and all-day events use `DTSTART;VALUE=DATE` for the selected/current day (`DATA-04`).
 */
export function buildEventIcsContent(
  event: NormalizedEvent,
  selectedDate?: string | null,
  dtStamp: Date = new Date()
): string {
  const occ = resolveEventOccurrence(event, selectedDate, dtStamp);
  const singleDayExport = resolveAllDayOrMultiDayExportDates(
    occ,
    event.raw?.all_day,
    selectedDate,
    dtStamp
  );

  const startStamp = singleDayExport
    ? singleDayExport.startDateCompact
    : formatIcsTimestamp(occ.start);
  const dtStartLine = singleDayExport
    ? `DTSTART;VALUE=DATE:${singleDayExport.startDateCompact}`
    : `DTSTART:${startStamp}`;
  const dtEndLine = singleDayExport
    ? `DTEND;VALUE=DATE:${singleDayExport.endDateCompact}`
    : `DTEND:${formatIcsTimestamp(occ.end)}`;

  const descParts = [event.shortDescription];
  if (singleDayExport?.spanNote) {
    descParts.push(singleDayExport.spanNote);
  }
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
    dtStartLine,
    dtEndLine,
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
  const now = new Date();
  const content = buildEventIcsContent(event, selectedDate, now);
  const occ = resolveEventOccurrence(event, selectedDate, now);
  const singleDayExport = resolveAllDayOrMultiDayExportDates(
    occ,
    event.raw?.all_day,
    selectedDate,
    now
  );
  const dateSuffix = singleDayExport
    ? `${singleDayExport.startDateCompact.slice(0, 4)}-${singleDayExport.startDateCompact.slice(4, 6)}-${singleDayExport.startDateCompact.slice(6, 8)}`
    : toDateKey(occ.start);

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
