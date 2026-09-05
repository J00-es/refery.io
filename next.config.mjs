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
}

export default nextConfig
