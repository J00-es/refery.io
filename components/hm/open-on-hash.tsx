'use client'

/**
 * Folded sections are `<details>`; a link to `#confirm` should open it, not
 * just scroll to a closed row. Opens the target on load and on every hash
 * change, then lets the browser do the scrolling.
 */

import { useEffect } from 'react'

export function OpenOnHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id) return
      const el = document.getElementById(id)
      if (el instanceof HTMLDetailsElement && !el.open) {
        el.open = true
        // The browser scrolled before the box grew; scroll again now it has.
        requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }))
      }
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [])
  return null
}
