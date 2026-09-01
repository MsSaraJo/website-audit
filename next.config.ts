import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  basePath: '/website-audit',
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  outputFileTracingIncludes: {
    '/api/**/*': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
};

export default nextConfig;
