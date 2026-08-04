'use client'

import { memo, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Banknote, MapPin, Users } from 'lucide-react'
import { CARD, CHIP, FOCUS, avatarTint, initialsOf } from '@/lib/candidate-ui'
import { stageLabel, stageTint, usableLogo } from '@/lib/company-ui'
import {
  REMOTE_LABELS,
  STATUS_META,
  formatExperience,
  formatSalary,
  isFresh,
  isPartnerRole,
  shortAge,
  visaSignal,
} from '@/lib/job-ui'

export interface JobRow {
  id: string
  title: string
  company_name?: string | null
  company_id?: string | null
  company_stage?: string | null
  company_logo_url?: string | null
  department?: string | null
  location?: string | null
  remote_policy?: string | null
  salary_min?: number | null
  salary_max?: number | null
  experience_years_min?: number | null
  experience_years_max?: number | null
  visa_requirement?: string | null
  status?: string | null
  internal_deal_type?: string | null
  referral_bonus?: number | null
  referral_bonus_type?: string | null
  pipeline_count?: number | null
  created_at?: string | null
}

function Logo({ name, url: rawUrl }: { name: string; url?: string | null }) {
  const url = usableLogo(rawUrl)
  const [failed, setFailed] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth === 0) setFailed(true)
  }, [url])

  if (!url || failed) {
    return (
      <span
        aria-hidden
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-[11px] text-[13px] font-semibold ${avatarTint(name)}`}
      >
        {initialsOf(name)}
      </span>
    )
  }
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[11px] border border-[#ECECE6] bg-white p-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={url}
        alt=""
        loading="lazy"
        className="h-full w-full object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

function JobCardComponent({ job, isAdmin = false }: { job: JobRow; isAdmin?: boolean }) {
  const company = job.company_name || 'Unknown company'
  const salary = formatSalary(job.salary_min, job.salary_max)
  const experience = formatExperience(job.experience_years_min, job.experience_years_max)
  const remote = job.remote_policy ? REMOTE_LABELS[job.remote_policy] : null
  const stage = stageLabel(job.company_stage)
  const visa = visaSignal(job.visa_requirement)
  const status = STATUS_META[job.status || 'open']
  const fresh = isFresh(job.created_at)
  const partner = isPartnerRole(job.internal_deal_type)
  const pipeline = job.pipeline_count ?? 0

  return (
    <Link href={`/jobs/${job.id}`} className={`group block h-full rounded-[18px] ${FOCUS}`}>
      <article
        className={`${CARD} grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_1fr_auto] gap-3.5 overflow-hidden p-4 transition-[border-color,box-shadow] duration-150 group-hover:border-[#D8D8D0] group-hover:shadow-[0_2px_12px_rgba(22,22,19,0.06)] sm:p-5`}
      >
        {/* ── identity: the role leads, the company qualifies it ─────────── */}
        <header className="flex min-w-0 items-start gap-3">
          <Logo name={company} url={job.company_logo_url} />
          <div className="min-w-0 flex-1">
            <h3
              className="line-clamp-2 text-[15.5px] font-semibold leading-tight tracking-[-0.01em] text-[#161613]"
              title={job.title}
            >
              {job.title}
            </h3>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] leading-snug text-[#6E6E68]">
              <span className="truncate" title={company}>
                {company}
              </span>
              {stage && (
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold leading-none ${stageTint(job.company_stage)}`}
                >
                  {stage}
                </span>
              )}
            </p>
          </div>
          {/* Almost the whole board is sourced by us, so the few roles we
              actually have an agreement on need to be identifiable at a
              glance — that changes how a scout approaches them. It outranks
              the freshness marker. */}
          {partner ? (
            <span
              className="shrink-0 rounded-full bg-[#1F4D3A] px-2 py-0.5 text-[10.5px] font-semibold text-white"
              title="We have an agreement or a live conversation on this role"
            >
              Partner
            </span>
          ) : (
            fresh && (
              <span className="shrink-0 rounded-full bg-[#E9F0EC] px-2 py-0.5 text-[10.5px] font-semibold text-[#1F4D3A]">
                New
              </span>
            )
          )}
        </header>

        {/*
          ── where and what it pays ────────────────────────────────────────
          Location is on 100% of rows and salary on only 18%, so the salary
          slot collapses rather than reserving a permanent gap. Only the
          location flexes; the pay and policy never get pushed out of view.
        */}
        <div className="min-w-0 space-y-2">
          <p className="flex min-w-0 items-center gap-2 text-[13px] text-[#6E6E68]">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[#9C9C95]" />
            <span className="min-w-0 flex-1 truncate" title={job.location ?? undefined}>
              {job.location || 'Location not specified'}
            </span>
            {remote && (
              <>
                <span className="shrink-0 text-[#D8D8D0]">·</span>
                <span className="shrink-0">{remote}</span>
              </>
            )}
          </p>
          {salary && (
            <p className="flex items-center gap-2 text-[13.5px]">
              <Banknote className="h-3.5 w-3.5 shrink-0 text-[#9C9C95]" />
              <span className="font-semibold text-[#161613]">{salary}</span>
              {experience && <span className="text-[#9C9C95]">· {experience}</span>}
            </p>
          )}
        </div>

        {/* ── qualifiers ─────────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-2.5">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {/* A few dozen scraped rows have the city pasted into department;
                repeating the location as a chip just reads as a mistake. */}
            {job.department && job.department !== job.location && (
              <span className={CHIP} title={job.department}>
                <span className="truncate">{job.department}</span>
              </span>
            )}
            {!salary && experience && (
              <span className={CHIP}>
                <span className="truncate">{experience}</span>
              </span>
            )}
            {visa && (
              <span className={CHIP} title={visa}>
                <span className="truncate">{visa}</span>
              </span>
            )}
          </div>

          {/* Referral bonus is on only 34 of 72,862 jobs, so when it is set it
              is genuinely notable — give it real emphasis rather than a chip. */}
          {job.referral_bonus ? (
            <p className="flex items-center gap-1.5 rounded-[10px] bg-[#E9F0EC] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#1F4D3A]">
              ${job.referral_bonus.toLocaleString()} referral bonus
              {job.referral_bonus_type ? (
                <span className="font-normal opacity-70">· {job.referral_bonus_type}</span>
              ) : null}
            </p>
          ) : null}
        </div>

        {/* ── footer ─────────────────────────────────────────────────────── */}
        <footer className="flex min-w-0 items-center justify-between gap-3 border-t border-[#ECECE6] pt-3 text-[12px]">
          <span className="flex min-w-0 items-center gap-3">
            {isAdmin && status && (
              <span className="flex shrink-0 items-center gap-1.5 text-[#6E6E68]">
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
            )}
            {pipeline > 0 && (
              <span className="flex shrink-0 items-center gap-1.5 font-medium text-[#1F4D3A]">
                <Users className="h-3.5 w-3.5" />
                {pipeline}
              </span>
            )}
          </span>
          <span className="shrink-0 text-[#9C9C95]">{shortAge(job.created_at)}</span>
        </footer>
      </article>
    </Link>
  )
}

export const JobCard = memo(JobCardComponent)
