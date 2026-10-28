import { registerHooks } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
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
const sanitizeHtml = await import('../src/utils/sanitizeHtml.ts');
const { CITIES, CITY_LIST, SOURCE_REGISTRY } = await import(
  '../src/config/cities.ts'
);
const syncFeeds = await import('../scripts/sync-feeds.mjs');

const {
  isValidDateKey,
  parseDateKey,
  toDateKey,
  doesEventOccurOnDate,
  resolveEventForDate,
  hasUpcomingOrActiveOccurrence,
  formatEventTimeLabel,
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
  validateAndNormalizeFinlandCoordinates,
  upgradeKnownLinkedEventsUrl,
  fetchWithTimeout,
  isCachedRecordFresh,
} = linkedEventsClient;

const { getCitySourceAttribution } = licenseGuard;
const { enforceSafeAnchorAttributes } = sanitizeHtml;
const {
  classifyKeskiSuomiEventCity,
  classifySatakuntaEventCity,
  classifyEpEventCity,
  convertHelloKuopioEventToLinkedEvent,
  convertSaloPostToLinkedEvent,
  consolidateRawSeriesOccurrences,
  validateFallbackFreshness,
} = syncFeeds;

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

test('Check 12: Source registry and all 28 cities have valid metadata and source attribution', () => {
  assert.equal(CITY_LIST.length, 28);
  assert.equal(Object.keys(CITIES).length, 28);

  const expectedNewCities = [
    'jyvaskyla',
    'jamsa',
    'aanekoski',
    'keuruu',
    'saarijarvi',
    'viitasaari',
    'pori',
    'rauma',
    'ulvila',
    'harjavalta',
    'huittinen',
    'kokemaki',
    'kankaanpaa',
    'seinajoki',
    'lapua',
    'kauhava',
    'kauhajoki',
    'kurikka',
    'alavus',
    'ahtari',
    'kuopio',
    'salo',
  ];
  for (const id of expectedNewCities) {
    assert.ok(CITIES[id], `Missing city config for ${id}`);
    assert.ok(
      SOURCE_REGISTRY[CITIES[id].sourceId],
      `Missing source registry entry for ${id}`
    );
    const attr = getCitySourceAttribution(id);
    assert.ok(attr.text.length > 10, `Missing attribution text for ${id}`);
    assert.match(attr.url, /^https:\/\//);
  }
});

test('Check 13 (Keski-Suomi Events): Resolves area directory, handles blank location.id, LocalizedString alt_text, and location_extra_info', () => {
  const placeMap = new Map([
    [
      'https://keskisuomievents.fi/api/v1/place/jkl-uuid',
      { id: 'jkl-uuid', name: { fi: 'Jyväskylä' } },
    ],
    [
      'https://keskisuomievents.fi/api/v1/place/laukaa-uuid',
      { id: 'laukaa-uuid', name: { fi: 'Laukaa' } },
    ],
  ]);

  assert.equal(
    classifyKeskiSuomiEventCity(
      {
        area: { '@id': 'https://keskisuomievents.fi/api/v1/place/jkl-uuid' },
        location: { id: '', address_locality: null },
      },
      placeMap
    ),
    'jyvaskyla'
  );

  // Explicit non-target municipality (Laukaa) is not misassigned
  assert.equal(
    classifyKeskiSuomiEventCity(
      {
        area: { '@id': 'https://keskisuomievents.fi/api/v1/place/laukaa-uuid' },
      },
      placeMap
    ),
    null
  );

  const normalized = normalizeLinkedEvent(
    {
      id: 'ks:sauna-1',
      name: { fi: 'Saunalautta' },
      start_time: '2026-10-28T15:00:00Z',
      location: {
        id: '',
        name: { fi: 'Jyväskylä' },
        street_address: { fi: 'Satamakatu 8, Jyväskylä' },
        position: { type: 'Point', coordinates: [25.7577, 62.2363] },
      },
      location_extra_info: { fi: 'Jyväskylän Satama' },
      provider_name: 'SK ELÄMYKSET OY',
      external_links: [{ name: 'website', link: 'https://elamykset.net/' }],
      images: [
        {
          id: 'img-ks',
          url: 'https://keskisuomievents.fi/api/assets/123?key=public',
          alt_text: { fi: 'Saunakuva', en: 'Sauna photo' },
          photographer_name: 'SK',
          license: 'event_only',
        },
      ],
    },
    'jyvaskyla'
  );
  assert.ok(normalized);
  assert.equal(normalized.venueName, 'Jyväskylän Satama');
  assert.equal(normalized.imageAlt, 'Sauna photo');
  assert.equal(normalized.infoUrl, 'https://elamykset.net/');
  assert.match(normalized.attribution.badgeText, /SK ELÄMYKSET OY/);
});

test('Check 14 (Satakunta Events): Resolves se:* municipality and Pori district references and Honkajoki->Kankaanpää merger', () => {
  const placeMap = new Map([
    [
      'https://satakuntaevents.fi/api/v2/place/se:18',
      {
        id: 'se:18',
        name: { fi: 'Keskusta' },
        address_locality: { fi: 'Pori' },
      },
    ],
    [
      'https://satakuntaevents.fi/api/v2/place/se:4',
      {
        id: 'se:4',
        name: { fi: 'Honkajoki' },
        address_locality: { fi: 'Honkajoki' },
      },
    ],
    [
      'https://satakuntaevents.fi/api/v2/place/se:16',
      {
        id: 'se:16',
        name: { fi: 'Säkylä' },
        address_locality: { fi: 'Säkylä' },
      },
    ],
  ]);

  assert.equal(
    classifySatakuntaEventCity(
      { area: { '@id': 'https://satakuntaevents.fi/api/v2/place/se:18/' } },
      placeMap
    ),
    'pori'
  );
  assert.equal(
    classifySatakuntaEventCity(
      { area: { '@id': 'https://satakuntaevents.fi/api/v2/place/se:4/' } },
      placeMap
    ),
    'kankaanpaa'
  );
  assert.equal(
    classifySatakuntaEventCity(
      { area: { '@id': 'https://satakuntaevents.fi/api/v2/place/se:16/' } },
      placeMap
    ),
    null
  );
});

test('Check 15 (EP Kalenteri): Upgrades HTTP URLs, corrects swapped [lat, lon] coordinates, maps historic localities, and strips OIDC publisher IDs', () => {
  assert.equal(
    upgradeKnownLinkedEventsUrl(
      'http://epkalenteri.linkedevents.fi/v1/event/?page=2'
    ),
    'https://epkalenteri.linkedevents.fi/v1/event/?page=2'
  );
  assert.equal(
    upgradeKnownLinkedEventsUrl('http://evil.example.com/v1/event/?page=2'),
    null
  );

  // Swapped Seinäjoki [lat, lon] observed in live research
  const swappedCheck = validateAndNormalizeFinlandCoordinates([
    62.8291053, 22.9096926,
  ]);
  assert.equal(swappedCheck.swapped, true);
  assert.deepEqual(swappedCheck.coordinates, [22.9096926, 62.8291053]);

  // Rejects Null Island / out-of-Finland coordinates
  const invalidCheck = validateAndNormalizeFinlandCoordinates([0, 0]);
  assert.equal(invalidCheck.coordinates, null);

  // Historic Nurmo -> Seinäjoki, Jalasjärvi -> Kurikka
  assert.equal(
    classifyEpEventCity({
      location: { address_locality: { fi: 'Nurmo' } },
    }),
    'seinajoki'
  );
  assert.equal(
    classifyEpEventCity({
      location: { address_locality: { fi: 'Jalasjärvi' } },
    }),
    'kurikka'
  );

  // OIDC publisher strings never leak into attribution
  const epEv = normalizeLinkedEvent(
    {
      id: 'ep:1',
      name: { fi: '&lt;b&gt;Kirjastoilta&lt;/b&gt;' },
      description: { fi: '&lt;h2&gt;Tervetuloa&lt;/h2&gt;' },
      start_time: '2026-11-19T15:30:00Z',
      publisher: 'eptapahtumat:oidc:user:f62f0239-5f72-4bb3-a3c8-9ff6af144c41',
      location: {
        id: 'ep:nurmo',
        name: { fi: 'Nurmon kirjasto' },
        position: { type: 'Point', coordinates: [62.8291053, 22.9096926] },
      },
    },
    'seinajoki'
  );
  assert.ok(epEv);
  assert.deepEqual(epEv.coordinates, [22.9096926, 62.8291053]);
  assert.doesNotMatch(epEv.attribution.badgeText, /oidc:user/);
  assert.match(epEv.descriptionHtml, /<h2>Tervetuloa<\/h2>/);
});

test('Check 16 (Hello Kuopio & Salon Tapahtumat): Filters out external municipalities and formats compound Salo IDs', () => {
  const tahkoConverted = convertHelloKuopioEventToLinkedEvent({
    id: 10028333,
    title: 'Muksuaamu &#8211; Tahko',
    description: '<p>Perheaamu</p>',
    utc_start_date: '2026-10-28 07:00:00',
    utc_end_date: '2026-10-28 10:00:00',
    cost: '19€',
    url: 'https://www.hellokuopio.fi/tapahtuma/muksuaamu/',
    venue: {
      id: 52283,
      venue: 'SuperPark Tahko',
      address: 'Keitaankatu 1',
      city: 'Tahkovuori',
      geo_lat: 63.29099,
      geo_lng: 28.04208,
    },
  });
  assert.ok(tahkoConverted);
  assert.equal(tahkoConverted.id, 'kuopio:10028333');
  assert.equal(tahkoConverted.name.fi, 'Muksuaamu – Tahko');
  assert.equal(tahkoConverted.location.address_locality.fi, 'Tahkovuori, Kuopio');
  assert.equal(tahkoConverted.offers[0].is_free, false);

  // Outside municipality (Tuusniemi) is excluded from Kuopio feed
  const tuusniemiConverted = convertHelloKuopioEventToLinkedEvent({
    id: 999,
    title: 'Tuusniemi Tapahtuma',
    utc_start_date: '2026-10-28 10:00:00',
    venue: { city: 'Tuusniemi', venue: 'Kunnantalo' },
  });
  assert.equal(tuusniemiConverted, null);

  // Salo compound ID + Somero exclusion
  const refNow = new Date('2026-10-20T00:00:00Z');
  const someroPost = convertSaloPostToLinkedEvent(
    {
      id: 64842,
      blogId: '3',
      title: 'RekryNurkka Someron toimipisteellä',
      locationText: 'Salon työllisyysalue, Someron palvelupiste',
      startDate: 1793000000,
      endDate: 1793007200,
      gps_lat: 60.6275,
      gps_lng: 23.5162,
    },
    refNow
  );
  assert.equal(someroPost, null);

  const saloPost = convertSaloPostToLinkedEvent(
    {
      id: 74921,
      blogId: '3',
      title: 'Salo Jazz Ilta',
      locationText: 'Kulttuuritalo Kiva, Horninkatu 21, Salo',
      permalink: 'https://tapahtumat.salo.fi/salo-jazz/',
      startDate: 1793000000,
      endDate: 1793007200,
      gps_lat: 60.385,
      gps_lng: 23.1309,
      classes: [
        { name: 'Ilmainen', slug: 'ilmainen' },
        { name: 'Maksullisuus', slug: 'maksullisuus' },
      ],
    },
    refNow
  );
  assert.ok(saloPost);
  assert.equal(saloPost.id, 'salo:3:74921');
  assert.equal(saloPost.offers[0].is_free, true);
});

test('Check 17: Cancelled, deleted, and all-day events are handled accurately', () => {
  const deleted = normalizeLinkedEvent(
    {
      id: 'ks:del',
      name: { fi: 'Deleted Event' },
      start_time: '2026-10-29T12:00:00Z',
      deleted: true,
    },
    'jyvaskyla'
  );
  assert.equal(deleted, null);

  const cancelled = normalizeLinkedEvent(
    {
      id: 'ks:canc',
      name: { fi: 'Syyskonsertti' },
      start_time: '2026-10-29T18:00:00Z',
      event_status: 'EventCancelled',
    },
    'jyvaskyla'
  );
  assert.ok(cancelled);
  assert.equal(cancelled.title, '[Cancelled] Syyskonsertti');

  const allDay = normalizeLinkedEvent(
    {
      id: 'kuopio:allday',
      name: { fi: 'Koko päivän markkinat' },
      start_time: '2026-11-05',
      end_time: '2026-11-05',
      all_day: true,
    },
    'kuopio'
  );
  assert.ok(allDay);
  assert.equal(doesEventOccurOnDate(allDay, '2026-11-05'), true);
  assert.ok(
    allDay.endTime.getTime() - allDay.startTime.getTime() >= 23 * 3600 * 1000
  );
});

test('Check 18 (End-to-End 28-City Feed Integrity): Every synced static feed normalizes, consolidates, and passes coordinate + attribution + freshness invariants', () => {
  const feedsDir = fileURLToPath(new URL('../public/feeds', import.meta.url));
  let totalNormalizedEvents = 0;
  let totalFeedBytes = 0;

  for (const city of CITY_LIST) {
    const feedPath = path.join(feedsDir, `${city.id}.json`);
    assert.ok(
      existsSync(feedPath),
      `Missing static feed file for ${city.id}: ${feedPath}`
    );

    totalFeedBytes += statSync(feedPath).size;
    const payload = JSON.parse(readFileSync(feedPath, 'utf-8'));
    assert.ok(
      payload && typeof payload === 'object' && Array.isArray(payload.data),
      `Invalid feed payload structure for ${city.id}`
    );
    assert.equal(
      typeof payload.meta?.count,
      'number',
      `Missing numeric meta.count for ${city.id}`
    );

    const generatedNow = payload.meta?.generated_at
      ? new Date(payload.meta.generated_at)
      : new Date();

    const normalized = [];
    for (const raw of payload.data) {
      const ev = normalizeLinkedEvent(raw, city.id, 0, undefined, generatedNow);
      if (!ev) continue;

      assert.ok(ev.id.length > 0, `Empty event id in ${city.id}`);
      assert.ok(ev.title.length > 0, `Empty event title in ${city.id} (${ev.id})`);
      assert.ok(
        !Number.isNaN(ev.startTime.getTime()) &&
          !Number.isNaN(ev.endTime.getTime()) &&
          ev.endTime.getTime() >= ev.startTime.getTime(),
        `Invalid timestamp range in ${city.id} (${ev.id})`
      );
      assert.ok(
        hasUpcomingOrActiveOccurrence(ev, new Date(generatedNow.getTime() - 60_000)),
        `Past-only event remained in synced feed ${city.id} (${ev.id})`
      );

      if (ev.coordinates !== null) {
        const [lon, lat] = ev.coordinates;
        assert.ok(
          lon >= 18.0 && lon <= 32.5 && lat >= 59.0 && lat <= 70.5,
          `Out-of-Finland or swapped coordinates [${lon}, ${lat}] in ${city.id} (${ev.id})`
        );
      }

      assert.ok(
        ev.attribution.badgeText.length > 0 &&
          !ev.attribution.badgeText.includes('oidc:user') &&
          !ev.attribution.badgeText.includes('se:places'),
        `Invalid or leaked internal attribution badge in ${city.id} (${ev.id}): ${ev.attribution.badgeText}`
      );
      assert.match(ev.attribution.apiLicenseUrl, /^https:\/\//);

      if (ev.infoUrl) {
        assert.doesNotMatch(
          ev.infoUrl,
          /^http:\/\/epkalenteri\.linkedevents\.fi/i,
          `Un-upgraded HTTP EP Kalenteri infoUrl in ${city.id} (${ev.id})`
        );
      }
      if (ev.imageUrl) {
        assert.doesNotMatch(
          ev.imageUrl,
          /^http:\/\/epkalenteri\.linkedevents\.fi/i,
          `Un-upgraded HTTP EP Kalenteri imageUrl in ${city.id} (${ev.id})`
        );
      }

      normalized.push(ev);
    }

    const consolidated = consolidateRecurringEvents(normalized, generatedNow);
    const venueGroups = groupEventsByVenue(consolidated);
    assert.ok(
      consolidated.length <= normalized.length,
      `Consolidation grew event list in ${city.id}`
    );
    assert.ok(
      Array.isArray(venueGroups),
      `groupEventsByVenue failed in ${city.id}`
    );

    totalNormalizedEvents += normalized.length;
  }

  assert.ok(
    totalNormalizedEvents > 2000,
    `Expected >2000 normalized events across 28 cities, got ${totalNormalizedEvents}`
  );
  assert.ok(
    totalFeedBytes < 14 * 1024 * 1024,
    `Expected compacted feed payloads (<14 MB), got ${(totalFeedBytes / (1024 * 1024)).toFixed(2)} MB`
  );
});

test('Check 19 (BUG-02 & DATA-01): Ended series are dropped and active/upcoming series sort by next occurrence before cap', () => {
  const refNow = new Date('2026-10-28T12:00:00Z');
  const rawSeries = [
    {
      id: 'ks:past-only',
      name: { fi: 'Ended Summer Show' },
      start_time: '2026-06-10T10:00:00Z',
      end_time: '2026-06-10T12:00:00Z',
    },
    {
      id: 'ks:far-future',
      name: { fi: 'December Gala' },
      start_time: '2026-12-20T18:00:00Z',
      end_time: '2026-12-20T21:00:00Z',
    },
    {
      id: 'ks:tomorrow',
      name: { fi: 'Tomorrow Gig' },
      start_time: '2026-10-29T18:00:00Z',
      end_time: '2026-10-29T21:00:00Z',
    },
  ];

  const consolidated = consolidateRawSeriesOccurrences(rawSeries, refNow, 1);
  assert.equal(consolidated.length, 1);
  assert.equal(consolidated[0].id, 'ks:tomorrow');

  const pastNormalized = normalizeLinkedEvent(
    rawSeries[0],
    'jyvaskyla',
    0,
    undefined,
    refNow
  );
  assert.ok(pastNormalized);
  assert.equal(hasUpcomingOrActiveOccurrence(pastNormalized, refNow), false);
});

test('Check 20 (BUG-05 & BUG-06): Timeout rejects with TimeoutError and offline-fallback cache records are never fresh', async () => {
  const slowFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(init.signal.reason ?? new DOMException('Aborted', 'AbortError'));
      });
    });

  await assert.rejects(
    () => fetchWithTimeout('https://example.org/events', {}, 25, undefined, slowFetch),
    (err) => err?.name === 'TimeoutError'
  );

  const callerAbort = new AbortController();
  setTimeout(() => callerAbort.abort(), 10);
  await assert.rejects(
    () =>
      fetchWithTimeout(
        'https://example.org/events',
        {},
        500,
        callerAbort.signal,
        slowFetch
      ),
    (err) => err?.name === 'AbortError'
  );

  const nowMs = Date.now();
  assert.equal(
    isCachedRecordFresh({ source: 'offline-fallback', timestamp: nowMs }),
    false
  );
  assert.equal(
    isCachedRecordFresh({ source: 'live-api', timestamp: nowMs }),
    true
  );
});

test('Check 21 (BUG-07): Europe/Helsinki date math stays invariant across viewer time zones and date-only strings span one day', () => {
  // 2026-07-15 23:30 in Helsinki (+03:00 EEST) is 2026-07-15T20:30:00Z
  const lateHelsinkiInstant = new Date('2026-07-15T20:30:00Z');
  assert.equal(toDateKey(lateHelsinkiInstant), '2026-07-15');

  // 2026-07-16 00:30 in Helsinki (+03:00 EEST) is 2026-07-15T21:30:00Z (still July 15 in UTC & New York!)
  const justAfterMidnightHelsinki = new Date('2026-07-15T21:30:00Z');
  assert.equal(toDateKey(justAfterMidnightHelsinki), '2026-07-16');

  const singleDateOnly = normalizeLinkedEvent(
    {
      id: 'kuopio:july15',
      name: { fi: 'Heinäkuun toripäivä' },
      start_time: '2026-07-15',
      end_time: '2026-07-15',
    },
    'kuopio'
  );
  assert.ok(singleDateOnly);
  assert.equal(doesEventOccurOnDate(singleDateOnly, '2026-07-14'), false);
  assert.equal(doesEventOccurOnDate(singleDateOnly, '2026-07-15'), true);
  assert.equal(doesEventOccurOnDate(singleDateOnly, '2026-07-16'), false);
});

test('Check 22 (DATA-02 & DATA-06): Pop-up false positives, dance->culture, word-bounded online detection, and season pass filtering', () => {
  const popupCafe = {
    id: 'turku:popup',
    name: { fi: 'Pop up -kahvila ja kirppis' },
    short_description: { fi: 'Pop-up myymälä puistossa' },
    start_time: '2026-11-01T10:00:00Z',
  };
  assert.ok(!classifyTopics(popupCafe).includes('music'));

  const dancePerformance = {
    id: 'turku:dance',
    name: { fi: 'Nykytanssiesitys: Valo' },
    short_description: { fi: 'Tanssiteos näyttämöllä' },
    start_time: '2026-11-01T18:00:00Z',
  };
  assert.equal(classifyTopic(dancePerformance), 'culture');

  const teamsWebinar = normalizeLinkedEvent(
    {
      id: 'hel:webinar',
      name: { fi: 'Teams-kokous asukkaille' },
      short_description: { fi: 'Tilaisuus järjestetään etänä.' },
      start_time: '2026-11-02T15:00:00Z',
    },
    'helsinki'
  );
  assert.ok(teamsWebinar);
  assert.equal(teamsWebinar.isOnline, true);

  const inPersonVr = normalizeLinkedEvent(
    {
      id: 'hel:vr-museum',
      name: { fi: 'Tiimipäivä ja virtuaalitodellisuus museossa' },
      start_time: '2026-11-02T15:00:00Z',
      location: {
        id: 'tprek:1',
        name: { fi: 'Kaupunginmuseo' },
        position: { type: 'Point', coordinates: [24.952, 60.169] },
      },
    },
    'helsinki'
  );
  assert.ok(inPersonVr);
  assert.equal(inPersonVr.isOnline, false);

  const seasonPass = normalizeLinkedEvent(
    {
      id: 'turku:kotipassi',
      name: { fi: 'Kotipassi 2026–2027' },
      start_time: '2026-09-01T09:00:00Z',
      end_time: '2027-05-31T18:00:00Z',
    },
    'turku'
  );
  assert.equal(seasonPass, null);
});

test('Check 23 (DATA-03 & DATA-04): Long-span exhibitions are labeled Ongoing (not LIVE) and export single-day calendar entries', () => {
  const refNow = new Date('2026-10-28T12:00:00Z');
  const longExhibition = normalizeLinkedEvent(
    {
      id: 'hel:long-exhib',
      name: { fi: 'Vuosinäyttely' },
      start_time: '2026-10-01T08:00:00Z',
      end_time: '2027-02-15T16:00:00Z',
    },
    'helsinki',
    0,
    undefined,
    refNow
  );
  assert.ok(longExhibition);
  assert.equal(longExhibition.isLiveNow, false);
  assert.equal(longExhibition.isOngoingLongSpan, true);

  const label = formatEventTimeLabel(longExhibition, refNow);
  assert.match(label, /^Ongoing · until /);
  assert.match(label, /2027/);

  const gcal = buildGoogleCalendarUrl(longExhibition, '2026-10-30', refNow);
  assert.match(gcal, /dates=20261030%2F20261031|dates=20261030\/20261031/);

  const ics = buildEventIcsContent(longExhibition, '2026-10-30', refNow);
  assert.match(ics, /DTSTART;VALUE=DATE:20261030/);
  assert.match(ics, /DTEND;VALUE=DATE:20261031/);
});

test('Check 24 (SEC-02 & TOOL-03): Description anchors enforce external target/rel and stale >3d fallbacks fail validation', async () => {
  const makeMockAnchor = (href) => {
    const attrs = new Map(href !== null ? [['href', href]] : []);
    return {
      tagName: 'A',
      getAttribute: (k) => attrs.get(k) ?? null,
      setAttribute: (k, v) => attrs.set(k, v),
      removeAttribute: (k) => attrs.delete(k),
      attrs,
    };
  };

  const safeLink = makeMockAnchor('https://turku.fi/liput');
  enforceSafeAnchorAttributes(safeLink);
  assert.equal(safeLink.attrs.get('target'), '_blank');
  assert.equal(safeLink.attrs.get('rel'), 'noopener noreferrer');

  const jsLink = makeMockAnchor('javascript:alert(1)');
  enforceSafeAnchorAttributes(jsLink);
  assert.equal(jsLink.attrs.has('href'), false);

  const relLink = makeMockAnchor('/internal-route');
  enforceSafeAnchorAttributes(relLink);
  assert.equal(relLink.attrs.has('href'), false);

  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'tarra-feeds-'));
  try {
    const now = new Date('2026-10-29T00:00:00Z');
    await fsPromises.writeFile(
      path.join(tmpDir, 'fresh.json'),
      JSON.stringify({
        meta: { count: 1, generated_at: '2026-10-28T12:00:00Z' },
        data: [{ id: '1' }],
      })
    );
    await fsPromises.writeFile(
      path.join(tmpDir, 'stale.json'),
      JSON.stringify({
        meta: { count: 1, generated_at: '2026-10-20T00:00:00Z' },
        data: [{ id: '1' }],
      })
    );

    const freshCheck = await validateFallbackFreshness('fresh', now, tmpDir);
    assert.equal(freshCheck.valid, true);

    const staleCheck = await validateFallbackFreshness('stale', now, tmpDir);
    assert.equal(staleCheck.valid, false);
  } finally {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  }
});
