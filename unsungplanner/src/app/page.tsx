'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import Sidebar from '@/components/sidebar';
import Navbar from '@/components/Navbar';
import {
  MapPinIcon,
  GlobeAltIcon,
  CalendarIcon,
  MoonIcon,
  UsersIcon,
  BanknotesIcon,
  PaintBrushIcon,
  PaperAirplaneIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/16/solid';


const TravelMap = dynamic(() => import('@/components/TravelMap'), {
  ssr: false,
  loading: () => (
    <div className="retro-window h-125 flex items-center justify-center bg-white/80 font-pixel text-slate-700 text-sm">
      <Loader2 className="h-5 w-5 animate-spin mr-2 text-pink-500" />
      INITIALIZING
    </div>
  ),
});
import {
  Compass,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  MapPin,
  X,
  Calendar,
  Users,
  DollarSign,
  Plane,
  Sparkles,
  FileText,
  Star,
  ArrowRight,
  Globe,
  Sliders,
  Check,
  Moon,
  Banknote,
  Landmark,
  Trees,
  Building2,
} from 'lucide-react';
import { BUDGET_STYLES, DISPLAY_CURRENCIES, TRAVEL_THEMES, type Budget, type ResearchSource, type TravelTheme } from '@/lib/types';

// Set NEXT_PUBLIC_TURNSTILE_SITE_KEY to enable captcha
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

/** Only absolute https URLs may be rendered as links */
function safeHref(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function TurnstileWidget({ onToken, resetKey }: { onToken: (token: string) => void; resetKey: number }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;

    const render = () => {
      if (cancelled || !container.current || !window.turnstile) return;
      if (widgetId.current) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
      widgetId.current = window.turnstile.render(container.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'light',
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
    if (window.turnstile) {
      render();
    } else if (existing) {
      existing.addEventListener('load', render);
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = '1';
      script.addEventListener('load', render);
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      existing?.removeEventListener('load', render);
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [onToken, resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={container} className="col-span-full flex justify-center py-2" />;
}


// ─── Types ────────────────────────────────────────────────────────────────────

type CityCandidate = {
  name: string;
  admin1: string | null;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  timezone: string;
  population: number | null;
  label: string;
};

type PinnedCity = {
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  timezone: string;
};

// ─── CityPicker with Retro Style ──────────────────────────────────────────────

function CityPicker({
  idPrefix,
  cityLabel,
  cityPlaceholder,
  countryPlaceholder,
  city,
  country,
  pin,
  icon = 'pin',
  onCityChange,
  onCountryChange,
  onPin,
  onClearPin,
}: {
  idPrefix: string;
  cityLabel: string;
  cityPlaceholder: string;
  countryPlaceholder: string;
  city: string;
  country: string;
  pin: PinnedCity | null;
  icon?: 'pin' | 'world';
  onCityChange: (v: string) => void;
  onCountryChange: (v: string) => void;
  onPin: (c: PinnedCity) => void;
  onClearPin: () => void;
}) {
  const LabelIcon = icon === 'world' ? Globe : MapPin;
  const [candidates, setCandidates] = useState<CityCandidate[]>([]);
  const [fetching, setFetching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fetchCandidates = useCallback((c: string, ctry: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (c.trim().length < 2) { setCandidates([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setFetching(true);
      try {
        const r = await fetch(`/api/cities?city=${encodeURIComponent(c)}&country=${encodeURIComponent(ctry)}`);
        const data: CityCandidate[] = await r.json();
        setCandidates(data);
        if (data.length > 0) setOpen(true);
      } catch { /* ignore */ } finally { setFetching(false); }
    }, 450);
  }, []);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function handleSelect(c: CityCandidate) {
    onPin({ name: c.name, country: c.country, countryCode: c.countryCode, lat: c.lat, lng: c.lng, timezone: c.timezone });
    onCityChange(c.name);
    onCountryChange(c.country);
    setOpen(false);
    setCandidates([]);
  }

  function handleCityInput(v: string) {
    onCityChange(v);
    onClearPin();
    fetchCandidates(v, country);
  }

  function handleCountryInput(v: string) {
    onCountryChange(v);
    onClearPin();
    fetchCandidates(city, v);
  }

  const CityIcon = icon === 'world' ? GlobeAltIcon : MapPinIcon;

  return (
    <div ref={wrapperRef} className="contents">
      {/* City field */}
      <div className="space-y-1 relative">
        <label htmlFor={`${idPrefix}-city`} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
          <CityIcon className="h-3.5 w-3.5 text-black" aria-hidden={true} />
          {cityLabel} City
        </label>
        {pin ? (
          <div className="flex items-center gap-2 bg-linear-to-r from-emerald-100 to-teal-50 border-2 border-emerald-400 p-2 text-sm shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)]">
            <Check className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-bold text-emerald-900 truncate">{pin.name}</span>
            <span className="text-xs bg-emerald-200 text-emerald-800 px-1 py-0.5 border border-emerald-400">PINNED</span>
            <button
              type="button"
              onClick={onClearPin}
              title="Change city"
              className="ml-auto text-slate-500 hover:text-red-600 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              id={`${idPrefix}-city`}
              className="w-full bg-white border-2 border-slate-500 border-r-slate-200 border-b-slate-200 p-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-pink-500 shadow-[inset_2px_2px_3px_rgba(0,0,0,0.15)]"
              placeholder={cityPlaceholder}
              value={city}
              onChange={(e) => handleCityInput(e.target.value)}
              onFocus={() => { if (candidates.length > 0) setOpen(true); }}
              autoComplete="off"
              required
            />
            {fetching && (
              <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 text-pink-500 animate-spin" />
            )}
          </div>
        )}

        {/* Dropdown menu */}
        {open && candidates.length > 0 && !pin && (
          <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border-2 border-slate-800 shadow-2xl max-h-56 overflow-y-auto divide-y divide-slate-100">
            {candidates.map((c, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full text-left px-3 py-2 hover:bg-pink-50 transition flex items-start gap-2 text-slate-800"
                >
                  <MapPinIcon className="h-3.5 w-3.5 text-black shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-slate-900">{c.label}</div>
                    {c.population != null && (
                      <div className="text-[10px] text-slate-500">
                        Pop: {c.population.toLocaleString()}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Country field */}
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-country`} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
          <GlobeAltIcon className="h-3.5 w-3.5 text-black" />
          {cityLabel} Country
        </label>
        <input
          id={`${idPrefix}-country`}
          className="w-full bg-white border-2 border-slate-500 border-r-slate-200 border-b-slate-200 p-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-pink-500 shadow-[inset_2px_2px_3px_rgba(0,0,0,0.15)]"
          placeholder={countryPlaceholder}
          value={country}
          onChange={(e) => handleCountryInput(e.target.value)}
          autoComplete="off"
          required
        />
      </div>
    </div>
  );
}

// ─── Itinerary Summary Card ────────────────────────────────────────────────────

type CardType = 'RESTAURANT' | 'EXPLORE' | 'HOTEL' | 'OTHER';

const CARD_CONFIG: Record<CardType, { label: string; bg: string; border: string }> = {
  RESTAURANT: { label: 'Restaurant', bg: 'bg-white', border: 'border-slate-200' },
  EXPLORE: { label: 'Explore', bg: 'bg-white', border: 'border-slate-200' },
  HOTEL: { label: 'Hotel', bg: 'bg-white', border: 'border-slate-200' },
  OTHER: { label: 'Tips & More', bg: 'bg-white', border: 'border-slate-200' },
};

function SummaryCard({
  type,
  content,
  sources,
  locationContext,
}: {
  type: CardType;
  content: string;
  sources: ResearchSource[];
  locationContext?: string;
}) {
  const cfg = CARD_CONFIG[type];
  const cleanContent = content.replace(/^[—\-\s]+/, '').replace(/\s*[—–]\s*/, ' ');
  return (
    <div className={`flex items-start gap-2 rounded-sm border ${cfg.border} ${cfg.bg} px-2.5 py-1.5 text-xs shadow-xs`}>
      <div className="min-w-0">
        <span className="text-slate-700">{renderInlineItinerary(cleanContent, sources, locationContext)}</span>
      </div>
    </div>
  );
}

// ─── Itinerary Renderer with Retro Note Styling ───────────────────────────────

function ItineraryRenderer({
  text,
  sources,
  locationContext,
}: {
  text: string;
  sources: ResearchSource[];
  locationContext?: string;
}) {
  const lines = text.split('\n');
  // Collect consecutive summary cards to group them in a mini-grid
  const elements: React.ReactNode[] = [];
  let cardBuffer: React.ReactNode[] = [];

  const flushCards = (key: string) => {
    if (cardBuffer.length === 0) return;
    elements.push(
      <div key={`cards-${key}`} className="mt-3 ml-2 flex flex-col gap-1.5">
        {cardBuffer}
      </div>
    );
    cardBuffer = [];
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cardMatch = trimmed.match(/^\[(RESTAURANT|EXPLORE|HOTEL|OTHER)\]\s*(.+)$/);
    if (cardMatch) {
      cardBuffer.push(
        <SummaryCard key={i} type={cardMatch[1] as CardType} content={cardMatch[2]} sources={sources} locationContext={locationContext} />
      );
      return;
    }

    // Flush any pending cards before non-card content
    flushCards(String(i));

    if (/^Day\s+\d+/i.test(trimmed)) {
      elements.push(
        <div key={i} className="mt-6 first:mt-0 flex items-center gap-2">
          <span className="bg-linear-to-r from-pink-500 to-purple-600 text-white font-black px-2.5 py-1 text-xs uppercase tracking-wider shadow-sm border border-pink-300">
            {trimmed}
          </span>
          <div className="flex-1 h-0.5 bg-linear-to-r from-pink-300 to-transparent"></div>
        </div>
      );
      return;
    }
    if (/^(Morning|Afternoon|Evening)$/i.test(trimmed)) {
      elements.push(
        <p key={i} className="text-cyan-800 font-extrabold text-xs uppercase tracking-widest mt-2 flex items-center gap-1">
          <span className="text-pink-500">▶</span> {trimmed}
        </p>
      );
      return;
    }
    elements.push(
      <p key={i} className="text-slate-600 text-xs pl-2">{renderInlineItinerary(trimmed, sources, locationContext)}</p>
    );
  });

  flushCards('end');

  return (
    <div className="space-y-1 text-sm font-sans leading-relaxed text-slate-800">
      {elements}
    </div>
  );
}

/* Google Maps search link for a named place (URL built locally from the name, or matched to a verified research source). */
function GoogleMapLink({
  place,
  locationContext,
  sources,
}: {
  place: string;
  locationContext?: string;
  sources?: ResearchSource[];
}) {
  const name = place.trim();
  const nameLower = name.toLowerCase();

  // Prefer exact verified source URL from research notes if available
  const verified = sources?.find((s) => {
    const titleLower = s.title.toLowerCase();
    return titleLower.includes(nameLower) || (nameLower.length >= 4 && nameLower.includes(titleLower));
  });

  // Always append destination city/country to disambiguate places on Google Maps
  const query = encodeURIComponent(
    locationContext ? `${name}, ${locationContext}` : name
  );
  const href = verified?.url || `https://www.google.com/maps/search/?api=1&query=${query}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open "${name}" on Google Maps`}
      className="text-pink-600 hover:text-purple-700 text-xs font-bold underline decoration-dotted transition"
    >
      {name}
    </a>
  );
}

/* Splits itinerary text on {{Place}} markers → Google Maps links; everything else (incl. [n] citations) flows through renderWithCitations. */
function renderInlineItinerary(line: string, sources: ResearchSource[], locationContext?: string) {
  return line.split(/(\{\{[^}]*\}\})/g).map((part, i) => {
    const match = part.match(/^\{\{(.+)\}\}$/);
    if (match) return <GoogleMapLink key={i} place={match[1]} locationContext={locationContext} sources={sources} />;
    return <span key={i}>{renderWithCitations(part, sources)}</span>;
  });
}

function renderWithCitations(text: string, sources: ResearchSource[]) {
  return text.split(/(\[\d+\])/).map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const src = sources[Number(match[1]) - 1];
      const href = src ? safeHref(src.url) : undefined;
      if (src && href) {
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={src.title}
            className="inline-flex items-center text-pink-600 hover:text-purple-700 text-xs font-bold underline decoration-dotted transition mx-0.5"
          >
            [{match[1]}]
          </a>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

const STEPS = [
  { node: 'geocode_cities', label: 'Locating cities' },
  { node: 'find_logistics', label: 'Flights, hotels & routes' },
  { node: 'find_research', label: 'Web research' },
  { node: 'find_weather', label: 'Weather & holidays' },
  { node: 'calc_budget', label: 'Budget calculation' },
  { node: 'write_itinerary', label: 'Writing itinerary' },
];

/** Progress nodes for unsung mode. */
const UNSUNG_STEPS = [
  { node: 'geocode_cities', label: 'Locating destination' },
  { node: 'find_logistics', label: 'Flights, hotels & routes' },
  { node: 'find_research', label: 'Unsung gems & local eats' },
  { node: 'find_weather', label: 'Weather & holidays' },
  { node: 'calc_budget', label: 'Budget calculation' },
  { node: 'write_itinerary', label: 'Writing unsung itinerary' },
];

import type { QualityScored } from '@/lib/unsung/score';

type Result = {
  budget: Budget | null;
  itinerary: string;
  warnings: string[];
  gaps: string[];
  sources: ResearchSource[];
  unsung?: UnsungPanel | null;
};

/** Shape of the server's `unsung` NDJSON event (mirrors UnsungResult). */
type UnsungPanel = {
  label: string | null;
  results: QualityScored[];
  verifyPool: QualityScored[];
  notes: string[];
};

function isoToDDMMYY(isoStr: string): string {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
  }
  return isoStr;
}

function ddmmyyToIso(val: string): string | null {
  const clean = val.trim();
  const match = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  let year = match[3];
  if (year.length === 2) {
    year = `20${year}`;
  }
  const iso = `${year}-${month}-${day}`;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return iso;
}

export default function Home() {
  const [originCity, setOriginCity] = useState('');
  const [originCountry, setOriginCountry] = useState('');
  const [originPin, setOriginPin] = useState<PinnedCity | null>(null);
  const [destCity, setDestCity] = useState('');
  const [destCountry, setDestCountry] = useState('');
  const [destPin, setDestPin] = useState<PinnedCity | null>(null);
  const [startDate, setStartDate] = useState(''); // ISO yyyy-mm-dd
  const [dateDisplay, setDateDisplay] = useState('');
  const datePickerRef = useRef<HTMLInputElement>(null);
  const [minDate, setMinDate] = useState(''); // today, for the native picker's past-date block
  const [nights, setNights] = useState('4');
  const [travelers, setTravelers] = useState('1');
  const [style, setStyle] = useState('Mid-range');
  const [theme, setTheme] = useState<TravelTheme>('Balanced');
  const [mode, setMode] = useState('fly');
  const [currency, setCurrency] = useState('USD');
  const [unsungMode, setUnsungMode] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleTurnstileToken = useCallback((token: string) => setTurnstileToken(token), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinDate(new Date().toISOString().slice(0, 10)); // client-only clock → avoids hydration drift
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(window.innerWidth >= 1280); // adopt viewport after mount to avoid hydration mismatch

    // Default sample route for interactive map radar
    setOriginCity('Bangkok');
    setOriginCountry('Thailand');
    setOriginPin({
      name: 'Bangkok',
      country: 'Thailand',
      countryCode: 'TH',
      lat: 13.7563,
      lng: 100.5018,
      timezone: 'Asia/Bangkok',
    });
    setDestCity('Tokyo');
    setDestCountry('Japan');
    setDestPin({
      name: 'Tokyo',
      country: 'Japan',
      countryCode: 'JP',
      lat: 35.6762,
      lng: 139.6503,
      timezone: 'Asia/Tokyo',
    });
  }, []);

  // 1-scroll moves directly to next/prev section
  useEffect(() => {
    let isTransitioning = false;

    const scrollToSection = (targetIndex: number) => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>('section.snap-section'));
      if (targetIndex >= 0 && targetIndex < sections.length) {
        isTransitioning = true;
        sections[targetIndex].scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => {
          isTransitioning = false;
        }, 850);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select')) return;

      const scrollableChild = target?.closest('.overflow-y-auto');
      if (scrollableChild) {
        const atTop = scrollableChild.scrollTop <= 0;
        const atBottom = scrollableChild.scrollTop + scrollableChild.clientHeight >= scrollableChild.scrollHeight - 5;
        if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
          return;
        }
      }

      if (Math.abs(e.deltaY) < 25) return;
      if (isTransitioning) {
        e.preventDefault();
        return;
      }

      const sections = Array.from(document.querySelectorAll<HTMLElement>('section.snap-section'));
      if (sections.length <= 1) return;

      const scrollY = window.scrollY;
      let activeIndex = 0;
      let minDistance = Infinity;
      sections.forEach((sec, idx) => {
        const dist = Math.abs(sec.offsetTop - scrollY);
        if (dist < minDistance) {
          minDistance = dist;
          activeIndex = idx;
        }
      });

      if (e.deltaY > 0 && activeIndex < sections.length - 1) {
        e.preventDefault();
        scrollToSection(activeIndex + 1);
      } else if (e.deltaY < 0 && activeIndex > 0) {
        e.preventDefault();
        scrollToSection(activeIndex - 1);
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [result]);

  function applyEvent(evt: { type: string; node?: string; data?: Record<string, unknown>; message?: string;[key: string]: unknown }) {
    if (evt.type === 'error') { setError(evt.message ?? 'Unknown error'); return; }
    if (evt.type === 'unsung') {
      // Unsung mode replaces the plan entirely — overwrite, don't merge.
      setResult(() => ({
        budget: null, itinerary: '', warnings: [], gaps: [], sources: [],
        unsung: {
          label: (evt.label as string | undefined) ?? null,
          results: (evt.results as QualityScored[] | undefined) ?? [],
          verifyPool: (evt.verifyPool as QualityScored[] | undefined) ?? [],
          notes: (evt.notes as string[] | undefined) ?? [],
        },
      }));
      return;
    }
    if (evt.type !== 'step' || !evt.node) return;
    setDone((d) => [...d, evt.node!]);
    const data = evt.data ?? {};
    setResult((prev) => {
      const r: Result = prev ?? { budget: null, itinerary: '', warnings: [], gaps: [], sources: [] };
      return {
        budget: (data.budget as Budget | undefined) ?? r.budget,
        itinerary: (data.itinerary as string | undefined) ?? r.itinerary,
        warnings: (data.calendarWarnings as string[] | undefined) ?? r.warnings,
        gaps: [...r.gaps, ...((data.gaps as string[] | undefined) ?? [])],
        sources: Array.from(
          new Map(
            [...r.sources, ...((data.researchSources as ResearchSource[] | undefined) ?? [])].map((s) => [s.url, s])
          ).values()
        ),
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError('Please complete the human verification below and try again.');
      return;
    }
    setLoading(true); setError(null); setResult(null); setDone([]); setSourcesOpen(false);
    try {
      const body: Record<string, unknown> = {
        originCity, originCountry, destCity, destCountry,
        startDate, nights: Number(nights), travelers: Number(travelers), style, theme, mode, displayCurrency: currency,
      };
      if (unsungMode) body.unsungMode = true;
      if (originPin) body.originPin = originPin;
      if (destPin) body.destPin = destPin;
      if (TURNSTILE_SITE_KEY) body.turnstileToken = turnstileToken;

      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (; ;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) if (line.trim()) applyEvent(JSON.parse(line));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach the planner.');
    } finally {
      setLoading(false);
      if (TURNSTILE_SITE_KEY) {
        setTurnstileToken('');
        setTurnstileReset((n) => n + 1);
      }
    }
  }

  const fmt = (usd: number, b: Budget) =>
    b.displayCurrency !== 'USD' && b.fxRate
      ? `${Math.round(usd * b.fxRate).toLocaleString()} ${b.displayCurrency} ($${usd.toLocaleString()} USD)`
      : `$${usd.toLocaleString()} USD`;

  const canSubmit = !loading && !!startDate && !!originCity && !!originCountry && !!destCity && !!destCountry;

  const saveTripToCalendar = useCallback(() => {
    if (!result || !result.itinerary) return;
    try {
      const lines = result.itinerary.split('\n');
      const places: Array<{
        id: string;
        name: string;
        day: number;
        category: 'transit' | 'hotel' | 'restaurant' | 'explore' | 'other';
        lat: number;
        lng: number;
        description?: string;
        price?: string;
      }> = [];

      let currentDay = 1;
      const baseLat = destPin?.lat || 35.6762;
      const baseLng = destPin?.lng || 139.6503;

      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        const dayMatch = trimmed.match(/^Day\s+(\d+)/i);
        if (dayMatch) {
          currentDay = parseInt(dayMatch[1], 10);
          return;
        }

        const cardMatch = trimmed.match(/^\[(RESTAURANT|EXPLORE|HOTEL|OTHER)\]\s*(.+)$/);
        if (cardMatch) {
          const type = cardMatch[1].toLowerCase() as 'restaurant' | 'explore' | 'hotel' | 'other';
          const content = cardMatch[2];
          const nameMatch = content.match(/\{\{([^}]+)\}\}/);
          const name = nameMatch ? nameMatch[1] : content.split('—')[0].trim();
          const desc = content.replace(/\{\{[^}]+\}\}/g, '').replace(/^[—\-]\s*/, '').trim();
          const priceMatch = content.match(/\(([^)]*(?:¥|\$|€|£|฿|\d+\s*(?:THB|JPY|USD|EUR)|per person)[^)]*)\)/i) || content.match(/\(~\$?(\d+[^)]*)\)/);

          places.push({
            id: `p-${idx}`,
            name,
            day: currentDay,
            category: type,
            lat: baseLat + (Math.sin(idx * 1.5) * 0.028),
            lng: baseLng + (Math.cos(idx * 1.5) * 0.028),
            description: desc || undefined,
            price: priceMatch ? priceMatch[1] : undefined,
          });
          return;
        }

        const inlinePlaceMatch = trimmed.match(/\{\{([^}]+)\}\}/);
        if (inlinePlaceMatch) {
          const name = inlinePlaceMatch[1];
          if (!places.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
            places.push({
              id: `p-${idx}`,
              name,
              day: currentDay,
              category: 'explore',
              lat: baseLat + (Math.sin(idx * 1.5) * 0.028),
              lng: baseLng + (Math.cos(idx * 1.5) * 0.028),
              description: trimmed.replace(/\{\{[^}]+\}\}/g, name),
            });
          }
        }
      });

      const tripData = {
        id: `session-${Date.now()}`,
        title: `${destCity} Vacation Journey`,
        destination: destCity,
        country: destCountry,
        origin: `${originCity}, ${originCountry}`,
        startDate: startDate || '2026-11-11',
        startDDMMYY: isoToDDMMYY(startDate) || '11/11/26',
        nights: Number(nights) || 4,
        travelers: Number(travelers) || 1,
        style,
        budgetUSD: result.budget?.totalKnownUSD,
        places: places.length > 0 ? places : undefined,
      };

      localStorage.setItem('unsung_calendar_trip', JSON.stringify(tripData));

      // Append/update to separate sessions array (every time user presses "PLAN MY TRIP")
      try {
        const rawSessions = localStorage.getItem('unsung_calendar_sessions');
        const existingSessions = rawSessions ? JSON.parse(rawSessions) : [];
        const filtered = Array.isArray(existingSessions)
          ? existingSessions.filter((s: { destination?: string; startDate?: string }) => !(s.destination === destCity && s.startDate === startDate))
          : [];
        localStorage.setItem('unsung_calendar_sessions', JSON.stringify([tripData, ...filtered]));
      } catch (err) {
        console.warn('Failed saving to unsung_calendar_sessions:', err);
      }
    } catch (e) {
      console.warn('saveTripToCalendar error:', e);
    }
  }, [result, destCity, destCountry, originCity, originCountry, startDate, nights, travelers, style, destPin]);

  useEffect(() => {
    if (result?.itinerary) {
      saveTripToCalendar();
    }
  }, [result?.itinerary, saveTripToCalendar]);

  // Preset popular trip shortcuts
  const selectQuickTrip = (
    origC: string,
    origCountry: string,
    dstC: string,
    dstCountry: string,
    origCoords?: { lat: number; lng: number; code: string; tz: string },
    dstCoords?: { lat: number; lng: number; code: string; tz: string }
  ) => {
    setOriginCity(origC);
    setOriginCountry(origCountry);
    if (origCoords) {
      setOriginPin({
        name: origC,
        country: origCountry,
        countryCode: origCoords.code,
        lat: origCoords.lat,
        lng: origCoords.lng,
        timezone: origCoords.tz,
      });
    } else {
      setOriginPin(null);
    }
    setDestCity(dstC);
    setDestCountry(dstCountry);
    if (dstCoords) {
      setDestPin({
        name: dstC,
        country: dstCountry,
        countryCode: dstCoords.code,
        lat: dstCoords.lat,
        lng: dstCoords.lng,
        timezone: dstCoords.tz,
      });
    } else {
      setDestPin(null);
    }
  };

  return (
    <div className={`relative min-h-screen text-slate-800 overflow-x-hidden selection:bg-pink-300 selection:text-purple-900 transition-[padding] duration-300 ease-in-out ${sidebarOpen ? 'xl:pl-87.5' : 'pl-0'}`}>

      {/* ─── Section 1: Trip Planner & Hero (Background 1) ─── */}
      <section
        id="section-planner"
        className="snap-section relative w-full min-h-screen text-slate-800 pb-16 overflow-hidden flex flex-col justify-between selection:bg-pink-300 selection:text-purple-900 bg-cover bg-center bg-fixed"
        style={{ backgroundImage: "url('/1.jpg')" }}
      >
        {/* Retro Wireframe Grid at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-64 retro-grid-perspective opacity-40 pointer-events-none z-0" />

        {/* ─── Top Navbar ─── */}
        <Navbar />

        {/* ─── Main Content Container (Centered Vertically & Horizontally) ─── */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 py-4 w-full my-auto">

          {/* ─── Hero Section with Retro Styling ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-8">

            {/* Left Column: Retro Badge + Subtitle + Map */}
            <div className="lg:col-span-5 space-y-6 pt-2">

              {/* Logo (public)*/}
              <div className="relative">
                <Image
                  src="/logo.png"
                  alt="Unsung Planner logo"
                  width={100}
                  height={100}
                  priority
                  className="mb-3 w-55 h-auto"
                />
              </div>

              {/* Subtitle / Description */}
              <p className="text-slate-800 text-[16px] font-medium leading-relaxed max-w-sm">
                Flight, hotel prices, public holiday checks, and transportation prices.
                <br />
                <span className="text-bold text-pink-600 text-[17px]">*Note that some prices are estimated!*</span>
              </p>

              {/* Functional Leaflet Travel Map */}
              <div className="w-full my-2">
                <TravelMap origin={originPin} destination={destPin} height={258} />
              </div>
            </div>

            {/* Right Column: The Main Retro OS Window (`TravelPlanner `) */}
            <div className="lg:col-span-7 space-y-20">

              {/* ─── Window: TravelPlanner ─── */}
              <div className="retro-window rounded-sm overflow-hidden">

                {/* Window Title Bar */}
                <div className="retro-window-header px-3 py-2 flex items-center justify-between select-none">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[25px] tracking-wider text-slate-800 font-pixel uppercase">
                      PLAN YOUR TRIP
                    </span>
                  </div>

                </div>

                {/* Window Form Body */}
                <form onSubmit={handleSubmit} className="p-4 md:p-6 bg-[#f9fafb] space-y-1">

                  {/* Cities Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-3 border-2 border-slate-300 shadow-inner">
                    {/* Origin */}
                    <CityPicker
                      idPrefix="origin"
                      cityLabel="From"
                      cityPlaceholder="e.g. Bangkok"
                      countryPlaceholder="e.g. Thailand"
                      city={originCity}
                      country={originCountry}
                      pin={originPin}
                      onCityChange={setOriginCity}
                      onCountryChange={setOriginCountry}
                      onPin={setOriginPin}
                      onClearPin={() => setOriginPin(null)}
                    />

                    {/* Destination */}
                    <CityPicker
                      idPrefix="dest"
                      cityLabel="To"
                      cityPlaceholder="e.g. Tokyo"
                      countryPlaceholder="e.g. Japan"
                      icon="world"
                      city={destCity}
                      country={destCountry}
                      pin={destPin}
                      onCityChange={setDestCity}
                      onCountryChange={setDestCountry}
                      onPin={setDestPin}
                      onClearPin={() => setDestPin(null)}
                    />
                  </div>

                  {/* Dates, Nights, Travelers */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

                    {/* Start Date */}
                    <div className="space-y-1">
                      <label htmlFor="start-date" className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wide">
                        <span className="flex items-center gap-1.5">
                          <CalendarIcon className="h-3.5 w-3.5 text-black" /> Start Date
                        </span>

                      </label>
                      <div className="relative flex items-center">
                        <input
                          id="start-date"
                          type="text"
                          placeholder="DD/MM/YY"
                          className="w-full bg-white border-2 border-slate-500 border-r-slate-200 border-b-slate-200 p-2 pr-9 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-pink-500 shadow-[inset_2px_2px_3px_rgba(0,0,0,0.15)]"
                          value={dateDisplay}
                          onChange={(e) => {
                            setDateDisplay(e.target.value);
                            const parsedIso = ddmmyyToIso(e.target.value);
                            if (parsedIso) setStartDate(parsedIso);
                          }}
                          onBlur={() => {
                            const parsedIso = ddmmyyToIso(dateDisplay);
                            if (parsedIso) {
                              setStartDate(parsedIso);
                              setDateDisplay(isoToDDMMYY(parsedIso));
                            } else if (startDate) {
                              setDateDisplay(isoToDDMMYY(startDate));
                            }
                          }}
                          required
                        />
                        {/* Hidden native date input to provide calendar dropdown picker */}
                        <input
                          type="date"
                          ref={datePickerRef}
                          min={minDate}
                          value={startDate}
                          onChange={(e) => {
                            if (e.target.value) {
                              setStartDate(e.target.value);
                              setDateDisplay(isoToDDMMYY(e.target.value));
                            }
                          }}
                          className="sr-only"
                          tabIndex={-1}
                          aria-hidden="true"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              datePickerRef.current?.showPicker();
                            } catch {
                              datePickerRef.current?.focus();
                            }
                          }}
                          className="absolute right-2 p-1 text-black hover:text-slate-700 transition cursor-pointer"
                          title="Open Calendar Picker"
                        >
                          <CalendarIcon className="h-4 w-4 text-black" />
                        </button>
                      </div>
                    </div>

                    {/* Nights */}
                    <div className="space-y-1">
                      <label htmlFor="nights" className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
                        <MoonIcon className="h-3.5 w-3.5 text-black" /> Nights (1–14)
                      </label>
                      <input
                        id="nights"
                        type="number"
                        min={1}
                        max={14}
                        className="w-full bg-white border-2 border-slate-500 border-r-slate-200 border-b-slate-200 p-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-pink-500 shadow-[inset_2px_2px_3px_rgba(0,0,0,0.15)]"
                        value={nights}
                        onChange={(e) => setNights(e.target.value)}
                        required
                      />
                    </div>

                    {/* Travelers */}
                    <div className="space-y-1">
                      <label htmlFor="travelers" className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
                        <UsersIcon className="h-3.5 w-3.5 text-black" /> Travelers
                      </label>
                      <select
                        id="travelers"
                        className="w-full bg-white border-2 border-slate-500 border-r-slate-200 border-b-slate-200 p-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-pink-500 shadow-[inset_2px_2px_3px_rgba(0,0,0,0.15)]"
                        value={travelers}
                        onChange={(e) => setTravelers(e.target.value)}
                      >
                        <option value="1">1 adult</option>
                        <option value="2">2 adults</option>
                        <option value="3">3 adults</option>
                        <option value="4">4 adults</option>
                        <option value="5">5 adults</option>
                        <option value="6">6 adults</option>
                      </select>
                    </div>
                  </div>

                  {/* Budget Style, Traveling Theme, Transport Mode, Currency */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Budget Level */}
                    <div className="space-y-1">
                      <label htmlFor="budget-style" className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
                        <BanknotesIcon className="h-3.5 w-3.5 text-black" /> Budget Level
                      </label>
                      <select
                        id="budget-style"
                        className="w-full bg-white border-2 border-slate-500 border-r-slate-200 border-b-slate-200 p-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-pink-500 shadow-[inset_2px_2px_3px_rgba(0,0,0,0.15)]"
                        value={style}
                        onChange={(e) => setStyle(e.target.value)}
                      >
                        {BUDGET_STYLES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    {/* Traveling Theme */}
                    <div className="space-y-1">
                      <label htmlFor="travel-theme" className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
                        <PaintBrushIcon className="h-3.5 w-3.5 text-black" /> Style
                      </label>
                      <select
                        id="travel-theme"
                        className="w-full bg-white border-2 border-slate-500 border-r-slate-200 border-b-slate-200 p-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-pink-500 shadow-[inset_2px_2px_3px_rgba(0,0,0,0.15)]"
                        value={theme}
                        onChange={(e) => setTheme(e.target.value as TravelTheme)}
                      >
                        {TRAVEL_THEMES.map((t) => (
                          <option key={t} value={t}>
                            {t === 'Balanced' ? 'Balanced (All)' : t}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Transport Mode */}
                    <div className="space-y-1">
                      <label htmlFor="transport-mode" className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
                        <PaperAirplaneIcon className="h-3.5 w-3.5 text-black" /> Getting There
                      </label>
                      <select
                        id="transport-mode"
                        className="w-full bg-white border-2 border-slate-500 border-r-slate-200 border-b-slate-200 p-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-pink-500 shadow-[inset_2px_2px_3px_rgba(0,0,0,0.15)]"
                        value={mode}
                        onChange={(e) => setMode(e.target.value)}
                      >
                        <option value="fly">Fly</option>
                        <option value="drive">Drive (rental car)</option>
                        <option value="train">Train</option>
                      </select>
                    </div>

                    {/* Currency */}
                    <div className="space-y-1">
                      <label htmlFor="display-currency" className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
                        <CurrencyDollarIcon className="h-3.5 w-3.5 text-black" /> Currency
                      </label>
                      <select
                        id="display-currency"
                        className="w-full bg-white border-2 border-slate-500 border-r-slate-200 border-b-slate-200 p-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-pink-500 shadow-[inset_2px_2px_3px_rgba(0,0,0,0.15)]"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                      >
                        {DISPLAY_CURRENCIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Unsung Mode Toggle */}
                  <div className={`flex items-center gap-3 bg-white p-3 border-2 shadow-inner transition-colors ${unsungMode ? 'border-pink-500' : 'border-slate-300'}`}>
                    <button
                      id="unsung-toggle"
                      type="button"
                      aria-pressed={unsungMode}
                      onClick={() => setUnsungMode((v) => !v)}
                      className={`font-pixel text-sm font-bold px-3 py-1.5 border-2 shadow-[2px_2px_0px_rgba(0,0,0,0.4)] transition active:scale-[0.98] cursor-pointer shrink-0 ${unsungMode ? 'bg-linear-to-r from-pink-500 to-pink-600 text-white border-pink-700' : 'bg-slate-100 text-slate-500 border-slate-400'}`}
                    >
                      {unsungMode ? 'ON' : 'OFF'}
                    </button>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1">
                      </span>
                      <p className="text-18 text-zinc-900 truncate">
                        {unsungMode
                          ? 'On, digging up lesser-known hidden gems.'
                          : 'Off, plan the classic way. Turn on for hidden gem places searching.'}
                      </p>
                    </div>
                  </div>

                  {/* Turnstile Captcha Widget */}
                  <TurnstileWidget onToken={handleTurnstileToken} resetKey={turnstileReset} />

                  {/* Submit Action Button */}
                  <div className="pt-2">
                    <button
                      id="submit-btn"
                      type="submit"
                      disabled={!canSubmit}
                      className="w-full bg-zinc-900 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500 text-white retro-btn-accent font-pixel py-3.5 px-6 rounded-none flex items-center justify-center gap-2 text-xl font-bold tracking-wider disabled:opacity-50 disabled:cursor-not-allowed shadow-[3px_3px_0px_#09090b] transition active:scale-[0.99] cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span>PROCESSING TRIP PLANNER...</span>
                        </>
                      ) : (
                        <span>PLAN MY TRIP</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

          </div>

          {/* ─── Task Manager Progress (When Loading or Done) ─── */}
          {(loading || done.length > 0) && (
            <div className="retro-window mb-8">
              <div className="retro-window-header px-3 py-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-pixel text-xs font-bold text-slate-800">
                    {loading
                      ? (unsungMode ? 'Discovering Hidden Gems...' : 'Computing Graph Nodes...')
                      : (unsungMode ? 'Unsung Plan Complete' : 'Plan Completed')}
                  </span>
                </div>
                <div className="flex gap-1 text-xs">
                  <span>_</span>
                  <span>□</span>
                  <span>✕</span>
                </div>
              </div>
              <div className="p-4 bg-white space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs font-pixel">
                  {(() => {
                    // Unsung now goes through the same travelWorkflow — use same STEPS
                    const activeSteps = unsungMode ? UNSUNG_STEPS : STEPS;
                    return activeSteps.map((s) => {
                      const isFinished = done.includes(s.node) || (!loading && Boolean(result?.itinerary));
                      return (
                        <div
                          key={s.node}
                          className={`flex items-center gap-2 p-2 border ${isFinished ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                        >
                          {isFinished ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Circle className="h-4 w-4 text-slate-300 shrink-0" />
                          )}
                          <span className="font-bold">{s.label}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
                {loading && (
                  <div className="w-full bg-slate-200 h-2 overflow-hidden border border-slate-300">
                    <div className="bg-linear-to-r from-pink-500 to-cyan-500 h-full w-2/3 animate-pulse" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Alert Box */}
          {error && (
            <div className="retro-window mb-6 border-red-500 bg-red-50 p-4 flex items-center gap-3 text-red-900 text-sm font-bold">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          {/* Calendar Warnings */}
          {result?.warnings.map((w, idx) => (
            <div key={idx} className="retro-window mb-4 bg-amber-50 border-amber-400 p-4 flex gap-3 text-amber-900 text-sm">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="font-medium">{w}</div>
            </div>
          ))}
        </div>

        {/* If no results yet, show footer at bottom of section 1 */}
        {!result && (
          <footer className="relative z-10 max-w-6xl mx-auto px-4 mt-16 text-center text-xs font-pixel text-slate-700">
            <div className="bg-white/60 backdrop-blur-sm border border-white py-2 px-4 inline-block shadow-sm">
              <span className="text-[20px]"> UNSUNG PLANNER 2026 SREP9 NECTEC P&apos;9Meo Lab</span>
            </div>
          </footer>
        )}
      </section>

      {/* ─── Section 2: Budget Ledger (Background 2) ─── */}
      {result?.budget && (
        <section
          id="section-budget"
          className="snap-section relative w-full min-h-screen flex flex-col justify-center py-16 text-slate-800 border-t-4 border-slate-700/20 shadow-inner overflow-hidden selection:bg-pink-300 selection:text-purple-900 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: "url('/2.jpg')" }}
        >
          <div className="max-w-6xl mx-auto px-4">
            <div className="retro-window overflow-hidden">
              <div className="bg-linear-to-r from-emerald-200 via-teal-100 to-cyan-200 px-3 py-2 flex items-center justify-between border-b-2 border-slate-400">
                <div className="flex items-center gap-2 font-pixel text-xs font-bold text-slate-800">
                  <Banknote className="h-4 w-4 text-emerald-700" />
                  <span>Budget ({result.budget.travelers ?? travelers} traveler{Number(result.budget.travelers ?? travelers) > 1 ? 's' : ''})</span>
                </div>
                <div className="flex gap-1 text-xs">
                  <span>_</span>
                  <span>□</span>
                  <span>✕</span>
                </div>
              </div>

              <div className="p-4 md:p-6 bg-white space-y-4">
                <div className="flex items-baseline justify-between flex-wrap gap-2 pb-3 border-b-2 border-slate-200">
                  <div>
                    <h2 className="text-xl font-black font-pixel text-slate-800 tracking-wide">
                      ESTIMATED TOTAL BUDGET
                    </h2>
                    <p className="text-xs text-slate-500 font-pixel">Calculated by deterministic code</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-linear-to-r from-emerald-500 to-teal-600 text-white font-pixel font-bold text-2xl px-3 py-1 shadow-[2px_2px_0px_#064e3b]">
                      {fmt(result.budget.totalKnownUSD, result.budget)}
                    </span>
                    {!result.budget.complete && (
                      <div className="text-xs text-amber-600 font-bold mt-1 font-pixel">
                        ⚠ + missing unverified items
                      </div>
                    )}
                  </div>
                </div>

                {/* Budget Line Items Table */}
                <div className="overflow-x-auto border-2 border-slate-300">
                  <table className="w-full text-sm text-left border-collapse font-sans">
                    <thead className="bg-[#f0f2f5] text-xs font-pixel text-slate-700 uppercase border-b-2 border-slate-300">
                      <tr>
                        <th className="py-2.5 px-4 font-bold">Item Description</th>
                        <th className="py-2.5 px-4 text-right font-bold">Estimated Cost</th>
                        <th className="py-2.5 px-4 text-center font-bold">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {result.budget.lines.map((l) => (
                        <tr key={l.id} className="hover:bg-pink-50/50 transition">
                          <td className="py-2.5 px-4 font-medium text-slate-800">
                            <div>{l.label}</div>
                            {l.note && <div className="text-xs text-slate-500 mt-0.5">{l.note}</div>}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                            <div className="flex flex-col items-end gap-1">
                              {l.amountUSD == null ? (
                                (() => {
                                  const href = l.url ? safeHref(l.url) : undefined;
                                  return href ? (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 border border-amber-200 text-xs hover:bg-amber-100 transition"
                                    >
                                      No data Search ↗
                                    </a>
                                  ) : (
                                    <span className="text-amber-600 bg-amber-50 px-2 py-0.5 border border-amber-200 text-xs">
                                      No data
                                    </span>
                                  );
                                })()
                              ) : (
                                <span>{fmt(l.amountUSD, result.budget!)}</span>
                              )}
                              {/* Domain citation badge next to price */}
                              {(() => {
                                const href = l.url ? safeHref(l.url) : undefined;
                                if (!href || l.amountUSD == null) return null;
                                let domain = '';
                                try { domain = new URL(href).hostname.replace('www.', ''); } catch { return null; }
                                return (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-blue-600 hover:text-blue-800 underline decoration-dotted font-normal leading-none"
                                  >
                                    {domain} ↗
                                  </a>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-center text-xs">
                            {l.source === 'live' ? (
                              (() => {
                                const href = l.url ? safeHref(l.url) : undefined;
                                return href ? (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 border border-emerald-300 font-bold hover:bg-emerald-200 transition"
                                  >
                                    Live Rate ↗
                                  </a>
                                ) : (
                                  <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 border border-emerald-300 font-bold">
                                    Live Rate
                                  </span>
                                );
                              })()
                            ) : l.source === 'research' ? (
                              <span className="bg-cyan-100 text-cyan-800 px-2 py-0.5 border border-cyan-300">
                                Web Verified
                              </span>
                            ) : (
                              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 border border-slate-300">
                                Estimate
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {result.gaps.length > 0 && (
                  <div className="bg-amber-50 border border-amber-300 p-3 text-xs text-amber-900 space-y-1">
                    <div className="font-bold uppercase tracking-wider font-pixel">Data Notes:</div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {result.gaps.map((g, idx) => (
                        <li key={idx}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}


      {/* ─── Section 3: Itinerary & Sources (Parallax Background 3) ─── */}
      {result && (
        <section
          id="section-itinerary"
          className="snap-section relative w-full min-h-screen flex flex-col justify-between py-16 text-slate-800 border-t-4 border-slate-700/20 shadow-inner overflow-hidden selection:bg-pink-300 selection:text-purple-900 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: "url('/3.jpg')" }}
        >
          <div className="max-w-6xl mx-auto px-4 space-y-8">
            {/* Itinerary Window */}
            {result.itinerary && (
              <div className="retro-window overflow-hidden">
                <div className="retro-window-header px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-pixel text-xs font-bold text-slate-800">
                    <span>{unsungMode ? 'Itinerary' : 'Itinerary'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href="/calendar"
                      onClick={saveTripToCalendar}
                      className="retro-btn-accent text-[11px] font-pixel font-bold px-2.5 py-0.5 flex items-center gap-1 shadow-xs"
                      title="Open in 12-Grid Calendar & Route Map"
                    >
                      <Calendar className="h-3 w-3" />
                      <span>Calendar &amp; Map →</span>
                    </Link>
                    <div className="flex gap-1 text-xs">
                      <span>_</span>
                      <span>□</span>
                      <span>✕</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 md:p-6 bg-white space-y-4">
                  <ItineraryRenderer
                    text={result.itinerary}
                    sources={result.sources}
                    locationContext={destCity ? `${destCity}, ${destCountry}` : undefined}
                  />

                  <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-slate-500 font-pixel">
                      {unsungMode
                        ? '✓ Unsung plan with Google Maps citations. Verify for correctness of availability of places and prices yourself.'
                        : '✓ Plan with Google Maps citations. Verify for correctness of availability of places and prices yourself.'}
                    </span>
                    <Link
                      href="/calendar"
                      onClick={saveTripToCalendar}
                      className="retro-btn text-xs font-pixel font-bold py-1.5 px-3 text-pink-700 hover:bg-pink-50 flex items-center gap-1.5 transition border border-pink-300"
                    >
                      <Calendar className="h-3.5 w-3.5 text-pink-600" />
                      <span>View in Calendar &amp; Route Visualizer →</span>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Research Sources Window (`References.hlp`) */}
            {result.sources && result.sources.length > 0 && (
              <div className="retro-window overflow-hidden">
                <button
                  type="button"
                  className="w-full bg-[#f0f2f5] px-4 py-2.5 flex items-center justify-between text-xs font-bold font-pixel text-slate-700 hover:bg-pink-50 transition border-b border-slate-300"
                  onClick={() => setSourcesOpen((o) => !o)}
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-pink-500" />
                    Sources &amp; Verified Citations ({result.sources.length})
                  </span>
                  {sourcesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {sourcesOpen && (
                  <ul className="p-4 bg-white divide-y divide-slate-100 max-h-96 overflow-y-auto">
                    {result.sources.map((src, i) => {
                      const href = safeHref(src.url);
                      return (
                        <li key={i} className="py-3 space-y-1 text-xs">
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-bold text-pink-600 hover:text-purple-700 flex items-center gap-1.5 transition"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              {src.title}
                            </a>
                          ) : (
                            <span className="font-bold text-slate-800 flex items-center gap-1.5">
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              {src.title}
                            </span>
                          )}
                          <p className="text-slate-600">{src.snippet}</p>
                          <p className="text-slate-400 font-mono text-[10px] truncate">{src.url}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* Retro Footer Bar */}
            <footer className="relative z-10 max-w-6xl mx-auto px-4 mt-16 text-center text-xs font-pixel text-slate-700">
              <div className="bg-white/60 backdrop-blur-sm border border-white py-2 px-4 inline-block shadow-sm">
                <span className="text-[20px]"> UNSUNG PLANNER 2026 SREP9 NECTEC P&apos;9Meo Lab</span>
              </div>
            </footer>
          </div>
        </section>
      )}

      {/* Retro Floating Quick-Jump Section Navigator */}
      {result && (
        <div className="fixed right-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2 font-pixel">
          <button
            type="button"
            onClick={() => document.getElementById('section-planner')?.scrollIntoView({ behavior: 'smooth' })}
            title="Jump to Trip Planner"
            className="retro-btn-accent text-xs px-2.5 py-1.5 shadow-md hover:bg-zinc-800 transition flex items-center gap-1.5 font-bold cursor-pointer text-white"
          >
            <span>[1]</span> Plan
          </button>
          {result.budget && (
            <button
              type="button"
              onClick={() => document.getElementById('section-budget')?.scrollIntoView({ behavior: 'smooth' })}
              title="Jump to Budget Ledger"
              className="retro-btn-accent text-xs px-2.5 py-1.5 shadow-md hover:bg-zinc-800 transition flex items-center gap-1.5 font-bold cursor-pointer text-white"
            >
              <span>[2]</span> Budget
            </button>
          )}
          {(result.itinerary || (result.sources && result.sources.length > 0)) && (
            <button
              type="button"
              onClick={() => document.getElementById('section-itinerary')?.scrollIntoView({ behavior: 'smooth' })}
              title="Jump to Itinerary & Citations"
              className="retro-btn-accent text-xs px-2.5 py-1.5 shadow-md hover:bg-zinc-800 transition flex items-center gap-1.5 font-bold cursor-pointer text-white"
            >
              <span>[3]</span> Itinerary
            </button>
          )}
        </div>
      )}

      {/* Floating Retro Chatbot Assistant Sidebar */}
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen((prev) => !prev)} />

    </div>
  );
}