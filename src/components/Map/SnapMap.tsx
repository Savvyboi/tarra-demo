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
  show3DBuildings: boolean;
  showHeatmap: boolean;
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

const STICKER_ANGLES = [-2.4, 1.8, -1.3, 2.2, -1.9, 1.4, -0.8, 2.5];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStickerAngle(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return STICKER_ANGLES[Math.abs(hash) % STICKER_ANGLES.length];
}

export const SnapMap: React.FC<SnapMapProps> = ({
  activeCity,
  venueGroups,
  selectedVenueId,
  focusCoordinates,
  mapStyle,
  show3DBuildings,
  showHeatmap,
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

  // Build GeoJSON for the GPU Thermal Heatmap Layer
  const buildHeatmapGeoJson = useCallback((): GeoJSON.FeatureCollection<GeoJSON.Point> => {
    return {
      type: 'FeatureCollection',
      features: venueGroups.map((group) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: group.coordinates,
        },
        properties: {
          venueId: group.venueId,
          weight: group.hasLiveEvent
            ? Math.min(2.5, group.totalHeat * 1.45)
            : group.totalHeat,
          eventCount: group.events.length,
          isLive: group.hasLiveEvent ? 1 : 0,
        },
      })),
    };
  }, [venueGroups]);

  // Apply custom tarra street-metal style layers (Heatmap + 3D Buildings + Steel/Asphalt tinting)
  const syncCustomLayers = useCallback(
    (map: maplibregl.Map) => {
      if (!map.isStyleLoaded()) return;

      // 1. Apply Industrial Steel / Dark Asphalt tinting to base layers
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

      // 2. Add or update GPU Heatmap source & layer
      const heatGeoJson = buildHeatmapGeoJson();
      const existingSource = map.getSource('snapevents-heat') as
        | maplibregl.GeoJSONSource
        | undefined;

      if (existingSource) {
        existingSource.setData(heatGeoJson);
      } else {
        map.addSource('snapevents-heat', {
          type: 'geojson',
          data: heatGeoJson,
        });
      }

      if (!map.getLayer('snapevents-thermal-heatmap')) {
        map.addLayer({
          id: 'snapevents-thermal-heatmap',
          type: 'heatmap',
          source: 'snapevents-heat',
          maxzoom: 17,
          layout: {
            visibility: showHeatmap ? 'visible' : 'none',
          },
          paint: {
            'heatmap-weight': [
              'interpolate',
              ['linear'],
              ['get', 'weight'],
              0,
              0,
              0.5,
              0.6,
              2.5,
              1.4,
            ],
            'heatmap-intensity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              9,
              1.0,
              13,
              1.6,
              16,
              2.3,
            ],
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0,
              'rgba(0, 0, 0, 0)',
              0.2,
              'rgba(255, 85, 0, 0.22)',
              0.45,
              'rgba(255, 42, 133, 0.42)',
              0.72,
              'rgba(255, 145, 0, 0.68)',
              0.9,
              'rgba(255, 230, 0, 0.85)',
              1,
              'rgba(255, 255, 255, 0.95)',
            ],
            'heatmap-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              9,
              28,
              13,
              54,
              16,
              82,
            ],
            'heatmap-opacity': showHeatmap ? 0.72 : 0,
          },
        });
      } else {
        map.setLayoutProperty(
          'snapevents-thermal-heatmap',
          'visibility',
          showHeatmap ? 'visible' : 'none'
        );
      }

      // 3. Add 3D extruded buildings at zoom >= 14.5 if vector source exists
      const sources = map.getStyle()?.sources || {};
      const vectorSourceId = Object.keys(sources).find(
        (k) => sources[k].type === 'vector'
      );

      if (vectorSourceId && !map.getLayer('snapevents-3d-buildings')) {
        try {
          map.addLayer({
            id: 'snapevents-3d-buildings',
            source: vectorSourceId,
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14.5,
            layout: {
              visibility: show3DBuildings ? 'visible' : 'none',
            },
            paint: {
              'fill-extrusion-color':
                mapStyle === 'daylight'
                  ? '#cbd5e1'
                  : mapStyle === 'neon'
                    ? '#232832'
                    : '#1a1e24',
              'fill-extrusion-height': [
                'coalesce',
                ['get', 'render_height'],
                ['get', 'height'],
                14,
              ],
              'fill-extrusion-base': [
                'coalesce',
                ['get', 'render_min_height'],
                ['get', 'min_height'],
                0,
              ],
              'fill-extrusion-opacity': 0.76,
            },
          });
        } catch {
          // Vector tile source may not have 'building' layer
        }
      } else if (map.getLayer('snapevents-3d-buildings')) {
        map.setLayoutProperty(
          'snapevents-3d-buildings',
          'visibility',
          show3DBuildings ? 'visible' : 'none'
        );
      }
    },
    [buildHeatmapGeoJson, mapStyle, show3DBuildings, showHeatmap]
  );

  // Initialize MapLibre GL JS instance
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCity = CITIES[activeCity];
    const startCenter = focusCoordinates || initialCity.coordinates;
    const startZoom = focusCoordinates ? 15.6 : initialCity.defaultZoom;
    const startPitch = focusCoordinates ? 55 : initialCity.pitch;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URLS[mapStyle],
      center: startCenter,
      zoom: startZoom,
      pitch: startPitch,
      bearing: initialCity.bearing,
      maxPitch: 70,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
        showCompass: true,
      }),
      'top-right'
    );

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
      pitch: target.pitch,
      bearing: target.bearing,
      duration: 1400,
      essential: true,
    });
  }, [activeCity]);

  // Fly directly to a specific venue when "Show on Map" is clicked in Pole Feed View
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusCoordinates) return;
    map.flyTo({
      center: focusCoordinates,
      zoom: 15.8,
      pitch: 56,
      duration: 1100,
      essential: true,
    });
  }, [focusCoordinates]);

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

  // Update heatmap & 3D buildings when toggles or venueGroups change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    syncCustomLayers(map);
  }, [venueGroups, showHeatmap, show3DBuildings, mapReady, syncCustomLayers]);

  // Render "Near Me" user location sticker marker & fly to user when requested
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
          <span class="absolute -inset-2 rounded-full bg-[#ffe600]/45 animate-ping"></span>
          <div class="relative px-2 py-0.5 bg-[#ffe600] text-[#0d0e11] border-2 border-[#0d0e11] outline-2 outline-[#f4f1ea] shadow-[2px_3px_0px_#07080a] font-mono-stamp text-[10px] font-bold uppercase tracking-tighter">
            📍 YOU
          </div>
        </div>
      `;
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(userLocation)
        .addTo(map);

      map.flyTo({
        center: userLocation,
        zoom: 14.2,
        pitch: 52,
        duration: 1300,
        essential: true,
      });
    }
  }, [userLocation]);

  // Rebuild Supercluster index when venueGroups change
  useEffect(() => {
    const supercluster = new Supercluster<ClusterProps, ClusterProps>({
      radius: 48,
      maxZoom: 15,
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

  // Render Supercluster + Die-Cut Street Sticker DOM Markers
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

      // 1. CLUSTER MARKER: Stacked Pile of Street Stickers
      if (props.cluster && typeof props.cluster_id === 'number') {
        const count = props.point_count || 0;
        const hasLiveCount = props.hasLive || 0;
        const clusterEl = document.createElement('button');
        clusterEl.type = 'button';
        clusterEl.setAttribute(
          'aria-label',
          `Sticker cluster with ${count} venues. Click to zoom in.`
        );
        clusterEl.className =
          'group relative flex items-center justify-center cursor-pointer focus:outline-none select-none';

        clusterEl.innerHTML = `
          <div class="relative flex items-center justify-center w-14 h-14 transition-transform duration-150 group-hover:scale-110">
            <!-- Back sticker in stack -->
            <div class="absolute w-12 h-12 -translate-x-1 -translate-y-1 rounded-md bg-[#ffe600] border-2 border-[#0d0e11] shadow-[2px_3px_0px_#07080a] rotate-12"></div>
            <!-- Middle sticker in stack -->
            <div class="absolute w-12 h-12 translate-x-1 translate-y-1 rounded-md bg-[#ff2a85] border-2 border-[#f4f1ea] shadow-[2px_3px_0px_#07080a] -rotate-12"></div>
            <!-- Front count slap -->
            <div class="relative flex flex-col items-center justify-center w-12 h-12 rounded-md bg-[#121418] border-[2.5px] border-[#f4f1ea] text-[#f4f1ea] shadow-[3px_4px_0px_#07080a]">
              <span class="font-display-slap text-sm leading-none text-[#ffe600]">${count}</span>
              <span class="font-mono-stamp text-[9px] font-bold uppercase tracking-tighter text-[#f4f1ea] mt-0.5">${
                hasLiveCount > 0 ? '🔥 LIVE' : 'SLAPS'
              }</span>
            </div>
          </div>
        `;

        clusterEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const expansionZoom = Math.min(
            supercluster.getClusterExpansionZoom(props.cluster_id!),
            16.5
          );
          map.flyTo({
            center: [lon, lat],
            zoom: expansionZoom,
            duration: 700,
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

      // 2. SINGLE VENUE MARKER: Die-Cut Vinyl Sticker Slap
      const vg = props.venueGroup;
      if (!vg) continue;

      const isSelected = vg.venueId === selectedVenueId;
      const slapColor =
        CATEGORY_SLAP_COLORS[vg.topCategory] || { bg: '#ffe600', text: '#0d0e11' };
      const eventCount = vg.events.length;
      const leadEvent = vg.events[0];
      const angle = getStickerAngle(vg.venueId);

      // Safe event_only image usage inside this specific event's map marker sticker
      const thumbUrl = vg.coverImageUrl ? escapeHtml(vg.coverImageUrl) : null;
      const safeVenueName = escapeHtml(vg.venueName);
      const safeLeadTitle = escapeHtml(leadEvent.title);

      const bubbleEl = document.createElement('button');
      bubbleEl.type = 'button';
      bubbleEl.setAttribute(
        'aria-label',
        `Open event sticker for ${vg.venueName} (${eventCount} ${
          eventCount === 1 ? 'event' : 'events'
        })`
      );
      bubbleEl.className =
        'group relative flex flex-col items-center cursor-pointer focus:outline-none select-none';

      bubbleEl.innerHTML = `
        <div
          class="relative flex flex-col items-center transition-transform duration-150 ${
            isSelected ? 'scale-125 z-30' : 'group-hover:scale-110 group-hover:z-20'
          }"
          style="transform: rotate(${isSelected ? 0 : angle}deg);"
        >
          <!-- Die-Cut Square/Rounded Vinyl Sticker -->
          <div
            class="relative w-13 h-13 rounded-lg bg-[#f4f1ea] p-[3px] shadow-[3px_4px_0px_#07080a]"
            style="border: 2px solid #0d0e11;"
          >
            <div class="relative w-full h-full rounded-[4px] bg-[#16191f] overflow-hidden flex items-center justify-center border border-[#0d0e11]">
              ${
                thumbUrl
                  ? `<img src="${thumbUrl}" alt="" loading="lazy" class="w-full h-full object-cover contrast-110 group-hover:scale-105 transition-transform" />`
                  : `<div class="w-full h-full flex items-center justify-center text-2xl" style="background-color: ${slapColor.bg}; color: ${slapColor.text};">${vg.topEmoji}</div>`
              }
              <!-- Corner Category Stamp -->
              <span
                class="absolute bottom-0 right-0 px-1 py-[1px] text-[11px] leading-none border-t border-l border-[#0d0e11]"
                style="background-color: ${slapColor.bg}; color: ${slapColor.text};"
              >${vg.topEmoji}</span>
            </div>

            ${
              vg.hasLiveEvent
                ? `<span class="absolute -top-2 -left-2 px-1.5 py-[1px] bg-[#ff2a85] text-white border-[1.5px] border-[#f4f1ea] shadow-[2px_2px_0px_#07080a] font-mono-stamp text-[8px] font-bold uppercase tracking-tighter">● LIVE</span>`
                : vg.hasStartingSoon
                  ? `<span class="absolute -top-2 -left-2 px-1.5 py-[1px] bg-[#ffe600] text-[#0d0e11] border-[1.5px] border-[#0d0e11] shadow-[2px_2px_0px_#07080a] font-mono-stamp text-[8px] font-bold uppercase tracking-tighter">SOON</span>`
                  : ''
            }

            ${
              eventCount > 1
                ? `<span class="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-sm bg-[#ffe600] border-[1.5px] border-[#0d0e11] text-[#0d0e11] font-mono-stamp text-[10px] font-bold flex items-center justify-center shadow-[2px_2px_0px_#07080a]">+${eventCount}</span>`
                : ''
            }
          </div>

          <!-- Rectangular Street-Sign / Slap Label underneath -->
          <div class="mt-1 max-w-[142px] px-2 py-0.5 bg-[#111317] border-[1.5px] border-[#f4f1ea] shadow-[2px_3px_0px_#07080a] text-left pointer-events-none">
            <p class="font-grotesk text-[10px] font-bold uppercase tracking-tight text-[#ffe600] truncate leading-tight">${safeVenueName}</p>
            <p class="text-[9px] font-medium text-[#f4f1ea] truncate leading-tight">${safeLeadTitle}</p>
          </div>
        </div>
      `;

      bubbleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectVenueGroup(vg);
      });

      const marker = new maplibregl.Marker({
        element: bubbleEl,
        anchor: 'bottom',
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
        aria-label="Interactive 6-City tarra Street Sticker Map"
      />
      {/* Subtle bottom vignette so the bottom sticker dock pops cleanly */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0d0e11]/85 to-transparent" />
    </div>
  );
};

