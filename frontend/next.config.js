/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  allowedDevOrigins: [
    'localhost:3000',
    '127.0.0.1:3000',
    '172.31.92.13',
    '172.31.92.13:3000',
    '10.55.162.185',
    '10.55.162.185:3000',
    '10.221.163.37',
    '10.221.163.37:3000',
  ],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
