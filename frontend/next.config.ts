import type { NextConfig } from "next";

const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
const localBackendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  // Em ambiente local, redireciona rotas de API para o FastAPI local (porta 8000).
  // Na Vercel, o roteamento unificado do vercel.json direciona /api/* para api/index.py.
  async rewrites() {
    if (isVercel) {
      return [];
    }
    return [
      {
        source: "/api/strava/:path*",
        destination: `${localBackendUrl}/api/strava/:path*`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${localBackendUrl}/api/v1/:path*`,
      },
      {
        source: "/api/triage/:path*",
        destination: `${localBackendUrl}/api/triage/:path*`,
      },
      {
        source: "/health",
        destination: `${localBackendUrl}/health`,
      },
      {
        source: "/api/backend/:path*",
        destination: `${localBackendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
