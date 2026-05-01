'use client'

import Link from 'next/link'
import { FileCheck, ArrowRight } from 'lucide-react'

export default function Page() {
  return (
    <div 
      className="min-h-svh w-full"
      style={{ 
        background: '#F8F8F3',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <header 
        className="fixed top-0 left-0 right-0 z-10"
        style={{
          background: 'rgba(248,248,243,0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(16,15,15,0.10)',
        }}
      >
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link 
            href="/" 
            style={{ 
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: '22px',
              color: '#100F0F',
              textDecoration: 'none',
            }}
          >
            Refery<span style={{ color: '#2A6B45' }}>.</span>io
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-32 pb-16 px-6">
        <div className="max-w-xl mx-auto text-center">
          {/* Success Icon */}
          <div 
            className="mx-auto mb-8 w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: '#EBF4EF' }}
          >
            <svg 
              width="28" 
              height="28" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="#2A6B45" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>

          {/* Welcome Message */}
          <h1 
            className="mb-4"
            style={{ 
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: '42px',
              fontWeight: 400,
              lineHeight: 1.1,
              color: '#100F0F',
              letterSpacing: '-0.02em',
            }}
          >
            Thank you for signing up
          </h1>
          
          <p 
            className="max-w-md mx-auto mb-10"
            style={{ 
              fontSize: '16px',
              lineHeight: 1.6,
              color: 'rgba(16,15,15,0.64)',
            }}
          >
            Our team is reviewing your application. We&apos;ll get back to you within 48 hours.
          </p>

          {/* Status Card */}
          <div 
            className="text-left mb-10 p-6"
            style={{ 
              background: '#FFFFFF',
              border: '1px solid rgba(16,15,15,0.10)',
              borderRadius: '10px',
            }}
          >
            <div className="flex items-start gap-4">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: '#EBF4EF' }}
              >
                <FileCheck className="h-5 w-5" style={{ color: '#2A6B45' }} />
              </div>
              <div>
                <h3 
                  className="mb-1.5"
                  style={{ 
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#100F0F',
                  }}
                >
                  Partner agreement
                </h3>
                <p 
                  style={{ 
                    fontSize: '14px',
                    lineHeight: 1.6,
                    color: 'rgba(16,15,15,0.64)',
                  }}
                >
                  If you&apos;ve already signed your partner agreement, you&apos;re all set. 
                  Our team will review your application and get you access as soon as possible.
                </p>
                <p 
                  className="mt-3"
                  style={{ 
                    fontSize: '14px',
                    lineHeight: 1.6,
                    color: 'rgba(16,15,15,0.64)',
                  }}
                >
                  Haven&apos;t received it yet? Check your inbox or reach out to us.
                </p>
              </div>
            </div>
          </div>

          {/* Back to Login */}
          <Link 
            href="/auth/login"
            className="inline-flex items-center gap-2 transition-colors"
            style={{ 
              fontSize: '14px',
              fontWeight: 500,
              color: '#2A6B45',
            }}
          >
            Back to login
            <ArrowRight className="h-4 w-4" />
          </Link>

          {/* Footer */}
          <div 
            className="mt-16 pt-8"
            style={{ borderTop: '1px solid rgba(16,15,15,0.06)' }}
          >
            <p 
              style={{ 
                fontSize: '13px',
                color: 'rgba(16,15,15,0.40)',
              }}
            >
              Questions?{' '}
              <a 
                href="mailto:hello@refery.io" 
                style={{ 
                  color: '#2A6B45',
                  fontWeight: 500,
                }}
              >
                Contact support
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
