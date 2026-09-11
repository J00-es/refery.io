import type { MetadataRoute } from 'next'

/**
 * Served at /manifest.webmanifest. This is what makes "Add to Home Screen"
 * open Refery full screen with its own icon, on iPhone and Android alike.
 * Icons are generated from the wordmark in public/icons; the maskable one has
 * extra cream around it so Android's shapes never clip the word.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Refery',
    short_name: 'Refery',
    description: 'You refer the person. We do the rest.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F2F1EB',
    theme_color: '#F2F1EB',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
