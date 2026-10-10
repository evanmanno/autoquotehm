import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { UNIT_LABEL, money, qty, serviceQuantity } from '../pricing'
import { deliverPdf } from './native'

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

const fmtDate = (d) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

// Short, stable-looking estimate number: AQ-YYMMDD-### (### derived from the
// customer name so re-downloading the same quote gives the same number).
function estimateNumber(job, date) {
  const yy = String(date.getFullYear()).slice(2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const seed = [...(job.customerName || 'quote')].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 997, 7)
  return `PQ-${yy}${mm}${dd}-${String(seed).padStart(3, '0')}`
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
        name: item.baseName,
        desc: `${qty(item.baseQuantity)} ${item.unitLabel ?? ''} per visit${
          item.depthLabel ? `, ${item.depthLabel} snow` : ''
        }`.replace(/\s+,/, ','),
        qtyText: `${item.visits} visits`,
        quantity: item.visits,
        cost: item.cost,
      })
      return
    }
    groups.materials.push({
      name: item.baseName ?? item.name,
      desc: item.tbd
        ? 'To be priced separately'
        : [item.note, item.depthLabel ? `${item.depthLabel} snow` : ''].filter(Boolean).join(', '),
      qtyText: item.tbd ? '—' : `${qty(item.quantity)} ${item.unitLabel ?? ''}`.trim(),
      quantity: item.quantity,
      cost: item.cost,
      tbd: item.tbd,
    })
  })
  ;(est.materialItems ?? []).forEach((item) => {
    groups.materials.push({
      name: item.name,
      desc: item.note || 'Material',
      qtyText: `${qty(item.quantity)} ${item.unitLabel ?? ''}`.trim(),
      quantity: item.quantity,
      cost: item.cost,
    })
  })
  if (est.laborCost > 0) {
    const hrs = est.laborHours * est.crewMembers
    groups.labor.push({
      name: 'Labor',
      desc: `${qty(est.crewMembers)} crew × ${qty(est.laborHours)} hrs`,
      qtyText: `${qty(hrs)} hrs`,
      quantity: hrs,
      cost: est.laborCost,
    })
  }
  est.equipmentItems.forEach((item) => {
    groups.equipment.push({
      name: item.name,
      desc: 'Equipment',
      qtyText: `${qty(item.quantity)} day${item.quantity === 1 ? '' : 's'}`,
      quantity: item.quantity,
      cost: item.cost,
    })
  })
  if (est.travelCost > 0) {
    groups.other.push({
      name: 'Travel',
      desc: `${qty(est.driveMiles)} miles total`,
      qtyText: '1',
      quantity: 1,
      cost: est.travelCost,
    })
  }
  if (est.fuelCost > 0) {
    groups.other.push({ name: 'Equipment fuel', desc: '', qtyText: '1', quantity: 1, cost: est.fuelCost })
  }
  if (est.disposalCost > 0) {
    groups.other.push({
      name: 'Disposal / dump fees',
      desc: `${qty(est.dumpLoads)} load${est.dumpLoads === 1 ? '' : 's'}`,
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

const DEFAULT_GREEN = '#5c9a17'

// Builds the finished customer-facing quote (jsPDF document, not yet saved).
// Layout follows the invoice-style template: logo + company block on top,
// recipient on the left and a quote summary box on the right, a bordered
// product / description / qty / unit price / total table, subtotal, tax and
// total, then the company's own terms and a signature line.
export async function buildQuotePdfDoc(job, est, company, opts = {}) {
  // Everyone's profile is seeded with the old default green; treat that as
  // "no brand color chosen" and use the template green instead.
  const rawBrand = (company?.brandColor || '').toLowerCase()
  const brand = hexToRgb(!rawBrand || rawBrand === '#1f6f45' ? DEFAULT_GREEN : rawBrand)
  const [r, g, b] = brand
  const logoData = await loadImageDataUrl(company?.logoUrl)

  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 44
  const right = pageWidth - margin
  const today = new Date()
  const validUntil = new Date(today.getTime() + 30 * 86400000)
  const INK = [28, 38, 50]
  const GRAY = [238, 238, 238]
  const fmt = (d) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  // ---- top: logo (left) + company block ----
  let textX = margin
  if (logoData) {
    try {
      const props = doc.getImageProperties(logoData)
      const boxW = 150
      const boxH = 64
      const scale = Math.min(boxW / props.width, boxH / props.height)
      const w = props.width * scale
      const h = props.height * scale
      doc.addImage(logoData, props.fileType || 'PNG', margin, 40 + (boxH - h) / 2, w, h)
      textX = margin + w + 26
    } catch {
      // unsupported image: just skip the logo
    }
  }
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  const nameLines = doc.splitTextToSize(company?.businessName || 'Your Company', right - textX)
  let ty = 62
  nameLines.forEach((line) => {
    doc.text(line, textX, ty)
    ty += 22
  })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  ty -= 6
  doc.splitTextToSize(company?.shopAddress || '', right - textX).forEach((line) => {
    doc.text(line, textX, ty)
    ty += 12
  })
  const phone = company?.contactPhone || company?.yourPhone
  const email = company?.contactEmail || company?.yourEmail
  const contactLine = [phone, email].filter(Boolean).join('   |   ')
  if (contactLine) {
    doc.text(contactLine, textX, ty)
    ty += 12
  }

  // ---- recipient (left) + quote summary box (right) ----
  const topY = Math.max(ty + 26, 150)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...INK)
  doc.text('RECIPIENT:', margin, topY + 16)
  doc.setFontSize(14)
  doc.text(job.customerName || 'Customer', margin, topY + 56)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  let by = topY + 74
  ;[...doc.splitTextToSize(job.address || '', 250), ...(job.phone ? [job.phone] : [])].forEach((line) => {
    doc.text(line, margin, by)
    by += 13
  })

  const boxW = 258
  const boxX = right - boxW
  doc.setFillColor(r, g, b)
  doc.rect(boxX, topY, boxW, 30, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(255, 255, 255)
  doc.text(`Quote #${estimateNumber(job, today).replace(/^PQ-/, '')}`, boxX + 6, topY + 20)
  const preparedBy = company?.crewMemberName || company?.contactName || ''
  const meta = [
    ['Issued', fmt(today)],
    ['Valid until', fmt(validUntil)],
    ['Prepared by', preparedBy || '—'],
  ]
  let my = topY + 30
  meta.forEach(([label, value]) => {
    doc.setFillColor(...GRAY)
    doc.rect(boxX, my + 2, boxW, 28, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    doc.text(label, boxX + 6, my + 20)
    doc.text(String(value), boxX + boxW - 6, my + 20, { align: 'right' })
    my += 30
  })
  const taxRate = Number(company?.salesTaxRate) > 0 ? Number(company.salesTaxRate) : 0
  const tax = Math.round(est.quotePrice * taxRate) / 100
  const total = est.quotePrice + tax
  doc.setFillColor(r, g, b)
  doc.rect(boxX, my + 2, boxW, 30, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(255, 255, 255)
  doc.text('Total', boxX + 6, my + 22)
  doc.text(money(total), boxX + boxW - 6, my + 22, { align: 'right' })
  my += 32

  // ---- scope heading + line items ----
  let y = Math.max(by, my) + 34
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.setTextColor(...INK)
  doc.text('Quote for Services', margin, y)
  y += 10

  const lines = Object.values(buildCustomerLines(est)).flat()
  const body = lines.map((l) => [
    l.name,
    l.desc || '',
    l.tbd ? '—' : l.qtyText,
    l.tbd ? '—' : money(l.unitPrice),
    l.tbd ? 'TBD' : money(l.amount),
  ])
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 70 },
    head: [['PRODUCT / SERVICE', 'DESCRIPTION', 'QTY', 'UNIT PRICE', 'TOTAL']],
    body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: INK,
      lineColor: [190, 190, 190],
      lineWidth: 0.6,
      cellPadding: { top: 7, bottom: 7, left: 6, right: 6 },
      valign: 'middle',
    },
    headStyles: {
      fillColor: [r, g, b],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
      lineColor: [r, g, b],
    },
    columnStyles: {
      0: { cellWidth: 118 },
      1: { cellWidth: 'auto' },
      2: { halign: 'right', cellWidth: 62 },
      3: { halign: 'right', cellWidth: 74 },
      4: { halign: 'right', cellWidth: 74 },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index >= 2) data.cell.styles.halign = 'center'
    },
  })
  y = doc.lastAutoTable.finalY + 26

  // ---- thank-you note (left) + totals (right) ----
  const totalsW = 232
  const totalsX = right - totalsW
  const rowsCount = taxRate ? 3 : 2
  if (y + rowsCount * 26 + 30 > pageHeight - 70) {
    doc.addPage()
    y = 60
  }
  const noteLines = doc.splitTextToSize(
    `Thank you for your business. Please contact us with any questions regarding this quote.`,
    totalsX - margin - 24,
  )
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...INK)
  noteLines.forEach((line, i) => doc.text(line, margin, y + 8 + i * 13))

  let ry = y + 6
  const totalRow = (label, value, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...(bold ? [r, g, b] : INK))
    doc.text(label, totalsX + 4, ry)
    doc.text(value, right - 4, ry, { align: 'right' })
    doc.setDrawColor(150, 150, 150)
    doc.setLineWidth(1.2)
    doc.line(totalsX, ry + 8, right, ry + 8)
    ry += 26
  }
  totalRow('Subtotal', money(est.quotePrice))
  if (taxRate) totalRow(`Sales Tax (${taxRate}%)`, money(tax))
  totalRow('Total', money(total), true)
  y = Math.max(ry, y + 8 + noteLines.length * 13) + 18

  // ---- terms & notes (full width) ----
  const flags = []
  if (est.belowMinimum) flags.push(`Priced at the ${money(est.minJobCharge)} minimum job charge.`)
  if (est.hasTbd) {
    const names = est.lineItems.filter((i) => i.tbd).map((i) => i.name).join(' and ')
    flags.push(`Not included: ${names} — to be priced separately.`)
  }
  const customTerms = (company?.terms || '').trim()
  const terms = [
    ...(customTerms
      ? customTerms.split(/\n+/).map((t) => t.trim()).filter(Boolean)
      : [
          'This quote is valid for 30 days from the date above.',
          'Final price may change if the scope of work changes after the site visit.',
        ]),
    ...flags,
  ]
  const textW = right - margin
  const writeBlock = (heading, paragraphs) => {
    if (y > pageHeight - 90) {
      doc.addPage()
      y = 60
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(r, g, b)
    doc.text(heading, margin, y)
    y += 15
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...INK)
    paragraphs.forEach((t) => {
      doc.splitTextToSize(t, textW).forEach((line) => {
        if (y > pageHeight - 56) {
          doc.addPage()
          y = 60
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(9)
          doc.setTextColor(...INK)
        }
        doc.text(line, margin, y)
        y += 12
      })
      y += 3
    })
    y += 8
  }
  writeBlock('Terms and Conditions', terms)
  if (job.notes) writeBlock('Notes', job.notes.split(/\n+/).filter(Boolean))

  // ---- signature, bottom of the last page ----
  let sigY = Math.max(y + 36, pageHeight - 96)
  if (sigY > pageHeight - 50) {
    doc.addPage()
    sigY = 120
  }
  doc.setDrawColor(r, g, b)
  doc.setLineWidth(0.8)
  doc.line(right - 214, sigY, right, sigY)
  doc.line(margin, sigY, margin + 130, sigY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(r, g, b)
  doc.text('customer signature', right - 107, sigY + 14, { align: 'center' })
  doc.text('date', margin + 65, sigY + 14, { align: 'center' })

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
    doc.text('Created with Pricr', margin, pageHeight - 24)
    if (pageCount > 1) doc.text(`Page ${i} of ${pageCount}`, right, pageHeight - 24, { align: 'right' })
  }

  return doc
}

// Builds the PDF and triggers a download.
export async function buildQuotePdf(job, est, company, opts = {}) {
  const doc = await buildQuotePdfDoc(job, est, company, opts)
  const safeName = (job.customerName || 'quote').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  await deliverPdf(doc, `${safeName}-quote.pdf`)
}
