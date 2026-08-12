/**
 * PDF rendering for signed Recruitment Services Agreements.
 *
 * Server-only. @react-pdf/renderer pulls in node-only modules, so import only
 * inside API routes.
 */

import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'

const C = {
  ink: '#100F0F',
  ink2: '#3F3E3E',
  ink3: '#6B6B6B',
  green: '#1F3A2F',
  border: '#E5E2D8',
  cream: '#FAF9F5',
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 56,
    fontFamily: 'Helvetica',
    fontSize: 10.5,
    lineHeight: 1.6,
    color: C.ink2,
  },
  topRule: {
    borderBottomWidth: 2,
    borderBottomColor: C.green,
    width: 64,
    marginBottom: 22,
  },
  h1: {
    fontFamily: 'Times-Roman',
    fontSize: 22,
    color: C.ink,
    marginBottom: 16,
    lineHeight: 1.2,
  },
  versionLine: {
    fontSize: 9.5,
    color: C.ink3,
    marginBottom: 28,
  },
  h2: {
    fontFamily: 'Times-Roman',
    fontSize: 14,
    color: C.ink,
    marginTop: 24,
    marginBottom: 10,
    borderTopWidth: 0.75,
    borderTopColor: C.border,
    paddingTop: 14,
  },
  h2First: {
    fontFamily: 'Times-Roman',
    fontSize: 14,
    color: C.ink,
    marginTop: 4,
    marginBottom: 10,
  },
  h3: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: C.ink,
    marginTop: 14,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 10.5,
    color: C.ink2,
    marginBottom: 10,
    lineHeight: 1.6,
  },
  listItem: {
    fontSize: 10.5,
    color: C.ink2,
    marginBottom: 6,
    lineHeight: 1.55,
    flexDirection: 'row',
  },
  listBullet: {
    width: 14,
    color: C.green,
  },
  hr: {
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    marginVertical: 16,
  },
  tableBox: {
    borderWidth: 0.75,
    borderColor: C.border,
    borderRadius: 6,
    marginBottom: 18,
    backgroundColor: '#FFFFFF',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  tableRowLast: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  tableLabel: {
    width: '32%',
    fontSize: 9,
    color: C.ink3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: 'Helvetica-Bold',
  },
  tableValue: {
    flex: 1,
    fontSize: 10.5,
    color: C.ink,
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
    color: C.ink,
  },
  signatureBlock: {
    marginTop: 36,
    paddingTop: 22,
    borderTopWidth: 2,
    borderTopColor: C.green,
  },
  signatureHeader: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: C.green,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  sigGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sigField: {
    width: '50%',
    marginBottom: 10,
  },
  sigFieldFull: {
    width: '100%',
    marginBottom: 10,
  },
  sigLabel: {
    fontSize: 8.5,
    color: C.ink3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
    fontFamily: 'Helvetica-Bold',
  },
  sigValue: {
    fontSize: 10,
    color: C.ink,
  },
  sigMono: {
    fontSize: 8.5,
    color: C.ink2,
    fontFamily: 'Courier',
  },
  footerLine: {
    marginTop: 28,
    paddingTop: 14,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    fontSize: 8.5,
    color: C.ink3,
    textAlign: 'center',
  },
})

type Block =
  | { type: 'h1'; text: string }
  | { type: 'h2'; num: string | null; rest: string }
  | { type: 'h3'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; rows: string[][] }
  | { type: 'hr' }
  | { type: 'version'; text: string }

// Parser that mirrors components/agreement-content.tsx, with one tweak: the
// version line "**v2.4** · ..." that follows the title is captured separately
// so we can style it as a single muted line in the PDF.
function parse(content: string): Block[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let pBuf: string[] = []
  let ulBuf: string[] = []
  let tableBuf: string[][] = []

  const flushP = () => {
    if (pBuf.length) {
      const text = pBuf.join(' ')
      // Detect the version sub-title pattern.
      const lastBlock = blocks[blocks.length - 1]
      if (
        lastBlock &&
        lastBlock.type === 'h1' &&
        /^\*\*v[\d.]+\*\*/.test(text)
      ) {
        blocks.push({ type: 'version', text })
      } else {
        blocks.push({ type: 'paragraph', text })
      }
      pBuf = []
    }
  }
  const flushUl = () => {
    if (ulBuf.length) {
      blocks.push({ type: 'list', items: [...ulBuf] })
      ulBuf = []
    }
  }
  const flushTable = () => {
    if (tableBuf.length) {
      const dataRows = tableBuf.filter((row) => row.some((c) => c.trim() !== ''))
      if (dataRows.length) blocks.push({ type: 'table', rows: dataRows })
      tableBuf = []
    }
  }
  const flushAll = () => {
    flushP()
    flushUl()
    flushTable()
  }

  const parseTableRow = (line: string): string[] | null => {
    if (!line.startsWith('|') || !line.endsWith('|')) return null
    return line.slice(1, -1).split('|').map((c) => c.trim())
  }
  const isTableSeparator = (cells: string[]): boolean =>
    cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c))

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushAll()
      continue
    }
    if (line === '---' || line === '***' || line === '___') {
      flushAll()
      blocks.push({ type: 'hr' })
      continue
    }
    if (line.startsWith('# ')) {
      flushAll()
      blocks.push({ type: 'h1', text: line.slice(2).trim() })
      continue
    }
    if (line.startsWith('## ')) {
      flushAll()
      const rest = line.slice(3).trim()
      const m = rest.match(/^(\d+)\.\s+(.+)$/)
      blocks.push(
        m
          ? { type: 'h2', num: m[1], rest: m[2] }
          : { type: 'h2', num: null, rest },
      )
      continue
    }
    if (line.startsWith('### ')) {
      flushAll()
      blocks.push({ type: 'h3', text: line.slice(4).trim() })
      continue
    }
    if (line.startsWith('- ')) {
      flushP()
      flushTable()
      ulBuf.push(line.slice(2).trim())
      continue
    }
    const cells = parseTableRow(line)
    if (cells) {
      flushP()
      flushUl()
      if (!isTableSeparator(cells)) tableBuf.push(cells)
      continue
    }
    flushUl()
    flushTable()
    pBuf.push(line)
  }
  flushAll()
  return blocks
}

// Render a string with **bold** markers into a sequence of <Text> spans.
function renderInline(text: string): React.ReactNode {
  if (!text.includes('**')) return text
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return React.createElement(
        Text,
        { key: i, style: styles.bold },
        part.slice(2, -2),
      )
    }
    return React.createElement(Text, { key: i }, part)
  })
}

interface AgreementPdfBase {
  content: string
  signerName: string
  signerEmail: string
  signedAt: string // ISO
  version: string
  termsHash: string
  agreementLinkId: string
  ipAddress: string | null
}

export interface ClientAgreementPdfData extends AgreementPdfBase {
  kind: 'client'
  companyName: string
  signerTitle: string | null
}

export interface PartnerAgreementPdfData extends AgreementPdfBase {
  kind: 'partner'
  partnerType: 'scout' | 'recruiter' | null
}

export type AgreementPdfData = ClientAgreementPdfData | PartnerAgreementPdfData

function partnerLabel(t: PartnerAgreementPdfData['partnerType']): string {
  if (t === 'scout') return 'Scout Partner'
  if (t === 'recruiter') return 'Recruiting Partner'
  return 'Partner'
}

function documentTitle(data: AgreementPdfData): string {
  if (data.kind === 'client') {
    return `Refery Recruitment Services Agreement: ${data.companyName}`
  }
  return `Refery ${partnerLabel(data.partnerType)} Agreement: ${data.signerName}`
}

function footerLabel(data: AgreementPdfData): string {
  if (data.kind === 'client') {
    return `Refery · Recruitment Services Agreement · v${data.version}`
  }
  return `Refery · ${partnerLabel(data.partnerType)} Agreement · v${data.version}`
}

function AgreementDocument(data: AgreementPdfData) {
  const blocks = parse(data.content)
  let h2Seen = 0
  const showTitleField = data.kind === 'client'

  return React.createElement(
    Document,
    { title: documentTitle(data) },
    React.createElement(
      Page,
      { size: 'LETTER', style: styles.page },
      React.createElement(View, { style: styles.topRule }),
      ...blocks.map((block, i) => {
        switch (block.type) {
          case 'h1':
            return React.createElement(
              Text,
              { key: i, style: styles.h1 },
              block.text,
            )
          case 'version':
            return React.createElement(
              Text,
              { key: i, style: styles.versionLine },
              renderInline(block.text),
            )
          case 'h2': {
            const isFirst = h2Seen === 0
            h2Seen += 1
            return React.createElement(
              Text,
              { key: i, style: isFirst ? styles.h2First : styles.h2 },
              block.num ? `${block.num}. ${block.rest}` : block.rest,
            )
          }
          case 'h3':
            return React.createElement(
              Text,
              { key: i, style: styles.h3 },
              block.text,
            )
          case 'paragraph':
            return React.createElement(
              Text,
              { key: i, style: styles.paragraph },
              renderInline(block.text),
            )
          case 'list':
            return React.createElement(
              View,
              { key: i, style: { marginBottom: 12 } },
              ...block.items.map((it, j) =>
                React.createElement(
                  View,
                  { key: j, style: styles.listItem },
                  React.createElement(Text, { style: styles.listBullet }, '•'),
                  React.createElement(
                    Text,
                    { style: { flex: 1 } },
                    renderInline(it),
                  ),
                ),
              ),
            )
          case 'table':
            return React.createElement(
              View,
              { key: i, style: styles.tableBox },
              ...block.rows.map((row, r) => {
                const isLast = r === block.rows.length - 1
                if (row.length === 2) {
                  return React.createElement(
                    View,
                    { key: r, style: isLast ? styles.tableRowLast : styles.tableRow },
                    React.createElement(
                      Text,
                      { style: styles.tableLabel },
                      renderInline(row[0]),
                    ),
                    React.createElement(
                      Text,
                      { style: styles.tableValue },
                      renderInline(row[1]),
                    ),
                  )
                }
                return React.createElement(
                  View,
                  { key: r, style: isLast ? styles.tableRowLast : styles.tableRow },
                  ...row.map((cell, c) =>
                    React.createElement(
                      Text,
                      { key: c, style: { flex: 1, fontSize: 10.5, color: C.ink } },
                      renderInline(cell),
                    ),
                  ),
                )
              }),
            )
          case 'hr':
            return React.createElement(View, { key: i, style: styles.hr })
        }
      }),
      // Signature block at the end of the document.
      React.createElement(
        View,
        { style: styles.signatureBlock, wrap: false },
        React.createElement(
          Text,
          { style: styles.signatureHeader },
          'Electronic signature',
        ),
        React.createElement(
          View,
          { style: styles.sigGrid },
          React.createElement(
            View,
            { style: styles.sigField },
            React.createElement(Text, { style: styles.sigLabel }, 'Signed by'),
            React.createElement(Text, { style: styles.sigValue }, data.signerName),
          ),
          showTitleField
            ? React.createElement(
                View,
                { style: styles.sigField },
                React.createElement(Text, { style: styles.sigLabel }, 'Title'),
                React.createElement(
                  Text,
                  { style: styles.sigValue },
                  (data as ClientAgreementPdfData).signerTitle || 'Not given',
                ),
              )
            : React.createElement(View, { style: styles.sigField }),
          React.createElement(
            View,
            { style: styles.sigField },
            React.createElement(Text, { style: styles.sigLabel }, 'Email'),
            React.createElement(Text, { style: styles.sigValue }, data.signerEmail),
          ),
          React.createElement(
            View,
            { style: styles.sigField },
            React.createElement(Text, { style: styles.sigLabel }, 'Signed at (UTC)'),
            React.createElement(Text, { style: styles.sigValue }, data.signedAt),
          ),
          React.createElement(
            View,
            { style: styles.sigField },
            React.createElement(Text, { style: styles.sigLabel }, 'Version'),
            React.createElement(Text, { style: styles.sigValue }, `v${data.version}`),
          ),
          React.createElement(
            View,
            { style: styles.sigField },
            React.createElement(Text, { style: styles.sigLabel }, 'IP address'),
            React.createElement(
              Text,
              { style: styles.sigValue },
              data.ipAddress || 'Not recorded',
            ),
          ),
          React.createElement(
            View,
            { style: styles.sigFieldFull },
            React.createElement(Text, { style: styles.sigLabel }, 'Agreement ID'),
            React.createElement(Text, { style: styles.sigMono }, data.agreementLinkId),
          ),
          React.createElement(
            View,
            { style: styles.sigFieldFull },
            React.createElement(Text, { style: styles.sigLabel }, 'Terms hash (SHA-256)'),
            React.createElement(Text, { style: styles.sigMono }, data.termsHash),
          ),
        ),
      ),
      // Inline footer label rendered once at the end of the document. A `fixed`
      // absolutely-positioned footer with a `render` callback was crashing
      // @react-pdf/pdfkit on the recruiter agreement layout
      // (`unsupported number: -3.998...e+22` in PDFDocument.transform), which
      // silently aborted PDF generation and skipped the partner welcome emails.
      React.createElement(Text, { style: styles.footerLine }, footerLabel(data)),
    ),
  )
}

export async function generateAgreementPdf(data: AgreementPdfData): Promise<Buffer> {
  return renderToBuffer(AgreementDocument(data))
}
