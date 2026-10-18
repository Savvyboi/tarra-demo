export type LocalizedString = {
  fi?: string | null;
  sv?: string | null;
  en?: string | null;
};

export type CityId = 'helsinki' | 'espoo' | 'vantaa' | 'turku' | 'tampere' | 'oulu';

export type TimeFilter = 'all' | 'live' | 'tonight' | 'weekend' | 'custom-date';

export type TopicCategory =
  | 'all'
  | 'music'
  | 'culture'
  | 'sports'
  | 'family'
  | 'food'
  | 'nightlife'
  | 'nature';

export type MapStyleId = 'midnight' | 'neon' | 'daylight';

export type ViewMode = 'map' | 'list';

export type ListSortMode = 'distance' | 'time' | 'live';

export interface LinkedEventImage {
  id: number | string;
  url: string;
  name?: string;
  photographer_name?: string | null;
  alt_text?: string | null;
  license?: 'event_only' | 'cc_by' | string;
  data_source?: string | null;
  publisher?: string | null;
  cropping?: string | null;
  '@id'?: string;
  '@context'?: string;
  '@type'?: string;
}

export interface LinkedEventDivision {
  type: string;
  ocd_id?: string;
  municipality?: string | null;
  name?: LocalizedString;
}

export interface LinkedEventPlace {
  id: string;
  data_source?: string;
  name: LocalizedString;
  street_address?: LocalizedString | null;
  address_locality?: LocalizedString | null;
  postal_code?: string | null;
  telephone?: LocalizedString | null;
  info_url?: LocalizedString | null;
  divisions?: LinkedEventDivision[];
  position?: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  } | null;
  '@id'?: string;
  '@context'?: string;
  '@type'?: string;
}

export interface LinkedEventKeyword {
  id: string;
  name?: LocalizedString;
  data_source?: string;
  '@id'?: string;
  '@type'?: string;
}

export interface LinkedEventOffer {
  is_free: boolean;
  price?: LocalizedString | null;
  description?: LocalizedString | null;
  info_url?: LocalizedString | null;
}

export interface RawEventOccurrence {
  start: string;
  end?: string | null;
}

export interface RawLinkedEvent {
  id: string;
  name: LocalizedString;
  short_description?: LocalizedString | null;
  description?: LocalizedString | null;
  start_time: string | null;
  end_time?: string | null;
  occurrence_dates?: RawEventOccurrence[];
  location?: LinkedEventPlace | null;
  location_extra_info?: LocalizedString | null;
  keywords?: LinkedEventKeyword[];
  images?: LinkedEventImage[];
  offers?: LinkedEventOffer[];
  info_url?: LocalizedString | null;
  provider?: LocalizedString | string | null;
  data_source?: string | null;
  publisher?: string | null;
  event_status?: string;
  _demo_offset_hours?: number;
  _demo_duration_hours?: number;
  _demo_day_offset?: number;
  '@id'?: string;
  '@context'?: string;
  '@type'?: string;
}

export interface LinkedEventsApiResponse {
  meta: {
    count: number;
    next: string | null;
    previous: string | null;
  };
  data: RawLinkedEvent[];
}

export interface LicenseAttribution {
  badgeText: string;
  licenseType: 'event_only' | 'cc_by';
  photographer: string;
  source: string;
  canReuseOutOfContext: boolean;
  apiAttributionText: string;
  apiLicenseUrl: string;
}

export interface NormalizedOccurrence {
  start: Date;
  end: Date;
  dateKey: string;
}

export interface NormalizedEvent {
  id: string;
  cityId: CityId;
  title: string;
  shortDescription: string;
  descriptionHtml: string;
  startTime: Date;
  endTime: Date;
  dateKey: string;
  occurrenceDates: NormalizedOccurrence[];
  isLiveNow: boolean;
  isStartingSoon: boolean;
  isTonight: boolean;
  isThisWeekend: boolean;
  category: Exclude<TopicCategory, 'all'>;
  categoryEmoji: string;
  categoryLabel: string;
  venueId: string;
  venueName: string;
  streetAddress: string;
  coordinates: [number, number]; // [lon, lat]
  /** Distance in kilometers from user GPS (or active city center fallback) */
  distanceKm: number;
  imageUrl: string | null;
  imageAlt: string;
  attribution: LicenseAttribution;
  isFree: boolean;
  priceText: string;
  infoUrl: string | null;
  reittiopasUrl: string;
  heatWeight: number;
  raw: RawLinkedEvent;
}

export interface VenueStoryGroup {
  venueId: string;
  venueName: string;
  streetAddress: string;
  cityId: CityId;
  coordinates: [number, number]; // [lon, lat]
  distanceKm: number;
  events: NormalizedEvent[];
  hasLiveEvent: boolean;
  hasStartingSoon: boolean;
  topCategory: Exclude<TopicCategory, 'all'>;
  topEmoji: string;
  coverImageUrl: string | null;
  totalHeat: number;
}
