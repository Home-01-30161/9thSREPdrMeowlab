import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { Server, ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Used APIs | Unsung Planner',
  description: 'Connected services and APIs that power Unsung Planner.',
};

export default function ApisPage() {
  return (
    <div
      className="relative min-h-screen text-slate-800 bg-cover bg-center bg-fixed selection:bg-pink-300 selection:text-purple-900 pb-20"
      style={{ backgroundImage: "url('/2.jpg')" }}
    >
      {/* Retro Wireframe Grid at bottom */}
      <div className="fixed bottom-0 left-0 right-0 h-64 retro-grid-perspective opacity-40 pointer-events-none z-0" />

      {/* Top Navbar */}
      <Navbar />

      {/* Main Container */}
      <main className="relative z-10 max-w-3xl mx-auto px-4 pt-10 pb-16">
        <div className="retro-window rounded-sm overflow-hidden shadow-2xl min-h-145 md:min-h-160 flex flex-col">
          {/* Window Header */}
          <div className="retro-window-header px-4 py-2.5 flex items-center justify-between select-none">
            <div className="flex items-center gap-2">
              <span className="font-pixel font-bold text-lg text-slate-900 tracking-wider">
                Used APIs
              </span>
            </div>
          </div>

          {/* Window Content */}
          <div className="p-6 md:p-8 bg-white flex-1 flex flex-col justify-between space-y-6 font-sans">
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold font-pixel text-slate-900 tracking-wide">
                  CONNECTED SERVICES &amp; APIS
                </h1>

              </div>

              <div className="api-name">
                <ul className="list-disc list-inside space-y-3.5 text-sm text-slate-700 leading-relaxed pl-1">
                  <li><strong>Google Flights (SerpAPI):</strong> Searches real flight prices, airlines, and route options.</li>
                  <li><strong>Google Hotels (SerpAPI):</strong> Finds verified hotel rates and ratings for your destination.</li>
                  <li><strong>OpenRouteService (ORS):</strong> Calculates driving distances and road travel estimates.</li>
                  <li><strong>Tavily Search:</strong> Gathers ticket prices, restaurant costs, and local spot details.</li>
                  <li><strong>ExchangeRate API:</strong> Converts prices accurately between USD, THB, JPY, EUR, and more.</li>
                  <li><strong>Nager.Date:</strong> Detects public holidays during your trip to avoid unexpected closures.</li>
                </ul>
              </div>
            </div>

            {/* Navigation Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 font-pixel text-xs mt-auto">
              <Link
                href="/"
                className="retro-btn px-4 py-2 flex items-center gap-1.5 text-slate-700 hover:text-pink-600 transition"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Home</span>
              </Link>
              <Link
                href="/about"
                className="retro-btn-accent px-4 py-2 flex items-center gap-1 font-bold shadow-xs transition"
              >
                <span>About Us →</span>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
