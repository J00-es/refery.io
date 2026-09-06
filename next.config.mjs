/** @type {import('next').NextConfig} */
const nextConfig = {
  // The recap drafter reads the skill file at runtime so the copy has exactly
  // one home. Serverless tracing does not follow a readFileSync path, so the
  // file has to be named here or it is missing in production.
  outputFileTracingIncludes: {
    '/api/cron/call-recaps': ['./.claude/skills/recap-email/SKILL.md'],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
  // The desk moved from /partners to /searches to match its nav label. Every
  // brief and proposal email sent before that carries the old path.
  async redirects() {
    return [
      { source: '/partners', destination: '/searches', permanent: true },
      { source: '/partners/:path*', destination: '/searches/:path*', permanent: true },
      // The candidate-brief review queue was retired on 6 Sep 2026; the client
      // briefs on the desk replaced it. Old bookmarks land on Searches.
      { source: '/briefs', destination: '/searches', permanent: true },
    ]
  },
}

export default nextConfig
