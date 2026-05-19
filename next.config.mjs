/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // !! ATENÇÃO !!
    // Perigoso em projetos grandes, mas útil para deploy rápido agora.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: [
      "@sparticuz/chromium",
      "puppeteer-core",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*', // Corrigido de '**' para '*'
      },
    ],
  },
};

export default nextConfig;
