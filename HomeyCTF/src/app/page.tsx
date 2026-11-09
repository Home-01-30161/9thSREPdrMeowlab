'use client';

import dynamic from 'next/dynamic';

const App = dynamic(() => import('@/src/App'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-bg flex items-center justify-center text-gray-400">
      Loading Homy Shop...
    </div>
  ),
});

export default function Home() {
  return <App />;
}

