import type { NextConfig } from 'next';

const CORS_HEADERS = [
  { key: 'Access-Control-Allow-Origin', value: '*' },
  { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
  { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Requested-With' },
  { key: 'Access-Control-Max-Age', value: '86400' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@lexware/client', '@lexware/db', '@lexware/crypto'],
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: CORS_HEADERS,
      },
    ];
  },
  webpack: (config: { resolve: { alias: Record<string, boolean> } }) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
