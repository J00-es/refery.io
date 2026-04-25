import { Metadata } from 'next'
import { AgreementSigningClient } from './agreement-signing-client'

export const metadata: Metadata = {
  title: 'Sign Agreement | Refery',
  description: 'Review and sign your Refery partner agreement',
}

export default async function AgreementSigningPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <AgreementSigningClient token={token} />
    </div>
  )
}
