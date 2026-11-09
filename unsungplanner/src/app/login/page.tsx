'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { KeyRound, Lock, ArrowLeft, Check, Sparkles, AlertCircle, LogOut, MessageSquare } from 'lucide-react';

interface AuthUser {
  id?: string;
  name: string;
  email: string;
  picture?: string;
  provider?: string;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setCurrentUser(data.user);
      })
      .catch(() => { });
  }, []);

  const handleGuestLogin = () => {
    const guestUser: AuthUser = {
      name: 'Guest Traveler',
      email: 'guest@unsungplanner.org',
      provider: 'guest',
    };
    document.cookie = `unsung_user=${encodeURIComponent(JSON.stringify(guestUser))}; path=/; max-age=2592000; SameSite=Lax`;
    setCurrentUser(guestUser);
    setMessage('Entering as Guest Traveler... Redirecting to Planner!');
    setTimeout(() => {
      router.push('/');
      router.refresh();
    }, 800);
  };

  const handleDemoGoogleLogin = () => {
    const demoGoogle: AuthUser = {
      name: 'Google Explorer',
      email: 'explorer@gmail.com',
      picture: 'https://lh3.googleusercontent.com/a/default-user',
      provider: 'google',
    };
    document.cookie = `unsung_user=${encodeURIComponent(JSON.stringify(demoGoogle))}; path=/; max-age=2592000; SameSite=Lax`;
    setMessage('Signed in with Google Account (Demo)... Redirecting!');
    setTimeout(() => {
      router.push('/');
      router.refresh();
    }, 800);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    document.cookie = 'unsung_user=; path=/; max-age=0';
    setCurrentUser(null);
    setMessage('Logged out successfully.');
    router.refresh();
  };

  return (
    <div className="p-6 md:p-8 bg-[#f9fafb] space-y-6 font-sans">
      {/* Banner */}
      <div className="flex items-center gap-4 pb-4 border-b-2 border-slate-300">

        <div>
          <h1 className="font-pixel font-bold text-xl text-slate-900 tracking-wide">
            Log in to save your chats + use AI.
          </h1>

        </div>
      </div>

      {/* Already Logged In State */}
      {currentUser && (
        <div className="p-4 bg-emerald-50 border-2 border-emerald-400 space-y-3 font-sans">
          <div className="flex items-center gap-3">
            {currentUser.picture ? (
              <Image
                src={currentUser.picture}
                alt={currentUser.name}
                width={40}
                height={40}
                className="w-10 h-10 rounded-full border-2 border-emerald-500"
              />
            ) : (
              <div className="w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-bold text-sm text-emerald-950 font-pixel flex items-center gap-2">
                <span>Logged in as {currentUser.name}</span>
                {currentUser.provider === 'google' ? (
                  <span className="text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.2 border border-emerald-400">
                    Google Verified ✓
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 border border-slate-300">
                    Guest Mode
                  </span>
                )}
              </div>
              <div className="text-xs text-emerald-700 font-mono">{currentUser.email}</div>
            </div>
          </div>

          {currentUser.provider !== 'google' && currentUser.provider !== 'guest' && (
            <div className="p-2.5 bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-amber-600 shrink-0" />
              <span>To use the AI Chatbot assistant, please sign in with Google.</span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Link
              href="/"
              className="flex-1 retro-btn-accent font-pixel py-2 px-3 text-center text-sm font-bold shadow-sm"
            >
              Go to Planner →
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="retro-btn font-pixel py-2 px-3 text-xs text-red-700 hover:bg-red-50 flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              Log Out
            </button>
          </div>
        </div>
      )}

      {/* Missing Credentials Alert Box */}
      {errorParam === 'missing_credentials' && !currentUser && (
        <div className="p-4 bg-amber-50 border-2 border-amber-400 text-amber-950 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold font-pixel text-sm text-amber-900">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <span>Google OAuth Setup Notice</span>
          </div>
          <p className="leading-relaxed">
            To enable live Google OAuth in production, set <code className="bg-amber-100 px-1 py-0.5 border border-amber-300 font-mono">GOOGLE_CLIENT_ID</code> and <code className="bg-amber-100 px-1 py-0.5 border border-amber-300 font-mono">GOOGLE_CLIENT_SECRET</code> in your <code className="font-mono">.env.local</code>.
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={handleDemoGoogleLogin}
              className="retro-btn font-pixel text-xs px-3 py-1.5 font-bold text-emerald-800 bg-emerald-100 border-emerald-300 hover:bg-emerald-200 transition cursor-pointer"
            >
              ★ Use Instant Google Demo Login ★
            </button>
          </div>
        </div>
      )}

      {/* Notification message */}
      {message && (
        <div className="p-3 bg-emerald-50 border-2 border-emerald-400 text-emerald-900 text-xs font-bold font-pixel flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Main Authentication Choices */}
      {(!currentUser || currentUser.provider !== 'google') && (
        <div className="space-y-4 pt-1">
          {/* Primary Action: Google Sign-In */}
          <div className="space-y-2">
            <a
              href="/api/auth/google"
              className="w-full bg-white hover:bg-slate-50 text-slate-900 border-2 border-slate-700 border-r-slate-400 border-b-slate-400 py-3.5 px-4 font-bold font-pixel text-base flex items-center justify-center gap-3 shadow-[3px_3px_0px_#1e1b4b] active:translate-x-px active:translate-y-px transition cursor-pointer"
            >
              {/* Google Colored "G" Logo */}
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>CONTINUE WITH GOOGLE</span>
            </a>
          </div>

          {/* TEST ONLY: Sign In as Guest (delete after testing) */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleGuestLogin}
              className="w-full retro-btn font-pixel py-3 px-4 flex items-center justify-center gap-2 text-sm text-slate-800 font-bold hover:bg-slate-100 cursor-pointer shadow-sm transition"
            >
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span>Continue as Guest (Test)</span>
            </button>
            <p className="text-[11px] text-center text-slate-400 font-pixel mt-1">
              Temporary test option • Sign in as guest without Google OAuth
            </p>
          </div>
          {/* END TEST ONLY */}
        </div>
      )}


    </div>
  );
}

export default function LoginPage() {
  return (
    <div
      className="relative min-h-screen text-slate-800 bg-cover bg-center bg-fixed selection:bg-pink-300 selection:text-purple-900 pb-20"
      style={{ backgroundImage: "url('/3.jpg')" }}
    >
      {/* Retro Wireframe Grid at bottom */}
      <div className="fixed bottom-0 left-0 right-0 h-64 retro-grid-perspective opacity-40 pointer-events-none z-0" />

      {/* Top Navbar */}
      <Navbar />

      {/* Main Container */}
      <main className="relative z-10 max-w-lg mx-auto px-4 pt-16">
        <div className="retro-window rounded-sm overflow-hidden shadow-2xl">
          {/* Window Header */}
          <div className="retro-window-header px-4 py-2.5 flex items-center justify-between select-none">
            <div className="flex items-center gap-2">
              <span className="font-pixel font-bold text-lg text-slate-900 tracking-wider">
                Log In
              </span>
            </div>

          </div>

          {/* Window Body with Suspense for useSearchParams */}
          <Suspense fallback={<div className="p-8 text-center font-pixel">LOADING AUTH MODULE...</div>}>
            <LoginForm />
          </Suspense>
        </div>

        {/* Retro Footer */}
        <footer className="mt-12 text-center text-xs font-pixel text-slate-700">
          <div className="bg-white/60 backdrop-blur-sm border border-white py-2 px-4 inline-block shadow-sm">
            <span className="text-[18px]">UNSUNG PLANNER 2026 SREP9 NECTEC P&apos;9Meo Lab</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
