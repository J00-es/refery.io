'use client'

import { useEffect, useRef, useState } from 'react'
import { faqItems } from './home-faq'

const START_HIRING_URL = 'https://refery.io/start-hiring'

export default function HomeClient() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const hamRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  // Nav scroll shadow
  useEffect(() => {
    const onScroll = () => {
      if (navRef.current) {
        navRef.current.style.boxShadow =
          window.scrollY > 10 ? '0 1px 16px rgba(16,15,15,0.06)' : ''
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close drawer on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        hamRef.current &&
        drawerRef.current &&
        !hamRef.current.contains(t) &&
        !drawerRef.current.contains(t)
      ) {
        setDrawerOpen(false)
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  // Reveal animations + counter animation
  useEffect(() => {
    const ro = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible')
            ro.unobserve(e.target)
          }
        })
      },
      { threshold: 0.05 }
    )
    document.querySelectorAll('.reveal').forEach((r) => ro.observe(r))

    const co = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const t = entry.target as HTMLElement
            const target = Number(t.dataset.target || '0')
            const suf = t.dataset.suffix || ''
            let cur = 0
            const step = Math.max(1, Math.ceil(target / 40))
            const tm = setInterval(() => {
              cur = Math.min(cur + step, target)
              t.textContent = cur + suf
              if (cur >= target) clearInterval(tm)
            }, 28)
            co.unobserve(t)
          }
        })
      },
      { threshold: 0.5 }
    )
    document.querySelectorAll('[data-target]').forEach((c) => co.observe(c))

    return () => {
      ro.disconnect()
      co.disconnect()
    }
  }, [])

  // Scroll spy for nav link highlight
  useEffect(() => {
    const onScroll = () => {
      const secs = document.querySelectorAll('[id]')
      const navLinks = document.querySelectorAll(
        '.nav-link'
      ) as NodeListOf<HTMLAnchorElement>
      let cur = ''
      secs.forEach((s) => {
        if (window.scrollY >= (s as HTMLElement).offsetTop - 80) cur = (s as HTMLElement).id
      })
      navLinks.forEach((l) => {
        const isActive = l.getAttribute('href') === '#' + cur
        l.style.background = isActive ? 'var(--bg-3)' : ''
        l.style.color = isActive ? 'var(--ink)' : ''
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const closeDrawer = () => setDrawerOpen(false)

  const toggleFaq = (i: number) => {
    setOpenFaq((current) => (current === i ? null : i))
  }

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600;700&display=swap');

        :root {
          --bg: #f8f8f3;
          --bg-2: #EAE9E1;
          --bg-3: #e8e8e1;
          --card: #ffffff;
          --ink: #100f0f;
          --ink-2: rgba(16, 15, 15, 0.64);
          --ink-3: rgba(16, 15, 15, 0.4);
          --ink-4: rgba(16, 15, 15, 0.2);
          --green: #2a6b45;
          --green-bg: #ebf4ef;
          --border: rgba(16, 15, 15, 0.1);
          --r: 10px;
          --r-sm: 6px;
        }

        *,
        *::before,
        *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        html {
          scroll-behavior: smooth;
        }
        body {
          background: var(--bg);
          font-family: 'Inter', system-ui, sans-serif;
          color: var(--ink);
          line-height: 1.6;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        /* NAV */
        nav {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(248, 248, 243, 0.88);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 40px;
          height: 58px;
        }
        .nav-logo {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 20px;
          color: var(--ink);
          text-decoration: none;
          letter-spacing: -0.01em;
        }
        .nav-logo em {
          font-style: italic;
        }
        .nav-links {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .nav-link {
          font-size: 14px;
          font-weight: 400;
          color: var(--ink-2);
          text-decoration: none;
          padding: 6px 14px;
          border-radius: 99px;
          transition: color 0.15s, background 0.15s;
          white-space: nowrap;
        }
        .nav-link:hover {
          color: var(--ink);
          background: var(--bg-2);
        }
        .nav-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .btn-nav {
          font-size: 14px;
          font-weight: 500;
          color: #fff;
          background: var(--ink);
          border: none;
          cursor: pointer;
          font-family: 'Inter', sans-serif;
          padding: 7px 18px;
          border-radius: var(--r-sm);
          text-decoration: none;
          transition: opacity 0.15s;
          white-space: nowrap;
        }
        .btn-nav:hover {
          opacity: 0.85;
        }
        .btn-nav-green {
          font-size: 14px;
          font-weight: 500;
          color: #fff;
          background: var(--green);
          border: none;
          cursor: pointer;
          font-family: 'Inter', sans-serif;
          padding: 7px 18px;
          border-radius: var(--r-sm);
          text-decoration: none;
          transition: opacity 0.15s;
          white-space: nowrap;
        }
        .btn-nav-green:hover {
          opacity: 0.85;
        }
        .nav-ham {
          display: none;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          flex-direction: column;
          gap: 5px;
        }
        .nav-ham span {
          display: block;
          width: 20px;
          height: 1.5px;
          background: var(--ink);
        }
        .nav-drawer {
          display: none;
          position: fixed;
          top: 58px;
          left: 0;
          right: 0;
          background: var(--bg);
          border-bottom: 1px solid var(--border);
          padding: 1rem 1.25rem;
          z-index: 99;
          flex-direction: column;
        }
        .nav-drawer.open {
          display: flex;
        }
        .nav-drawer a {
          font-size: 15px;
          font-weight: 500;
          color: var(--ink-2);
          text-decoration: none;
          padding: 0.85rem 0;
          border-bottom: 1px solid var(--border);
          transition: color 0.15s;
        }
        .nav-drawer a:last-child {
          border-bottom: none;
          color: var(--green);
        }
        .nav-drawer a:hover {
          color: var(--ink);
        }
        .nav-drawer a.drawer-cta {
          font-weight: 600;
        }
        .nav-drawer a.drawer-hire {
          color: var(--ink);
        }
        .nav-drawer a.drawer-scout {
          color: var(--green);
        }
        .nav-drawer a.drawer-scout:hover {
          color: var(--green);
          opacity: 0.8;
        }

        /* SHARED */
        .wrap {
          max-width: 900px;
          margin: 0 auto;
        }
        .sec {
          padding: 80px 40px;
        }
        .sec-dark {
          background: var(--ink);
        }
        .sec-light {
          background: var(--bg-2);
        }
        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--green);
          margin-bottom: 16px;
        }
        .eyebrow::before {
          content: '';
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--green);
          flex-shrink: 0;
        }
        .sec-dark .eyebrow {
          color: #5fbf84;
        }
        .sec-dark .eyebrow::before {
          background: #5fbf84;
        }
        h2 {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: clamp(32px, 4vw, 52px);
          font-weight: 400;
          line-height: 1.05;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin-bottom: 16px;
        }
        h2 em {
          font-style: italic;
          color: var(--green);
        }
        .sec-dark h2 {
          color: #f8f8f3;
        }
        .sec-dark h2 em {
          color: #5fbf84;
        }
        .lead {
          font-size: 18px;
          color: var(--ink-2);
          line-height: 1.75;
          max-width: 580px;
          margin-bottom: 48px;
          font-weight: 400;
        }
        .sec-dark .lead {
          color: rgba(248, 248, 243, 0.45);
        }
        .btn-dark {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: var(--ink);
          color: #fff;
          font-family: 'Inter', sans-serif;
          font-size: 16px;
          font-weight: 500;
          padding: 14px 28px;
          border-radius: var(--r-sm);
          text-decoration: none;
          border: none;
          cursor: pointer;
          transition: opacity 0.15s;
          white-space: nowrap;
        }
        .btn-dark:hover {
          opacity: 0.82;
        }
        .btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          color: var(--ink);
          font-family: 'Inter', sans-serif;
          font-size: 16px;
          font-weight: 500;
          padding: 13px 28px;
          border-radius: var(--r-sm);
          text-decoration: none;
          border: 1px solid var(--border);
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
          white-space: nowrap;
        }
        .btn-ghost:hover {
          background: var(--bg-2);
          border-color: var(--ink-3);
        }

        /* WORD FLIP */
        .flip-wrap {
          display: inline-block;
          height: 1.15em;
          overflow: hidden;
          vertical-align: bottom;
          position: relative;
          padding-top: 0.05em;
        }
        .flip-track {
          display: flex;
          flex-direction: column;
          animation: flipWords 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .flip-word {
          height: 1.15em;
          display: flex;
          align-items: baseline;
          font-style: italic;
          color: var(--green);
          padding-bottom: 0.05em;
        }
        @keyframes flipWords {
          0%,
          20% {
            transform: translateY(0);
          }
          26%,
          53% {
            transform: translateY(-33.333%);
          }
          59%,
          86% {
            transform: translateY(-66.666%);
          }
          92%,
          100% {
            transform: translateY(0);
          }
        }

        .reveal {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
            transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .reveal.visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* HERO */
        .hero {
          max-width: 900px;
          margin: 0 auto;
          padding: 80px 40px 64px;
        }
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 500;
          color: var(--ink-2);
          background: var(--card);
          border: 1px solid var(--border);
          padding: 5px 12px;
          border-radius: 99px;
          margin-bottom: 32px;
        }
        .hero-badge-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #3db86a;
        }
        .hero h1 {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: clamp(46px, 6vw, 76px);
          font-weight: 400;
          line-height: 1.02;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin-bottom: 28px;
        }
        .hero h1 em {
          font-style: italic;
          color: var(--green);
        }
        .hero-sub {
          font-size: 19px;
          font-weight: 400;
          line-height: 1.75;
          color: var(--ink-2);
          max-width: 620px;
          margin-bottom: 40px;
        }
        .hero-cta {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .hero-stats {
          display: flex;
          gap: 0;
          border: 1px solid var(--border);
          border-radius: var(--r);
          background: var(--card);
          overflow: hidden;
          margin-top: 56px;
        }
        .hero-stat {
          flex: 1;
          padding: 24px 28px;
          border-right: 1px solid var(--border);
        }
        .hero-stat:last-child {
          border-right: none;
        }
        .hero-stat-n {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 36px;
          line-height: 1;
          margin-bottom: 6px;
          color: var(--ink);
        }
        .hero-stat-n em {
          font-style: italic;
          color: var(--green);
        }
        .hero-stat-d {
          font-size: 14px;
          color: var(--ink-3);
        }

        /* TICKER */
        .ticker {
          overflow: hidden;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          padding: 12px 0;
          background: var(--bg-2);
        }
        .ticker-inner {
          display: flex;
          white-space: nowrap;
          animation: tick 55s linear infinite;
        }
        .ticker-inner:hover {
          animation-play-state: paused;
        }
        .ti {
          font-size: 12px;
          letter-spacing: 0.06em;
          color: var(--ink-3);
          text-transform: uppercase;
          padding: 0 1.5rem;
          font-weight: 500;
        }
        .ts {
          color: var(--green);
          opacity: 0.5;
        }
        @keyframes tick {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        /* PAIN */
        .pain-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
          margin-bottom: 48px;
        }
        .pain-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: var(--r);
          padding: 28px 24px;
          transition: border-color 0.2s;
        }
        .pain-card:hover {
          border-color: rgba(255, 255, 255, 0.18);
        }
        .pain-card-icon {
          font-size: 20px;
          margin-bottom: 16px;
          opacity: 0.5;
        }
        .pain-card h4 {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 19px;
          font-weight: 400;
          color: #f8f8f3;
          margin-bottom: 10px;
          line-height: 1.25;
        }
        .pain-card p {
          font-size: 15px;
          color: rgba(248, 248, 243, 0.35);
          line-height: 1.65;
        }
        .pain-pivot {
          font-size: 20px;
          line-height: 1.7;
          color: rgba(248, 248, 243, 0.55);
          font-weight: 300;
          max-width: 640px;
          border-left: 3px solid #5fbf84;
          padding-left: 24px;
        }
        .pain-pivot strong {
          color: #f8f8f3;
          font-weight: 500;
        }
        .pain-pivot em {
          color: #5fbf84;
          font-style: normal;
          font-weight: 600;
        }

        /* NETWORK */
        .net-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 40px;
        }
        .net-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--r);
          padding: 32px 28px;
          transition: box-shadow 0.2s;
        }
        .net-card:hover {
          box-shadow: 0 4px 24px rgba(16, 15, 15, 0.07);
        }
        .net-card-tag {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--green);
          margin-bottom: 12px;
        }
        .net-card h4 {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 22px;
          font-weight: 400;
          color: var(--ink);
          margin-bottom: 10px;
          line-height: 1.2;
        }
        .net-card p {
          font-size: 15px;
          color: var(--ink-2);
          line-height: 1.7;
        }
        .net-cta-strip {
          background: var(--ink);
          border-radius: var(--r);
          padding: 32px 36px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
        }
        .net-cta-text {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 22px;
          color: #f8f8f3;
          font-weight: 400;
          line-height: 1.3;
        }
        .net-cta-text em {
          font-style: italic;
          color: #5fbf84;
        }
        .btn-white {
          display: inline-flex;
          align-items: center;
          background: #f8f8f3;
          color: var(--ink);
          font-family: 'Inter', sans-serif;
          font-size: 15px;
          font-weight: 600;
          padding: 13px 26px;
          border-radius: var(--r-sm);
          text-decoration: none;
          border: none;
          cursor: pointer;
          transition: opacity 0.15s;
          white-space: nowrap;
        }
        .btn-white:hover {
          opacity: 0.85;
        }

        /* TIMELINE */
        .timeline {
          position: relative;
          padding-left: 48px;
          max-width: 580px;
        }
        .timeline::before {
          content: '';
          position: absolute;
          left: 15px;
          top: 8px;
          bottom: 8px;
          width: 2px;
          background: linear-gradient(to bottom, var(--green), var(--green-bg));
          border-radius: 2px;
        }
        .tl-step {
          position: relative;
          padding-bottom: 48px;
        }
        .tl-step:last-child {
          padding-bottom: 0;
        }
        .tl-dot {
          position: absolute;
          left: -48px;
          top: 2px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--green-bg);
          border: 2px solid var(--green);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Instrument Serif', serif;
          font-size: 14px;
          color: var(--green);
          font-weight: 400;
          z-index: 1;
        }
        .tl-step:hover .tl-dot {
          background: var(--green);
          color: #fff;
        }
        .tl-time {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--green);
          margin-bottom: 6px;
        }
        .tl-step h4 {
          font-size: 18px;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 6px;
        }
        .tl-step p {
          font-size: 15px;
          color: var(--ink-3);
          line-height: 1.65;
        }

        /* PROOF */
        .logos-line {
          font-size: 13px;
          font-weight: 500;
          color: var(--ink-3);
          letter-spacing: 0.06em;
          text-align: center;
          text-transform: uppercase;
          margin-bottom: 24px;
        }
        .logos-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 32px;
          justify-content: center;
          align-items: center;
        }
        .logo-pill {
          font-size: 13px;
          font-weight: 500;
          color: var(--ink-3);
          letter-spacing: 0.02em;
          transition: color 0.2s;
          cursor: default;
        }
        .logo-pill:hover {
          color: var(--ink-2);
        }

        /* TESTIMONIALS */
        .test-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .test-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--r);
          padding: 24px 22px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          transition: box-shadow 0.2s;
        }
        .test-card:hover {
          box-shadow: 0 4px 20px rgba(16, 15, 15, 0.07);
        }
        .test-quote {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 17px;
          font-weight: 400;
          line-height: 1.65;
          color: var(--ink);
          letter-spacing: -0.01em;
          flex: 1;
        }
        .test-who {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .test-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--green);
          flex-shrink: 0;
          margin-top: 6px;
          opacity: 0.5;
        }
        .test-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--ink);
          line-height: 1.2;
        }
        .test-role {
          font-size: 13px;
          color: var(--ink-3);
          margin-top: 2px;
        }

        /* COMPARE */
        .cmp-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .cmp-table th {
          padding: 14px 16px;
          font-size: 13px;
          font-weight: 600;
          text-align: center;
          border-bottom: 2px solid var(--border);
          vertical-align: bottom;
          color: var(--ink-3);
          letter-spacing: 0.02em;
        }
        .cmp-table th:first-child {
          text-align: left;
          color: transparent;
          width: 22%;
        }
        .cmp-table th.cmp-hi {
          background: var(--ink);
          color: #f8f8f3;
          border-radius: 10px 10px 0 0;
          font-size: 14px;
          border-bottom: none;
        }
        .cmp-table td {
          padding: 16px 16px;
          text-align: center;
          border-bottom: 1px solid var(--border);
          color: var(--ink-3);
          font-size: 14px;
          line-height: 1.4;
          vertical-align: middle;
        }
        .cmp-table td:first-child {
          text-align: left;
          font-weight: 600;
          color: var(--ink);
          font-size: 13px;
          letter-spacing: 0.01em;
        }
        .cmp-table td.cmp-hi {
          background: rgba(16, 15, 15, 0.03);
          color: var(--ink);
          font-weight: 500;
        }
        .cmp-table tbody tr:last-child td {
          border-bottom: none;
        }
        .cmp-table tbody tr:last-child td.cmp-hi {
          border-radius: 0 0 10px 10px;
        }
        .cmp-table tbody tr:hover td {
          background: rgba(16, 15, 15, 0.015);
        }
        .cmp-table tbody tr:hover td.cmp-hi {
          background: rgba(16, 15, 15, 0.05);
        }
        .cmp-check {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--green-bg);
          margin-right: 8px;
          flex-shrink: 0;
          vertical-align: middle;
        }
        .cmp-check::after {
          content: '';
          width: 10px;
          height: 10px;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2 6l3 3L10 3' stroke='%232A6B45' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-size: contain;
          background-repeat: no-repeat;
        }
        .cmp-val {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        /* FAQ */
        .faq-list {
          max-width: 680px;
        }
        .faq-item {
          border-bottom: 1px solid var(--border);
        }
        .faq-trigger {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 0;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          gap: 16px;
          transition: padding-left 0.15s;
        }
        .faq-trigger:hover {
          padding-left: 6px;
        }
        .faq-q {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 19px;
          font-weight: 400;
          color: var(--ink);
          line-height: 1.3;
          transition: color 0.15s;
        }
        .faq-item:hover .faq-q {
          color: var(--green);
        }
        .faq-plus {
          font-size: 22px;
          color: var(--ink-3);
          line-height: 1;
          flex-shrink: 0;
          transition: transform 0.3s, color 0.15s;
          font-weight: 300;
        }
        .faq-item:hover .faq-plus {
          color: var(--green);
        }
        .faq-item.open .faq-plus {
          transform: rotate(45deg);
        }
        .faq-item.open .faq-q {
          color: var(--green);
        }
        .faq-answer {
          font-size: 16px;
          color: var(--ink-2);
          line-height: 1.8;
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.35s ease, padding-bottom 0.3s;
        }
        .faq-item.open .faq-answer {
          max-height: 400px;
          padding-bottom: 20px;
        }

        /* SCOUT STRIP */
        .scout-strip {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--r);
          padding: 36px 40px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 32px;
          flex-wrap: wrap;
        }
        .scout-strip-text h3 {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 24px;
          font-weight: 400;
          color: var(--ink);
          margin-bottom: 6px;
          line-height: 1.2;
        }
        .scout-strip-text h3 em {
          font-style: italic;
          color: var(--green);
        }
        .scout-strip-text p {
          font-size: 15px;
          color: var(--ink-2);
          line-height: 1.6;
          max-width: 440px;
        }
        .scout-strip-cta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
          flex-shrink: 0;
        }
        .scout-strip-email {
          font-size: 13px;
          color: var(--ink-3);
        }
        .scout-strip-email a {
          color: var(--green);
          text-decoration: none;
          font-weight: 500;
        }
        .scout-strip-email a:hover {
          text-decoration: underline;
        }

        /* CONTACT */
        .contact-main {
          background: var(--ink);
          border-radius: var(--r);
          padding: 48px 40px;
          text-align: center;
          margin-bottom: 12px;
        }
        .contact-main .eyebrow {
          color: #5fbf84;
          justify-content: center;
        }
        .contact-main .eyebrow::before {
          background: #5fbf84;
        }
        .contact-main h2 {
          color: #f8f8f3;
        }
        .contact-main h2 em {
          color: #5fbf84;
        }
        .contact-main p {
          font-size: 17px;
          color: rgba(248, 248, 243, 0.45);
          margin-bottom: 28px;
          line-height: 1.7;
        }
        .contact-main .btn-white {
          font-size: 16px;
          padding: 15px 32px;
        }
        .contact-email {
          font-size: 14px;
          color: rgba(248, 248, 243, 0.3);
          margin-top: 16px;
        }
        .contact-email a {
          color: rgba(248, 248, 243, 0.45);
          text-decoration: none;
        }
        .contact-email a:hover {
          color: #5fbf84;
        }

        /* FOOTER */
        footer {
          background: var(--ink);
          padding: 48px 40px 28px;
        }
        .footer-top {
          display: grid;
          grid-template-columns: 1.6fr 1fr 1fr 1fr;
          gap: 40px;
          padding-bottom: 40px;
          border-bottom: 1px solid rgba(248, 248, 243, 0.08);
          max-width: 900px;
          margin: 0 auto;
        }
        .footer-brand {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 18px;
          color: rgba(248, 248, 243, 0.35);
          margin-bottom: 10px;
        }
        .footer-brand em {
          font-style: italic;
        }
        .footer-brand-desc {
          font-size: 14px;
          color: rgba(248, 248, 243, 0.2);
          line-height: 1.7;
          max-width: 190px;
        }
        .footer-col h4 {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(248, 248, 243, 0.2);
          margin-bottom: 16px;
        }
        .footer-col ul {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .footer-col ul li a {
          font-size: 14px;
          color: rgba(248, 248, 243, 0.35);
          text-decoration: none;
          transition: color 0.15s;
        }
        .footer-col ul li a:hover {
          color: #5fbf84;
        }
        .footer-bottom {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          padding-top: 24px;
          max-width: 900px;
          margin: 0 auto;
        }
        .footer-copy {
          font-size: 12px;
          color: rgba(248, 248, 243, 0.18);
        }
        .footer-legal {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
        }
        .footer-legal a {
          font-size: 12px;
          color: rgba(248, 248, 243, 0.18);
          text-decoration: none;
          transition: color 0.15s;
        }
        .footer-legal a:hover {
          color: rgba(248, 248, 243, 0.45);
        }

        /* ABOUT */
        .about-split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 72px;
          align-items: start;
          margin-top: 8px;
        }
        .about-body {
          font-size: 17px;
          line-height: 1.85;
          color: rgba(248, 248, 243, 0.5);
          font-weight: 300;
          margin-bottom: 18px;
        }
        .about-body:last-of-type {
          margin-bottom: 28px;
        }
        .about-body strong {
          color: rgba(248, 248, 243, 0.82);
          font-weight: 500;
        }
        .about-hello {
          display: inline-flex;
          font-size: 14px;
          font-weight: 500;
          color: #5fbf84;
          text-decoration: none;
          transition: opacity 0.15s;
        }
        .about-hello:hover {
          opacity: 0.7;
        }

        /* RESPONSIVE */
        @media (max-width: 900px) {
          nav {
            padding: 0 24px;
          }
          .nav-links {
            display: none;
          }
          .btn-nav-green {
            display: none;
          }
          .nav-ham {
            display: flex;
          }
          .hero {
            padding: 60px 24px 48px;
          }
          .sec {
            padding: 64px 24px;
          }
          .hero-stats {
            flex-direction: column;
          }
          .hero-stat {
            border-right: none;
            border-bottom: 1px solid var(--border);
          }
          .hero-stat:last-child {
            border-bottom: none;
          }
          .pain-grid {
            grid-template-columns: 1fr;
          }
          .net-grid {
            grid-template-columns: 1fr;
          }
          .test-grid {
            grid-template-columns: 1fr 1fr;
          }
          .test-card:nth-child(3) {
            grid-column: 1 / -1;
          }
          .about-split {
            grid-template-columns: 1fr;
            gap: 32px;
          }
          .net-cta-strip {
            flex-direction: column;
            text-align: center;
          }
          .scout-strip {
            flex-direction: column;
            text-align: center;
            align-items: center;
          }
          .scout-strip-cta {
            align-items: center;
          }
          .footer-top {
            grid-template-columns: 1fr 1fr;
            gap: 28px;
          }
        }
        @media (max-width: 560px) {
          nav {
            padding: 0 16px;
            height: 52px;
          }
          .nav-drawer {
            top: 52px;
          }
          .hero {
            padding: 40px 16px 44px;
          }
          .hero h1 {
            font-size: 36px;
          }
          .hero-sub {
            font-size: 17px;
          }
          .hero-cta {
            flex-direction: column;
            align-items: stretch;
          }
          .btn-dark,
          .btn-ghost {
            justify-content: center;
          }
          .sec {
            padding: 48px 16px;
          }
          h2 {
            font-size: clamp(28px, 8vw, 40px);
          }
          .lead {
            font-size: 16px;
          }
          .test-grid {
            grid-template-columns: 1fr;
          }
          .test-card:nth-child(3) {
            grid-column: auto;
          }
          .contact-main {
            padding: 36px 24px;
          }
          .scout-strip {
            padding: 28px 24px;
          }
          footer {
            padding: 32px 16px 20px;
          }
          .footer-top {
            grid-template-columns: 1fr;
            gap: 24px;
          }
          .footer-bottom {
            flex-direction: column;
            align-items: flex-start;
          }
        }
        @media (max-width: 375px) {
          .hero h1 {
            font-size: 30px;
          }
        }
      `}</style>

      {/* NAV */}
      <nav id="nav" ref={navRef}>
        <a className="nav-logo" href="#">
          Refery<em>.</em>
        </a>
        <div className="nav-links">
          <a className="nav-link" href="#why">
            Why Refery
          </a>
          <a className="nav-link" href="#network">
            The Network
          </a>
          <a className="nav-link" href="#how">
            How it Works
          </a>
          <a className="nav-link" href="#pricing">
            Pricing
          </a>
          <a className="nav-link" href="#faq">
            FAQ
          </a>
        </div>
        <div className="nav-right">
          <a href="/auth/login" className="btn-nav-green">
            Partner Login →
          </a>
          <a href={START_HIRING_URL} className="btn-nav">
            Start Hiring →
          </a>
          <button
            className="nav-ham"
            id="hamburger"
            ref={hamRef}
            aria-label="Menu"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </nav>
      <div
        className={`nav-drawer${drawerOpen ? ' open' : ''}`}
        id="nav-drawer"
        ref={drawerRef}
      >
        <a href="#why" onClick={closeDrawer}>
          Why Refery
        </a>
        <a href="#network" onClick={closeDrawer}>
          The Network
        </a>
        <a href="#how" onClick={closeDrawer}>
          How it Works
        </a>
        <a href="#pricing" onClick={closeDrawer}>
          Pricing
        </a>
        <a href="#faq" onClick={closeDrawer}>
          FAQ
        </a>
        <a href={START_HIRING_URL} className="drawer-cta drawer-hire">
          Start Hiring →
        </a>
        <a href="/auth/login" className="drawer-cta drawer-scout">
          Partner Login →
        </a>
      </div>

      {/* HERO */}
      <section className="hero">
        <span className="hero-badge">
          <span className="hero-badge-dot"></span>200+ VC-backed startups
        </span>
        <h1>
          The talent who builds trillion-dollar companies doesn&apos;t come from{' '}
          <span className="flip-wrap">
            <span className="flip-track">
              <span className="flip-word">job boards.</span>
              <span className="flip-word">agencies.</span>
              <span className="flip-word">LinkedIn posts.</span>
            </span>
          </span>
        </h1>
        <p className="hero-sub">
          They come from intros — by billion-dollar founders, public-company CTOs, and
          top-tier fund partners. Refery is the infrastructure that puts their referral
          network to work for your engineering and GTM hires. Seed to Series B. SF and NY.
          One contact point. Hundreds of scouts.
        </p>
        <div className="hero-cta">
          <a href={START_HIRING_URL} className="btn-dark">
            Start Hiring →
          </a>
          <a href="#network" className="btn-ghost">
            See who&apos;s referring
          </a>
        </div>
        <p
          style={{
            fontSize: '14px',
            color: 'var(--ink-3)',
            marginTop: '20px',
            fontWeight: 400,
          }}
        >
          Built by operators behind 9 and 10-figure exits.{' '}
          <a
            href="#about"
            style={{ color: 'var(--green)', textDecoration: 'none', fontWeight: 500 }}
          >
            Our story →
          </a>
        </p>
        <div className="hero-stats reveal">
          <div className="hero-stat">
            <div className="hero-stat-n" data-target="200" data-suffix="+">
              0+
            </div>
            <div className="hero-stat-d">VC-backed startups hiring</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-n">Days</div>
            <div className="hero-stat-d">to first candidates</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-n">
              <em>$0</em>
            </div>
            <div className="hero-stat-d">pay only on successful hire</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-n">
              <em>300</em>+
            </div>
            <div className="hero-stat-d">scouts across SF &amp; NY</div>
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div className="ticker">
        <div className="ticker-inner">
          <span className="ti">Engineering Roles</span>
          <span className="ts"> · </span>
          <span className="ti">GTM Roles</span>
          <span className="ts"> · </span>
          <span className="ti">San Francisco &amp; New York</span>
          <span className="ts"> · </span>
          <span className="ti">Referred by Founders &amp; CTOs</span>
          <span className="ts"> · </span>
          <span className="ti">Candidates Agencies Can&apos;t Reach</span>
          <span className="ts"> · </span>
          <span className="ti">Every Referral With Real Context</span>
          <span className="ts"> · </span>
          <span className="ti">Fund Partners &amp; Investors</span>
          <span className="ts"> · </span>
          <span className="ti">Engineers &amp; Talent Leaders</span>
          <span className="ts"> · </span>
          <span className="ti">Engineering Roles</span>
          <span className="ts"> · </span>
          <span className="ti">GTM Roles</span>
          <span className="ts"> · </span>
          <span className="ti">San Francisco &amp; New York</span>
          <span className="ts"> · </span>
          <span className="ti">Referred by Founders &amp; CTOs</span>
          <span className="ts"> · </span>
          <span className="ti">Candidates Agencies Can&apos;t Reach</span>
          <span className="ts"> · </span>
          <span className="ti">Every Referral With Real Context</span>
          <span className="ts"> · </span>
          <span className="ti">Fund Partners &amp; Investors</span>
          <span className="ts"> · </span>
          <span className="ti">Engineers &amp; Talent Leaders</span>
          <span className="ts"> · </span>
        </div>
      </div>

      {/* PAIN */}
      <div className="sec sec-dark reveal" id="why">
        <div className="wrap">
          <div className="eyebrow">The problem</div>
          <h2>
            At seed to Series B, every hire
            <br />
            is <em>the</em> hire.
          </h2>
          <p className="lead">
            One wrong engineer costs you 6 months. One wrong GTM lead costs you the market.
            You already know this — and yet the options you have are built for a different
            world.
          </p>
          <div className="pain-grid">
            <div className="pain-card">
              <div className="pain-card-icon">✕</div>
              <h4>Agencies don&apos;t know your world</h4>
              <p>
                30% + retainer. Months of waiting. Candidates they&apos;re placing everywhere
                else. Their recruiters have never built a startup.
              </p>
            </div>
            <div className="pain-card">
              <div className="pain-card-icon">✕</div>
              <h4>Job boards give volume, not signal</h4>
              <p>
                The best people aren&apos;t applying anywhere. They only move when someone they
                trust makes the intro.
              </p>
            </div>
            <div className="pain-card">
              <div className="pain-card-icon">✕</div>
              <h4>Your own network is finite</h4>
              <p>
                You know 50 great people. Maybe 100. Your next hire is two intros away — in
                a network you can&apos;t reach alone.
              </p>
            </div>
          </div>
          <div className="pain-pivot">
            We&apos;ve been on your side of the table — as founders desperately hiring our first
            engineer, as investors watching portfolio companies stall because one seat
            stayed empty for six months. So we built the thing we wished existed:
            <br />
            <br />
            <strong>
              What if the founders who built the companies you admire — the CTOs who scaled
              the teams you benchmark against, the investors who&apos;ve seen thousands of hires
              — were the ones <em>finding your next hire?</em>
            </strong>
          </div>
        </div>
      </div>

      {/* NETWORK */}
      <div className="sec reveal" id="network">
        <div className="wrap">
          <div className="eyebrow">The network</div>
          <h2>
            Hundreds of scouts. One <em>single source.</em>
          </h2>
          <p className="lead">
            Founders, CTOs, fund partners, and engineers across SF and NY. Curated by
            Refery. Vetted by our committee. Every candidate matched and screened before
            they reach you. One contact point. No noise. Ready-built infrastructure — so
            you don&apos;t start from scratch.
          </p>
          <div className="net-grid">
            <div className="net-card">
              <div className="net-card-tag">Founders &amp; CEOs</div>
              <h4>Builders of billion-dollar companies</h4>
              <p>
                They&apos;ve hired their first engineer and their 100th. When they refer
                someone, it&apos;s because they&apos;d hire them again.
              </p>
            </div>
            <div className="net-card">
              <div className="net-card-tag">CTOs &amp; Engineering Leaders</div>
              <h4>From publicly traded tech companies</h4>
              <p>
                They know what a 10x engineer looks like in practice — not on a resume.
                Their referrals come with real signal.
              </p>
            </div>
            <div className="net-card">
              <div className="net-card-tag">Fund Partners &amp; Investors</div>
              <h4>Top-tier funds, billions in AUM</h4>
              <p>
                They sit across hundreds of portfolio companies. They&apos;ve seen who makes
                startups win — repeatedly, across stages.
              </p>
            </div>
            <div className="net-card">
              <div className="net-card-tag">Engineers &amp; Talent Acquisition</div>
              <h4>From the fastest-scaling startups &amp; tech companies</h4>
              <p>
                Senior engineers and talent leaders who&apos;ve scaled teams from 10 to 1,000.
                They refer from circles agencies can&apos;t access.
              </p>
            </div>
          </div>
          <div className="net-cta-strip">
            <div className="net-cta-text">
              You don&apos;t build this network from scratch.
              <br />
              You <em>plug into ours.</em>
            </div>
            <a href={START_HIRING_URL} className="btn-white">
              Start Hiring →
            </a>
          </div>
        </div>
      </div>

      {/* SOCIAL PROOF */}
      <div className="sec sec-light reveal">
        <div className="wrap">
          <p className="logos-line">
            Trusted by startups backed by the world&apos;s best investors
          </p>
          <div className="logos-wrap">
            <span className="logo-pill">Y Combinator</span>
            <span className="logo-pill">Sequoia</span>
            <span className="logo-pill">a16z</span>
            <span className="logo-pill">Index Ventures</span>
            <span className="logo-pill">General Catalyst</span>
            <span className="logo-pill">Lightspeed</span>
            <span className="logo-pill">Founders Fund</span>
            <span className="logo-pill">Tiger Global</span>
            <span className="logo-pill">Insight Partners</span>
            <span className="logo-pill">Greylock</span>
            <span className="logo-pill">DST Global</span>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div className="sec reveal" id="how">
        <div className="wrap">
          <div className="eyebrow">How it works</div>
          <h2>
            Three steps. <em>That&apos;s it.</em>
          </h2>
          <p className="lead">
            Designed for founders who don&apos;t have time to manage another vendor.
          </p>
          <div className="timeline">
            <div className="tl-step">
              <div className="tl-dot">1</div>
              <div className="tl-time">5 minutes</div>
              <h4>Send us your role</h4>
              <p>
                A job description, a Notion doc, or just a paragraph over email. Tell us
                what great looks like. We handle the rest.
              </p>
            </div>
            <div className="tl-step">
              <div className="tl-dot">2</div>
              <div className="tl-time">Within days</div>
              <h4>We match, you pick</h4>
              <p>
                Our scout network surfaces referrals. We screen and select only the
                strongest fits — you receive a handpicked shortlist with real context. See
                someone you like? We make a warm intro immediately.
              </p>
            </div>
            <div className="tl-step">
              <div className="tl-dot">3</div>
              <div className="tl-time">You&apos;re in control</div>
              <h4>Interview, offer, hire</h4>
              <p>
                You run your own process. 10% of first-year salary, only after you hire.
                90-day quality guarantee included.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* COMPARISON */}
      <div className="sec sec-light reveal" id="pricing">
        <div className="wrap">
          <div className="eyebrow">Why Refery wins &amp; Pricing</div>
          <h2>
            The difference at <em>a glance.</em>
          </h2>
          <div
            style={{
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              marginTop: '36px',
            }}
          >
            <table className="cmp-table">
              <thead>
                <tr>
                  <th></th>
                  <th className="cmp-hi">Refery</th>
                  <th>Agency</th>
                  <th>Job board / DIY</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Who refers</td>
                  <td className="cmp-hi">
                    <span className="cmp-val">
                      <span className="cmp-check"></span>Founders, CTOs, investors,
                      operators from top startups &amp; tech
                    </span>
                  </td>
                  <td>Junior recruiters</td>
                  <td>Whoever applies</td>
                </tr>
                <tr>
                  <td>Time to first candidate</td>
                  <td className="cmp-hi">
                    <span className="cmp-val">
                      <span className="cmp-check"></span>Days
                    </span>
                  </td>
                  <td>Weeks (after retainer)</td>
                  <td>Unpredictable</td>
                </tr>
                <tr>
                  <td>Upfront cost</td>
                  <td className="cmp-hi">
                    <span className="cmp-val">
                      <span className="cmp-check"></span>$0
                    </span>
                  </td>
                  <td>$15–30K retainer</td>
                  <td>Job board fees</td>
                </tr>
                <tr>
                  <td>Total fee</td>
                  <td className="cmp-hi">
                    <span className="cmp-val">
                      <span className="cmp-check"></span>10% on success only
                    </span>
                  </td>
                  <td>30% + retainer already paid</td>
                  <td>Your time (not free)</td>
                </tr>
                <tr>
                  <td>Doesn&apos;t work out in 3 months</td>
                  <td className="cmp-hi">
                    <span className="cmp-val">
                      <span className="cmp-check"></span>Free replacement guaranteed
                    </span>
                  </td>
                  <td>Tough luck</td>
                  <td>Start over</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TESTIMONIALS */}
      <div className="sec reveal">
        <div className="wrap">
          <div className="eyebrow">From founders</div>
          <h2>
            They tried it. <em>It worked.</em>
          </h2>
          <div className="test-grid" style={{ marginTop: '40px' }}>
            <div className="test-card">
              <div className="test-quote">
                &quot;We&apos;d been searching for a VP Eng for 4 months. Refery had someone on a
                call in 5 days — referred by a CTO who&apos;d built alongside them for 3 years.
                We made an offer that week.&quot;
              </div>
              <div className="test-who">
                <div className="test-dot"></div>
                <div>
                  <div className="test-name">Series A CEO</div>
                  <div className="test-role">Fintech · London</div>
                </div>
              </div>
            </div>
            <div className="test-card">
              <div className="test-quote">
                &quot;The quality of candidates was on a completely different level. These
                weren&apos;t people who applied to a job board — they were people who got a call
                from someone they deeply trust.&quot;
              </div>
              <div className="test-who">
                <div className="test-dot"></div>
                <div>
                  <div className="test-name">Seed-stage founder</div>
                  <div className="test-role">YC-backed · New York</div>
                </div>
              </div>
            </div>
            <div className="test-card">
              <div className="test-quote">
                &quot;Our first three hires through Refery are still here a year later. All
                three came through operator referrals. That track record is worth more than
                any discount.&quot;
              </div>
              <div className="test-who">
                <div className="test-dot"></div>
                <div>
                  <div className="test-name">Co-founder &amp; CTO</div>
                  <div className="test-role">Series B · San Francisco</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ABOUT */}
      <div className="sec sec-dark reveal" id="about">
        <div className="wrap">
          <div className="eyebrow">About</div>
          <div className="about-split">
            <div>
              <h2>
                Built by operators
                <br />
                who felt the <em>pain.</em>
              </h2>
            </div>
            <div>
              <p className="about-body">
                Founded by operators and investors behind{' '}
                <strong>9 and 10-figure exits.</strong> People who built companies from
                first hire to acquisition — and deployed capital into the startups that
                became household names.
              </p>
              <p className="about-body">
                We&apos;ve been the founders desperately hiring our first engineer. The
                investors watching portfolio companies stall because one critical role
                stayed open for months.{' '}
                <strong>
                  We&apos;ve lived the cost of a wrong hire — and the magic of the right one.
                </strong>
              </p>
              <p className="about-body">
                Across our portfolio, the pattern was obvious:{' '}
                <strong>the best hires came from referrals.</strong> From people who knew
                the industry and had worked alongside the candidates.
              </p>
              <p className="about-body">
                That network existed. The infrastructure didn&apos;t.{' '}
                <strong>Refery is what we built to fix that.</strong>
              </p>
              <a href="mailto:hello@refery.io" className="about-hello">
                Say hello → hello@refery.io
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="sec sec-light reveal" id="faq">
        <div className="wrap">
          <div className="eyebrow">FAQ</div>
          <h2>
            Common <em>questions.</em>
          </h2>
          <div className="faq-list">
            {faqItems.map((item, i) => (
              <div key={i} className={`faq-item${openFaq === i ? ' open' : ''}`}>
                <button className="faq-trigger" onClick={() => toggleFaq(i)}>
                  <span className="faq-q">{item.q}</span>
                  <span className="faq-plus">+</span>
                </button>
                <div className="faq-answer">{item.a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SCOUT STRIP */}
      <div className="sec reveal">
        <div className="wrap">
          <div className="scout-strip">
            <div className="scout-strip-text">
              <h3>
                Know great people? <em>Get paid for it.</em>
              </h3>
              <p>
                Founders, CTOs, investors, operators, and independent recruiters who already
                make great intros — Refery pays you 70% of the placement fee on every hire
                you source. No recruiting overhead, no BD, no platform fees.
              </p>
            </div>
            <div className="scout-strip-cta">
              <a href="/partner-guidelines" className="btn-dark">
                Scout &amp; Partner Guidelines →
              </a>
              <div className="scout-strip-email">
                <a href="mailto:scouts@refery.io">scouts@refery.io</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTACT */}
      <div className="sec reveal">
        <div className="wrap">
          <div className="contact-main">
            <div className="eyebrow">Start hiring</div>
            <h2>
              Your next hire is one
              <br />
              <em>intro</em> away.
            </h2>
            <p>
              Send us a role — a job description, a Notion doc, or even a paragraph.
              <br />
              We&apos;ll take it from there within 48 hours.
            </p>
            <a href={START_HIRING_URL} className="btn-white">
              Start Hiring →
            </a>
            <div className="contact-email">
              or just email us directly —{' '}
              <a href="mailto:hello@refery.io">hello@refery.io</a>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer>
        <div className="footer-top">
          <div>
            <div className="footer-brand">
              Refery<em>.</em>
            </div>
            <div className="footer-brand-desc">
              Referral hiring for the world&apos;s best startups.
            </div>
          </div>
          <div className="footer-col">
            <h4>Startups</h4>
            <ul>
              <li>
                <a href={START_HIRING_URL}>Start Hiring</a>
              </li>
              <li>
                <a href="#how">How it Works</a>
              </li>
              <li>
                <a href="#faq">FAQ</a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Scouts &amp; Partners</h4>
            <ul>
              <li>
                <a href="/partner-guidelines">Guidelines</a>
              </li>
              <li>
                <a href="/auth/login">Partner Login</a>
              </li>
              <li>
                <a href="mailto:scouts@refery.io">scouts@refery.io</a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <ul>
              <li>
                <a href="mailto:hello@refery.io">Contact</a>
              </li>
              <li>
                <a
                  href="https://www.linkedin.com/company/refery-io/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  LinkedIn
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-copy">© 2026 Refery.io. All rights reserved.</div>
          <div className="footer-legal">
            <a href="/terms">Terms of Service</a>
            <a href="/privacy">Privacy Policy</a>
            <a href="/partner-guidelines">Scout &amp; Partner Guidelines</a>
          </div>
        </div>
      </footer>
    </>
  )
}
