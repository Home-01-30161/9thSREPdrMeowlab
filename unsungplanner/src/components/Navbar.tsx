'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, User } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

interface AuthUser {
  name: string;
  email: string;
  picture?: string;
  provider?: string;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setUser(data.user);
        else setUser(null);
      })
      .catch(() => setUser(null));
  }, [pathname]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    document.cookie = 'unsung_user=; path=/; max-age=0';
    setUser(null);
    router.refresh();
  };

  const links = [
    { href: '/', label: 'Home' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/about', label: 'About Us' },
    { href: '/apis', label: 'Used APIs' },
  ];

  return (
    <nav className="relative z-20 w-full max-w-6xl mx-auto px-4 pt-6">
      <div className="w-full flex flex-wrap items-center justify-between gap-4 py-2.5 px-6 bg-white/75 dark:bg-slate-900/70 backdrop-blur-md border border-white/80 dark:border-slate-600/40 rounded-full shadow-md">
        {/* Nav Links */}
        <div className="flex items-center gap-6 text-xs font-bold text-slate-800 tracking-wide font-pixel">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 text-[22px] transition ${
                  isActive
                    ? 'text-pink-600 font-extrabold underline decoration-2 decoration-pink-500 underline-offset-4'
                    : 'text-slate-800 hover:text-pink-600'
                }`}
              >
                {isActive && <span>***</span>}
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Right side: Theme toggle + User Session or Log In */}
        <div className="flex items-center gap-4 text-xs font-bold text-slate-800 tracking-wide font-pixel">
          <ThemeToggle />
          {user ? (
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="flex items-center gap-2 hover:text-pink-600 transition"
                title={`Logged in as ${user.email}`}
              >
                {user.picture ? (
                  <Image
                    src={user.picture}
                    alt={user.name}
                    width={26}
                    height={26}
                    className="w-6 h-6 rounded-full border border-pink-400"
                  />
                ) : (
                  <div className="w-6 h-6 bg-pink-600 text-white rounded-full flex items-center justify-center text-[10px]">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
                <span className="text-[20px] max-w-30 truncate">{user.name}</span>
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="retro-btn px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-1 cursor-pointer"
                title="Log Out"
              >
                <LogOut className="w-3 h-3" />
                <span>Exit</span>
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className={`gap-1.5 text-[22px] transition ${
                pathname === '/login'
                  ? 'text-pink-600 font-extrabold underline decoration-2 decoration-pink-500 underline-offset-4'
                  : 'text-slate-800 hover:text-pink-600'
              }`}
            >
              {pathname === '/login' && <span>***</span>}
              Log In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
