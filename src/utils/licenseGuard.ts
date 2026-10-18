import {
  LicenseAttribution,
  LinkedEventImage,
  LocalizedString,
  RawLinkedEvent,
} from '../types/linkedEvents';

export const LINKED_EVENTS_CREDIT_TEXT =
  'Event data: City of Helsinki / Espoo / Vantaa / 6Aika Linked Events API';
export const CC_BY_4_URL = 'https://creativecommons.org/licenses/by/4.0/';

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
 * Formats mandatory photographer and source attribution in compliance with
 * 6Aika Linked Events API terms (CC BY 4.0 metadata + event_only / cc_by image rules).
 *
 * Rules enforced:
 * - Images marked "license": "event_only" may ONLY be displayed inside the map marker
 *   bubble and 9:16 Story Card for that specific event (never reused out of context).
 * - Every Story Card displaying an image MUST show the photographer & source attribution pill:
 *   `📷 {photographer_name} • {provider || data_source}`
 */
export function buildLicenseAttribution(
  event: RawLinkedEvent,
  primaryImage?: LinkedEventImage | null
): LicenseAttribution {
  const rawLicense = primaryImage?.license || 'event_only';
  const licenseType: 'event_only' | 'cc_by' =
    rawLicense === 'cc_by' ? 'cc_by' : 'event_only';

  const photographer =
    primaryImage?.photographer_name?.trim() ||
    'Official Event Media';

  const providerName = pickLocalizedText(event.provider, '');
  const source =
    providerName ||
    primaryImage?.data_source?.trim() ||
    event.data_source?.trim() ||
    '6Aika Linked Events';

  const badgeText = `📷 ${photographer} • ${source}`;

  return {
    badgeText,
    licenseType,
    photographer,
    source,
    canReuseOutOfContext: licenseType === 'cc_by',
    apiAttributionText: LINKED_EVENTS_CREDIT_TEXT,
    apiLicenseUrl: CC_BY_4_URL,
  };
}

/**
 * Validates that an image URL is only rendered for its owning event ID
 * when license === 'event_only'.
 */
export function getSafeEventImageUrl(
  event: RawLinkedEvent,
  targetEventId: string
): string | null {
  if (!event.images || event.images.length === 0) return null;
  const img = event.images[0];
  if (!img?.url) return null;

  // Enforce event_only context isolation
  if (img.license !== 'cc_by' && event.id !== targetEventId) {
    return null;
  }

  // Ensure HTTPS for GitHub Pages mixed-content compliance
  if (img.url.startsWith('http://')) {
    return img.url.replace(/^http:\/\//i, 'https://');
  }
  return img.url;
}
