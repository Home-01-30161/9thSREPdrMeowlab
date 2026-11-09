'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Compass, Navigation, Maximize2, MapPin } from 'lucide-react';

interface Coords {
  lat: number;
  lng: number;
  name: string;
  country?: string;
}

interface TravelMapProps {
  origin: Coords | null;
  destination: Coords | null;
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
  /** Map height in px (500) or any CSS length, e.g. "50vh" or "min(500px, 60vw)". */
  height?: number | string;
}

// Calculate Haversine distance in kilometers
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Generate curved points for flight path visualization
function createCurvedFlightPoints(
  start: [number, number],
  end: [number, number],
  numPoints: number = 30
): [number, number][] {
  const points: [number, number][] = [];
  const [lat1, lng1] = start;
  const [lat2, lng2] = end;

  // Midpoint with curve offset
  const midLat = (lat1 + lat2) / 2;
  const dist = Math.hypot(lat2 - lat1, lng2 - lng1);
  const curveOffset = Math.min(dist * 0.15, 12); // Arc curvature

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    // Quadratic Bezier interpolation
    const lat =
      (1 - t) * (1 - t) * lat1 +
      2 * (1 - t) * t * (midLat + curveOffset) +
      t * t * lat2;
    const lng = (1 - t) * lng1 + t * lng2;
    points.push([lat, lng]);
  }
  return points;
}

export default function TravelMap({
  origin,
  destination,
  onMapClick,
  className = '',
  height = 500,
}: TravelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [cursorCoords, setCursorCoords] = useState<{ lat: string; lng: string }>({
    lat: '0.00°',
    lng: '0.00°',
  });

  // Calculate distance synchronously during render
  const distanceKm =
    origin &&
      destination &&
      !isNaN(origin.lat) &&
      !isNaN(origin.lng) &&
      !isNaN(destination.lat) &&
      !isNaN(destination.lng)
      ? calculateDistance(origin.lat, origin.lng, destination.lat, destination.lng)
      : null;

  // Initialize Leaflet Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Create map instance
    const map = L.map(containerRef.current, {
      center: [20, 10],
      zoom: 2,
      minZoom: 1.5,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true,
    });

    // OpenStreetMap standard tile layer (canonical host — see img-src in next.config.ts)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Zoom buttons in top-right
    L.control
      .zoom({
        position: 'topright',
      })
      .addTo(map);

    // Track mouse coords for retro radar HUD
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({
        lat: e.latlng.lat.toFixed(2) + '°',
        lng: e.latlng.lng.toFixed(2) + '°',
      });
    });

    // Handle map click
    if (onMapClick) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        onMapClick(e.latlng.lat, e.latlng.lng);
      });
    }

    // Layer group for dynamic markers and polylines
    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapRef.current = map;

    // Invalidate map size to ensure tile grid renders completely
    const timer1 = setTimeout(() => map.invalidateSize(), 150);
    const timer2 = setTimeout(() => map.invalidateSize(), 500);

    // Watch container size changes
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [onMapClick]);

  // Update Markers & Flight Route whenever origin or destination changes
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    const bounds: [number, number][] = [];

    // 1. Origin Marker
    if (origin && !isNaN(origin.lat) && !isNaN(origin.lng)) {
      const originIcon = L.divIcon({
        className: 'border-0 bg-transparent',
        html: `
          <div class="inline-flex items-center gap-1 
bg-zinc-800 text-white border-2 px-2 font-bold ubuntu max-w-sm text-[13px] tracking-[0.5px] -translate-x-1/2 -translate-y-full whitespace-nowrap">
            <span>FROM: ${origin.name}</span>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const m = L.marker([origin.lat, origin.lng], { icon: originIcon }).addTo(
        layerGroup
      );
      m.bindPopup(
        `<div style="font-family:var(--font-kanit),sans-serif;font-size:14px;color:#064e3b;font-weight:bold;"> Origin: ${origin.name}${origin.country ? ', ' + origin.country : ''}</div>`
      );
      bounds.push([origin.lat, origin.lng]);
    }

    // 2. Destination Marker
    if (destination && !isNaN(destination.lat) && !isNaN(destination.lng)) {
      const destIcon = L.divIcon({
        className: 'border-0 bg-transparent',
        html: `
          <div class="inline-flex items-center gap-1 bg-white text-zinc-800 border-2 border-pink-400 px-2 font-bold leading-relaxed max-w-sm tracking-[0.5px] shadow-[2px_2px_0px_#1e1b4b,0_4px_6px_rgba(0,0,0,0.25)] -translate-x-1/2 -translate-y-full whitespace-nowrap">
            <span>TO: ${destination.name}</span>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const m = L.marker([destination.lat, destination.lng], {
        icon: destIcon,
      }).addTo(layerGroup);
      m.bindPopup(
        `<div style="font-family:var(--font-kanit),sans-serif;font-size:14px;color:#831843;font-weight:bold;"> Destination: ${destination.name}${destination.country ? ', ' + destination.country : ''}</div>`
      );
      bounds.push([destination.lat, destination.lng]);
    }

    // 3. Flight Route & Distance
    if (
      origin &&
      destination &&
      !isNaN(origin.lat) &&
      !isNaN(origin.lng) &&
      !isNaN(destination.lat) &&
      !isNaN(destination.lng)
    ) {
      const dist = calculateDistance(
        origin.lat,
        origin.lng,
        destination.lat,
        destination.lng
      );

      // Curved Flight Path
      const flightPath = createCurvedFlightPoints(
        [origin.lat, origin.lng],
        [destination.lat, destination.lng]
      );

      // Neon cyan / pink glow polyline
      L.polyline(flightPath, {
        color: '#ec4899',
        weight: 3.5,
        opacity: 0.9,
        dashArray: '6, 8',
      }).addTo(layerGroup);

      // Midpoint distance tag
      const midIdx = Math.floor(flightPath.length / 2);
      const midPoint = flightPath[midIdx];

      const distanceIcon = L.divIcon({
        className: 'border-0 bg-transparent',
        html: `
          <div style="
            display: inline-flex;
            align-items: center;
            background: #1e1b4b;
            color: #fdf2f8;
            border: 1.5px solid #f472b6;
            padding: 0.5 6px;
            font-family: var(--font-kanit), sans-serif;
            font-size: 13px;
            box-shadow: 2px 2px 0px rgba(0,0,0,0.4);
            transform: translate(-50%, -50%);
            white-space: nowrap;
          ">
            ${dist.toLocaleString()} km
          </div>
        `,
        iconSize: [0, 0],
      });
      L.marker(midPoint, { icon: distanceIcon }).addTo(layerGroup);
    }

    // Fit map bounds smoothly
    if (bounds.length === 2) {
      map.fitBounds(bounds, {
        padding: [60, 60],
        maxZoom: 9,
      });
    } else if (bounds.length === 1) {
      map.flyTo(bounds[0], 5, { duration: 1.2 });
    }

    // Additional invalidateSize call after bounds transition
    setTimeout(() => map.invalidateSize(), 300);
  }, [origin, destination]);

  return (
    <div
      className={`retro-window overflow-hidden flex flex-col shadow-lg ${className}`}
    >
      {/* Map Interactive Canvas */}
      <div
        className="relative w-full bg-slate-200 overflow-hidden"
        style={{ height, minHeight: height }}
      >
        <div
          id="map"
          ref={containerRef}
          style={{ height, width: '100%' }}
          className="w-full h-full z-10"
        />

        {/* Retro Map HUD Overlay */}
        <div className="absolute top-2 left-2 z-20 pointer-events-none flex flex-col gap-1">
          {distanceKm && (
            <div className="bg-gray-50 text-black border border-slate-900 px-2 py-0.5 shadow-sm font-kanit text-xs font-bold">
              FLIGHT: {distanceKm.toLocaleString()} KM
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
