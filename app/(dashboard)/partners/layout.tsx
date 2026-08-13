import { resolvePartnerAccess } from '@/lib/partners-access'
import { PreviewBanner } from '@/components/partners/preview-banner'

/**
 * A segment layout for one job: carrying the preview banner across every page
 * under /partners.
 *
 * Putting it here rather than in each page means the desk, a client, a search, a
 * brief and the requests queue all show it — including any page added later,
 * which is the failure this is guarding against. A banner that appears on four
 * pages out of five is worse than none, because the one that forgets is the one
 * that misleads.
 */
export default async function PartnersLayout({ children }: { children: React.ReactNode }) {
  const access = await resolvePartnerAccess()

  return (
    <>
      {access?.preview && <PreviewBanner preview={access.preview} />}
      {children}
    </>
  )
}
