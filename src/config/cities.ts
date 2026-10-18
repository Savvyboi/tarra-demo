import { CityId, TopicCategory } from '../types/linkedEvents';

export interface CityConfig {
  id: CityId;
  name: string;
  nativeName: string;
  regionLabel: string;
  coordinates: [number, number]; // [lon, lat]
  defaultZoom: number;
  pitch: number;
  bearing: number;
  dataMechanism: 'live-api' | 'static-jsonld';
  sourceUrl: string;
  badgeColor: string;
  accentHex: string;
  digitransitRouter: 'hsl' | 'waltti' | 'finland';
}

export const CITIES: Record<CityId, CityConfig> = {
  helsinki: {
    id: 'helsinki',
    name: 'Helsinki',
    nativeName: 'Helsinki • Helsingfors',
    regionLabel: 'Capital Region • Live 6Aika API',
    coordinates: [24.9384, 60.1699],
    defaultZoom: 13.2,
    pitch: 52,
    bearing: -12,
    dataMechanism: 'live-api',
    sourceUrl: 'https://api.hel.fi/linkedevents/v1/event/?division=helsinki&include=location,keywords',
    badgeColor: 'bg-[#ffe600] text-[#0d0e11]',
    accentHex: '#ffe600',
    digitransitRouter: 'hsl',
  },
  espoo: {
    id: 'espoo',
    name: 'Espoo',
    nativeName: 'Espoo • Esbo',
    regionLabel: 'Capital Region • Live 6Aika API',
    coordinates: [24.6559, 60.2055],
    defaultZoom: 12.2,
    pitch: 48,
    bearing: 8,
    dataMechanism: 'live-api',
    sourceUrl: 'https://api.hel.fi/linkedevents/v1/event/?division=espoo&include=location,keywords',
    badgeColor: 'bg-[#38bdf8] text-[#0d0e11]',
    accentHex: '#38bdf8',
    digitransitRouter: 'hsl',
  },
  vantaa: {
    id: 'vantaa',
    name: 'Vantaa',
    nativeName: 'Vantaa • Vanda',
    regionLabel: 'Capital Region • Live 6Aika API',
    coordinates: [25.0409, 60.2934],
    defaultZoom: 12.2,
    pitch: 48,
    bearing: -5,
    dataMechanism: 'live-api',
    sourceUrl: 'https://api.hel.fi/linkedevents/v1/event/?division=vantaa&include=location,keywords',
    badgeColor: 'bg-[#22c55e] text-[#0d0e11]',
    accentHex: '#22c55e',
    digitransitRouter: 'hsl',
  },
  turku: {
    id: 'turku',
    name: 'Turku',
    nativeName: 'Turku • Åbo',
    regionLabel: 'Southwest Finland • 6Aika JSON-LD Feed',
    coordinates: [22.2666, 60.4518],
    defaultZoom: 13.4,
    pitch: 52,
    bearing: 15,
    dataMechanism: 'static-jsonld',
    sourceUrl: 'feeds/turku.json',
    badgeColor: 'bg-[#ff5500] text-[#ffffff]',
    accentHex: '#ff5500',
    digitransitRouter: 'waltti',
  },
  tampere: {
    id: 'tampere',
    name: 'Tampere',
    nativeName: 'Tampere • Tammerfors',
    regionLabel: 'Pirkanmaa • 6Aika JSON-LD Feed',
    coordinates: [23.7610, 61.4978],
    defaultZoom: 13.4,
    pitch: 54,
    bearing: -18,
    dataMechanism: 'static-jsonld',
    sourceUrl: 'feeds/tampere.json',
    badgeColor: 'bg-[#ff2a85] text-[#ffffff]',
    accentHex: '#ff2a85',
    digitransitRouter: 'waltti',
  },
  oulu: {
    id: 'oulu',
    name: 'Oulu',
    nativeName: 'Oulu • Uleåborg',
    regionLabel: 'Northern Ostrobothnia • 6Aika JSON-LD Feed',
    coordinates: [25.4651, 65.0121],
    defaultZoom: 13.3,
    pitch: 50,
    bearing: 10,
    dataMechanism: 'static-jsonld',
    sourceUrl: 'feeds/oulu.json',
    badgeColor: 'bg-[#f4f1ea] text-[#0d0e11]',
    accentHex: '#f4f1ea',
    digitransitRouter: 'waltti',
  },
};

export const CITY_LIST: CityConfig[] = [
  CITIES.helsinki,
  CITIES.espoo,
  CITIES.vantaa,
  CITIES.turku,
  CITIES.tampere,
  CITIES.oulu,
];

export interface TopicMeta {
  id: TopicCategory;
  label: string;
  emoji: string;
  color: string;
  ringGradient: string;
  slapBg: string;
  slapText: string;
}

export const TOPICS: TopicMeta[] = [
  { id: 'all', label: 'All Slaps', emoji: '⚡', color: '#ffe600', ringGradient: 'from-[#ffe600] via-[#ff5500] to-[#ff2a85]', slapBg: '#ffe600', slapText: '#0d0e11' },
  { id: 'music', label: 'Music & Gigs', emoji: '🎵', color: '#ff2a85', ringGradient: 'from-[#ff2a85] via-[#e11d48] to-[#ff5500]', slapBg: '#ff2a85', slapText: '#ffffff' },
  { id: 'culture', label: 'Art & Theatre', emoji: '🎭', color: '#f4f1ea', ringGradient: 'from-[#f4f1ea] via-[#94a3b8] to-[#38bdf8]', slapBg: '#f4f1ea', slapText: '#0d0e11' },
  { id: 'sports', label: 'Sports & Action', emoji: '🛹', color: '#22c55e', ringGradient: 'from-[#22c55e] via-[#10b981] to-[#ffe600]', slapBg: '#22c55e', slapText: '#0d0e11' },
  { id: 'family', label: 'Family & Youth', emoji: '🎡', color: '#facc15', ringGradient: 'from-[#facc15] via-[#fb923c] to-[#f43f5e]', slapBg: '#facc15', slapText: '#0d0e11' },
  { id: 'food', label: 'Food & Markets', emoji: '🍜', color: '#ff5500', ringGradient: 'from-[#ff5500] via-[#f97316] to-[#ffe600]', slapBg: '#ff5500', slapText: '#ffffff' },
  { id: 'nightlife', label: 'Nightlife & Clubs', emoji: '🪩', color: '#38bdf8', ringGradient: 'from-[#38bdf8] via-[#2563eb] to-[#ff2a85]', slapBg: '#38bdf8', slapText: '#0d0e11' },
  { id: 'nature', label: 'Parks & Outdoors', emoji: '🌲', color: '#a3e635', ringGradient: 'from-[#a3e635] via-[#22c55e] to-[#14b8a6]', slapBg: '#a3e635', slapText: '#0d0e11' },
];
