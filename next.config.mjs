import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */

function getSupabaseImageHostname() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) return null;

  try {
    return new URL(supabaseUrl).hostname;
  } catch {
    return null;
  }
}

const supabaseImageHostname = getSupabaseImageHostname();

const remotePatterns = [
  {
    protocol: "https",
    hostname: "static-images.ifood.com.br",
  },
  ...(supabaseImageHostname
    ? [
        {
          protocol: "https",
          hostname: supabaseImageHostname,
        },
      ]
    : []),
];

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
    remotePatterns,
  },
};

const sentryBuildConfigured = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT,
);

export default sentryBuildConfigured
  ? withSentryConfig(nextConfig, {
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
    })
  : nextConfig;
