'use client'

import Link from 'next/link'
import { AgreementContent } from '@/components/agreement-content'
import { RECRUITER_AGREEMENT_TEXT } from '@/lib/agreements'

export default function RecruitingPartnerAgreementPage() {
  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600;700&display=swap');
        
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        
        :root {
          --bg: #F8F8F3;
          --bg-2: #F0F0EA;
          --bg-3: #E8E8E1;
          --card: #FFFFFF;
          --ink: #100F0F;
          --ink-2: rgba(16,15,15,0.64);
          --ink-3: rgba(16,15,15,0.40);
          --ink-4: rgba(16,15,15,0.20);
          --green: #2A6B45;
          --green-bg: #EBF4EF;
          --border: rgba(16,15,15,0.10);
          --r: 10px;
          --r-sm: 6px;
        }
        
        html { scroll-behavior: smooth; }
        body {
          background: var(--bg);
          font-family: 'Inter', system-ui, sans-serif;
          color: var(--ink);
          line-height: 1.6;
          overflow-x: hidden;
        }

        @media (max-width: 768px) {
          .agreement-container { padding: 40px 20px !important; }
          .agreement-inner { padding: 0 !important; }
        }
      `}</style>

      {/* NAV */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(248,248,243,0.88)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', height: 58
      }}>
        <Link href="/" style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 20, color: 'var(--ink)', textDecoration: 'none' }}>
          Refery<em style={{ fontStyle: 'italic' }}>.</em>
        </Link>
        <Link href="/" style={{
          fontSize: 14, fontWeight: 500, color: 'var(--ink-2)', textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 6
        }}>
          <span style={{ fontSize: 18 }}>&#8592;</span> Back to Home
        </Link>
      </nav>

      {/* AGREEMENT CONTENT */}
      <div className="agreement-container" style={{ 
        maxWidth: 800, 
        margin: '0 auto', 
        padding: '60px 40px 80px' 
      }}>
        <div className="agreement-inner">
          {/* Version and Date Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 32,
            padding: '10px 16px',
            background: 'var(--green-bg)',
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--green)'
          }}>
            <span>Version 1.2</span>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--green)', opacity: 0.4 }} />
            <span>Last Updated: May 9, 2026</span>
          </div>

          {/* Agreement Content */}
          <AgreementContent 
            content={RECRUITER_AGREEMENT_TEXT} 
            density="comfortable"
            showEyebrow={true}
          />

          {/* Footer Note */}
          <div style={{
            marginTop: 48,
            padding: '24px',
            background: 'var(--bg-2)',
            borderRadius: 'var(--r)',
            border: '1px solid var(--border)'
          }}>
            <p style={{
              fontSize: 14,
              color: 'var(--ink-2)',
              lineHeight: 1.7,
              margin: 0
            }}>
              This agreement is displayed for reference purposes. To become a Recruiting Partner, please{' '}
              <Link href="https://cal.com/refery-lily/15" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)', textDecoration: 'underline' }}>
                book an intro call
              </Link>{' '}
              or{' '}
              <Link href="/auth/sign-up" style={{ color: 'var(--green)', textDecoration: 'underline' }}>
                sign up
              </Link>{' '}
              to accept the agreement electronically.
            </p>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ background: 'var(--ink)', padding: '48px 40px 28px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
          maxWidth: 800, margin: '0 auto'
        }}>
          <div style={{ fontSize: 12, color: 'rgba(248,248,243,0.18)' }}>© 2026 Refery.io. All rights reserved.</div>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link href="/terms" style={{ fontSize: 12, color: 'rgba(248,248,243,0.18)', textDecoration: 'none' }}>Terms</Link>
            <Link href="/privacy" style={{ fontSize: 12, color: 'rgba(248,248,243,0.18)', textDecoration: 'none' }}>Privacy</Link>
            <Link href="/recruiting-partner-agreement" style={{ fontSize: 12, color: 'rgba(248,248,243,0.35)', textDecoration: 'none' }}>Recruiting Partner Agreement</Link>
          </div>
        </div>
      </footer>
    </>
  )
}
