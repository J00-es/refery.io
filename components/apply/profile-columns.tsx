import type { ApplyAnswers } from '@/lib/apply/options'

/** The form's answers in the shape `saysLine` reads, for the browser (no server imports). */
export function profileColumnsFromClient(a: ApplyAnswers) {
  return {
    looking: a.looking,
    locations: a.locations,
    cities: a.cities as Record<string, string>,
    relocation: a.relocation,
    setting: a.setting,
    work_auth_us: a.workAuthUs,
    work_auth_uk_eu: a.workAuthUkEu,
    work_auth_other: a.workAuthOther || null,
    bases: a.bases,
    current_base: a.currentBase,
    start_by: a.startBy,
    stages: a.stages,
    functions: a.functions,
    roles: a.roles,
    roles_other: a.rolesOther || null,
  }
}
