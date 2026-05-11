import { Metadata } from 'next'
import { ClientAgreementSigningClient } from './client-agreement-signing-client'

export const metadata: Metadata = {
  title: 'Recruitment Services Agreement | Refery',
  description: 'Review and sign your Refery recruitment services agreement',
}

export const dynamic = 'force-dynamic'

export default async function ClientAgreementSigningPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <ClientAgreementSigningClient token={token} />
}
