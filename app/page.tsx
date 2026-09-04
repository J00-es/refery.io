import type { Metadata } from 'next'
import HomeClient from './HomeClient'
import { faqItems } from './home-faq'

export const metadata: Metadata = {
  title: 'Refery — Earn From the People You Already Know',
  description:
    'Refery is where scouts and independent recruiters introduce people they would vouch for. We bring the clients, the contracts and the guarantee. You bring the person, and keep 70% of the fee.',
}

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.a,
    },
  })),
}

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <HomeClient />
    </>
  )
}
