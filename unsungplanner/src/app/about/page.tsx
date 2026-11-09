import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { Compass, Sparkles, MapPin, Banknote, ArrowLeft, Heart, CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About Us | Unsung Planner',
  description: 'Learn about the story and mission behind Unsung Planner.',
};

export default function AboutPage() {
  return (
    <div
      className="relative min-h-screen text-slate-800 bg-cover bg-center bg-fixed selection:bg-pink-300 selection:text-purple-900 pb-20"
      style={{ backgroundImage: "url('/1.jpg')" }}
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
                About Us
              </span>
            </div>
          </div>

          {/* Window Content */}
          <div className="p-6 md:p-8 bg-white flex-1 flex flex-col justify-between font-sans space-y-6">
            <div className="space-y-6">
              {/* Header Hero */}
              <div className="flex flex-col sm:flex-row items-center gap-5 pb-6 border-b border-slate-200 text-center sm:text-left">
                <div className="relative shrink-0">
                  <Image
                    src="/logo.png"
                    alt="Unsung Planner logo"
                    width={100}
                    height={100}
                    priority
                    className="w-24 h-auto mx-auto"
                  />
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-2xl md:text-3xl font-extrabold font-pixel text-slate-900 tracking-wide">
                    UNSUNG PLANNER
                  </h1>

                </div>
              </div>

              {/* Mission & Purpose */}
              <div className="about-content space-y-4 text-sm text-slate-700 leading-relaxed">
                <h3 className="font-bold text-base text-slate-900">
                  We make web applications for people who want to travel but don&apos;t know where to go and what to do.
                </h3>
                <p>
                  This is one of the projects in the NSTDA Summer Research Experience Program 2026 (Generation 9) .
                </p>
                <div className="pt-2">
                  <span className="font-pixel text-xs font-bold text-slate-900 block mb-2 uppercase">
                    Development Team:
                  </span>
                  <ul className="list-dev space-y-1 pl-1">
                    <li className="flex items-center gap-2">
                      <span>1. Pongchai "Home" Boonyawan: Fullstack Developer (Focus On Frontend)</span>
                    </li>

                    <li className="flex items-center gap-2">
                      <span>2. Phurin "JJ" Jitrhan: Fullstack Developer (Focus On Backend)</span>
                    </li>

                    <li className="flex items-center gap-2">
                      <span>3. Kanpitcha "Aongtong" Kongbantud: Data Research/Tester</span>
                    </li>

                    <li className="flex items-center gap-2">
                      <span>4. Teacher Sasiprapa "Jabb" Rinkaew: Data Research/Tester</span>
                    </li>

                    <li className="flex items-center gap-2">
                      <span>Dr. Sarawoot "Meo" Kongyoung: Advisor</span>
                    </li>


                  </ul>
                </div>
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
                href="/apis"
                className="retro-btn-accent px-4 py-2 flex items-center gap-1 font-bold shadow-xs transition"
              >
                <span>View Used APIs →</span>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
