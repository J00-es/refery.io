import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, GraduationCap, Briefcase, Award, BookOpen, Heart, Lightbulb, Languages } from 'lucide-react'
import { formatEducationYears, formatRoleDates } from '@/lib/resume'
import type { ParsedResumeData } from '@/lib/types'

/**
 * Everything a resume said, rendered.
 *
 * The profile page used to show a summary, up to every role's one-line
 * description, and a degree line — which meant the bullet points that carry all
 * the quantified detail, plus links, projects, awards, languages and the
 * document text itself, existed only inside the PDF. These components are
 * shared with the pre-create review screen so what a recruiter approves is
 * exactly what the profile ends up showing.
 *
 * Every section renders only when it has content, so profiles parsed by the
 * older, thinner extractor degrade to what they had before rather than showing
 * a page of empty cards.
 */

function hasItems(value: unknown[] | undefined | null): boolean {
  return Array.isArray(value) && value.length > 0
}

export function WorkHistorySection({ parsed }: { parsed: ParsedResumeData }) {
  if (!hasItems(parsed.work_history)) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          Work History
          <span className="text-sm font-normal text-muted-foreground">
            {parsed.work_history.length} position{parsed.work_history.length === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {parsed.work_history.map((role, i) => (
            <div key={i} className="border-l-2 border-border pl-4">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="font-medium text-foreground">{role.title}</p>
                {role.is_current && (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">Current</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {[role.company, formatRoleDates(role), role.location, role.employment_type]
                  .filter(Boolean)
                  .join(' · ')}
              </p>

              {role.description && (
                <p className="mt-2 text-sm text-foreground">{role.description}</p>
              )}

              {hasItems(role.highlights) && (
                <ul className="mt-2 space-y-1.5">
                  {role.highlights!.map((highlight, h) => (
                    <li key={h} className="flex gap-2 text-sm text-foreground">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              )}

              {hasItems(role.technologies) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {role.technologies!.map(tech => (
                    <span key={tech} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {tech}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function EducationSection({ parsed }: { parsed: ParsedResumeData }) {
  if (!hasItems(parsed.education)) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          Education
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {parsed.education.map((edu, i) => (
            <div key={i}>
              <p className="font-medium text-foreground">
                {[edu.degree, edu.field].filter(Boolean).join(' in ') || edu.institution}
              </p>
              <p className="text-sm text-muted-foreground">
                {[edu.institution, formatEducationYears(edu), edu.location]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {(edu.honors || edu.gpa) && (
                <p className="mt-1 text-sm text-foreground">
                  {[edu.honors, edu.gpa && `GPA ${edu.gpa}`].filter(Boolean).join(' · ')}
                </p>
              )}
              {edu.activities && (
                <p className="mt-1 text-sm text-muted-foreground">{edu.activities}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function ProjectsSection({ parsed }: { parsed: ParsedResumeData }) {
  if (!hasItems(parsed.projects)) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5" />
          Projects
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {parsed.projects!.map((project, i) => (
            <div key={i}>
              <p className="font-medium text-foreground">
                {project.url ? (
                  <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {project.name}
                  </a>
                ) : (
                  project.name
                )}
              </p>
              {project.description && <p className="text-sm text-foreground">{project.description}</p>}
              {hasItems(project.technologies) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {project.technologies!.map(tech => (
                    <span key={tech} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {tech}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function AwardsSection({ parsed }: { parsed: ParsedResumeData }) {
  if (!hasItems(parsed.awards)) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5" />
          Awards &amp; Recognition
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {parsed.awards!.map((award, i) => (
            <div key={i}>
              <p className="font-medium text-foreground">{award.name}</p>
              <p className="text-sm text-muted-foreground">
                {[award.issuer, award.year].filter(Boolean).join(' · ')}
              </p>
              {award.description && <p className="mt-1 text-sm text-foreground">{award.description}</p>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function PublicationsSection({ parsed }: { parsed: ParsedResumeData }) {
  if (!hasItems(parsed.publications)) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Publications
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {parsed.publications!.map((pub, i) => (
            <div key={i}>
              <p className="font-medium text-foreground">
                {pub.url ? (
                  <a href={pub.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {pub.title}
                  </a>
                ) : (
                  pub.title
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {[pub.venue, pub.year].filter(Boolean).join(' · ')}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function VolunteerSection({ parsed }: { parsed: ParsedResumeData }) {
  if (!hasItems(parsed.volunteer)) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="h-5 w-5" />
          Volunteering
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {parsed.volunteer!.map((entry, i) => (
            <div key={i}>
              <p className="font-medium text-foreground">{[entry.role, entry.organization].filter(Boolean).join(' — ')}</p>
              {entry.duration && <p className="text-sm text-muted-foreground">{entry.duration}</p>}
              {entry.description && <p className="mt-1 text-sm text-foreground">{entry.description}</p>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * The résumé transcribed in full, collapsed by default.
 *
 * This is the answer to "did we actually read the whole thing" — if a detail is
 * missing from the structured sections above, it can still be found here
 * without opening the PDF. Uses a native <details> so it stays a server
 * component.
 */
export function FullResumeTextSection({ parsed }: { parsed: ParsedResumeData }) {
  const text = parsed.raw_text?.trim()
  if (!text) return null

  const wordCount = text.split(/\s+/).length

  return (
    <Card>
      <CardContent className="pt-6">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-foreground">
            <FileText className="h-5 w-5" />
            Full résumé text
            <span className="text-sm font-normal text-muted-foreground">
              {wordCount.toLocaleString()} words · click to expand
            </span>
          </summary>
          <div className="mt-4 max-h-[32rem] overflow-y-auto rounded-lg border border-border bg-muted/40 p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</p>
          </div>
          {parsed.extraction_notes && (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Parser notes: </span>
              {parsed.extraction_notes}
            </p>
          )}
        </details>
      </CardContent>
    </Card>
  )
}

export function LanguagesSection({ parsed }: { parsed: ParsedResumeData }) {
  if (!hasItems(parsed.languages)) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          Languages
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {parsed.languages!.map((lang, i) => (
            <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-foreground">{lang.language}</span>
              {lang.proficiency && <span className="text-muted-foreground">{lang.proficiency}</span>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/** Everything from the resume that belongs in the main column, in reading order. */
export function ResumeBodySections({ parsed }: { parsed: ParsedResumeData }) {
  return (
    <>
      <WorkHistorySection parsed={parsed} />
      <EducationSection parsed={parsed} />
      <ProjectsSection parsed={parsed} />
      <PublicationsSection parsed={parsed} />
      <AwardsSection parsed={parsed} />
      <VolunteerSection parsed={parsed} />
      <FullResumeTextSection parsed={parsed} />
    </>
  )
}
