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

const CATEGORY_RING_COLORS: Record<string, string> = {
  music: '#f43f5e',
  culture: '#a855f7',
  sports: '#10b981',
  family: '#f59e0b',
  food: '#fb923c',
  nightlife: '#ec4899',
  nature: '#22c55e',
};

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

  // Apply custom Snap style layers (Thermal Heatmap + 3D Extruded Buildings + Nordic Neon tinting)
  const syncCustomLayers = useCallback(
    (map: maplibregl.Map) => {
      if (!map.isStyleLoaded()) return;

      // 1. Apply Nordic Neon / Snap Midnight color customization to base layers
      const style = map.getStyle();
      if (style?.layers) {
        for (const layer of style.layers) {
          try {
            if (layer.type === 'background') {
              if (mapStyle === 'neon') {
                map.setPaintProperty(layer.id, 'background-color', '#050816');
              } else if (mapStyle === 'midnight') {
                map.setPaintProperty(layer.id, 'background-color', '#090d16');
              }
            }
            if (layer.id.includes('water') && layer.type === 'fill') {
              if (mapStyle === 'neon') {
                map.setPaintProperty(layer.id, 'fill-color', '#081b33');
              } else if (mapStyle === 'midnight') {
                map.setPaintProperty(layer.id, 'fill-color', '#0b1526');
              }
            }
          } catch {
            // Ignore layers that don't support dynamic paint overrides
          }
        }
      }

      // 2. Add or update GPU Thermal Heatmap source & layer
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
              1.1,
              13,
              1.8,
              16,
              2.6,
            ],
            'heatmap-color':
              mapStyle === 'neon'
                ? [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0,
                    'rgba(0, 0, 0, 0)',
                    0.15,
                    'rgba(6, 182, 212, 0.28)',
                    0.4,
                    'rgba(59, 130, 246, 0.52)',
                    0.65,
                    'rgba(217, 70, 239, 0.72)',
                    0.85,
                    'rgba(244, 63, 94, 0.88)',
                    1,
                    'rgba(250, 204, 21, 0.98)',
                  ]
                : [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0,
                    'rgba(0, 0, 0, 0)',
                    0.18,
                    'rgba(16, 185, 129, 0.25)',
                    0.42,
                    'rgba(34, 211, 238, 0.50)',
                    0.68,
                    'rgba(250, 204, 21, 0.74)',
                    0.88,
                    'rgba(249, 115, 22, 0.88)',
                    1,
                    'rgba(239, 68, 68, 0.96)',
                  ],
            'heatmap-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              9,
              32,
              13,
              64,
              16,
              96,
            ],
            'heatmap-opacity': showHeatmap ? 0.86 : 0,
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
                    ? '#1e1b4b'
                    : '#1e293b',
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
              'fill-extrusion-opacity': 0.72,
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
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URLS[mapStyle],
      center: initialCity.coordinates,
      zoom: initialCity.defaultZoom,
      pitch: initialCity.pitch,
      bearing: initialCity.bearing,
      maxPitch: 70,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
        showCompass: true,
      }),
      'bottom-right'
    );

    const handleMove = () => setViewTick((t) => t + 1);
    map.on('load', () => {
      setMapReady(true);
      syncCustomLayers(map);
      handleMove();
    });
    map.on('styledata', () => {
      syncCustomLayers(map);
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

  // Fly smoothly when activeCity changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = CITIES[activeCity];
    map.flyTo({
      center: target.coordinates,
      zoom: target.defaultZoom,
      pitch: target.pitch,
      bearing: target.bearing,
      duration: 1500,
      essential: true,
    });
  }, [activeCity]);

  // Fly directly to a specific venue when "Show on Map" is clicked in List View
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusCoordinates) return;
    map.flyTo({
      center: focusCoordinates,
      zoom: 15.8,
      pitch: 56,
      duration: 1200,
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

  // Render "Near Me" user location marker & fly to user when requested
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    if (userLocation) {
      const el = document.createElement('div');
      el.className = 'snapevents-user-marker';
      el.innerHTML = `
        <div class="relative flex items-center justify-center w-8 h-8">
          <span class="absolute inset-0 rounded-full bg-cyan-400/50 animate-ping"></span>
          <span class="relative w-4 h-4 rounded-full bg-cyan-400 border-2 border-white shadow-lg shadow-cyan-400/60"></span>
        </div>
      `;
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(userLocation)
        .addTo(map);

      map.flyTo({
        center: userLocation,
        zoom: 14.2,
        pitch: 55,
        duration: 1400,
        essential: true,
      });
    }
  }, [userLocation]);

  // Rebuild Supercluster index when venueGroups change
  useEffect(() => {
    const supercluster = new Supercluster<ClusterProps, ClusterProps>({
      radius: 46,
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

  // Render Supercluster + Venue Story Bubble DOM Markers
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

      if (props.cluster && typeof props.cluster_id === 'number') {
        const count = props.point_count || 0;
        const hasLiveCount = props.hasLive || 0;
        const clusterEl = document.createElement('button');
        clusterEl.type = 'button';
        clusterEl.setAttribute(
          'aria-label',
          `Event cluster with ${count} venues. Click to zoom in.`
        );
        clusterEl.className =
          'group relative flex items-center justify-center cursor-pointer focus:outline-none';

        clusterEl.innerHTML = `
          <div class="relative flex items-center justify-center w-14 h-14 transition-transform duration-200 group-hover:scale-110">
            ${
              hasLiveCount > 0
                ? `<span class="absolute inset-0 rounded-full bg-gradient-to-tr from-rose-500 via-fuchsia-500 to-cyan-400 opacity-70 blur-[3px] animate-pulse"></span>`
                : ''
            }
            <div class="relative flex flex-col items-center justify-center w-12 h-12 rounded-full bg-slate-900/95 border-2 ${
              hasLiveCount > 0 ? 'border-cyan-400' : 'border-slate-500'
            } text-white shadow-xl backdrop-blur-md">
              <span class="text-xs font-extrabold tracking-tight leading-none">${count}</span>
              <span class="text-[9px] font-semibold uppercase tracking-wider text-cyan-300 mt-0.5">${
                hasLiveCount > 0 ? '🔥 LIVE' : 'spots'
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
            duration: 750,
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

      const vg = props.venueGroup;
      if (!vg) continue;

      const isSelected = vg.venueId === selectedVenueId;
      const ringColor =
        CATEGORY_RING_COLORS[vg.topCategory] || '#22d3ee';
      const eventCount = vg.events.length;
      const leadEvent = vg.events[0];

      // Safe event_only image usage inside this specific event's map marker bubble
      const thumbUrl = vg.coverImageUrl;

      const bubbleEl = document.createElement('button');
      bubbleEl.type = 'button';
      bubbleEl.setAttribute(
        'aria-label',
        `Open Snap Story for ${vg.venueName} (${eventCount} ${
          eventCount === 1 ? 'event' : 'events'
        })`
      );
      bubbleEl.className =
        'group relative flex flex-col items-center cursor-pointer focus:outline-none select-none';

      bubbleEl.innerHTML = `
        <div class="relative flex items-center justify-center transition-transform duration-200 ${
          isSelected ? 'scale-125 z-30' : 'group-hover:scale-110'
        }">
          ${
            vg.hasLiveEvent
              ? `<span class="absolute -inset-1.5 rounded-full opacity-80 animate-ping" style="background: radial-gradient(circle, ${ringColor}66 0%, transparent 70%); animation-duration: 2.2s;"></span>`
              : ''
          }
          <div class="relative w-14 h-14 rounded-full p-[3px] shadow-2xl" style="background: conic-gradient(from 180deg, ${ringColor}, #22d3ee, #ec4899, ${ringColor});">
            <div class="relative w-full h-full rounded-full bg-slate-900 overflow-hidden flex items-center justify-center border-2 border-slate-950">
              ${
                thumbUrl
                  ? `<img src="${thumbUrl}" alt="" loading="lazy" class="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />`
                  : `<span class="text-2xl">${vg.topEmoji}</span>`
              }
              <div class="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent"></div>
              <span class="absolute bottom-0.5 text-sm drop-shadow">${vg.topEmoji}</span>
            </div>
          </div>

          ${
            vg.hasLiveEvent
              ? `<span class="absolute -bottom-1.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-[9px] font-black uppercase tracking-wider text-white shadow-md border border-slate-950">LIVE</span>`
              : vg.hasStartingSoon
                ? `<span class="absolute -bottom-1.5 px-1.5 py-0.5 rounded-full bg-cyan-500 text-[9px] font-black uppercase tracking-wider text-slate-950 shadow-md border border-slate-950">SOON</span>`
                : ''
          }

          ${
            eventCount > 1
              ? `<span class="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-slate-950/95 border border-cyan-400 text-cyan-300 text-[10px] font-bold flex items-center justify-center shadow-lg">+${eventCount}</span>`
              : ''
          }
        </div>
        <div class="mt-2 max-w-[136px] px-2 py-0.5 rounded-full bg-slate-950/85 border border-white/15 backdrop-blur-md shadow-lg text-center pointer-events-none">
          <p class="text-[10px] font-semibold text-white truncate leading-tight">${vg.venueName}</p>
          <p class="text-[9px] text-slate-300 truncate leading-tight">${leadEvent.title}</p>
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
        aria-label="Interactive 6-City SnapEvents Map"
      />
      {/* Subtle top and bottom vignette for crisp HUD legibility */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-950/80 via-slate-950/35 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent" />
    </div>
  );
};
