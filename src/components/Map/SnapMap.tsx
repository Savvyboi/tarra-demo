import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Supercluster from 'supercluster';
import { CITIES } from '../../config/cities';
import {
  CityId,
  MapStyleId,
  VenueStoryGroup,
} from '../../types/linkedEvents';

interface SnapMapProps {
  activeCity: CityId;
  venueGroups: VenueStoryGroup[];
  selectedVenueId: string | null;
  focusCoordinates?: [number, number] | null;
  mapStyle: MapStyleId;
  userLocation: [number, number] | null;
  onSelectVenueGroup: (group: VenueStoryGroup) => void;
}

interface ClusterProps {
  venueGroup?: VenueStoryGroup;
  cluster?: boolean;
  cluster_id?: number;
  point_count?: number;
  hasLive?: number;
}

const STYLE_URLS: Record<MapStyleId, string> = {
  midnight: 'https://tiles.openfreemap.org/styles/dark',
  neon: 'https://tiles.openfreemap.org/styles/dark',
  daylight: 'https://tiles.openfreemap.org/styles/positron',
};

const CATEGORY_SLAP_COLORS: Record<string, { bg: string; text: string }> = {
  music: { bg: '#ff2a85', text: '#ffffff' },
  culture: { bg: '#f4f1ea', text: '#0d0e11' },
  sports: { bg: '#22c55e', text: '#0d0e11' },
  family: { bg: '#ffe600', text: '#0d0e11' },
  food: { bg: '#ff5500', text: '#ffffff' },
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

export const SnapMap: React.FC<SnapMapProps> = ({
  activeCity,
  venueGroups,
  selectedVenueId,
  focusCoordinates,
  mapStyle,
  userLocation,
  onSelectVenueGroup,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const clusterIndexRef = useRef<Supercluster<ClusterProps, ClusterProps> | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [viewTick, setViewTick] = useState(0);

  // Apply subtle surface tinting (2D street map, no heatmap clutter)
  const syncCustomLayers = useCallback(
    (map: maplibregl.Map) => {
      if (!map.isStyleLoaded()) return;

      const style = map.getStyle();
      if (style?.layers) {
        for (const layer of style.layers) {
          try {
            if (layer.type === 'background') {
              if (mapStyle === 'neon') {
                map.setPaintProperty(layer.id, 'background-color', '#14171c');
              } else if (mapStyle === 'midnight') {
                map.setPaintProperty(layer.id, 'background-color', '#0c0e11');
              }
            }
            if (layer.id.includes('water') && layer.type === 'fill') {
              if (mapStyle === 'neon') {
                map.setPaintProperty(layer.id, 'fill-color', '#0d1824');
              } else if (mapStyle === 'midnight') {
                map.setPaintProperty(layer.id, 'fill-color', '#080d14');
              }
            }
          } catch {
            // Ignore layers that don't support dynamic paint overrides
          }
        }
      }
    },
    [mapStyle]
  );

  // Initialize MapLibre GL JS instance in clean 2D mode
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCity = CITIES[activeCity];
    const startCenter = focusCoordinates || initialCity.coordinates;
    const startZoom = focusCoordinates ? 15.2 : initialCity.defaultZoom;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URLS[mapStyle],
      center: startCenter,
      zoom: startZoom,
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
    });

    const handleMove = () => setViewTick((t) => t + 1);
    map.on('load', () => {
      setMapReady(true);
      syncCustomLayers(map);
      handleMove();
    });
    map.on('style.load', () => {
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

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!map || !mapReady || !focusCoordinates) return;
    map.flyTo({
      center: focusCoordinates,
      zoom: 15.4,
      pitch: 0,
      bearing: 0,
      duration: 950,
      essential: true,
    });
  }, [focusCoordinates, mapReady]);

  // Switch MapLibre base style when mapStyle changes
  const prevStyleRef = useRef<MapStyleId>(mapStyle);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (prevStyleRef.current !== mapStyle) {
      prevStyleRef.current = mapStyle;
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

  // Rebuild Supercluster index when venueGroups change (tighter radius so stickers breathe)
  useEffect(() => {
    const supercluster = new Supercluster<ClusterProps, ClusterProps>({
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

    supercluster.load(points);
    clusterIndexRef.current = supercluster;
    setViewTick((t) => t + 1);
  }, [venueGroups]);

  // Render compact, organic, chaotic Street Sticker DOM Markers
  useEffect(() => {
    const map = mapRef.current;
    const supercluster = clusterIndexRef.current;
    if (!map || !supercluster || !mapReady) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const bounds = map.getBounds();
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    const zoom = Math.floor(map.getZoom());

    let clusters: Array<
      Supercluster.ClusterFeature<ClusterProps> | Supercluster.PointFeature<ClusterProps>
    > = [];
    try {
      clusters = supercluster.getClusters(bbox, zoom);
    } catch {
      clusters = supercluster.getClusters([-180, -85, 180, 85], zoom);
    }

    for (const feature of clusters) {
      const [lon, lat] = feature.geometry.coordinates;
      const props = feature.properties;

      // 1. COMPACT CLUSTER MARKER: Small chaotic pile of mini-slaps
      if (props.cluster && typeof props.cluster_id === 'number') {
        const count = props.point_count || 0;
        const hasLiveCount = props.hasLive || 0;
        const clusterAngle = ((props.cluster_id * 19) % 21) - 10;
        const clusterEl = document.createElement('button');
        clusterEl.type = 'button';
        clusterEl.setAttribute(
          'aria-label',
          `Cluster of ${count} spots. Click to zoom in.`
        );
        clusterEl.className =
          'group relative flex items-center justify-center cursor-pointer focus:outline-none select-none';

        clusterEl.innerHTML = `
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
                  ? `<span class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#ff2a85] border border-[#f4f1ea]"></span>`
                  : ''
              }
            </div>
          </div>
        `;

        clusterEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const expansionZoom = Math.min(
            supercluster.getClusterExpansionZoom(props.cluster_id!),
            16
          );
          map.flyTo({
            center: [lon, lat],
            zoom: expansionZoom,
            pitch: 0,
            bearing: 0,
            duration: 600,
            essential: true,
          });
        });

        const marker = new maplibregl.Marker({
          element: clusterEl,
          anchor: 'center',
        })
          .setLngLat([lon, lat])
          .addTo(map);
        markersRef.current.push(marker);
        continue;
      }

      // 2. SINGLE VENUE MARKER: Small, organic, chaotic die-cut slap (no permanent road-blocking label!)
      const vg = props.venueGroup;
      if (!vg) continue;

      const isSelected = vg.venueId === selectedVenueId;
      const slapColor =
        CATEGORY_SLAP_COLORS[vg.topCategory] || { bg: '#ffe600', text: '#0d0e11' };
      const eventCount = vg.events.length;
      const leadEvent = vg.events[0];
      const h = hashVenue(vg.venueId);
      const angle = CHAOTIC_ANGLES[h % CHAOTIC_ANGLES.length];
      const radiusShape = ORGANIC_RADII[h % ORGANIC_RADII.length];

      const thumbUrl = vg.coverImageUrl ? escapeHtml(vg.coverImageUrl) : null;
      const safeVenueName = escapeHtml(vg.venueName);
      const safeLeadTitle = escapeHtml(leadEvent.title);

      const bubbleEl = document.createElement('button');
      bubbleEl.type = 'button';
      bubbleEl.setAttribute(
        'aria-label',
        `${vg.venueName}: ${leadEvent.title}`
      );
      bubbleEl.className =
        'group relative flex flex-col items-center cursor-pointer focus:outline-none select-none';

      // Pass state to CSS via Custom Properties (--slap-rot, --slap-radius)
      bubbleEl.innerHTML = `
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
                ? `<img src="${thumbUrl}" alt="" loading="lazy" class="w-full h-full object-cover contrast-110" />`
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
              ? `<span class="absolute -bottom-1 -right-1 px-1 py-0 rounded-xs bg-[#ffe600] border border-[#0d0e11] text-[#0d0e11] font-mono-stamp text-[8px] font-bold leading-tight">${eventCount}</span>`
              : ''
          }
        </div>

        <!-- Hover-only / Selected-only mini street tag so streets stay legible -->
        <div class="${
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        } pointer-events-none absolute bottom-full mb-1.5 z-40 transition-opacity duration-150 whitespace-nowrap max-w-[160px] px-2 py-0.5 rounded-xs bg-[#111317] border border-[#f4f1ea] text-left shadow -rotate-2">
          <p class="font-grotesk text-[9px] font-extrabold uppercase tracking-tight text-[#ffe600] truncate leading-tight">${safeVenueName}</p>
          <p class="text-[9px] text-[#f4f1ea] truncate leading-tight">${safeLeadTitle}</p>
        </div>
      `;

      bubbleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectVenueGroup(vg);
      });

      const marker = new maplibregl.Marker({
        element: bubbleEl,
        anchor: 'center',
      })
        .setLngLat([lon, lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [venueGroups, selectedVenueId, viewTick, mapReady, onSelectVenueGroup]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full"
        aria-label="Interactive 6-City Street Sticker Map"
      />
    </div>
  );
};
