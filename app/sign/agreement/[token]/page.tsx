import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import { AgreementSigningClient } from './agreement-signing-client'

export const metadata: Metadata = {
  title: 'Sign Agreement | Refery',
  description: 'Review and sign your Refery partner agreement',
}

// Force dynamic rendering - never cache this page
export const dynamic = 'force-dynamic'

export default async function AgreementSigningPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Use admin client to bypass RLS for public access
  const adminClient = createAdminClient()

  // Verify the agreement link exists
  const { data: link, error: linkError } = await adminClient
    .from('agreement_links')
    .select('id, status, expires_at')
    .eq('token', token)
    .single()

  if (linkError || !link) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Invalid Agreement Link</h2>
          <p className="text-muted-foreground">
            This agreement link is invalid. Please contact your administrator for a new link.
          </p>
        </div>
      </div>
    )
  }

  // Check if already signed
  if (link.status === 'signed') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Agreement Already Signed</h2>
          <p className="text-muted-foreground">This agreement has already been signed. Thank you!</p>
        </div>
      </div>
    )
  }

  // Check if revoked
  if (link.status === 'revoked') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Agreement Link Revoked</h2>
          <p className="text-muted-foreground">
            This agreement link has been revoked. Please contact your administrator for a new link.
          </p>
        </div>
      </div>
    )
  }

  // Check if expired
  if (new Date(link.expires_at) < new Date()) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Agreement Link Expired</h2>
          <p className="text-muted-foreground">
            This agreement link has expired. Please contact your administrator for a new link.
          </p>
        </div>
      </div>
    )
  }

  // Render the signing client - publicly accessible via secret token
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <AgreementSigningClient token={token} />
    </div>
  )
}
