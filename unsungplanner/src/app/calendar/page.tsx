'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import {
  Calendar as CalendarIcon,
  MapPin,
  Compass,
  ArrowRight,
  Sparkles,
  ExternalLink,
  PlusCircle,
  FileText,
  Clock,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { type CalendarPlace } from '@/components/CalendarMap';

// Dynamically import Leaflet Map component with SSR disabled
const CalendarMap = dynamic(() => import('@/components/CalendarMap'), {
  ssr: false,
  loading: () => (
    <div className="retro-window h-120 flex flex-col items-center justify-center bg-white/80 font-pixel text-slate-700 text-sm gap-2">
      <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
      <span>INITIALIZING ROUTE...</span>
    </div>
  ),
});

export interface PlannedSession {
  id: string;
  title: string;
  destination: string;
  country: string;
  origin: string;
  startDate: string; // ISO yyyy-mm-dd or DD/MM/YY
  startDDMMYY: string;
  nights: number;
  travelers: number;
  style: string;
  budgetUSD?: number;
  places: CalendarPlace[];
}

function formatDDMMYY(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function getDateForDay(startDateStr: string, dayIndex: number): string {
  let base: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) {
    const [y, m, d] = startDateStr.split('-').map(Number);
    base = new Date(y, m - 1, d);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(startDateStr)) {
    const parts = startDateStr.split('/').map(Number);
    const y = parts[2] < 100 ? 2000 + parts[2] : parts[2];
    base = new Date(y, parts[1] - 1, parts[0]);
  } else {
    base = new Date();
  }
  const date = new Date(base.getTime());
  date.setDate(base.getDate() + (dayIndex - 1));
  return formatDDMMYY(date);
}

// Initial Sample Planned Sessions (empty by default)
const INITIAL_SESSIONS: PlannedSession[] = [];

export default function CalendarPage() {
  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);

  // Load all sessions saved every time user presses "PLAN MY TRIP"
  useEffect(() => {
    try {
      const rawSessions = localStorage.getItem('unsung_calendar_sessions');
      if (rawSessions) {
        const parsed = JSON.parse(rawSessions);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const userSessions: PlannedSession[] = parsed.map((s, idx) => ({
            id: s.id || `session-${idx}`,
            title: s.title || `${s.destination} Planned Route`,
            destination: s.destination || 'Destination',
            country: s.country || '',
            origin: s.origin || '',
            startDate: s.startDate || '2026-11-11',
            startDDMMYY: s.startDDMMYY || '11/11/26',
            nights: s.nights || 4,
            travelers: s.travelers || 1,
            style: s.style || 'Mid-range',
            budgetUSD: s.budgetUSD,
            places: Array.isArray(s.places) ? s.places : [],
          }));

          setSessions(userSessions);
          setActiveSessionId(userSessions[0].id);
          return;
        }
      }

      // Check single saved trip fallback
      const single = localStorage.getItem('unsung_calendar_trip');
      if (single) {
        const parsed = JSON.parse(single);
        if (parsed?.destination) {
          const singleSession: PlannedSession = {
            id: parsed.id || 'session-current',
            title: parsed.title || `${parsed.destination} Trip`,
            destination: parsed.destination,
            country: parsed.country || '',
            origin: parsed.origin || '',
            startDate: parsed.startDate || '2026-11-11',
            startDDMMYY: parsed.startDDMMYY || '11/11/26',
            nights: parsed.nights || 4,
            travelers: parsed.travelers || 1,
            style: parsed.style || 'Mid-range',
            budgetUSD: parsed.budgetUSD,
            places: Array.isArray(parsed.places) ? parsed.places : [],
          };
          setSessions([singleSession]);
          setActiveSessionId(singleSession.id);
          return;
        }
      }

      setSessions([]);
      setActiveSessionId('');
    } catch {
      setSessions([]);
      setActiveSessionId('');
    }
  }, []);

  const currentSession = sessions.find((s) => s.id === activeSessionId) || sessions[0] || null;
  const totalDays = currentSession ? currentSession.nights + 1 : 0;

  const handleRemoveSession = (sessionId: string) => {
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== sessionId);
      try {
        localStorage.setItem('unsung_calendar_sessions', JSON.stringify(updated));
        const single = localStorage.getItem('unsung_calendar_trip');
        if (single) {
          const parsed = JSON.parse(single);
          if (parsed?.id === sessionId) {
            if (updated.length > 0) {
              localStorage.setItem('unsung_calendar_trip', JSON.stringify(updated[0]));
            } else {
              localStorage.removeItem('unsung_calendar_trip');
            }
          }
        }
      } catch (e) {
        console.warn('Failed removing session:', e);
      }

      if (activeSessionId === sessionId) {
        if (updated.length > 0) {
          setActiveSessionId(updated[0].id);
        } else {
          setActiveSessionId('');
        }
      }
      return updated;
    });
  };

  return (
    <div
      className="relative min-h-screen text-black bg-cover bg-center bg-fixed selection:bg-pink-300 selection:text-black pb-20"
      style={{ backgroundImage: "url('/2.jpg')" }}
    >
      {/* Retro Wireframe Grid at bottom */}
      <div className="fixed bottom-0 left-0 right-0 h-64 retro-grid-perspective opacity-40 pointer-events-none z-0" />

      {/* Top Navbar */}
      <Navbar />

      {/* Main Container */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 pt-8 space-y-8">
        {/* Main Retro Window */}
        <div className="retro-window rounded-sm overflow-hidden shadow-2xl">
          {/* Window Header */}
          <div className="retro-window-header px-4 py-2.5 flex items-center justify-between select-none">
            <div className="flex items-center gap-2">
              <span className="font-pixel font-bold text-lg text-black tracking-wider">
                Calendar
              </span>
            </div>
          </div>

          {/* Window Content */}
          <div className="p-6 md:p-8 bg-[#fdfdfd] text-black">
            <div className="text-center"></div>

            {/* ─── 3×4 GRID (12 BOXES: SEPARATE FOR EACH SESSION) ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({ length: 12 }, (_, idx) => {
                const sessionItem = sessions[idx];
                const hasSession = Boolean(sessionItem);
                const isSelected = hasSession && sessionItem.id === activeSessionId;

                // Extract sample places for this session
                const places = sessionItem?.places ?? [];
                const hotel = places.find((p) => p.category === 'hotel');
                const restaurants = places.filter((p) => p.category === 'restaurant');
                const explores = places.filter((p) => p.category === 'explore');

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (hasSession) {
                        setActiveSessionId(sessionItem.id);
                        setSelectedDay(null);
                        if (sessionItem.places.length > 0) {
                          setActivePlaceId(sessionItem.places[0].id);
                        }
                      }
                    }}
                    className={`relative min-h-47.5 p-4 flex flex-col justify-between border rounded-sm transition select-none text-black ${hasSession
                      ? isSelected
                        ? 'bg-pink-50/80 border-slate-900 shadow-sm'
                        : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-400 shadow-xs cursor-pointer active:translate-x-px active:translate-y-px'
                      : 'bg-slate-100/60 border-dashed border-slate-200 opacity-60'
                      }`}
                  >
                    {/* Box Header showing start date in DD/MM/YY */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        {/* DD/MM/YY Badge */}
                        {hasSession ? (
                          <span className="font-pixel text-xs font-bold px-2.5 py-0.5 border border-slate-900 bg-white text-black tracking-wider shadow-xs">
                            {sessionItem.startDDMMYY}
                          </span>
                        ) : (
                          <span className="font-pixel text-xs font-bold px-2 py-0.5 border bg-slate-200 text-black border-slate-300">
                            EMPTY SLOT
                          </span>
                        )}

                        {hasSession ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveSession(sessionItem.id);
                              }}
                              className="p-1 text-black hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-xs transition cursor-pointer"
                              title={`Remove Session #${idx + 1}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-black" />
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {/* Destination Title */}
                      <div className="font-pixel text-xs font-bold text-black line-clamp-1 flex items-center gap-1.5 pt-0.5">
                        {hasSession ? (
                          <>
                            <MapPin className="h-3.5 w-3.5 text-black shrink-0" />
                            <span className="truncate text-black">{sessionItem.destination}, {sessionItem.country}</span>
                          </>
                        ) : (
                          <span className="text-black">Available Session Slot</span>
                        )}
                      </div>
                    </div>

                    {/* Content summary for this planned session */}
                    {hasSession ? (
                      <div className="my-2 space-y-1.5 text-[11px] text-black">
                        {/* Hotel item */}
                        {hotel && (
                          <div className="flex items-center gap-1.5 text-black font-medium truncate">
                            <span className="truncate text-black">{hotel.name.replace(/^[—\-\s]+/, '').replace(/\s*[—–]\s*/g, ' ')}</span>
                          </div>
                        )}

                        {/* Restaurant item without price badge */}
                        {restaurants.slice(0, 1).map((r) => (
                          <div key={r.id} className="flex items-center gap-1.5 text-black font-medium truncate">
                            <span className="truncate text-black">{r.name.replace(/^[—\-\s]+/, '').replace(/\s*[—–]\s*/g, ' ')}</span>
                          </div>
                        ))}

                        {/* Explore spot */}
                        {explores.slice(0, 1).map((exp) => (
                          <div key={exp.id} className="flex items-center gap-1.5 text-black font-medium truncate">
                            <span className="truncate text-black">{exp.name.replace(/^[—\-\s]+/, '').replace(/\s*[—–]\s*/g, ' ')}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-4 text-center text-xs text-black font-pixel">
                        Press &quot;PLAN MY TRIP&quot; on Home to fill this slot
                      </div>
                    )}

                    {/* Bottom action indicator */}
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] font-pixel text-black">
                      {hasSession ? (
                        <>
                          <span className="text-black font-bold">
                            {isSelected ? '✓ Showing Route on Map' : 'Click to show on map'}
                          </span>
                          <ArrowRight className="h-3 w-3 text-black" />
                        </>
                      ) : (
                        <Link href="/" className="text-black hover:underline flex items-center gap-1">
                          <PlusCircle className="h-3 w-3 text-black" />
                          <span className="text-black">Plan New Session</span>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ─── LEAFLET ROUTE MAP & DESTINATIONS DIRECTORY ─── */}
            {currentSession ? (
              <>
                <div className="space-y-4 pt-4 border-t-2 border-slate-200 text-black">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <h2 className="font-pixel font-bold text-xl text-black tracking-wide flex items-center gap-2">
                        <span className="text-black">{currentSession.destination.toUpperCase()}, {currentSession.country.toUpperCase()}</span>
                      </h2>
                    </div>

                    {/* Day Filter Chips in DD/MM/YY */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-pixel">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDay(null);
                          setActivePlaceId(null);
                        }}
                        className={`px-2.5 py-1 text-[11px] font-bold border transition cursor-pointer ${selectedDay === null
                          ? 'bg-black text-white border-black shadow-xs'
                          : 'bg-white text-black border-slate-300 hover:bg-slate-100'
                          }`}
                      >
                        All Dates ({currentSession.places.length})
                      </button>
                      {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => {
                        const dateTag = getDateForDay(currentSession.startDate, d);
                        const dayPlaces = currentSession.places.filter((p) => p.day === d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => {
                              setSelectedDay(d);
                              const first = dayPlaces[0];
                              if (first) setActivePlaceId(first.id);
                            }}
                            className={`px-2 py-1 text-[11px] font-bold border transition cursor-pointer ${selectedDay === d
                              ? 'bg-black text-white border-black shadow-xs'
                              : 'bg-white text-black border-slate-300 hover:bg-slate-100'
                              }`}
                          >
                            {dateTag} (D{d})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* The Leaflet Map Canvas */}
                  <CalendarMap
                    places={currentSession.places}
                    destination={`${currentSession.destination}, ${currentSession.country}`}
                    activeDay={selectedDay}
                    activePlaceId={activePlaceId}
                    onSelectPlace={(p) => setActivePlaceId(p.id)}
                    height={460}
                  />
                </div>

                {/* ─── PLANNED DESTINATIONS DIRECTORY (WITH GOOGLE MAPS LINKS) ─── */}
                <div className="space-y-4 pt-2 text-black">
                  <h3 className="font-pixel font-bold text-base text-black tracking-wide flex items-center gap-2">
                    <span className="text-black">DESTINATIONS DIRECTORY: {currentSession.destination.toUpperCase()} ({currentSession.startDDMMYY})</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {currentSession.places.map((place) => {
                      const gmapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${place.name}, ${currentSession.destination}, ${currentSession.country}`
                      )}`;
                      const isFocused = activePlaceId === place.id;
                      const dateTag = getDateForDay(currentSession.startDate, place.day);

                      return (
                        <div
                          key={place.id}
                          onClick={() => setActivePlaceId(place.id)}
                          className={`p-3 bg-white border transition rounded-sm flex items-start justify-between gap-3 cursor-pointer text-black ${isFocused
                            ? 'border-black bg-slate-50 shadow-xs'
                            : 'border-slate-200 hover:border-slate-400 shadow-xs'
                            }`}
                        >
                          <div className="space-y-1 min-w-0 text-black">
                            <div className="flex items-center gap-2">
                              <span className="font-pixel text-[10px] font-bold px-1.5 py-0.2 bg-slate-100 border border-slate-300 text-black">
                                {dateTag}
                              </span>
                            </div>

                            <div className="font-bold text-sm text-black truncate">
                              {place.name.replace(/^[—\-\s]+/, '').replace(/\s*[—–]\s*/g, ' ')}
                            </div>

                            {place.description && (
                              <div className="text-xs text-black line-clamp-1">
                                {place.description.replace(/^[—\-\s]+/, '').replace(/\s*[—–]\s*/g, ' ')}
                              </div>
                            )}

                            {place.price && (
                              <div className="text-xs font-bold text-black">
                                Price: {place.price.replace(/[—–]/g, '-')}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <a
                              href={gmapUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="retro-btn text-[11px] font-pixel font-bold px-2 py-1 text-black hover:bg-slate-100 flex items-center gap-1 transition shadow-xs border border-slate-300"
                              title="Open place on Google Maps"
                            >
                              <span className="text-black">Maps</span>
                              <ExternalLink className="h-3 w-3 text-black" />
                            </a>
                            <span className="text-[10px] text-black font-pixel">
                              Click to focus
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 px-4 border-2 border-dashed border-slate-300 bg-slate-50 space-y-3 font-pixel text-black">
                <CalendarIcon className="h-10 w-10 text-black mx-auto" />
                <h3 className="text-lg font-bold text-black">No Planned Sessions Yet</h3>
                <p className="text-xs text-black max-w-md mx-auto">
                  Your calendar is currently empty. Go to Home and press &quot;PLAN MY TRIP&quot; to generate an itinerary and visualize its route.
                </p>
                <div className="pt-2 flex items-center justify-center gap-3">
                  <Link href="/" className="retro-btn-accent text-xs px-3 py-1.5 flex items-center gap-1.5 font-bold">
                    <span>Plan My Trip on "Home"</span>
                  </Link>
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 font-pixel text-black">


              {sessions.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('unsung_calendar_sessions');
                    localStorage.removeItem('unsung_calendar_trip');
                    setSessions([]);
                    setActiveSessionId('');
                    setSelectedDay(null);
                    setActivePlaceId(null);
                  }}
                  className="retro-btn text-xs text-black hover:text-red-700 py-2 px-3 flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Clear All Sessions</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
