/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    VITE_OPENCLAW_API_KEY: process.env.VITE_OPENCLAW_API_KEY || process.env.NEXT_PUBLIC_OPENCLAW_API_KEY || '',
    NEXT_PUBLIC_OPENCLAW_API_KEY: process.env.NEXT_PUBLIC_OPENCLAW_API_KEY || process.env.VITE_OPENCLAW_API_KEY || '',
  },
  async rewrites() {
    return [
      {
        source: '/api/openclaw/:path*',
        destination: 'http://localhost:18789/:path*',
      },
    ];
  },
};

export default nextConfig;

