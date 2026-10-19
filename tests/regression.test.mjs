import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

// Enable extensionless .ts resolution for Node v24 native TypeScript execution
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !path.extname(specifier) &&
      context.parentURL
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const tsCandidate = path.resolve(parentDir, `${specifier}.ts`);
      if (existsSync(tsCandidate)) {
        return nextResolve(pathToFileURL(tsCandidate).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const calendarUtils = await import('../src/utils/calendarUtils.ts');
const linkedEventsClient = await import('../src/services/linkedEventsClient.ts');
const licenseGuard = await import('../src/utils/licenseGuard.ts');
const { CITIES } = await import('../src/config/cities.ts');

const {
  isValidDateKey,
  parseDateKey,
  doesEventOccurOnDate,
  resolveEventForDate,
  buildEventIcsContent,
  buildGoogleCalendarUrl,
  isEventOnUpcomingWeekend,
  isEventOccurringTonight,
  buildMonthGrid,
} = calendarUtils;

const {
  normalizeLinkedEvent,
  consolidateRecurringEvents,
  classifyTopic,
  classifyTopics,
  groupEventsByVenue,
} = linkedEventsClient;

const { buildLicenseAttribution } = licenseGuard;

test('Check 01 (Finding 03): Multi-day exhibition and overnight event match all overlapped calendar dates', () => {
  const exhibition = normalizeLinkedEvent(
    {
      id: 'turku:exhibition-oct',
      name: { fi: 'October Exhibition' },
      start_time: '2026-10-01T10:00:00Z',
      end_time: '2026-10-31T18:00:00Z',
      offers: [{ is_free: true }],
    },
    'turku'
  );
  assert.ok(exhibition);
  assert.equal(doesEventOccurOnDate(exhibition, '2026-10-20'), true);
  assert.equal(doesEventOccurOnDate(exhibition, '2026-11-01'), false);

  const overnight = normalizeLinkedEvent(
    {
      id: 'turku:overnight-party',
      name: { fi: 'Late Night Club' },
      start_time: '2026-10-20T23:00:00+03:00',
      end_time: '2026-10-21T02:00:00+03:00',
      offers: [{ is_free: false, price: { fi: '15 €' } }],
    },
    'turku'
  );
  assert.ok(overnight);
  assert.equal(doesEventOccurOnDate(overnight, '2026-10-20'), true);
  assert.equal(doesEventOccurOnDate(overnight, '2026-10-21'), true);
});

test('Check 02 (Finding 04): Selecting a later recurrence resolves display and export timestamps to that occurrence', () => {
  const recurring = normalizeLinkedEvent(
    {
      id: 'turku:weekly-jazz',
      name: { fi: 'Weekly Jazz' },
      start_time: '2026-10-20T10:00:00Z',
      end_time: '2026-10-20T12:00:00Z',
      occurrence_dates: [
        {
          id: 'occ-1',
          start: '2026-10-20T10:00:00Z',
          end: '2026-10-20T12:00:00Z',
          info_url: 'https://example.org/oct-20',
        },
        {
          id: 'occ-2',
          start: '2026-10-27T10:00:00Z',
          end: '2026-10-27T12:00:00Z',
          info_url: 'https://example.org/oct-27',
        },
      ],
    },
    'turku',
    0,
    undefined,
    new Date('2026-10-19T12:00:00Z')
  );
  assert.ok(recurring);
  assert.equal(doesEventOccurOnDate(recurring, '2026-10-27'), true);

  const resolved = resolveEventForDate(
    recurring,
    '2026-10-27',
    new Date('2026-10-19T12:00:00Z')
  );
  assert.equal(resolved.startTime.toISOString(), '2026-10-27T10:00:00.000Z');
  assert.equal(resolved.endTime.toISOString(), '2026-10-27T12:00:00.000Z');
  assert.equal(resolved.infoUrl, 'https://example.org/oct-27');

  const gcalUrl = buildGoogleCalendarUrl(recurring, '2026-10-27');
  assert.match(gcalUrl, /20261027T100000Z/);

  const icsContent = buildEventIcsContent(recurring, '2026-10-27');
  assert.match(icsContent, /DTSTART:20261027T100000Z/);
});

test('Check 03 (Finding 05): Consolidation preserves same-day matinee and evening sessions and retains alias IDs', () => {
  const morning = normalizeLinkedEvent(
    {
      id: 'tampere:show-matinee',
      name: { fi: 'Teatteriesitys' },
      start_time: '2026-10-24T10:00:00+03:00',
      end_time: '2026-10-24T12:00:00+03:00',
      location: {
        id: 'tampere:ttt',
        name: { fi: 'TTT-Klubi' },
        position: { type: 'Point', coordinates: [23.752, 61.497] },
      },
    },
    'tampere'
  );
  const evening = normalizeLinkedEvent(
    {
      id: 'tampere:show-evening',
      name: { fi: 'Teatteriesitys' },
      start_time: '2026-10-24T20:00:00+03:00',
      end_time: '2026-10-24T22:00:00+03:00',
      location: {
        id: 'tampere:ttt',
        name: { fi: 'TTT-Klubi' },
        position: { type: 'Point', coordinates: [23.752, 61.497] },
      },
    },
    'tampere'
  );

  const merged = consolidateRecurringEvents([morning, evening]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].occurrenceDates.length, 2);
  assert.deepEqual(merged[0].aliasIds, [
    'tampere:show-matinee',
    'tampere:show-evening',
  ]);
});

test('Check 04 (Finding 06): Missing price data normalizes to unknown rather than Free Entry', () => {
  const noOffers = normalizeLinkedEvent(
    {
      id: 'turku:unpriced',
      name: { fi: 'Mystery Concert' },
      start_time: '2026-10-25T18:00:00Z',
      offers: [],
    },
    'turku'
  );
  assert.ok(noOffers);
  assert.equal(noOffers.priceStatus, 'unknown');
  assert.equal(noOffers.isFree, false);
  assert.equal(noOffers.priceText, 'Price not provided');

  const explicitFree = normalizeLinkedEvent(
    {
      id: 'turku:free-concert',
      name: { fi: 'Free Park Concert' },
      start_time: '2026-10-25T18:00:00Z',
      offers: [{ is_free: true }],
    },
    'turku'
  );
  assert.ok(explicitFree);
  assert.equal(explicitFree.priceStatus, 'free');
  assert.equal(explicitFree.isFree, true);
  assert.equal(explicitFree.priceText, 'Free Entry');
});

test('Check 05 (Finding 07): Missing venue coordinates are not replaced with invented coordinates', () => {
  const unmapped = normalizeLinkedEvent(
    {
      id: 'turku:no-coords',
      name: { fi: 'Unmapped Lecture' },
      start_time: '2026-10-25T15:00:00Z',
      location: {
        id: 'turku:unknown',
        name: { fi: 'Secret Hall' },
        position: null,
      },
    },
    'turku'
  );
  assert.ok(unmapped);
  assert.equal(unmapped.coordinates, null);
  assert.equal(unmapped.hasExactCoordinates, false);
  assert.equal(unmapped.distanceKm, null);
  assert.equal(unmapped.reittiopasUrl, null);

  // Excluded from map markers by default, included when includeUnmapped is true
  assert.equal(groupEventsByVenue([unmapped]).length, 0);
  assert.equal(
    groupEventsByVenue([unmapped], { includeUnmapped: true }).length,
    1
  );
});

test('Check 06 (Finding 10): Weekend filter matches only the upcoming Friday–Sunday window', () => {
  const refMonday = new Date('2026-10-19T12:00:00+03:00'); // Monday
  const thisWeekendEvent = normalizeLinkedEvent(
    {
      id: 'turku:this-sat',
      name: { fi: 'This Saturday Gig' },
      start_time: '2026-10-24T19:00:00+03:00', // Saturday 24 Oct
      end_time: '2026-10-24T22:00:00+03:00',
    },
    'turku',
    0,
    undefined,
    refMonday
  );
  const farFutureSaturday = normalizeLinkedEvent(
    {
      id: 'turku:dec-sat',
      name: { fi: 'December Saturday Gig' },
      start_time: '2026-12-19T19:00:00+02:00', // Saturday in December
      end_time: '2026-12-19T22:00:00+02:00',
    },
    'turku',
    0,
    undefined,
    refMonday
  );

  assert.equal(isEventOnUpcomingWeekend(thisWeekendEvent, refMonday), true);
  assert.equal(isEventOnUpcomingWeekend(farFutureSaturday, refMonday), false);
});

test('Check 07 (Finding 11): Tonight filter excludes ended sessions and includes late-night spillover', () => {
  const nowEvening = new Date('2026-10-20T21:00:00+03:00');

  const alreadyEnded = normalizeLinkedEvent(
    {
      id: 'turku:ended-earlier',
      name: { fi: 'Early Evening Talk' },
      start_time: '2026-10-20T18:00:00+03:00',
      end_time: '2026-10-20T19:00:00+03:00',
    },
    'turku',
    0,
    undefined,
    nowEvening
  );
  const afterMidnight = normalizeLinkedEvent(
    {
      id: 'turku:late-dj',
      name: { fi: 'After Midnight DJ Set' },
      start_time: '2026-10-21T00:30:00+03:00',
      end_time: '2026-10-21T03:00:00+03:00',
    },
    'turku',
    0,
    undefined,
    nowEvening
  );

  assert.equal(isEventOccurringTonight(alreadyEnded, nowEvening), false);
  assert.equal(isEventOccurringTonight(afterMidnight, nowEvening), true);
});

test('Check 08 (Finding 12): Calendar grid marks hasLive only on today cell, not future dates', () => {
  const now = new Date('2026-10-20T19:00:00+03:00');
  const liveRecurring = normalizeLinkedEvent(
    {
      id: 'turku:live-recurring',
      name: { fi: 'Recurring Live Show' },
      start_time: '2026-10-20T18:00:00+03:00',
      end_time: '2026-10-20T21:00:00+03:00',
      occurrence_dates: [
        {
          start: '2026-10-20T18:00:00+03:00',
          end: '2026-10-20T21:00:00+03:00',
        },
        {
          start: '2026-10-27T18:00:00+02:00',
          end: '2026-10-27T21:00:00+02:00',
        },
      ],
    },
    'turku',
    0,
    undefined,
    now
  );

  const grid = buildMonthGrid(2026, 9, [liveRecurring], now); // October (0-indexed 9)
  const oct20 = grid.find((c) => c.dateKey === '2026-10-20');
  const oct27 = grid.find((c) => c.dateKey === '2026-10-27');
  assert.equal(oct20?.hasLive, true);
  assert.equal(oct27?.hasLive, false);
  assert.equal(oct27?.eventCount, 1);
});

test('Check 09 (Finding 18): Word-boundary topic classification avoids substring false positives', () => {
  const baroque = {
    id: 'turku:baroque',
    name: { fi: 'Barokin labyrinteissä' },
    short_description: { fi: 'Kamarimusiikkikonsertti' },
    start_time: '2026-10-20T18:00:00Z',
  };
  assert.equal(classifyTopic(baroque), 'music');

  const trueCrime = {
    id: 'turku:truecrime',
    name: { fi: 'Miljoonakeikka - True crime -erikoiskierros' },
    short_description: { fi: 'Opastettu kierros museossa' },
    start_time: '2026-10-20T18:00:00Z',
  };
  assert.equal(classifyTopic(trueCrime), 'culture');
  assert.ok(!classifyTopics(trueCrime).includes('music'));
});

test('Check 10 (Finding 17 & Tip B): ICS escaping/folding and honest attribution credits', () => {
  const ev = normalizeLinkedEvent(
    {
      id: 'turku:ics-test',
      name: { fi: 'Semi;Colon, Comma\\Slash\nNewline Event' },
      start_time: '2026-10-20T18:00:00Z',
      end_time: '2026-10-20T20:00:00Z',
      data_source: 'turku',
      images: [
        {
          id: 'img-1',
          url: 'https://example.org/photo.jpg',
          photographer_name: null,
        },
      ],
    },
    'turku'
  );
  assert.ok(ev);
  assert.match(ev.attribution.badgeText, /Photo credit not provided/);
  assert.match(ev.attribution.apiAttributionText, /kalenteri\.turku\.fi/);

  const ics = buildEventIcsContent(ev);
  assert.match(ics, /SUMMARY:Semi\\;Colon\\, Comma\\\\Slash\\nNewline Event/);
  for (const line of ics.split('\r\n')) {
    assert.ok(
      Buffer.byteLength(line, 'utf8') <= 75,
      `ICS line exceeded 75 octets: ${line}`
    );
  }
});

test('Check 11 (Finding 23): Date validation rejects impossible dates and prototype keys are rejected as city IDs', () => {
  assert.equal(isValidDateKey('2026-10-20'), true);
  assert.equal(isValidDateKey('2026-02-31'), false);
  assert.equal(isValidDateKey('2026-13-01'), false);
  assert.equal(Number.isNaN(parseDateKey('2026-02-31').getTime()), true);

  assert.equal(Object.hasOwn(CITIES, 'turku'), true);
  assert.equal(Object.hasOwn(CITIES, 'toString'), false);
  assert.equal(Object.hasOwn(CITIES, 'constructor'), false);
});
