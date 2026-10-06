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

const SAGE = '#5b8f7e'
const TRADE_TITLES = {
  landscaping: 'LANDSCAPING',
  hardscaping: 'HARDSCAPING',
  snow: 'SNOW',
}

// "LANDSCAPING QUOTE", "LANDSCAPING & SNOW QUOTE", or just "QUOTE".
function quoteTitle(company) {
  const names = (company?.industries ?? []).map((id) => TRADE_TITLES[id]).filter(Boolean)
  if (names.length === 0 || names.length > 2) return 'QUOTE'
  return `${names.join(' & ')} QUOTE`
}

// Builds the finished customer-facing quote (jsPDF document, not yet saved).
// Layout follows the clean "Landscaping Quote" template: company block + logo
// on top, big spaced title, Bill To / quote details, flat line-item table,
// subtotal / tax / total, terms, signature line.
export async function buildQuotePdfDoc(job, est, company, opts = {}) {
  // Everyone's profile is seeded with the old default green; treat that as
  // "no brand color chosen" and use the template's sage instead.
  const rawBrand = (company?.brandColor || '').toLowerCase()
  const brand = hexToRgb(!rawBrand || rawBrand === '#1f6f45' ? SAGE : rawBrand)
  const [r, g, b] = brand
  const band = tint(brand, 0.93)
  const logoData = await loadImageDataUrl(company?.logoUrl)

  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 48
  const right = pageWidth - margin
  const today = new Date()
  const validUntil = new Date(today.getTime() + 30 * 86400000)
  const INK = [34, 38, 36]
  const fmt = (d) =>
    `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`

  // ---- top left: company block ----
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(14)
  doc.text(company?.businessName || 'Your Company', margin, 66)
  doc.setFontSize(9)
  const addr = doc.splitTextToSize(company?.shopAddress || '', 220)
  let ty = 83
  addr.forEach((line) => {
    doc.text(line, margin, ty)
    ty += 12
  })
  const phone = company?.contactPhone || company?.yourPhone
  const email = company?.contactEmail || company?.yourEmail
  ;[phone, email].filter(Boolean).forEach((line) => {
    doc.text(line, margin, ty)
    ty += 12
  })

  // ---- top right: logo ----
  if (logoData) {
    try {
      const props = doc.getImageProperties(logoData)
      const boxW = 220
      const boxH = 62
      const scale = Math.min(boxW / props.width, boxH / props.height)
      const w = props.width * scale
      const h = props.height * scale
      doc.addImage(logoData, props.fileType || 'PNG', right - w, 48 + (boxH - h) / 2, w, h)
    } catch {
      // unsupported image: just skip the logo
    }
  }

  // ---- title ----
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(r, g, b)
  doc.setFontSize(27)
  const title = quoteTitle(company)
  const words = title.split(' ')
  const lastWord = words.pop() // QUOTE
  const firstLine = words.join(' ')
  const CS = 3.2
  let titleY = 150
  // jsPDF's right-align ignores charSpace, so right-align by hand.
  const spaced = (str, yy) => {
    const w = doc.getTextWidth(str) + CS * (str.length - 1)
    doc.text(str, right - w, yy, { charSpace: CS })
  }
  if (firstLine) {
    spaced(firstLine, titleY)
    titleY += 36
  }
  spaced(lastWord, titleY)

  // ---- bill to (left) + quote details (right) ----
  const blockY = Math.max(titleY + 44, 230)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(r, g, b)
  doc.text('Bill To', margin, blockY)
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12.5)
  doc.text(job.customerName || 'Customer', margin, blockY + 20)
  doc.setFontSize(9)
  let by = blockY + 36
  const billLines = [
    ...doc.splitTextToSize(job.address || '', 230),
    ...(job.phone ? [job.phone] : []),
  ]
  billLines.forEach((line) => {
    doc.text(line, margin, by)
    by += 12
  })

  const meta = [
    ['Quote #', estimateNumber(job, today)],
    ['Quote date', fmt(today)],
    ['Valid until', fmt(validUntil)],
  ]
  meta.forEach(([label, value], i) => {
    const yy = blockY + 4 + i * 23
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(r, g, b)
    doc.text(label, right - 118, yy, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...INK)
    doc.text(value, right, yy, { align: 'right' })
  })

  // ---- line items ----
  const lines = Object.values(buildCustomerLines(est)).flat()
  const body = lines.map((l) => [
    l.tbd ? '—' : l.qtyText.replace(/^1$/, '1'),
    l.name,
    l.tbd ? '—' : money(l.unitPrice),
    l.tbd ? 'TBD' : money(l.amount),
  ])

  let y = Math.max(blockY + 90, by + 24)
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 70 },
    head: [['QTY', 'Description', 'Unit Price', 'Amount']],
    body,
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: INK,
      cellPadding: { top: 5, bottom: 5, left: 6, right: 6 },
    },
    headStyles: { fillColor: [r, g, b], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 78 },
      1: { cellWidth: 'auto' },
      2: { halign: 'right', cellWidth: 82 },
      3: { halign: 'right', cellWidth: 82 },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index >= 2) data.cell.styles.halign = 'right'
    },
    didDrawPage: () => {},
  })
  y = doc.lastAutoTable.finalY

  // thin rule closing the table
  doc.setDrawColor(r, g, b)
  doc.setLineWidth(0.8)
  doc.line(margin, y, right, y)

  // ---- totals ----
  const taxRate = Number(company?.salesTaxRate) > 0 ? Number(company.salesTaxRate) : 0
  const tax = Math.round(est.quotePrice * taxRate) / 100
  const total = est.quotePrice + tax
  const boxX = right - 232
  const needed = (taxRate ? 74 : 54) + 24
  if (y + needed > pageHeight - 60) {
    doc.addPage()
    y = 60
  }
  const row = (label, value, yy, opts = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.setFontSize(opts.size || 9)
    doc.setTextColor(...(opts.color || INK))
    doc.text(label, boxX + 6, yy)
    doc.text(value, right - 6, yy, { align: 'right' })
  }
  const totalsPage = doc.internal.getNumberOfPages()
  let ty2 = y + 20
  row('Subtotal', money(est.quotePrice), ty2)
  ty2 += 20
  doc.setDrawColor(...[200, 208, 203])
  doc.setLineWidth(0.5)
  if (taxRate) {
    doc.line(boxX, ty2 - 13, right, ty2 - 13)
    row(`Sales Tax (${taxRate}%)`, money(tax), ty2)
    ty2 += 20
  }
  doc.setFillColor(...band)
  doc.rect(boxX, ty2 - 14, 232, 24, 'F')
  doc.setDrawColor(r, g, b)
  doc.setLineWidth(0.8)
  doc.line(boxX, ty2 - 14, right, ty2 - 14)
  doc.line(boxX, ty2 + 10, right, ty2 + 10)
  row('Total (USD)', money(total), ty2 + 2, { bold: true, color: [r, g, b], size: 9.5 })
  y = ty2 + 44

  // ---- terms & notes ----
  if (y > pageHeight - 150) {
    doc.addPage()
    y = 70
  }
  const flags = []
  if (est.belowMinimum) flags.push(`Priced at the ${money(est.minJobCharge)} minimum job charge.`)
  if (est.hasTbd) {
    const names = est.lineItems.filter((i) => i.tbd).map((i) => i.name).join(' and ')
    flags.push(`Not included: ${names} — to be priced separately.`)
  }
  const terms = [
    'This quote is valid for 30 days from the date above.',
    'Final price may change if the scope of work changes after the site visit.',
    ...flags,
    ...(company?.terms ? [company.terms] : []),
  ]
  const leftW = boxX - margin - 24
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(r, g, b)
  doc.text('Terms and Conditions', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...INK)
  let tyy = y + 16
  terms.forEach((t) => {
    doc.splitTextToSize(t, leftW).forEach((line) => {
      if (tyy > pageHeight - 56) {
        doc.addPage()
        tyy = 60
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(...INK)
      }
      doc.text(line, margin, tyy)
      tyy += 12
    })
  })
  if (job.notes) {
    tyy += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(r, g, b)
    doc.text('Notes', margin, tyy)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...INK)
    tyy += 16
    doc.splitTextToSize(job.notes, leftW).forEach((line) => {
      if (tyy > pageHeight - 56) {
        doc.addPage()
        tyy = 60
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(...INK)
      }
      doc.text(line, margin, tyy)
      tyy += 12
    })
  }

  // ---- signature, bottom right of the last page ----
  let sigY = pageHeight - 96
  if (doc.internal.getNumberOfPages() === totalsPage && ty2 + 40 > sigY) {
    doc.addPage()
  }
  doc.setDrawColor(r, g, b)
  doc.setLineWidth(0.8)
  doc.line(right - 214, sigY, right, sigY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(r, g, b)
  doc.text('customer signature', right - 107, sigY + 14, { align: 'center' })

  // ---- optional AI concept page ----
  if (opts.conceptUrl) {
    const dataUrl = await loadImageDataUrl(opts.conceptUrl)
    if (dataUrl) {
      doc.addPage()
      const pageW = doc.internal.pageSize.getWidth()
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.setTextColor(r, g, b)
      doc.text('Project preview', margin, 72)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(90, 100, 95)
      doc.text('A concept of the finished work described in this quote.', margin, 90)
      const props = doc.getImageProperties(dataUrl)
      const maxW = pageW - margin * 2
      const maxH = pageHeight - 110 - 90
      const scale = Math.min(maxW / props.width, maxH / props.height)
      const w = props.width * scale
      const h = props.height * scale
      doc.addImage(dataUrl, 'PNG', margin + (maxW - w) / 2, 108, w, h, undefined, 'FAST')
      doc.setFontSize(8.5)
      doc.setTextColor(120, 128, 124)
      doc.text(
        'AI-generated concept illustration for visualization only. Final materials, colors, sizes and layout will vary.',
        margin,
        108 + h + 18,
        { maxWidth: maxW },
      )
    }
  }

  // ---- footer ----
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(165, 170, 167)
    doc.text('Created with AutoQuoteHM', margin, pageHeight - 24)
    if (pageCount > 1) doc.text(`Page ${i} of ${pageCount}`, right, pageHeight - 24, { align: 'right' })
  }

  return doc
}

// Builds the PDF and triggers a download.
export async function buildQuotePdf(job, est, company, opts = {}) {
  const doc = await buildQuotePdfDoc(job, est, company, opts)
  const safeName = (job.customerName || 'quote').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  doc.save(`${safeName}-quote.pdf`)
}
