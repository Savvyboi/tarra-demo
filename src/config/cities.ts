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
    badgeColor: 'from-cyan-400 to-blue-500',
    accentHex: '#22d3ee',
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
    badgeColor: 'from-sky-400 to-indigo-500',
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
    badgeColor: 'from-emerald-400 to-teal-500',
    accentHex: '#34d399',
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
    badgeColor: 'from-amber-400 to-orange-500',
    accentHex: '#fbbf24',
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
    badgeColor: 'from-fuchsia-400 to-rose-500',
    accentHex: '#e879f9',
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
    badgeColor: 'from-violet-400 to-purple-500',
    accentHex: '#a78bfa',
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
}

export const TOPICS: TopicMeta[] = [
  { id: 'all', label: 'All Vibes', emoji: '✨', color: '#38bdf8', ringGradient: 'from-cyan-400 via-fuchsia-500 to-amber-400' },
  { id: 'music', label: 'Music & Gigs', emoji: '🎵', color: '#f43f5e', ringGradient: 'from-rose-500 via-fuchsia-500 to-indigo-500' },
  { id: 'culture', label: 'Art & Theatre', emoji: '🎭', color: '#a855f7', ringGradient: 'from-purple-500 via-violet-500 to-pink-500' },
  { id: 'sports', label: 'Sports & Action', emoji: '⚡', color: '#10b981', ringGradient: 'from-emerald-400 via-teal-500 to-cyan-500' },
  { id: 'family', label: 'Family & Youth', emoji: '🎡', color: '#f59e0b', ringGradient: 'from-amber-400 via-orange-500 to-yellow-400' },
  { id: 'food', label: 'Food & Markets', emoji: '🍜', color: '#fb923c', ringGradient: 'from-orange-400 via-red-500 to-amber-400' },
  { id: 'nightlife', label: 'Nightlife & Clubs', emoji: '🪩', color: '#ec4899', ringGradient: 'from-pink-500 via-fuchsia-500 to-cyan-400' },
  { id: 'nature', label: 'Parks & Outdoors', emoji: '🌲', color: '#22c55e', ringGradient: 'from-green-400 via-emerald-500 to-lime-400' },
];
