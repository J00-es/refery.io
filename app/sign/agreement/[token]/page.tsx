import { Metadata } from 'next'
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

  return <AgreementSigningClient token={token} />
}