import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Refery. The recruiting partner network',
  description:
    'Introduce people you already know to roles at VC-backed companies, and earn when they are hired. Refery is where scouts and recruiting partners work.',
  generator: 'v0.app',
  // The installable app: manifest, icons and the iPhone home-screen flags.
  // Icons are the wordmark, generated once into public/icons.
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, title: 'Refery', statusBarStyle: 'default' },
  }

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F2F1EB',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className={`font-sans antialiased ${dmSans.variable}`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
        <SpeedInsights />
      </body>
    </html>
  )
}