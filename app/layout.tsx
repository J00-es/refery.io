import type { Metadata } from 'next'
import { Geist, Geist_Mono, DM_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
})
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Refery.io - Partner Recruiter Network',
  description: 'Refer great talent, earn while you sleep. Partner with Refery.io to monetize your network with 200+ VC-backed companies.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: 'https://www.image2url.com/r2/default/images/1776207806088-a62cc7c1-74f2-41ec-8023-5408563cf26e.png',
      },
    ],
    apple: 'https://www.image2url.com/r2/default/images/1776207806088-a62cc7c1-74f2-41ec-8023-5408563cf26e.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`font-sans antialiased ${geist.variable} ${geistMono.variable} ${dmSans.variable}`}
      >
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
        <SpeedInsights />
      </body>
    </html>
  )
}
