import type {
  CityId,
  LicenseAttribution,
  LinkedEventImage,
  LocalizedString,
  RawLinkedEvent,
} from '../types/linkedEvents';

export const LINKED_EVENTS_CREDIT_TEXT =
  'Event data: City of Helsinki / Espoo / Vantaa (6Aika Linked Events API)';
export const CC_BY_4_URL = 'https://creativecommons.org/licenses/by/4.0/';

const CITY_SOURCE_ATTRIBUTION: Record<
  CityId,
  { text: string; url: string; label: string }
> = {
  // Capital Region
  helsinki: {
    text: 'Event data: City of Helsinki / 6Aika Linked Events API',
    url: CC_BY_4_URL,
    label: 'CC BY 4.0',
  },
  espoo: {
    text: 'Event data: City of Espoo / 6Aika Linked Events API',
    url: CC_BY_4_URL,
    label: 'CC BY 4.0',
  },
  vantaa: {
    text: 'Event data: City of Vantaa / 6Aika Linked Events API',
    url: CC_BY_4_URL,
    label: 'CC BY 4.0',
  },

  // Localhub Municipal Calendars
  turku: {
    text: 'Event data: City of Turku Event Calendar (kalenteri.turku.fi)',
    url: 'https://kalenteri.turku.fi',
    label: 'Turku Calendar',
  },
  tampere: {
    text: 'Event data: Tampere Event Calendar (tapahtumat.tampere.fi)',
    url: 'https://tapahtumat.tampere.fi',
    label: 'Tampere Calendar',
  },
  oulu: {
    text: 'Event data: Mun Oulu Event Calendar (tapahtumat.munoulu.fi)',
    url: 'https://tapahtumat.munoulu.fi',
    label: 'Oulu Calendar',
  },

  // Keski-Suomi Events (CC BY 4.0)
  jyvaskyla: {
    text: 'Event data: Keski-Suomi Events API (keskisuomievents.fi) • CC BY 4.0',
    url: CC_BY_4_URL,
    label: 'Keski-Suomi Events',
  },
  jamsa: {
    text: 'Event data: Keski-Suomi Events API (keskisuomievents.fi) • CC BY 4.0',
    url: CC_BY_4_URL,
    label: 'Keski-Suomi Events',
  },
  aanekoski: {
    text: 'Event data: Keski-Suomi Events API (keskisuomievents.fi) • CC BY 4.0',
    url: CC_BY_4_URL,
    label: 'Keski-Suomi Events',
  },
  keuruu: {
    text: 'Event data: Keski-Suomi Events API (keskisuomievents.fi) • CC BY 4.0',
    url: CC_BY_4_URL,
    label: 'Keski-Suomi Events',
  },
  saarijarvi: {
    text: 'Event data: Keski-Suomi Events API (keskisuomievents.fi) • CC BY 4.0',
    url: CC_BY_4_URL,
    label: 'Keski-Suomi Events',
  },
  viitasaari: {
    text: 'Event data: Keski-Suomi Events API (keskisuomievents.fi) • CC BY 4.0',
    url: CC_BY_4_URL,
    label: 'Keski-Suomi Events',
  },

  // Satakunta Events (CC BY 4.0)
  pori: {
    text: 'Event data: Satakunta Events API (satakuntaevents.fi) • CC BY 4.0',
    url: CC_BY_4_URL,
    label: 'Satakunta Events',
  },
  rauma: {
    text: 'Event data: Satakunta Events API (satakuntaevents.fi) • CC BY 4.0',
    url: CC_BY_4_URL,
    label: 'Satakunta Events',
  },
  ulvila: {
    text: 'Event data: Satakunta Events API (satakuntaevents.fi) • CC BY 4.0',
    url: CC_BY_4_URL,
    label: 'Satakunta Events',
  },
  harjavalta: {
    text: 'Event data: Satakunta Events API (satakuntaevents.fi) • CC BY 4.0',
    url: CC_BY_4_URL,
    label: 'Satakunta Events',
  },
  huittinen: {
    text: 'Event data: Satakunta Events API (satakuntaevents.fi) • CC BY 4.0',
    url: CC_BY_4_URL,
    label: 'Satakunta Events',
  },
  kokemaki: {
    text: 'Event data: Satakunta Events API (satakuntaevents.fi) • CC BY 4.0',
    url: CC_BY_4_URL,
    label: 'Satakunta Events',
  },
  kankaanpaa: {
    text: 'Event data: Satakunta Events API (satakuntaevents.fi) • CC BY 4.0',
    url: CC_BY_4_URL,
    label: 'Satakunta Events',
  },

  // EP Kalenteri / South Ostrobothnia
  seinajoki: {
    text: 'Event data: EP Kalenteri / Etelä-Pohjanmaan liitto (epkalenteri.linkedevents.fi)',
    url: 'https://epliitto.fi/kulttuurin-kehittaminen/tapahtumakalenteri/',
    label: 'EP Kalenteri',
  },
  lapua: {
    text: 'Event data: EP Kalenteri / Etelä-Pohjanmaan liitto (epkalenteri.linkedevents.fi)',
    url: 'https://epliitto.fi/kulttuurin-kehittaminen/tapahtumakalenteri/',
    label: 'EP Kalenteri',
  },
  kauhava: {
    text: 'Event data: EP Kalenteri / Etelä-Pohjanmaan liitto (epkalenteri.linkedevents.fi)',
    url: 'https://epliitto.fi/kulttuurin-kehittaminen/tapahtumakalenteri/',
    label: 'EP Kalenteri',
  },
  kauhajoki: {
    text: 'Event data: EP Kalenteri / Etelä-Pohjanmaan liitto (epkalenteri.linkedevents.fi)',
    url: 'https://epliitto.fi/kulttuurin-kehittaminen/tapahtumakalenteri/',
    label: 'EP Kalenteri',
  },
  kurikka: {
    text: 'Event data: EP Kalenteri / Etelä-Pohjanmaan liitto (epkalenteri.linkedevents.fi)',
    url: 'https://epliitto.fi/kulttuurin-kehittaminen/tapahtumakalenteri/',
    label: 'EP Kalenteri',
  },
  alavus: {
    text: 'Event data: EP Kalenteri / Etelä-Pohjanmaan liitto (epkalenteri.linkedevents.fi)',
    url: 'https://epliitto.fi/kulttuurin-kehittaminen/tapahtumakalenteri/',
    label: 'EP Kalenteri',
  },
  ahtari: {
    text: 'Event data: EP Kalenteri / Etelä-Pohjanmaan liitto (epkalenteri.linkedevents.fi)',
    url: 'https://epliitto.fi/kulttuurin-kehittaminen/tapahtumakalenteri/',
    label: 'EP Kalenteri',
  },

  // Hello Kuopio
  kuopio: {
    text: 'Event data: Hello Kuopio Regional Event Calendar (hellokuopio.fi)',
    url: 'https://www.hellokuopio.fi',
    label: 'Hello Kuopio',
  },

  // Salon Tapahtumat
  salo: {
    text: 'Event data: City of Salo Event Calendar (tapahtumat.salo.fi)',
    url: 'https://tapahtumat.salo.fi',
    label: 'Salon Tapahtumat',
  },
};

export function getCitySourceAttribution(cityId: CityId): {
  text: string;
  url: string;
  label: string;
} {
  return CITY_SOURCE_ATTRIBUTION[cityId] || CITY_SOURCE_ATTRIBUTION.helsinki;
}

export function pickLocalizedText(
  field: LocalizedString | string | null | undefined,
  fallback = ''
): string {
  if (!field) return fallback;
  if (typeof field === 'string') return field.trim() || fallback;
  return (
    field.en?.trim() ||
    field.fi?.trim() ||
    field.sv?.trim() ||
    fallback
  );
}

function sanitizePublisherString(rawPublisher: string): string {
  const trimmed = rawPublisher.trim();
  if (!trimmed) return '';
  // Reject internal OIDC user identifiers or machine place namespaces
  if (
    /oidc:user:|^[0-9a-f-]{24,}$|^se:places$|^eptapahtumat:eptapahtumat$/i.test(
      trimmed
    )
  ) {
    return '';
  }
  return trimmed;
}

/**
 * Formats photographer and source attribution accurately across
 * Capital Region 6Aika Linked Events, Regional Linked Events (Keski-Suomi, Satakunta, EP Kalenteri),
 * Localhub municipal calendars, Hello Kuopio, and Salon Tapahtumat.
 */
export function buildLicenseAttribution(
  event: RawLinkedEvent,
  primaryImage?: LinkedEventImage | null,
  cityId?: CityId
): LicenseAttribution {
  const rawLicense = primaryImage?.license || 'event_only';
  const licenseType: 'event_only' | 'cc_by' =
    rawLicense === 'cc_by' ? 'cc_by' : 'event_only';

  const providerName = (
    pickLocalizedText(event.provider, '').trim() ||
    (typeof event.provider_name === 'string'
      ? event.provider_name.trim()
      : '')
  ).trim();
  const publisherName = sanitizePublisherString(event.publisher || '');
  const dataSource = (
    primaryImage?.data_source ||
    event.data_source ||
    ''
  ).trim();

  const resolvedCityId: CityId | undefined =
    cityId ||
    (Object.hasOwn(CITY_SOURCE_ATTRIBUTION, dataSource)
      ? (dataSource as CityId)
      : dataSource === 'keskisuomievents'
        ? 'jyvaskyla'
        : dataSource === 'satakuntaevents'
          ? 'pori'
          : dataSource === 'eptapahtumat'
            ? 'seinajoki'
            : dataSource === 'hellokuopio'
              ? 'kuopio'
              : undefined);

  const citySource = resolvedCityId
    ? CITY_SOURCE_ATTRIBUTION[resolvedCityId]
    : null;

  const source =
    providerName ||
    publisherName ||
    (resolvedCityId ? citySource?.label : '') ||
    sanitizePublisherString(dataSource) ||
    '6Aika Linked Events';

  const rawPhotographer = (primaryImage?.photographer_name || '').trim();
  const isConvertedSnapshotCity =
    resolvedCityId !== 'helsinki' &&
    resolvedCityId !== 'espoo' &&
    resolvedCityId !== 'vantaa';

  // Detect placeholder strings or converted feeds where providerName was copied into photographer_name
  const isGenuinePhotographer =
    Boolean(rawPhotographer) &&
    rawPhotographer !== '.' &&
    rawPhotographer !== '-' &&
    rawPhotographer.toLowerCase() !== 'unknown' &&
    !(
      isConvertedSnapshotCity &&
      (rawPhotographer === providerName || rawPhotographer === publisherName)
    );

  const photographer = isGenuinePhotographer
    ? rawPhotographer
    : 'Photo credit not provided';

  const badgeText = isGenuinePhotographer
    ? `📷 ${photographer} • ${source}`
    : `📷 Photo credit not provided • ${source}`;

  return {
    badgeText,
    licenseType,
    photographer,
    hasPhotographerCredit: isGenuinePhotographer,
    source,
    canReuseOutOfContext: licenseType === 'cc_by',
    apiAttributionText: citySource
      ? citySource.text
      : LINKED_EVENTS_CREDIT_TEXT,
    apiLicenseUrl: citySource ? citySource.url : CC_BY_4_URL,
  };
}

/**
 * Validates that an image URL is only rendered for its owning event ID (or consolidated alias IDs)
 * when license === 'event_only'.
 */
export function getSafeEventImageUrl(
  event: RawLinkedEvent,
  targetEventId: string,
  aliasIds?: string[]
): string | null {
  if (!event.images || event.images.length === 0) return null;
  const img = event.images[0];
  if (!img?.url) return null;

  const isOwningEvent =
    event.id === targetEventId ||
    Boolean(aliasIds && aliasIds.includes(targetEventId));

  // Enforce event_only context isolation
  if (img.license !== 'cc_by' && !isOwningEvent) {
    return null;
  }

  // Ensure HTTPS for GitHub Pages mixed-content compliance
  if (img.url.startsWith('http://')) {
    return img.url.replace(/^http:\/\//i, 'https://');
  }
  return img.url;
}
