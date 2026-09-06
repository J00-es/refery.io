import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { firmsEnabled, getMembership } from '@/lib/firms'
import { InviteForm } from '@/components/firms/invite-form'
import { RemoveMember } from '@/components/firms/remove-member'
import { CARD } from '@/lib/candidate-ui'

/**
 * The firm's own team page.
 *
 * Priya runs her team here so that you never have to add or remove somebody's
 * colleague by hand. The acceptance date sits on each row because that is where
 * an auditor would look for who agreed to what, and when.
 */

export const dynamic = 'force-dynamic'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Firm admin',
  recruiter: 'Recruiter',
  coordinator: 'Coordinator',
}

const ROLE_TINT: Record<string, string> = {
  admin: 'bg-[#E7EDE9] text-[#1F3A2F]',
  recruiter: 'bg-[#E9E8E1] text-[#6E6E68]',
  coordinator: 'bg-[#E5E9EE] text-[#3D5468]',
}

function initials(s: string): string {
  const parts = s.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || s.slice(0, 2).toUpperCase()
}

function when(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function FirmMembersPage() {
  const appUser = await getAppUser()
  if (!appUser) redirect('/auth/login')
  if (!firmsEnabled(appUser)) notFound()

  const admin = createAdminClient()
  const membership = await getMembership(admin, appUser.id)
  if (!membership) redirect('/firm/new')

  const { firm, role } = membership
  const isAdmin = role === 'admin'
  const pendingFirm = firm.status !== 'active'

  const [{ data: members }, { data: invites }] = await Promise.all([
    admin
      .from('partner_org_members')
      .select('user_id, org_role, accepted_user_terms_at, joined_at')
      .eq('org_id', firm.id)
      .is('removed_at', null)
      .order('joined_at', { ascending: true }),
    admin
      .from('partner_org_invites')
      .select('id, email, org_role, expires_at')
      .eq('org_id', firm.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false }),
  ])

  const ids = (members ?? []).map(m => m.user_id as string)
  const { data: people } = ids.length
    ? await admin.from('users_admin').select('user_id, full_name, email').in('user_id', ids)
    : { data: [] as { user_id: string; full_name: string | null; email: string }[] }
  const byId = new Map((people ?? []).map(p => [p.user_id, p]))

  const daysLeft = (iso: string) =>
    Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))

  return (
    <div className="mx-auto max-w-[760px] space-y-5 px-1 pb-16 sm:px-0">
      <header>
        <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-[#161613] sm:text-[34px]">
          {firm.name}
        </h1>
        <p className="mt-2 text-[14px] text-[#6E6E68] sm:text-[15px]">
          {pendingFirm ? (
            <>
              <b className="font-semibold text-[#8A6A17]">Being reviewed.</b> We look at every firm by
              hand. You can invite your colleagues once it is active.
            </>
          ) : (
            <>
              Partner Terms accepted for <b className="font-semibold text-[#161613]">{firm.legal_name}</b>.
              Everyone below works under it.
            </>
          )}
        </p>
      </header>

      {isAdmin && <InviteForm disabled={pendingFirm} />}

      <section className={`${CARD} overflow-hidden`}>
        <h2 className="px-5 pt-5 text-[15px] font-semibold text-[#161613]">
          Team
          <span className="ml-2 font-normal text-[#9C9C95]">{members?.length ?? 0}</span>
        </h2>
        <div className="mt-3">
          {(members ?? []).map(m => {
            const person = byId.get(m.user_id as string)
            const label = person?.full_name || person?.email || 'Unknown'
            return (
              <div
                key={m.user_id as string}
                className="flex items-center gap-3 border-t border-[#E4E3DC] px-5 py-3.5"
              >
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-[#E4EDE7] text-[11px] font-semibold text-[#2C5A45]"
                >
                  {initials(label)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-[#161613]">{label}</span>
                  <span className="block truncate text-[12.5px] text-[#6E6E68]">
                    {m.accepted_user_terms_at
                      ? `Accepted ${when(m.accepted_user_terms_at as string)}`
                      : person?.email ?? ''}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] ${
                    ROLE_TINT[m.org_role as string] ?? ROLE_TINT.recruiter
                  }`}
                >
                  {ROLE_LABEL[m.org_role as string] ?? m.org_role}
                </span>
                {/* An admin can remove anyone but themselves. The endpoint also
                    refuses the last admin, so a firm cannot lock itself out. */}
                {isAdmin && (m.user_id as string) !== appUser.id && (
                  <RemoveMember userId={m.user_id as string} name={label} />
                )}
              </div>
            )
          })}

          {(invites ?? []).map(i => (
            <div key={i.id as string} className="flex items-center gap-3 border-t border-[#E4E3DC] px-5 py-3.5">
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-[#F4F0E4] text-[11px] font-semibold text-[#8A6A17]"
              >
                {initials(i.email as string)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[#161613]">{i.email}</span>
                <span className="block truncate text-[12.5px] text-[#6E6E68]">
                  Invited · expires in {daysLeft(i.expires_at as string)} days
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-[#FAF0D7] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#8A6A17]">
                Pending
              </span>
            </div>
          ))}
        </div>
      </section>

      {!isAdmin && (
        <p className="text-[13px] text-[#9C9C95]">
          Only a firm admin can invite or remove people. Ask whoever set the firm up.
        </p>
      )}
    </div>
  )
}
