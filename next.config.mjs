/** @type {import('next').NextConfig} */
const nextConfig = {
  serverComponentsExternalPackages: ['better-sqlite3'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
