'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Compass, ExternalLink, MapPin, Navigation } from 'lucide-react';

export interface CalendarPlace {
  id: string;
  name: string;
  day: number;
  category: 'transit' | 'hotel' | 'restaurant' | 'explore' | 'other';
  lat: number;
  lng: number;
  description?: string;
  price?: string;
}

interface CalendarMapProps {
  places: CalendarPlace[];
  destination?: string;
  activePlaceId?: string | null;
  activeDay?: number | null;
  onSelectPlace?: (place: CalendarPlace) => void;
  height?: number | string;
  className?: string;
}

const CATEGORY_COLORS: Record<CalendarPlace['category'], { bg: string; text: string; border: string; emoji: string }> = {
  transit: { bg: '#8b5cf6', text: '#ffffff', border: '#6d28d9', emoji: '✈️' },
  hotel: { bg: '#10b981', text: '#ffffff', border: '#059669', emoji: '🏨' },
  restaurant: { bg: '#f97316', text: '#ffffff', border: '#ea580c', emoji: '🍽️' },
  explore: { bg: '#0284c7', text: '#ffffff', border: '#0369a1', emoji: '🗺️' },
  other: { bg: '#ec4899', text: '#ffffff', border: '#db2777', emoji: '✨' },
};

export default function CalendarMap({
  places,
  destination,
  activePlaceId,
  activeDay,
  onSelectPlace,
  height = 500,
  className = '',
}: CalendarMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const [cursorCoords, setCursorCoords] = useState<{ lat: string; lng: string }>({
    lat: '0.00°',
    lng: '0.00°',
  });

  // Filter places if activeDay is selected
  const visiblePlaces = activeDay ? places.filter((p) => p.day === activeDay) : places;

  // Initialize Leaflet Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [35.6762, 139.6503], // Default Tokyo
      zoom: 12,
      minZoom: 2,
      maxZoom: 19,
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({
        lat: e.latlng.lat.toFixed(3) + '°',
        lng: e.latlng.lng.toFixed(3) + '°',
      });
    });

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapRef.current = map;

    const timer1 = setTimeout(() => map.invalidateSize(), 200);
    const timer2 = setTimeout(() => map.invalidateSize(), 600);

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
  }, []);

  // Update Markers & Itinerary Polylines
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    markersRef.current.clear();

    if (visiblePlaces.length === 0) return;

    const bounds: [number, number][] = [];
    const routeCoords: [number, number][] = [];

    // Sort by day then order
    const sorted = [...visiblePlaces].sort((a, b) => a.day - b.day);

    sorted.forEach((p, idx) => {
      if (isNaN(p.lat) || isNaN(p.lng)) return;

      bounds.push([p.lat, p.lng]);
      routeCoords.push([p.lat, p.lng]);

      const cfg = CATEGORY_COLORS[p.category] || CATEGORY_COLORS.other;
      const isSelected = activePlaceId === p.id;

      const markerHtml = `
        <div style="
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: ${isSelected ? '#f43f5e' : cfg.bg};
          color: #fff;
          border: 2px solid ${isSelected ? '#ffe4e6' : '#fff'};
          padding: 3px 7px;
          border-radius: 9999px;
          font-family: var(--font-kanit), sans-serif;
          font-size: 11px;
          font-weight: bold;
          white-space: nowrap;
          box-shadow: 0 3px 8px rgba(0,0,0,0.3);
          transform: translate(-50%, -100%);
          cursor: pointer;
          transition: transform 0.15s ease;
        ">
          <span>D${p.day}: ${p.name.length > 20 ? p.name.slice(0, 18) + '…' : p.name}</span>
        </div>
      `;

      const icon = L.divIcon({
        className: 'border-0 bg-transparent',
        html: markerHtml,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([p.lat, p.lng], { icon }).addTo(layerGroup);

      const queryTarget = destination ? `${p.name}, ${destination}` : p.name;
      const gmapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryTarget)}`;

      const popupContent = `
        <div style="font-family: var(--font-kanit), sans-serif; padding: 4px; max-width: 240px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span style="font-size: 10px; font-weight: bold; text-transform: uppercase; background: ${cfg.bg}; color: #fff; padding: 1px 6px; border-radius: 4px;">
              Day ${p.day} • ${p.category}
            </span>
          </div>
          <div style="font-size: 13px; font-weight: bold; color: #0f172a; margin-bottom: 3px;">
            ${p.name}
          </div>
          ${p.description ? `<div style="font-size: 11px; color: #475569; margin-bottom: 6px;">${p.description}</div>` : ''}
          ${p.price ? `<div style="font-size: 11px; color: #ea580c; font-weight: bold; margin-bottom: 6px;">Price: ${p.price}</div>` : ''}
          <a href="${gmapUrl}" target="_blank" rel="noopener noreferrer" style="
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            color: #db2777;
            text-decoration: underline;
            font-weight: bold;
          ">
            Open on Google Maps ↗
          </a>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.on('click', () => {
        onSelectPlace?.(p);
      });

      markersRef.current.set(p.id, marker);
    });

    // Draw route path
    if (routeCoords.length >= 2) {
      L.polyline(routeCoords, {
        color: '#db2777',
        weight: 3,
        opacity: 0.75,
        dashArray: '6, 8',
      }).addTo(layerGroup);
    }

    // Fit bounds
    if (bounds.length > 0) {
      map.fitBounds(bounds, {
        padding: [50, 50],
        maxZoom: 14,
      });
    }

    setTimeout(() => map.invalidateSize(), 300);
  }, [visiblePlaces, activePlaceId, activeDay, onSelectPlace]);

  // Pan to active place if selected
  useEffect(() => {
    if (!activePlaceId || !mapRef.current) return;
    const place = places.find((p) => p.id === activePlaceId);
    if (!place || isNaN(place.lat) || isNaN(place.lng)) return;

    mapRef.current.flyTo([place.lat, place.lng], 15, { duration: 1 });
    const marker = markersRef.current.get(activePlaceId);
    if (marker) {
      marker.openPopup();
    }
  }, [activePlaceId, places]);

  return (
    <div className={`retro-window overflow-hidden flex flex-col shadow-xl ${className}`}>
      {/* Map Header Strip */}
      <div className="bg-[#f0f2f5] border-b border-slate-300 px-3 py-1.5 flex items-center justify-between text-xs font-pixel select-none">
        <div className="flex items-center gap-2">
          <Navigation className="h-3.5 w-3.5 text-pink-600 animate-pulse" />
          <span className="font-bold text-slate-800 tracking-wide uppercase">
            Interactive Route Radar (Leaflet)
          </span>
          <span className="bg-pink-100 text-pink-700 text-[10px] px-1.5 py-0.2 border border-pink-300 font-bold">
            {visiblePlaces.length} Destinations
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
          <span>LAT: {cursorCoords.lat}</span>
          <span>LNG: {cursorCoords.lng}</span>
        </div>
      </div>

      {/* Map Container */}
      <div className="relative w-full bg-slate-200" style={{ height, minHeight: height }}>
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} className="z-10" />

        {/* Legend Overlay at bottom-left */}
        <div className="absolute bottom-2 left-2 z-20 bg-white/90 backdrop-blur-xs border border-slate-300 p-2 text-[10px] font-pixel shadow-md flex flex-wrap gap-2 pointer-events-none">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-600 inline-block" />
            <span>Explore</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
            <span>Restaurant</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            <span>Hotel</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
            <span>Transit</span>
          </div>
        </div>
      </div>
    </div>
  );
}

