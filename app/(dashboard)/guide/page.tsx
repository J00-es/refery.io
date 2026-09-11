import type { Metadata } from 'next'
import { getAppUser } from '@/lib/current-user'
import { GuideClient } from '@/components/guide/guide-client'
import { GUIDE_LAUNCHES, GUIDE_PATHS, GUIDE_SECTIONS } from '@/lib/guide/topics'

export const metadata: Metadata = { title: 'The guide' }

/**
 * Every partner-facing feature, per topic, with a search box. Partners and
 * scouts only see what they can touch; nothing here describes the desk or
 * the admin pages. Content lives in lib/guide/topics.tsx; the mock-ups are
 * React replicas of the live screens with fictional people.
 */
export default async function GuidePage() {
  const user = await getAppUser()
  const first = (user?.fullName ?? '').trim().split(/\s+/)[0] || ''
  return <GuideClient sections={GUIDE_SECTIONS} launches={GUIDE_LAUNCHES} paths={GUIDE_PATHS} viewerFirst={first} />
}
