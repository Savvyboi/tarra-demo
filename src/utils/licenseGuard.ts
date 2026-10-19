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

/**
 * Formats photographer and source attribution accurately across both
 * Capital Region 6Aika Linked Events feeds and Localhub municipal calendars.
 */
export function buildLicenseAttribution(
  event: RawLinkedEvent,
  primaryImage?: LinkedEventImage | null,
  cityId?: CityId
): LicenseAttribution {
  const rawLicense = primaryImage?.license || 'event_only';
  const licenseType: 'event_only' | 'cc_by' =
    rawLicense === 'cc_by' ? 'cc_by' : 'event_only';

  const providerName = pickLocalizedText(event.provider, '').trim();
  const publisherName = (event.publisher || '').trim();
  const dataSource = (
    primaryImage?.data_source ||
    event.data_source ||
    ''
  ).trim();

  const resolvedCityId: CityId | undefined =
    cityId ||
    (dataSource === 'turku' ||
    dataSource === 'tampere' ||
    dataSource === 'oulu' ||
    dataSource === 'helsinki' ||
    dataSource === 'espoo' ||
    dataSource === 'vantaa'
      ? (dataSource as CityId)
      : undefined);

  const citySource = resolvedCityId
    ? CITY_SOURCE_ATTRIBUTION[resolvedCityId]
    : null;

  const source =
    providerName ||
    publisherName ||
    (resolvedCityId ? citySource?.label : '') ||
    dataSource ||
    '6Aika Linked Events';

  const rawPhotographer = (primaryImage?.photographer_name || '').trim();
  const isLocalhubCity =
    resolvedCityId === 'turku' ||
    resolvedCityId === 'tampere' ||
    resolvedCityId === 'oulu';

  // Detect placeholder strings or Localhub feeds where providerName was previously copied into photographer_name
  const isGenuinePhotographer =
    Boolean(rawPhotographer) &&
    rawPhotographer !== '.' &&
    rawPhotographer !== '-' &&
    rawPhotographer.toLowerCase() !== 'unknown' &&
    !(isLocalhubCity && (rawPhotographer === providerName || rawPhotographer === publisherName));

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
    apiAttributionText: citySource ? citySource.text : LINKED_EVENTS_CREDIT_TEXT,
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
