import type { ReactNode } from 'react'

/**
 * Small replicas of the live screens, drawn with the same tokens as the desk
 * (cream ground, white cards, #E4E3DC hairlines, forest #1F3A2F) so a partner
 * recognises what they will see. Everything in them is fictional: Maya Okafor
 * is the partner, Daniel Reyes and Priya Natarajan are candidates, clients
 * appear as their aliases.
 */

export function Frame({ title, children, phone = false }: { title?: string; children: ReactNode; phone?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-[14px] border border-[#E4E3DC] bg-[#F2F1EB] ${phone ? 'mx-auto w-full max-w-[360px]' : 'w-full'}`}>
      {title && (
        <div className="flex items-center gap-2 border-b border-[#E4E3DC] bg-white px-3 py-2 text-[11.5px] text-[#9C9C95]">
          <span className="h-2 w-2 rounded-full bg-[#E4E3DC]" />
          <span className="h-2 w-2 rounded-full bg-[#E4E3DC]" />
          <span className="ml-1 font-mono">{title}</span>
        </div>
      )}
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[12px] border border-[#E4E3DC] bg-white p-3 ${className}`}>{children}</div>
}

export function H({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div>
      <p className="text-[13.5px] font-semibold text-[#161613]">{children}</p>
      {sub && <p className="mt-0.5 text-[11.5px] text-[#6E6E68]">{sub}</p>}
    </div>
  )
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'value' | 'warn' | 'bad' | 'blue' | 'dark' }) {
  const cls = {
    neutral: 'bg-[#EAE9E1] text-[#6E6E68]',
    value: 'bg-[#E7EDE9] text-[#1F3A2F]',
    warn: 'bg-[#F5EEDD] text-[#8A6A1F]',
    bad: 'bg-[#F9EBE9] text-[#9C3F37]',
    blue: 'bg-[#E7EDF2] text-[#33566E]',
    dark: 'bg-[#1F3A2F] text-white',
  }[tone]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${cls}`}>{children}</span>
}

export function Btn({ children, kind = 'primary', small = true }: { children: ReactNode; kind?: 'primary' | 'quiet' | 'text' | 'gold'; small?: boolean }) {
  const cls = {
    primary: 'bg-[#1F3A2F] text-white',
    quiet: 'border border-[#D2D1C7] bg-white text-[#161613]',
    text: 'text-[#1F3A2F]',
    gold: 'bg-[#C8A24B] text-[#173B2D]',
  }[kind]
  return <span className={`inline-flex items-center justify-center rounded-full font-semibold ${small ? 'min-h-[30px] px-3 text-[12px]' : 'min-h-[38px] px-4 text-[13px]'} ${cls}`}>{children}</span>
}

export function Field({ label, value, placeholder, tall = false }: { label?: string; value?: string; placeholder?: string; tall?: boolean }) {
  return (
    <div>
      {label && <p className="mb-1 text-[11.5px] font-medium text-[#2A2A26]">{label}</p>}
      <div className={`whitespace-pre-line rounded-[10px] border border-[#D2D1C7] bg-white px-2.5 py-1.5 text-[12px] leading-relaxed ${value ? 'text-[#161613]' : 'text-[#9C9C95]'} ${tall ? 'min-h-[96px]' : ''}`}>{value ?? placeholder}</div>
    </div>
  )
}

export function Pill({ children, on = false }: { children: ReactNode; on?: boolean }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${on ? 'border-[#1F3A2F] bg-[#E7EDE9] text-[#1F3A2F]' : 'border-[#D2D1C7] bg-white text-[#161613]'}`}>{children}</span>
}

/** The six-bar journey strip from the candidate page. */
export function Journey({ active }: { active: number }) {
  const steps = ['Uploaded', 'In review', 'Intro asked', 'Intro sent', 'Call booked', 'Warm']
  return (
    <div className="grid grid-cols-6 gap-1">
      {steps.map((s, i) => (
        <div key={s}>
          <div className={`h-1.5 rounded-full ${i <= active ? 'bg-[#1F3A2F]' : 'bg-[#E4E3DC]'}`} />
          <p className={`mt-1 hidden text-[10px] sm:block ${i === active ? 'font-semibold text-[#161613]' : 'text-[#9C9C95]'}`}>{s}</p>
        </div>
      ))}
    </div>
  )
}

/** The search stage strip from the role page. */
export function Stage({ active }: { active: number }) {
  const steps = ['Sourcing', 'Shortlisting', 'Client interviewing', 'Offer out', 'Filled']
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
      {steps.map((s, i) => (
        <span key={s} className={`rounded-full px-2 py-0.5 ${i === active ? 'bg-[#1F3A2F] text-white' : i < active ? 'bg-[#E7EDE9] text-[#1F3A2F]' : 'bg-[#EAE9E1] text-[#9C9C95]'}`}>{s}</span>
      ))}
    </div>
  )
}

export function Avatar({ initials, tone = 'green' }: { initials: string; tone?: 'green' | 'amber' | 'grey' }) {
  const cls = { green: 'bg-[#E7EDE9] text-[#1F3A2F]', amber: 'bg-[#F5EEDD] text-[#8A6A1F]', grey: 'bg-[#EAE9E1] text-[#6E6E68]' }[tone]
  return <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${cls}`}>{initials}</span>
}

/** One row of the candidates list. */
export function Row({ initials, name, line, right, chip, tone = 'green', grade }: { initials: string; name: string; line: string; right: string; chip?: ReactNode; tone?: 'green' | 'amber' | 'grey'; grade?: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[#E9E8E1] px-2.5 py-2 last:border-0">
      <Avatar initials={initials} tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-semibold text-[#161613]">{name}</span>
          {chip}
        </div>
        <p className="truncate text-[11px] text-[#6E6E68]">{line}</p>
      </div>
      {grade && <span className="rounded-md bg-[#E7EDE9] px-1.5 py-0.5 text-[10px] font-bold text-[#1F3A2F]">{grade}</span>}
      <span className="hidden w-[120px] text-right text-[11px] text-[#9C9C95] sm:block">{right}</span>
    </div>
  )
}

/** A tile from the Needs you strip on Searches. */
export function Tile({ children, tone = 'amber' }: { children: ReactNode; tone?: 'amber' | 'green' }) {
  const cls = tone === 'amber' ? 'bg-[#F5EEDD] text-[#8A6A1F]' : 'bg-[#E7EDE9] text-[#1F3A2F]'
  return (
    <div className={`flex items-center gap-2 rounded-[10px] px-3 py-2 text-[12px] font-medium ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      <span className="flex-1">{children}</span>
      <span aria-hidden>→</span>
    </div>
  )
}

/** A plain-text email, the way it lands. */
export function Letter({ from, to, subject, body, buttons = [] }: { from: string; to: string; subject: string; body: string; buttons?: { label: string; kind?: 'primary' | 'quiet' }[] }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[#E4E3DC] bg-white">
      <div className="grid grid-cols-[56px_1fr] gap-y-0.5 border-b border-[#E4E3DC] bg-[#FAF9F5] px-3 py-2 text-[11px] text-[#6E6E68]">
        <span>From</span>
        <span className="text-[#161613]">{from}</span>
        <span>To</span>
        <span className="text-[#161613]">{to}</span>
        <span>Subject</span>
        <span className="font-semibold text-[#161613]">{subject}</span>
      </div>
      <div className="whitespace-pre-line px-3 py-3 text-[12.5px] leading-relaxed text-[#2A2A26]">{body}</div>
      {buttons.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pb-3">
          {buttons.map(b => (
            <Btn key={b.label} kind={b.kind ?? 'primary'}>
              {b.label}
            </Btn>
          ))}
        </div>
      )}
    </div>
  )
}

/** The composer sheet, as it opens on a phone. */
export function SheetMock({ first, moment, subject, body, cc, effect }: { first: string; moment: string; subject: string; body: string; cc?: string; effect: string }) {
  const moments = ['Received your CV', 'Put you forward', 'Meet Lily', 'They want to meet you', 'Not this time', 'Congratulations', 'Blank']
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#E4E3DC] bg-white">
      <div className="border-b border-[#E4E3DC] px-3 py-2.5">
        <p className="text-[14px] font-semibold text-[#161613]">Write to {first}</p>
        <p className="text-[11px] text-[#6E6E68]">In your name, through Refery. Replies go to maya@okafor.co.</p>
      </div>
      <div className="space-y-2.5 px-3 py-3">
        <div className="flex flex-wrap gap-1">
          {moments.map(m => (
            <Pill key={m} on={m === moment}>
              {m}
            </Pill>
          ))}
        </div>
        <div className="grid grid-cols-[44px_1fr] gap-y-1 text-[11.5px]">
          <span className="text-[#9C9C95]">To</span>
          <span>daniel.reyes@…</span>
          <span className="text-[#9C9C95]">From</span>
          <span>
            Maya Okafor via Refery <span className="text-[#9C9C95]">&lt;partners@refery.io&gt;</span>
          </span>
          <span className="text-[#9C9C95]">Cc</span>
          <span>{cc ?? 'nobody'}</span>
        </div>
        <Field label="Subject" value={subject} />
        <Field label="Message" value={body} tall />
        <p className="text-[11px] text-[#6E6E68]">✓ {effect}</p>
      </div>
      <div className="flex items-center justify-between border-t border-[#E4E3DC] px-3 py-2.5">
        <span className="text-[12px] font-semibold text-[#1F3A2F]">Open in Gmail instead</span>
        <Btn small={false}>Send</Btn>
      </div>
    </div>
  )
}

/** Two or three screens side by side, stacking on a phone. */
export function Flow({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-[10px] bg-[#FFF7D6] px-3 py-2 text-[11.5px] leading-relaxed text-[#5B4A0F]">{children}</p>
}
