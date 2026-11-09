import { tavily } from "@tavily/core";
import { cached } from "../cache";
import { isHttpUrl } from "../security";
import type { TravelTheme } from "../types";

export interface ResearchSource {
    title: string;
    url: string;
    snippet: string;
}

export interface DestinationResearch {
    /** Plain-text notes for the LLM prompt (untrusted web content). */
    notes: string;
    /** Structured sources for display in the UI with clickable links. */
    sources: ResearchSource[];
}

function client() {
    const apiKey = process.env.TAVILY_API_KEY;
    return apiKey ? tavily({ apiKey }) : null;
}

interface GoogleLocalPlace {
    title: string;
    price?: string;
    rating?: number;
    type?: string;
    address?: string;
}

async function fetchGoogleLocalPlaces(query: string, apiKey: string): Promise<GoogleLocalPlace[]> {
    try {
        const url = `https://serpapi.com/search.json?engine=google_local&q=${encodeURIComponent(query)}&api_key=${apiKey}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.local_results || []).slice(0, 6).map((r: any) => ({
            title: r.title,
            price: r.price,
            rating: r.rating,
            type: r.type,
            address: r.address,
        }));
    } catch {
        return [];
    }
}

/**
 * Returns attraction, restaurant, and hotel snippets plus their source URLs.
 * Integrates live Google Maps (via SerpAPI Google Local) for verified pricing & ratings
 * alongside Tavily AI search.
 * UNTRUSTED web text: only ever pass `notes` to the LLM as quoted data.
 */
export async function researchDestination(
    city: string,
    country: string,
    theme: TravelTheme = "Balanced"
): Promise<DestinationResearch | null> {
    return researchDestinationCore(city, country, false, theme);
}

/**
 * Unsung variant: searches for hidden gems, lesser-known spots, and local restaurants
 * rather than mainstream tourist attractions.
 */
export async function researchDestinationUnsung(
    city: string,
    country: string,
    theme: TravelTheme = "Balanced"
): Promise<DestinationResearch | null> {
    return researchDestinationCore(city, country, true, theme);
}

async function researchDestinationCore(
    city: string,
    country: string,
    unsung: boolean,
    theme: TravelTheme = "Balanced"
): Promise<DestinationResearch | null> {
    const tvly = client();
    const serpApiKey = process.env.SERPAPI_KEY;
    if (!tvly && !serpApiKey) return null;

    const query = `${city}, ${country}`;
    const cacheKey = unsung ? `research_unsung_v3:${theme}:${query}` : `research_v5:${theme}:${query}`;
    return cached<DestinationResearch>(cacheKey, 7 * 86_400, async () => {
        try {
            // Theme-aware search queries
            let attractionQuery = "";
            let tavilyAttractionQuery = "";

            if (theme === "History") {
                attractionQuery = unsung
                    ? `hidden historic sites ruins old quarters local heritage ${query}`
                    : `top historic sites ancient temples heritage museums in ${query}`;
                tavilyAttractionQuery = unsung
                    ? `secret historic sites ancient ruins lesser-known heritage ${query}`
                    : `best historic places monuments temples and museums in ${query}`;
            } else if (theme === "Nature") {
                attractionQuery = unsung
                    ? `hidden nature spots secret hiking trails waterfalls viewpoints ${query}`
                    : `nature parks scenic viewpoints hiking trails botanical gardens in ${query}`;
                tavilyAttractionQuery = unsung
                    ? `lesser-known nature preserves scenic viewpoints secret trails ${query}`
                    : `top nature attractions parks scenic landscapes outdoor activities ${query}`;
            } else if (theme === "Modern") {
                attractionQuery = unsung
                    ? `indie modern architecture design districts hidden rooftop contemporary spots ${query}`
                    : `modern architecture futuristic attractions contemporary art shopping towers in ${query}`;
                tavilyAttractionQuery = unsung
                    ? `indie design districts contemporary art spaces modern underground spots ${query}`
                    : `top modern attractions contemporary museums skylines entertainment centers ${query}`;
            } else {
                // Balanced (Default)
                attractionQuery = unsung
                    ? `hidden gems off beaten path local secrets ${query}`
                    : `top tourist attractions in ${query}`;
                tavilyAttractionQuery = unsung
                    ? `hidden gems lesser-known attractions local secrets ${query}`
                    : `top tourist attractions and entrance fees ${query}`;
            }

            const restaurantQuery = unsung
                ? `local authentic food hole-in-the-wall restaurants ${query}`
                : `popular food restaurants in ${query}`;

            const hotelQuery = unsung
                ? `boutique local hotels guesthouses in ${query}`
                : `hotels in ${query}`;

            // Run Google Local searches and Tavily searches in parallel
            const [localRestaurants, localAttractions, localHotels, tavilyAttractions, tavilyRestaurants, tavilyHotels] = await Promise.all([
                serpApiKey ? fetchGoogleLocalPlaces(restaurantQuery, serpApiKey) : Promise.resolve([]),
                serpApiKey ? fetchGoogleLocalPlaces(attractionQuery, serpApiKey) : Promise.resolve([]),
                serpApiKey ? fetchGoogleLocalPlaces(hotelQuery, serpApiKey) : Promise.resolve([]),
                tvly ? tvly.search(tavilyAttractionQuery, { maxResults: 3 }) : Promise.resolve({ results: [] }),
                tvly ? tvly.search(unsung
                    ? `local authentic restaurants hole-in-the-wall food ${query} with prices`
                    : `best restaurants to eat in ${query} with prices`, { maxResults: 3 }) : Promise.resolve({ results: [] }),
                tvly ? tvly.search(`recommended hotels in ${query} price per night`, { maxResults: 2 }) : Promise.resolve({ results: [] }),
            ]);

            const tavilyResults = [
                ...tavilyAttractions.results.map((r) => ({ ...r, tag: "attraction" })),
                ...tavilyRestaurants.results.map((r) => ({ ...r, tag: "restaurant" })),
                ...tavilyHotels.results.map((r) => ({ ...r, tag: "hotel" })),
            ];

            const sources: ResearchSource[] = [];
            const seenTitles = new Set<string>();
            const seenUrls = new Set<string>();

            // Add verified Google Local / Google Maps places first (deduplicated by title)
            for (const p of [...localRestaurants, ...localAttractions, ...localHotels]) {
                const normTitle = p.title.trim().toLowerCase();
                if (seenTitles.has(normTitle)) continue;
                seenTitles.add(normTitle);

                const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.title} ${city}`)}`;
                const priceInfo = p.price ? ` · Google Maps Price: ${p.price}` : "";
                const ratingInfo = p.rating ? ` · ${p.rating}★` : "";
                sources.push({
                    title: `${p.title} (${p.type || "Spot"}${priceInfo}${ratingInfo})`,
                    url: mapUrl,
                    snippet: `Verified Google Maps listing for ${p.title} in ${city}. Type: ${p.type || "Venue"}.${p.price ? ` Price range: ${p.price}.` : ""}${p.rating ? ` Rating: ${p.rating}/5.` : ""}${p.address ? ` Address: ${p.address}.` : ""}`,
                });
            }

            // Append Tavily web sources (deduplicated by URL and title)
            for (const r of tavilyResults) {
                if (isHttpUrl(r.url)) {
                    const normUrl = r.url.toLowerCase();
                    const normTitle = r.title.trim().toLowerCase();
                    if (seenUrls.has(normUrl) || seenTitles.has(normTitle)) continue;
                    seenUrls.add(normUrl);
                    seenTitles.add(normTitle);

                    sources.push({
                        title: r.title,
                        url: r.url,
                        snippet: r.content.slice(0, 280),
                    });
                }
            }

            if (!sources.length) return null;

            const noteParts: string[] = [];

            // Verified Google Maps notes with explicit price tags
            if (localRestaurants.length) {
                noteParts.push(unsung ? "VERIFIED LOCAL RESTAURANTS (AUTHENTIC, OFF-THE-BEATEN-PATH):" : "VERIFIED GOOGLE MAPS RESTAURANTS & PRICES:");
                for (const r of localRestaurants) {
                    noteParts.push(`- ${r.title}: ${r.type || "Restaurant"}, Rating: ${r.rating || "?"}★, Google Maps Price: ${r.price || "moderate (check locally)"} (${r.address || city})`);
                }
            }

            if (localAttractions.length) {
                noteParts.push(unsung ? "VERIFIED HIDDEN GEMS & LESSER-KNOWN SPOTS:" : "VERIFIED GOOGLE MAPS ATTRACTIONS:");
                for (const a of localAttractions) {
                    noteParts.push(`- ${a.title}: ${a.type || "Attraction"}, Rating: ${a.rating || "?"}★ (${a.address || city})`);
                }
            }

            if (localHotels.length) {
                noteParts.push(unsung ? "VERIFIED LOCAL ACCOMMODATIONS (BOUTIQUE / GUESTHOUSES):" : "VERIFIED GOOGLE MAPS HOTELS:");
                for (const h of localHotels) {
                    noteParts.push(`- ${h.title}: ${h.type || "Hotel"}, Rating: ${h.rating || "?"}★, Google Maps Price: ${h.price || "check locally"} (${h.address || city})`);
                }
            }

            // Web snippets
            if (tavilyResults.length) {
                noteParts.push("WEB RESEARCH NOTES:");
                for (const r of tavilyResults) {
                    noteParts.push(`[${r.tag.toUpperCase()}] ${r.title}: ${r.content.slice(0, 300)}`);
                }
            }

            return {
                notes: noteParts.join("\n"),
                sources,
            };
        } catch {
            return null;
        }
    });
}

/**
 * Tries to read a fuel price (local currency/litre) from search snippets.
 * Returns null when Tavily is unavailable or no plausible value is found.
 */
export async function researchFuelPrice(city: string, country: string): Promise<number | null> {
    const tvly = client();
    if (!tvly) return null;
    return cached<number>(`fuel:${country}`, 24 * 3600, async () => {
        try {
            const res = await tvly.search(`petrol gasoline price per litre today ${country}`, { maxResults: 5 });
            const text = res.results.map((r) => r.content).join(" ");
            const prices = [...text.matchAll(/(\d{1,3}(?:\.\d{1,3})?)\s*(?:per\s*litre|\/l\b)/gi)]
                .map((m) => Number(m[1]))
                .filter((n) => n > 0.2 && n < 5000)
                .sort((a, b) => a - b);
            return prices.length ? prices[Math.floor(prices.length / 2)] : null;
        } catch {
            return null;
        }
    });
}