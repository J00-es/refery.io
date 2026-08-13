import type { Metadata } from 'next'
import HomeClient from './HomeClient'
import { faqItems } from './home-faq'

export const metadata: Metadata = {
  title: 'Refery — Referral Hiring for VC-Backed Startups',
  description:
    "The talent who builds trillion-dollar companies doesn't come from job boards. They come from intros — by billion-dollar founders, public-company CTOs, and top-tier fund partners. Refery is the infrastructure.",
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
