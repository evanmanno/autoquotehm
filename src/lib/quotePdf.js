import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { UNIT_LABEL, money, qty, serviceQuantity } from '../pricing'

async function loadImageDataUrl(url) {
  if (!url) return null
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Could not read logo image.'))
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function hexToRgb(hex) {
  const clean = (hex || '#1f6f45').replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return [31, 111, 69]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Blend a color toward white (amount 0..1) for soft section/zebra fills.
const tint = ([r, g, b], amount) => [
  Math.round(r + (255 - r) * amount),
  Math.round(g + (255 - g) * amount),
  Math.round(b + (255 - b) * amount),
]

const fmtDate = (d) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

// Short, stable-looking estimate number: AQ-YYMMDD-### (### derived from the
// customer name so re-downloading the same quote gives the same number).
function estimateNumber(job, date) {
  const yy = String(date.getFullYear()).slice(2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const seed = [...(job.customerName || 'quote')].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 997, 7)
  return `AQ-${yy}${mm}${dd}-${String(seed).padStart(3, '0')}`
}

// Turns the internal cost breakdown into customer-facing line items.
// The profit markup is spread evenly across every priced line, so the PDF
// shows what the customer pays for each piece -- never the company's costs or
// margin -- and the lines always add up exactly to the quoted price.
export function buildCustomerLines(est) {
  const scale = est.totalCost > 0 ? est.quotePrice / est.totalCost : 1
  const groups = { materials: [], labor: [], equipment: [], other: [] }

  est.lineItems.forEach((item) => {
    // Multi-visit snow lines read better as "N pushes at $X each" than as
    // hundreds of thousands of square feet at a fraction of a cent.
    if (!item.tbd && item.visits > 1) {
      groups.materials.push({
        name: `${item.baseName} — ${qty(item.baseQuantity)} ${item.unitLabel ?? ''}${
          item.depthLabel ? ` (${item.depthLabel} snow)` : ''
        }`.replace(/\s+\(/, ' ('),
        qtyText: `${item.visits} visits`,
        quantity: item.visits,
        cost: item.cost,
      })
      return
    }
    groups.materials.push({
      name: item.depthLabel ? `${item.baseName} (${item.depthLabel} snow)` : item.baseName ?? item.name,
      qtyText: item.tbd ? '—' : `${qty(item.quantity)} ${item.unitLabel ?? ''}`.trim(),
      quantity: item.quantity,
      cost: item.cost,
      tbd: item.tbd,
    })
  })
  if (est.laborCost > 0) {
    const hrs = est.laborHours * est.crewMembers
    groups.labor.push({
      name: `Labor (${qty(est.crewMembers)} crew × ${qty(est.laborHours)} hrs)`,
      qtyText: `${qty(hrs)} hrs`,
      quantity: hrs,
      cost: est.laborCost,
    })
  }
  est.equipmentItems.forEach((item) => {
    groups.equipment.push({
      name: item.name,
      qtyText: `${qty(item.quantity)} day${item.quantity === 1 ? '' : 's'}`,
      quantity: item.quantity,
      cost: item.cost,
    })
  })
  if (est.travelCost > 0) {
    groups.other.push({ name: 'Travel', qtyText: '1', quantity: 1, cost: est.travelCost })
  }
  if (est.fuelCost > 0) {
    groups.other.push({ name: 'Equipment fuel', qtyText: '1', quantity: 1, cost: est.fuelCost })
  }
  if (est.disposalCost > 0) {
    groups.other.push({
      name: 'Disposal / dump fees',
      qtyText: `${qty(est.dumpLoads)} load${est.dumpLoads === 1 ? '' : 's'}`,
      quantity: est.dumpLoads,
      cost: est.disposalCost,
    })
  }

  const all = Object.values(groups).flat()
  all.forEach((l) => {
    l.amount = l.tbd ? 0 : Math.round(l.cost * scale * 100) / 100
  })
  // Push any cent-rounding drift onto the largest line so the column foots.
  const priced = all.filter((l) => !l.tbd)
  if (priced.length) {
    const drift = Math.round((est.quotePrice - priced.reduce((s, l) => s + l.amount, 0)) * 100) / 100
    if (drift !== 0) {
      priced.reduce((a, b) => (b.amount > a.amount ? b : a)).amount += drift
    }
  }
  all.forEach((l) => {
    l.unitPrice = !l.tbd && l.quantity > 0 ? l.amount / l.quantity : 0
  })
  return groups
}

const GROUP_TITLES = {
  materials: 'Materials & Services',
  labor: 'Labor',
  equipment: 'Equipment',
  other: 'Travel & Disposal',
}

// Builds the finished customer-facing estimate (jsPDF document, not yet saved).
export async function buildQuotePdfDoc(job, est, company, photoCount) {
  const materials = company?.materials ?? []
  const brand = hexToRgb(company?.brandColor)
  const [r, g, b] = brand
  const soft = tint(brand, 0.88)
  const zebra = tint(brand, 0.95)
  const logoData = await loadImageDataUrl(company?.logoUrl)

  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  const contentW = pageWidth - margin * 2
  const today = new Date()
  const validUntil = new Date(today.getTime() + 30 * 86400000)
  const INK = [38, 44, 40]
  const MUTED = [110, 118, 112]
  const LINE = [208, 214, 209]

  // ---- header band ----
  const bandH = 100
  doc.setFillColor(r, g, b)
  doc.rect(0, 0, pageWidth, bandH, 'F')

  let textX = margin
  if (logoData) {
    try {
      const props = doc.getImageProperties(logoData)
      const box = 64
      const scale = Math.min((box - 8) / props.width, (box - 8) / props.height)
      const w = props.width * scale
      const h = props.height * scale
      doc.setFillColor(255, 255, 255)
      doc.roundedRect(margin, 24, box, box, 6, 6, 'F')
      doc.addImage(logoData, props.fileType || 'PNG', margin + (box - w) / 2, 24 + (box - h) / 2, w, h)
      textX = margin + box + 16
    } catch {
      // unsupported image -- fall back to a text-only header
    }
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.text(company?.businessName || 'Job Estimate', textX, 44)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const contactBits = [
    company?.shopAddress,
    [company?.contactPhone || company?.yourPhone, company?.contactEmail || company?.yourEmail]
      .filter(Boolean)
      .join('  •  '),
  ].filter(Boolean)
  contactBits.forEach((line, i) => doc.text(line, textX, 62 + i * 13))

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.text('ESTIMATE', pageWidth - margin, 46, { align: 'right' })
  doc.setFontSize(9)
  const meta = [
    ['Estimate #', estimateNumber(job, today)],
    ['Date', fmtDate(today)],
    ['Valid until', fmtDate(validUntil)],
  ]
  meta.forEach(([label, value], i) => {
    const yy = 64 + i * 13
    doc.setFont('helvetica', 'normal')
    doc.text(`${label}:`, pageWidth - margin - 108, yy, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.text(value, pageWidth - margin, yy, { align: 'right' })
  })

  // ---- reusable bits ----
  let y = bandH + 18

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - 50) {
      doc.addPage()
      y = 50
    }
  }

  const sectionBar = (title) => {
    doc.setFillColor(r, g, b)
    doc.rect(margin, y, contentW, 18, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text(title.toUpperCase(), margin + 8, y + 12.5)
    y += 18
  }

  const boxOutline = (top, height) => {
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.8)
    doc.rect(margin, top, contentW, height)
  }

  // ---- customer information ----
  sectionBar('Customer information')
  const infoTop = y
  const half = contentW / 2
  const customerRows = [
    ['Customer', job.customerName || '—'],
    ['Phone', job.phone || '—'],
  ]
  doc.setFontSize(10)
  customerRows.forEach(([label, value], i) => {
    const yy = infoTop + 17 + i * 18
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...MUTED)
    doc.text(label, margin + 10, yy)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...INK)
    doc.text(String(value), margin + 70, yy)
  })
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...MUTED)
  doc.text('Job site', margin + half + 10, infoTop + 17)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...INK)
  const addrLines = doc.splitTextToSize(job.address || '—', half - 80)
  doc.text(addrLines.slice(0, 2), margin + half + 60, infoTop + 17)
  const infoH = 48
  boxOutline(infoTop, infoH)
  doc.line(margin + half, infoTop, margin + half, infoTop + infoH)
  y = infoTop + infoH + 12

  // ---- job description ----
  const selected = materials.filter((s) => job.services.includes(s.id))
  // Scope is one wrapped line -- the itemized table below carries the quantities.
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  const descLines = selected.length
    ? doc.splitTextToSize(`Scope of work: ${selected.map((x) => x.name).join('  •  ')}`, contentW - 20)
    : []
  if (descLines.length || job.notes) {
    sectionBar('Job description')
    const bodyLines = [...descLines]
    if (job.notes) {
      if (bodyLines.length) bodyLines.push('')
      bodyLines.push(...doc.splitTextToSize(`Notes: ${job.notes}`, contentW - 20))
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    const boxH = bodyLines.length * 13 + 16
    ensureSpace(boxH + 10)
    const top = y
    doc.setTextColor(...INK)
    bodyLines.forEach((line, i) => doc.text(line, margin + 10, top + 16 + i * 13))
    boxOutline(top, boxH)
    y = top + boxH + 12
  }

  // ---- itemized table (grouped like the sample templates) ----
  const groups = buildCustomerLines(est)
  const body = []
  Object.entries(groups).forEach(([key, lines]) => {
    if (!lines.length) return
    body.push([
      {
        content: GROUP_TITLES[key],
        colSpan: 4,
        styles: { fillColor: soft, textColor: [r, g, b], fontStyle: 'bold', fontSize: 8.5, cellPadding: { top: 3, bottom: 3, left: 8, right: 8 } },
      },
    ])
    lines.forEach((l) =>
      body.push([
        l.name,
        l.qtyText,
        l.tbd ? '—' : money(l.unitPrice),
        l.tbd ? 'TBD' : money(l.amount),
      ]),
    )
  })

  ensureSpace(80)
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 60 },
    head: [['Description', 'Qty', 'Unit price', 'Amount']],
    body,
    theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: { top: 4.2, bottom: 4.2, left: 8, right: 8 }, textColor: INK, lineColor: LINE, lineWidth: 0 },
    headStyles: { fillColor: [r, g, b], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 95 },
      2: { halign: 'right', cellWidth: 85 },
      3: { halign: 'right', cellWidth: 90 },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right'
    },
    didDrawCell: (data) => {
      if (data.section === 'body') {
        doc.setDrawColor(...LINE)
        doc.setLineWidth(0.5)
        const { x, y: cy, width, height } = data.cell
        doc.line(x, cy + height, x + width, cy + height)
      }
    },
  })
  y = doc.lastAutoTable.finalY + 12

  // ---- totals (right) + notes & terms (left), side by side like the templates ----
  const boxW = 230
  const boxX = pageWidth - margin - boxW
  const leftW = contentW - boxW - 16

  const flags = []
  if (est.belowMinimum) flags.push(`Priced at the ${money(est.minJobCharge)} minimum job charge.`)
  if (est.hasTbd) {
    const names = est.lineItems
      .filter((i) => i.tbd)
      .map((i) => i.name)
      .join(' and ')
    flags.push(`Not included: ${names} — priced separately.`)
  }
  const terms = [
    ...flags,
    'Valid for 30 days. Price may change if the scope of work changes after the site visit.',
    'Signed approval authorizes the work to be scheduled.',
    ...(company?.terms ? [company.terms] : []),
  ]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  const termLines = terms.flatMap((t) => doc.splitTextToSize(`•  ${t}`, leftW - 20))
  const termsH = Math.max(termLines.length * 11.5 + 14, 62)
  ensureSpace(18 + termsH + 8)

  const blockTop = y
  // left: notes & terms
  doc.setFillColor(r, g, b)
  doc.rect(margin, blockTop, leftW, 18, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('NOTES & TERMS', margin + 8, blockTop + 12.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  termLines.forEach((line, i) => doc.text(line, margin + 10, blockTop + 33 + i * 11.5))
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.8)
  doc.rect(margin, blockTop + 18, leftW, termsH)

  // right: subtotal + total bar
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...INK)
  doc.text('Subtotal', boxX + 10, blockTop + 13)
  doc.text(money(est.quotePrice), pageWidth - margin - 10, blockTop + 13, { align: 'right' })
  doc.line(boxX, blockTop + 22, pageWidth - margin, blockTop + 22)
  doc.setFillColor(r, g, b)
  doc.rect(boxX, blockTop + 30, boxW, 28, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.setTextColor(255, 255, 255)
  doc.text('TOTAL ESTIMATE', boxX + 10, blockTop + 49.5)
  doc.setFontSize(14)
  doc.text(money(est.quotePrice), pageWidth - margin - 10, blockTop + 50, { align: 'right' })
  y = blockTop + 18 + termsH + 20

  // ---- acceptance ----
  ensureSpace(46)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...INK)
  doc.text('CUSTOMER ACCEPTANCE', margin, y)
  y += 24
  doc.setDrawColor(...INK)
  doc.setLineWidth(0.7)
  doc.line(margin, y, margin + 270, y)
  doc.line(margin + 300, y, margin + 300 + 130, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text('Signature', margin, y + 12)
  doc.text('Date', margin + 300, y + 12)

  // ---- footer on every page ----
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.6)
    doc.line(margin, pageHeight - 42, pageWidth - margin, pageHeight - 42)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(r, g, b)
    doc.text('Thank you for your business!', margin, pageHeight - 28)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    const questions = [company?.contactName, company?.contactPhone || company?.yourPhone]
      .filter(Boolean)
      .join(' · ')
    if (questions) doc.text(`Questions? ${questions}`, pageWidth / 2, pageHeight - 28, { align: 'center' })
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 28, { align: 'right' })
    doc.text('Created with AutoQuoteHM', pageWidth - margin, pageHeight - 17, { align: 'right' })
  }

  return doc
}

// Builds the PDF and triggers a download.
export async function buildQuotePdf(job, est, company, photoCount) {
  const doc = await buildQuotePdfDoc(job, est, company, photoCount)
  const safeName = (job.customerName || 'quote').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  doc.save(`${safeName}-estimate.pdf`)
}
