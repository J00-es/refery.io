'use client'

/**
 * One comment store for the whole brief.
 *
 * Comments appear in three places — under a section, under a checklist
 * question, and in the general thread at the foot — and all three have to agree
 * about what exists. So the state lives here once and every surface reads it,
 * rather than each fetching its own slice and drifting.
 *
 * ── Who owns a comment ─────────────────────────────────────────────────────
 * There is no account. On create the server mints a token and returns it once;
 * we keep it in localStorage against the comment id. Holding the token is what
 * lets you edit or delete, so ownership survives a reload and a closed laptop,
 * and stays confined to the browser that wrote the comment.
 *
 * Nothing here is read during render — localStorage on the server is undefined
 * and a first paint that disagrees with the server's HTML would be a hydration
 * error. Ownership fills in after mount, which is why the edit and delete
 * controls appear a beat late on a hard refresh.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export interface BriefComment {
  id: string
  sectionId: string | null
  sectionLabel: string | null
  prompt: string | null
  authorName: string | null
  body: string
  createdAt: string
  editedAt: string | null
}

export interface NewComment {
  body: string
  authorName?: string | null
  sectionId?: string | null
  sectionLabel?: string | null
  prompt?: string | null
}

interface CommentsValue {
  comments: BriefComment[]
  /** Ids this browser can edit. Empty until after mount — see the note above. */
  owned: Set<string>
  authorName: string
  rememberName: (name: string) => void
  add: (input: NewComment) => Promise<void>
  edit: (id: string, body: string) => Promise<void>
  remove: (id: string) => Promise<void>
  /** Where the reader is in the document, for the telemetry beacon. */
  sessionId: string
}

const CommentsContext = createContext<CommentsValue | null>(null)

export function useBriefComments(): CommentsValue {
  const ctx = useContext(CommentsContext)
  if (!ctx) throw new Error('useBriefComments must be used inside <BriefCommentsProvider>')
  return ctx
}

/** The name is the same person across every brief they are sent; the tokens are not. */
const NAME_KEY = 'refery.brief.author'
const tokensKey = (slug: string) => `refery.brief.${slug}.tokens`
const sessionKey = (slug: string) => `refery.brief.${slug}.session`

function readTokens(slug: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(tokensKey(slug))
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    // A cleared or blocked store means no edit rights, which is a fine outcome.
    return {}
  }
}

function writeTokens(slug: string, tokens: Record<string, string>) {
  try {
    window.localStorage.setItem(tokensKey(slug), JSON.stringify(tokens))
  } catch {
    /* Private mode. The comment still posted; it just cannot be edited later. */
  }
}

/** Stable per tab, so the reading trail groups into one sitting. */
function ensureSessionId(slug: string): string {
  const fresh = () =>
    `s${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`.slice(0, 40)
  try {
    const existing = window.sessionStorage.getItem(sessionKey(slug))
    if (existing) return existing
    const made = fresh()
    window.sessionStorage.setItem(sessionKey(slug), made)
    return made
  } catch {
    return fresh()
  }
}

export function BriefCommentsProvider({
  slug,
  initial,
  children,
}: {
  slug: string
  initial: BriefComment[]
  children: ReactNode
}) {
  const [comments, setComments] = useState<BriefComment[]>(initial)
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [authorName, setAuthorName] = useState('')
  const [sessionId, setSessionId] = useState('')
  const tokensRef = useRef<Record<string, string>>({})

  useEffect(() => {
    const stored = readTokens(slug)
    tokensRef.current = stored
    setTokens(stored)
    setSessionId(ensureSessionId(slug))
    try {
      setAuthorName(window.localStorage.getItem(NAME_KEY) ?? '')
    } catch {
      /* nothing to restore */
    }
  }, [slug])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/b/${slug}/comments`, { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as { comments?: BriefComment[] }
      if (Array.isArray(json.comments)) setComments(json.comments)
    } catch {
      /* Offline or mid-navigation. The list on screen is still valid. */
    }
  }, [slug])

  // Someone answering a checklist over two sittings, or on a phone and then a
  // laptop, should not find their earlier notes missing.
  useEffect(() => {
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const rememberName = useCallback((name: string) => {
    setAuthorName(name)
    try {
      if (name.trim()) window.localStorage.setItem(NAME_KEY, name.trim())
    } catch {
      /* not worth failing a comment over */
    }
  }, [])

  const add = useCallback(
    async (input: NewComment) => {
      const res = await fetch(`/api/b/${slug}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, sessionId }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not save that comment.')

      const { comment, token } = json as { comment: BriefComment; token: string }
      const next = { ...tokensRef.current, [comment.id]: token }
      tokensRef.current = next
      setTokens(next)
      writeTokens(slug, next)
      setComments(prev => [...prev, comment])
    },
    [slug, sessionId],
  )

  const edit = useCallback(
    async (id: string, body: string) => {
      const token = tokensRef.current[id]
      if (!token) throw new Error('This comment can only be edited from the browser that wrote it.')

      const res = await fetch(`/api/b/${slug}/comments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-comment-token': token },
        body: JSON.stringify({ body, authorName }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not save that edit.')

      const { comment } = json as { comment: BriefComment }
      setComments(prev => prev.map(c => (c.id === id ? comment : c)))
    },
    [slug, authorName],
  )

  const remove = useCallback(
    async (id: string) => {
      const token = tokensRef.current[id]
      if (!token) throw new Error('This comment can only be deleted from the browser that wrote it.')

      const res = await fetch(`/api/b/${slug}/comments/${id}`, {
        method: 'DELETE',
        headers: { 'x-comment-token': token },
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error ?? 'Could not delete that comment.')
      }

      setComments(prev => prev.filter(c => c.id !== id))
      const next = { ...tokensRef.current }
      delete next[id]
      tokensRef.current = next
      setTokens(next)
      writeTokens(slug, next)
    },
    [slug],
  )

  const value = useMemo<CommentsValue>(
    () => ({
      comments,
      owned: new Set(Object.keys(tokens)),
      authorName,
      rememberName,
      add,
      edit,
      remove,
      sessionId,
    }),
    [comments, tokens, authorName, rememberName, add, edit, remove, sessionId],
  )

  return <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>
}
