import { extractText, getDocumentProxy } from 'unpdf'

/**
 * Pull the text layer straight out of a PDF.
 *
 * Nearly every résumé that reaches us was exported from Word, Docs or a résumé
 * builder, so the words are already sitting in the file. Reading them here
 * rather than asking a model to re-type them is free, takes milliseconds, and
 * is *more* faithful than a transcription — a model paraphrases, a text layer
 * cannot. It also lets the extraction call take plain text instead of rendered
 * pages, which is the single largest cost in the whole pipeline.
 *
 * `unpdf` is used rather than `pdf-parse` because it ships a serverless build
 * of pdf.js with no native `canvas` dependency, which is what makes it work
 * inside a Vercel function at all.
 */
export interface PdfText {
  text: string
  pages: number
  /**
   * Whether the text layer is worth using.
   *
   * Scans and image-only exports parse "successfully" and hand back a page of
   * whitespace; sending that to the model would produce a confidently empty
   * profile. Below the threshold we fall back to letting the model look at the
   * pages instead.
   */
  usable: boolean
}

/** A page with less than this much text is not a page of prose. */
const MIN_CHARS_PER_PAGE = 120

/** Guards against a one-page PDF whose only text is a header or a watermark. */
const MIN_TOTAL_CHARS = 300

export async function extractPdfText(buffer: Uint8Array): Promise<PdfText> {
  try {
    const pdf = await getDocumentProxy(buffer)
    const { text, totalPages } = await extractText(pdf, { mergePages: true })

    // `mergePages` makes this a single string rather than one entry per page.
    const cleaned = normalizeExtractedText(text)
    const pages = totalPages || 1

    return {
      text: cleaned,
      pages,
      usable: cleaned.length >= MIN_TOTAL_CHARS && cleaned.length / pages >= MIN_CHARS_PER_PAGE,
    }
  } catch (error) {
    // A corrupt or encrypted PDF is not fatal here — the model still gets a
    // look at it through the vision path.
    console.warn('PDF text extraction failed, falling back to vision:', error)
    return { text: '', pages: 0, usable: false }
  }
}

/**
 * Tidy the raw text layer without changing a word of it.
 *
 * pdf.js emits the glyph runs it finds, which leaves ragged spacing and long
 * stretches of blank lines between sections. Collapsing those costs nothing and
 * removes tokens we would otherwise pay to send.
 */
function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
