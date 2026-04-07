/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@tbdff/shared'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/:path*`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:5000'}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
