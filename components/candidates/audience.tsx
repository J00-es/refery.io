/**
 * A quiet note next to a section title saying who else can see it. Rendered
 * for the super admin only, so Lily can tell at a glance what a partner or
 * scout reads on this page and what stays internal. Never shown to anyone
 * else; nothing here is a control.
 */
export function Audience({ show, who }: { show: boolean; who: 'you' | 'owner' }) {
  if (!show) return null
  return (
    <span
      title={who === 'you' ? 'Only super admins see this section.' : 'The partner or scout who owns this person sees this section too.'}
      className="ml-2 inline-block rounded-full border border-[#E4E3DC] px-1.5 py-px align-middle text-[10.5px] font-medium tracking-wide text-[#9C9C95]"
    >
      {who === 'you' ? 'you only' : 'owner sees'}
    </span>
  )
}
