import { sha256 } from './evidence'
export const CAPABILITY_VERSION = 'capabilities-v1'

/** Shadow retrieval text. No grades, schools, employer prestige or logistics.
 * Job titles remain because the responsibility is useful retrieval evidence. */
export function capabilityText(kind: 'candidate' | 'job', row: Record<string, unknown>) {
  const p = kind === 'candidate' && row.parsed_data && typeof row.parsed_data === 'object' ? row.parsed_data as Record<string, unknown> : row
  const lines: string[] = []
  const add = (label: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) lines.push(`${label}: ${value.trim()}`)
    else if (Array.isArray(value)) for (const v of value) add(label, v)
  }
  const identifiers = [row.name, row.email, row.phone, row.company_name]
  if (kind === 'candidate') {
    add('Skills', p.skills)
    for (const field of ['work_history', 'projects']) {
      for (const item of Array.isArray(p[field]) ? p[field] as Record<string, unknown>[] : []) {
        if (!item || typeof item !== 'object') continue
        identifiers.push(item.company)
        add('Role', item.title); add('Work', item.description); add('Outcome', item.highlights); add('Tools', item.technologies)
      }
    }
    for (const school of Array.isArray(p.education) ? p.education as Record<string, unknown>[] : []) identifiers.push(school?.institution)
  } else {
    add('Role', row.title); add('Skills', row.skills_required); add('Requirements', row.requirements)
    // A whole JD often contains benefits, citizenship and demographic language.
    // Use requirements; missing requirements are recorded as thin evidence.
  }
  let text = lines.join('\n')
  for (const value of identifiers) if (typeof value === 'string' && value.trim().length >= 3) text = text.replace(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[identity omitted]')
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email omitted]').slice(0, 12000)
  return { text, version: CAPABILITY_VERSION, inputHash: sha256(`${CAPABILITY_VERSION}\n${text}`), thin: text.length < 30 }
}
