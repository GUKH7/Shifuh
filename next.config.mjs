/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: [
    "@sparticuz/chromium",
    "puppeteer-core",
  ],
  outputFileTracingIncludes: {
    "/api/integrations/ifood/public-link/import": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
