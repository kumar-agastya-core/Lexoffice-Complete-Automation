import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@lexware/client', '@lexware/db', '@lexware/crypto'],
};

export default nextConfig;
