import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Supercluster from 'supercluster';
import { AlertTriangle, LayoutList, RefreshCw } from 'lucide-react';
import { CITIES } from '../../config/cities';
import {
  CityId,
  MapStyleId,
  VenueStoryGroup,
} from '../../types/linkedEvents';
import { getCitySourceAttribution } from '../../utils/licenseGuard';

export interface SnapMapProps {
  activeCity: CityId;
  venueGroups: VenueStoryGroup[];
  selectedVenueId: string | null;
  focusCoordinates?: [number, number] | null;
  mapStyle: MapStyleId;
  userLocation: [number, number] | null;
  isVisible?: boolean;
  onSelectVenueGroup: (group: VenueStoryGroup) => void;
  onMapError?: (reason: string) => void;
  onSwitchToList?: () => void;
}

function isWebGLSupported(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    return Boolean(gl);
  } catch {
    return false;
  }
}

interface ClusterProps {
  venueGroup?: VenueStoryGroup;
  cluster?: boolean;
  cluster_id?: number;
  point_count?: number;
  hasLive?: number;
}

interface ManagedMarkerEntry {
  key: string;
  kind: 'cluster' | 'venue';
  marker: maplibregl.Marker;
  el: HTMLButtonElement;
  coordinates: [number, number];
  clusterId?: number;
  venueGroup?: VenueStoryGroup;
  renderSig: string;
}

// Distinct OpenFreeMap styles (`UI-05`): Street (`liberty`), Midnight (`dark`), Daylight (`positron`)
export const STYLE_URLS: Record<MapStyleId, string> = {
  neon: 'https://tiles.openfreemap.org/styles/liberty',
  midnight: 'https://tiles.openfreemap.org/styles/dark',
  daylight: 'https://tiles.openfreemap.org/styles/positron',
};

// WCAG AA >= 4.5:1 text colors (`A11Y-03`)
const CATEGORY_SLAP_COLORS: Record<string, { bg: string; text: string }> = {
  music: { bg: '#ff2a85', text: '#0d0e11' },
  culture: { bg: '#f4f1ea', text: '#0d0e11' },
  sports: { bg: '#22c55e', text: '#0d0e11' },
  family: { bg: '#ffe600', text: '#0d0e11' },
  food: { bg: '#ff5500', text: '#0d0e11' },
  nightlife: { bg: '#38bdf8', text: '#0d0e11' },
  nature: { bg: '#a3e635', text: '#0d0e11' },
};

const CHAOTIC_ANGLES = [
  -16, 13, -9, 17, -14, 8, -6, 15, -12, 11, -18, 7, -5, 14, -11, 16,
];

const ORGANIC_RADII = [
  '54% 46% 48% 52% / 46% 54% 46% 54%',
  '4px 11px 5px 10px',
  '11px 4px 10px 4px',
  '50%',
  '6px 3px 9px 4px',
  '45% 55% 52% 48% / 53% 44% 56% 47%',
  '3px 9px 3px 9px',
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hashVenue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function buildClusterInnerHtml(
  count: number,
  hasLiveCount: number,
  clusterAngle: number
): string {
  return `
    <div class="relative flex items-center justify-center w-9 h-9 transition-transform duration-150 group-hover:scale-115">
      <div class="absolute w-7 h-7 -translate-x-1 -translate-y-0.5 rounded-[5px_9px_4px_8px] bg-[#ffe600] border-[1.5px] border-[#0d0e11] rotate-14"></div>
      <div class="absolute w-7 h-7 translate-x-1 translate-y-0.5 rounded-[9px_4px_8px_5px] bg-[#ff2a85] border-[1.5px] border-[#f4f1ea] -rotate-12"></div>
      <div
        class="relative flex items-center justify-center w-7.5 h-7.5 rounded-[44%_56%_48%_52%/52%_44%_56%_48%] bg-[#121418] border-2 border-[#f4f1ea] text-[#ffe600] shadow"
        style="transform: rotate(${clusterAngle}deg);"
      >
        <span class="font-display-slap text-[11px] leading-none">${count}</span>
        ${
          hasLiveCount > 0
            ? `<span class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#ff2a85] border border-[#f4f1ea]"></span>`
            : ''
        }
      </div>
    </div>
  `;
}

function buildVenueInnerHtml(vg: VenueStoryGroup, isSelected: boolean): string {
  const slapColor = CATEGORY_SLAP_COLORS[vg.topCategory] || {
    bg: '#ffe600',
    text: '#0d0e11',
  };
  const eventCount = vg.events.length;
  const leadEvent = vg.events[0];
  const h = hashVenue(vg.venueId);
  const angle = CHAOTIC_ANGLES[h % CHAOTIC_ANGLES.length];
  const radiusShape = ORGANIC_RADII[h % ORGANIC_RADII.length];

  const thumbUrl = vg.coverImageUrl ? escapeHtml(vg.coverImageUrl) : null;
  const safeVenueName = escapeHtml(vg.venueName);
  const safeLeadTitle = escapeHtml(leadEvent.title);

  return `
    <div
      class="map-mini-slap relative w-8 h-8 p-[2px] bg-[#f4f1ea] ${
        isSelected ? 'is-selected z-30 ring-2 ring-[#ffe600]' : 'hover:z-20'
      }"
      style="--slap-rot: ${angle}deg; --slap-radius: ${radiusShape}; border: 1.5px solid #0d0e11;"
    >
      <div
        class="relative w-full h-full overflow-hidden flex items-center justify-center"
        style="border-radius: inherit; background-color: ${slapColor.bg}; color: ${slapColor.text};"
      >
        ${
          thumbUrl
            ? `<img src="${thumbUrl}" alt="" title="${escapeHtml(leadEvent.attribution.badgeText)}" loading="lazy" class="w-full h-full object-cover contrast-110" />`
            : `<span class="text-sm leading-none">${vg.topEmoji}</span>`
        }
      </div>

      ${
        vg.hasLiveEvent
          ? `<span class="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-[#ff2a85] border border-[#f4f1ea]"></span>`
          : ''
      }

      ${
        eventCount > 1
          ? `<span class="absolute -bottom-1 -right-1 px-1 py-0 rounded-xs bg-[#ffe600] border border-[#0d0e11] text-[#0d0e11] font-mono-stamp text-[11px] font-bold leading-tight">${eventCount}</span>`
          : ''
      }
    </div>

    <div class="${
      isSelected
        ? 'opacity-100'
        : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
    } pointer-events-none absolute bottom-full mb-1.5 z-40 transition-opacity duration-150 whitespace-nowrap max-w-[180px] px-2 py-0.5 rounded-xs bg-[#111317] border border-[#f4f1ea] text-left shadow -rotate-2">
      <p class="font-grotesk text-[11px] font-extrabold uppercase tracking-tight text-[#ffe600] truncate leading-tight">${safeVenueName}</p>
      <p class="text-[11px] text-[#f4f1ea] truncate leading-tight">${safeLeadTitle}</p>
    </div>
  `;
}

export const SnapMap: React.FC<SnapMapProps> = ({
  activeCity,
  venueGroups,
  selectedVenueId,
  focusCoordinates,
  mapStyle,
  userLocation,
  isVisible = true,
  onSelectVenueGroup,
  onMapError,
  onSwitchToList,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const attributionCtrlRef = useRef<maplibregl.AttributionControl | null>(null);
  const markersMapRef = useRef<Map<string, ManagedMarkerEntry>>(new Map());
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const clusterIndexRef = useRef<
    Supercluster<ClusterProps, ClusterProps> | null
  >(null);

  // Refs to eliminate stale closures inside MapLibre event handlers (`TOOL-01`)
  const mapStyleRef = useRef<MapStyleId>(mapStyle);
  const onSelectVenueGroupRef = useRef(onSelectVenueGroup);
  const onMapErrorRef = useRef(onMapError);
  const initialConfigRef = useRef({
    activeCity,
    focusCoordinates,
    mapStyle,
  });

  useEffect(() => {
    mapStyleRef.current = mapStyle;
  }, [mapStyle]);

  useEffect(() => {
    onSelectVenueGroupRef.current = onSelectVenueGroup;
  }, [onSelectVenueGroup]);

  useEffect(() => {
    onMapErrorRef.current = onMapError;
  }, [onMapError]);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(() =>
    !isWebGLSupported()
      ? 'WebGL graphics acceleration is unavailable in this browser. Open the Street Pole Feed below to browse all events, filter dates, and view saved stickers.'
      : null
  );
  const [tileError, setTileError] = useState<string | null>(null);
  const [viewTick, setViewTick] = useState(0);

  useEffect(() => {
    if (mapError) {
      onMapErrorRef.current?.(mapError);
    }
  }, [mapError]);

  // Apply midnight surface tinting using latest `mapStyleRef.current` (`TOOL-01`, `UI-05`)
  const syncCustomLayers = useCallback((map: maplibregl.Map) => {
    if (!map.isStyleLoaded()) return;
    if (mapStyleRef.current !== 'midnight') return;

    const style = map.getStyle();
    if (style?.layers) {
      for (const layer of style.layers) {
        try {
          if (layer.type === 'background') {
            map.setPaintProperty(layer.id, 'background-color', '#0c0e11');
          }
          if (layer.id.includes('water') && layer.type === 'fill') {
            map.setPaintProperty(layer.id, 'fill-color', '#080d14');
          }
        } catch {
          // Ignore layers that don't support dynamic paint overrides
        }
      }
    }
  }, []);

  // Initialize MapLibre GL JS instance once (`TOOL-01`, `BUG-10`, `PERF-05`)
  useEffect(() => {
    if (!containerRef.current || mapRef.current || mapError) return;

    const {
      activeCity: initCityId,
      focusCoordinates: initFocus,
      mapStyle: initStyle,
    } = initialConfigRef.current;
    const initialCity = CITIES[initCityId];
    const startCenter = initFocus || initialCity.coordinates;
    const startZoom = initFocus ? 15.2 : initialCity.defaultZoom;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE_URLS[initStyle],
        center: startCenter,
        zoom: startZoom,
        pitch: 0,
        bearing: 0,
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: false,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? `Map initialization failed (${err.message}).`
          : 'Failed to initialize WebGL map.';
      queueMicrotask(() => setMapError(msg));
      return;
    }

    const handleMove = () => setViewTick((t) => t + 1);
    map.on('load', () => {
      setMapReady(true);
      setTileError(null);
      syncCustomLayers(map);
      handleMove();
    });
    map.on('style.load', () => {
      setTileError(null);
      syncCustomLayers(map);
      handleMove();
    });
    map.on('styledata', () => {
      if (map.isStyleLoaded()) {
        syncCustomLayers(map);
      }
    });
    map.on('moveend', handleMove);
    map.on('zoomend', handleMove);
    map.on('error', (ev) => {
      const rawErr = ev?.error as { message?: string; status?: number } | undefined;
      const errMessage = rawErr?.message || '';
      if (/webgl|context/i.test(errMessage)) {
        const msg =
          'WebGL rendering context failed. Switch to the Street Pole Feed below to continue browsing events.';
        setMapError(msg);
        onMapErrorRef.current?.(msg);
        return;
      }
      const status = typeof rawErr?.status === 'number' ? rawErr.status : 0;
      if (
        status >= 400 ||
        /failed to fetch|network|load|style|tile|openfreemap|timeout/i.test(
          errMessage
        )
      ) {
        setTileError(
          'Street map tiles could not be loaded (network or tile server error). Event pins remain interactive.'
        );
      }
    });

    const canvas = map.getCanvas?.();
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      const msg =
        'WebGL graphics context was lost. Switch to the Street Pole Feed below to continue browsing events.';
      setMapError(msg);
      onMapErrorRef.current?.(msg);
    };
    canvas?.addEventListener('webglcontextlost', handleContextLost);

    mapRef.current = map;
    const markersMap = markersMapRef.current;

    return () => {
      canvas?.removeEventListener('webglcontextlost', handleContextLost);
      for (const entry of markersMap.values()) {
        entry.marker.remove();
      }
      markersMap.clear();
      attributionCtrlRef.current = null;
      try {
        map.remove();
      } catch {
        // Ignore cleanup errors if WebGL context already failed
      }
      mapRef.current = null;
    };
  }, [mapError, syncCustomLayers]);

  // Single unified MapLibre AttributionControl including active city data credit (`UI-04`)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (attributionCtrlRef.current) {
      try {
        map.removeControl(attributionCtrlRef.current);
      } catch {
        // Ignore if already removed
      }
      attributionCtrlRef.current = null;
    }

    const cityAttr = getCitySourceAttribution(activeCity);
    const customAttribution = `<a href="${escapeHtml(cityAttr.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cityAttr.text)}</a>`;
    const ctrl = new maplibregl.AttributionControl({
      compact: true,
      customAttribution,
    });
    map.addControl(ctrl, 'bottom-left');
    attributionCtrlRef.current = ctrl;
  }, [activeCity, mapReady]);

  // Resize canvas cleanly when revealed from hidden state (`PERF-05`)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isVisible) return;
    const raf = window.requestAnimationFrame(() => {
      map.resize();
      setViewTick((t) => t + 1);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isVisible]);

  // Fly smoothly ONLY when activeCity actually changes after mount
  const prevCityRef = useRef<CityId>(activeCity);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (prevCityRef.current === activeCity) return;
    prevCityRef.current = activeCity;

    const target = CITIES[activeCity];
    map.flyTo({
      center: target.coordinates,
      zoom: target.defaultZoom,
      pitch: 0,
      bearing: 0,
      duration: 1200,
      essential: true,
    });
  }, [activeCity]);

  // Fly directly to a specific venue in 2D when "Show on Map" is triggered
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusCoordinates) return;
    map.flyTo({
      center: focusCoordinates,
      zoom: 15.4,
      pitch: 0,
      bearing: 0,
      duration: 950,
      essential: true,
    });
  }, [focusCoordinates]);

  // Switch MapLibre base style when mapStyle changes (`UI-05`)
  const prevStyleRef = useRef<MapStyleId>(mapStyle);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (prevStyleRef.current !== mapStyle) {
      prevStyleRef.current = mapStyle;
      setTileError(null);
      map.setStyle(STYLE_URLS[mapStyle]);
    } else if (mapReady) {
      syncCustomLayers(map);
    }
  }, [mapStyle, mapReady, syncCustomLayers]);

  // Render "Near Me" user location sticker marker & fly to user in 2D
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    if (userLocation) {
      const el = document.createElement('div');
      el.className = 'tarra-user-marker';
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <span class="absolute -inset-1.5 rounded-full bg-[#ffe600]/45 animate-ping"></span>
          <div class="relative w-4 h-4 rounded-full bg-[#ffe600] border-2 border-[#0d0e11] outline-2 outline-[#f4f1ea] shadow"></div>
        </div>
      `;
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(userLocation)
        .addTo(map);

      map.flyTo({
        center: userLocation,
        zoom: 14.0,
        pitch: 0,
        bearing: 0,
        duration: 1100,
        essential: true,
      });
    }
  }, [userLocation]);

  // Build Supercluster index via useMemo (`PERF-05`, zero extra render cascades)
  const supercluster = useMemo(() => {
    const sc = new Supercluster<ClusterProps, ClusterProps>({
      radius: 34,
      maxZoom: 14,
      map: (props) => ({
        hasLive: props.venueGroup?.hasLiveEvent ? 1 : 0,
      }),
      reduce: (accumulated, props) => {
        accumulated.hasLive = (accumulated.hasLive || 0) + (props.hasLive || 0);
      },
    });

    const points: Supercluster.PointFeature<ClusterProps>[] = venueGroups.map(
      (vg) => ({
        type: 'Feature',
        properties: {
          venueGroup: vg,
          hasLive: vg.hasLiveEvent ? 1 : 0,
        },
        geometry: {
          type: 'Point',
          coordinates: vg.coordinates,
        },
      })
    );

    sc.load(points);
    return sc;
  }, [venueGroups]);

  useEffect(() => {
    clusterIndexRef.current = supercluster;
  }, [supercluster]);

  // Diff and update Street Sticker DOM Markers IN PLACE (`BUG-04`, `BUG-10`) so keyboard focus
  // and DOM node identity survive 60-second temporal refreshes and pins stay interactive even if tiles fail!
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const bounds = map.getBounds();
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    const zoom = Math.floor(map.getZoom());

    let clusters: Array<
      | Supercluster.ClusterFeature<ClusterProps>
      | Supercluster.PointFeature<ClusterProps>
    >;
    try {
      clusters = supercluster.getClusters(bbox, zoom);
    } catch {
      clusters = supercluster.getClusters([-180, -85, 180, 85], zoom);
    }

    const markersMap = markersMapRef.current;
    const nextKeys = new Set<string>();

    for (const feature of clusters) {
      const [lon, lat] = feature.geometry.coordinates;
      const props = feature.properties;

      // 1. COMPACT CLUSTER MARKER
      if (props.cluster && typeof props.cluster_id === 'number') {
        const count = props.point_count || 0;
        const hasLiveCount = props.hasLive || 0;
        const key = `cluster:${zoom}:${lon.toFixed(4)},${lat.toFixed(4)}`;
        nextKeys.add(key);

        const clusterAngle =
          ((Math.abs(Math.round(lon * 1000 + lat * 1000)) * 19) % 21) - 10;
        const renderSig = `c|${count}|${hasLiveCount > 0 ? 1 : 0}|${clusterAngle}`;
        const ariaLabel = `Zoom to ${count} venues`;

        const existing = markersMap.get(key);
        if (existing && existing.kind === 'cluster') {
          existing.clusterId = props.cluster_id;
          if (
            existing.coordinates[0] !== lon ||
            existing.coordinates[1] !== lat
          ) {
            existing.coordinates = [lon, lat];
            existing.marker.setLngLat([lon, lat]);
          }
          if (existing.renderSig !== renderSig) {
            existing.renderSig = renderSig;
            existing.el.setAttribute('aria-label', ariaLabel);
            existing.el.innerHTML = buildClusterInnerHtml(
              count,
              hasLiveCount,
              clusterAngle
            );
          }
          continue;
        }

        if (existing) {
          existing.marker.remove();
          markersMap.delete(key);
        }

        const clusterEl = document.createElement('button');
        clusterEl.type = 'button';
        clusterEl.setAttribute('aria-label', ariaLabel);
        clusterEl.className =
          'group relative flex items-center justify-center cursor-pointer rounded-full select-none focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2';
        clusterEl.innerHTML = buildClusterInnerHtml(
          count,
          hasLiveCount,
          clusterAngle
        );

        const marker = new maplibregl.Marker({
          element: clusterEl,
          anchor: 'center',
        })
          .setLngLat([lon, lat])
          .addTo(map);

        const entry: ManagedMarkerEntry = {
          key,
          kind: 'cluster',
          marker,
          el: clusterEl,
          coordinates: [lon, lat],
          clusterId: props.cluster_id,
          renderSig,
        };

        clusterEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const sc = clusterIndexRef.current;
          const m = mapRef.current;
          if (!sc || !m || typeof entry.clusterId !== 'number') return;
          const expansionZoom = Math.min(
            sc.getClusterExpansionZoom(entry.clusterId),
            16
          );
          m.flyTo({
            center: entry.coordinates,
            zoom: expansionZoom,
            pitch: 0,
            bearing: 0,
            duration: 600,
            essential: true,
          });
        });

        markersMap.set(key, entry);
        continue;
      }

      // 2. SINGLE VENUE MARKER
      const vg = props.venueGroup;
      if (!vg || vg.events.length === 0) continue;

      const key = `venue:${vg.cityId}:${vg.venueId}:${vg.coordinates[0].toFixed(4)},${vg.coordinates[1].toFixed(4)}`;
      nextKeys.add(key);

      const isSelected = vg.venueId === selectedVenueId;
      const leadEvent = vg.events[0];
      const ariaLabel = `${vg.venueName}: ${leadEvent.title}`;
      const renderSig = `v|${isSelected ? 1 : 0}|${vg.hasLiveEvent ? 1 : 0}|${vg.events.length}|${vg.topCategory}|${vg.topEmoji}|${vg.coverImageUrl || ''}|${vg.venueName}|${leadEvent.title}`;

      const existing = markersMap.get(key);
      if (existing && existing.kind === 'venue') {
        existing.venueGroup = vg;
        if (
          existing.coordinates[0] !== lon ||
          existing.coordinates[1] !== lat
        ) {
          existing.coordinates = [lon, lat];
          existing.marker.setLngLat([lon, lat]);
        }
        if (existing.renderSig !== renderSig) {
          existing.renderSig = renderSig;
          existing.el.setAttribute('aria-label', ariaLabel);
          existing.el.innerHTML = buildVenueInnerHtml(vg, isSelected);
        }
        continue;
      }

      if (existing) {
        existing.marker.remove();
        markersMap.delete(key);
      }

      const bubbleEl = document.createElement('button');
      bubbleEl.type = 'button';
      bubbleEl.setAttribute('aria-label', ariaLabel);
      bubbleEl.className =
        'group relative flex flex-col items-center cursor-pointer rounded-md select-none focus-visible:outline-2 focus-visible:outline-[#ffe600] focus-visible:outline-offset-2';
      bubbleEl.innerHTML = buildVenueInnerHtml(vg, isSelected);

      const marker = new maplibregl.Marker({
        element: bubbleEl,
        anchor: 'center',
      })
        .setLngLat([lon, lat])
        .addTo(map);

      const entry: ManagedMarkerEntry = {
        key,
        kind: 'venue',
        marker,
        el: bubbleEl,
        coordinates: [lon, lat],
        venueGroup: vg,
        renderSig,
      };

      bubbleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (entry.venueGroup) {
          onSelectVenueGroupRef.current(entry.venueGroup);
        }
      });

      markersMap.set(key, entry);
    }

    for (const [oldKey, oldEntry] of markersMap.entries()) {
      if (!nextKeys.has(oldKey)) {
        oldEntry.marker.remove();
        markersMap.delete(oldKey);
      }
    }
  }, [supercluster, selectedVenueId, viewTick]);

  const handleRetryMapTiles = useCallback(() => {
    setTileError(null);
    const map = mapRef.current;
    if (map) {
      map.setStyle(STYLE_URLS[mapStyleRef.current]);
    }
  }, []);

  if (mapError) {
    return (
      <div
        role="alert"
        className={`${
          isVisible ? 'flex' : 'hidden'
        } relative w-full h-full street-box-bg items-center justify-center p-6`}
      >
        <div className="max-w-md w-full rounded-xl bg-[#16191f] border-[3px] border-[#f4f1ea] shadow-[6px_8px_0px_#07080a] p-6 text-center space-y-4">
          <span className="inline-block px-2.5 py-0.5 bg-[#ffe600] text-[#0d0e11] font-mono-stamp text-xs font-bold uppercase border border-[#0d0e11]">
            2D MAP UNAVAILABLE
          </span>
          <h2 className="text-base font-extrabold uppercase text-[#f4f1ea]">
            WebGL Map Could Not Start
          </h2>
          <p className="text-xs text-[#d5d2c8] leading-relaxed">{mapError}</p>
          {onSwitchToList && (
            <button
              type="button"
              onClick={onSwitchToList}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#ffe600] hover:bg-[#fff04d] text-[#0d0e11] border-2 border-[#0d0e11] font-display-slap text-xs uppercase cursor-pointer shadow-[2px_3px_0px_#07080a] focus-visible:outline-2 focus-visible:outline-[#f4f1ea] focus-visible:outline-offset-2"
            >
              <LayoutList aria-hidden="true" className="w-4 h-4" />
              <span>Open Street Pole Event List</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${isVisible ? 'block' : 'hidden'} relative w-full h-full`}>
      <div
        ref={containerRef}
        className="w-full h-full"
        aria-label="Interactive Finnish Street Sticker Map"
      />

      {tileError && (
        <div
          role="alert"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-25 max-w-[92vw] sm:max-w-md px-3.5 py-2.5 rounded-lg bg-[#14171c]/95 border-2 border-[#ffe600] text-[#f4f1ea] shadow-[3px_4px_0px_#07080a] flex flex-col sm:flex-row items-start sm:items-center gap-2"
        >
          <div className="flex items-start gap-2 text-[11px] font-mono-stamp">
            <AlertTriangle
              aria-hidden="true"
              className="w-4 h-4 text-[#ffe600] shrink-0 mt-0.5"
            />
            <span>{tileError}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
            <button
              type="button"
              onClick={handleRetryMapTiles}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs bg-[#ffe600] text-[#0d0e11] font-mono-stamp text-[11px] font-bold uppercase cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f4f1ea]"
            >
              <RefreshCw aria-hidden="true" className="w-3 h-3" />
              <span>Retry Map</span>
            </button>
            {onSwitchToList && (
              <button
                type="button"
                onClick={onSwitchToList}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs bg-[#22262e] text-[#f4f1ea] border border-[#f4f1ea]/50 font-mono-stamp text-[11px] font-bold uppercase cursor-pointer focus-visible:outline-2 focus-visible:outline-[#ffe600]"
              >
                <span>Pole List</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SnapMap;
