'use client'

/**
 * The one card that turns the website into the app.
 *
 * Mounted once in the dashboard layout. On a phone browser it offers to add
 * Refery to the home screen (one tap on Android, Share then Add to Home
 * Screen on iPhone). Once the app runs from the home screen it offers to
 * turn on notifications, and from then on quietly keeps this device's push
 * subscription registered. Desktop browsers see nothing.
 *
 * "Not now" snoozes the card for a month. Nothing here ever blocks the page.
 */

import { useCallback, useEffect, useState } from 'react'

type Mode = 'hidden' | 'install-android' | 'install-ios' | 'notifications'

const SNOOZE_KEY = 'refery.pwa.snoozed_at'
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function isPhone(): boolean {
  return window.matchMedia('(max-width: 767px)').matches && window.matchMedia('(pointer: coarse)').matches
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream
}

function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY) || 0)
    return at > 0 && Date.now() - at < SNOOZE_MS
  } catch {
    return false
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()))
  } catch {
    /* private mode: the card simply comes back next visit */
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

/** Registers the worker once; safe to call on every mount. */
async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

/** Makes sure this device has a subscription and the server knows it. */
async function syncSubscription(): Promise<boolean> {
  try {
    const reg = await registerWorker()
    if (!reg || !('pushManager' in reg)) return false
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const res = await fetch('/api/push/vapid')
      if (!res.ok) return false
      const { publicKey } = (await res.json()) as { publicKey: string }
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource })
    }
    const saved = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
    })
    return saved.ok
  } catch {
    return false
  }
}

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>('hidden')
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    void registerWorker()

    if (isStandalone()) {
      if (!('Notification' in window) || !('PushManager' in window)) return
      if (Notification.permission === 'granted') {
        void syncSubscription()
      } else if (Notification.permission === 'default' && !snoozed()) {
        setMode('notifications')
      }
      return
    }

    if (!isPhone() || snoozed()) return
    if (isIOS()) {
      setMode('install-ios')
      return
    }
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setMode('install-android')
    }
    const onInstalled = () => setMode('hidden')
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = useCallback(() => {
    snooze()
    setMode('hidden')
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return dismiss()
    setBusy(true)
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome !== 'accepted') snooze()
    } finally {
      setBusy(false)
      setDeferred(null)
      setMode('hidden')
    }
  }, [deferred, dismiss])

  const enable = useCallback(async () => {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') await syncSubscription()
      else snooze()
    } finally {
      setBusy(false)
      setMode('hidden')
    }
  }, [])

  if (mode === 'hidden') return null

  const copy =
    mode === 'notifications'
      ? {
          title: 'Turn on notifications',
          body: 'A note when a search opens for you or one of your candidates moves. Nothing else.',
          action: 'Turn on',
          onAction: enable,
          secondary: 'Not now',
        }
      : mode === 'install-ios'
        ? {
            title: 'Add Refery to your phone',
            body: 'In Safari, tap Share, then Add to Home Screen. Open it from there to get notifications.',
            action: 'Got it',
            onAction: dismiss,
            secondary: null,
          }
        : {
            title: 'Add Refery to your phone',
            body: 'One tap to install. You get a note when a search opens for you or a candidate moves.',
            action: 'Install',
            onAction: install,
            secondary: 'Not now',
          }

  return (
    <div role="region" aria-label={copy.title} className="mb-4 rounded-xl border border-[#E4E3DC] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(22,22,19,0.04)]">
      <div className="flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" width={40} height={40} className="mt-0.5 h-10 w-10 shrink-0 rounded-[10px] border border-[#E4E3DC]" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-5 text-[#161613]">{copy.title}</p>
          <p className="mt-0.5 text-[13px] leading-5 text-[#5B5B55]">{copy.body}</p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void copy.onAction()}
              disabled={busy}
              className="rounded-lg bg-[#1F3A2F] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {copy.action}
            </button>
            {copy.secondary && (
              <button type="button" onClick={dismiss} className="rounded-lg px-3 py-2 text-[13px] font-medium text-[#5B5B55]">
                {copy.secondary}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
