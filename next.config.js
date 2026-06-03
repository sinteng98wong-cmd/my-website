/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "pdfmake"],
  },
  // Exclude the Expo mobile app from Next.js compilation
  webpack(config) {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: /mobile\//,
    };
    return config;
  },
};

module.exports = nextConfig;
