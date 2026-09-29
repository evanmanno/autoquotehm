import { UNIT_LABEL, money, num, qty, serviceById, serviceQuantity } from './pricing'

const SIGNOFF = 'Sent from AutoQuoteMH.'

const rule = '='.repeat(46)
const thin = '-'.repeat(46)

// Two-column line: label on the left, amount right-aligned to 46 chars.
function line(label, amount) {
  const left = String(label)
  const right = String(amount)
  const gap = Math.max(1, 46 - left.length - right.length)
  return left + ' '.repeat(gap) + right
}

function heading(text) {
  return `${text}\n${thin}`
}

export function buildEmailBody(job, est, photoCount, company) {
  const materials = company?.materials ?? []
  const parts = []

  const title = company?.businessName
    ? `${company.businessName.toUpperCase()} — JOB ESTIMATE`
    : 'JOB ESTIMATE'
  parts.push(rule)
  parts.push(title)
  parts.push(rule)
  parts.push('')

  if (company?.crewMemberName) {
    const preparedByBits = [company.crewMemberName, company.yourPhone, company.yourEmail].filter(
      (bit) => bit && bit.trim(),
    )
    parts.push(`Prepared by: ${preparedByBits.join(' — ')}`)
    parts.push('')
  }

  parts.push(heading('CUSTOMER INFO'))
  parts.push(`Name:    ${job.customerName || '—'}`)
  parts.push(`Phone:   ${job.phone || '—'}`)
  parts.push(`Address: ${job.address || '—'}`)
  parts.push('')

  parts.push(heading('SERVICES SELECTED'))
  if (job.services.length === 0) {
    parts.push('None selected')
  } else {
    materials
      .filter((s) => job.services.includes(s.id))
      .forEach((service) => {
        const quantity = serviceQuantity(service, job)
        const detail =
          service.unit === 'tbd'
            ? 'priced separately (TBD)'
            : `${qty(quantity)} ${UNIT_LABEL[service.unit]}`
        parts.push(`• ${service.name} — ${detail}`)
      })
  }
  parts.push('')

  parts.push(heading('JOB DETAILS'))
  parts.push(`Property square footage: ${qty(num(job.squareFootage))} sq ft`)

  const yardLines = job.services
    .map((id) => serviceById(materials, id))
    .filter((s) => s && s.unit === 'yard')
    .map((s) => `${s.name}: ${qty(num(job.yards[s.id]))} ${UNIT_LABEL.yard}`)
  if (yardLines.length) {
    parts.push(`Material needed: ${yardLines.join(' | ')}`)
  }

  const areaLines = job.services
    .map((id) => serviceById(materials, id))
    .filter((s) => s && s.unit === 'sqft')
    .map((s) => `${s.name}: ${qty(serviceQuantity(s, job))} sq ft`)
  if (areaLines.length) {
    parts.push(`Area per service: ${areaLines.join(' | ')}`)
  }

  parts.push(`Estimated labor hours: ${qty(est.laborHours)}`)
  parts.push(`Crew members: ${qty(est.crewMembers)}`)
  parts.push(`Crew assigned: ${job.crew}`)
  if (est.equipmentItems.length) {
    const equipLines = est.equipmentItems
      .map((item) => `${item.name} (${qty(item.quantity)}d)`)
      .join(' | ')
    parts.push(`Equipment used: ${equipLines}`)
  }
  if (est.driveMiles > 0) {
    parts.push(`Drive distance: ${qty(est.driveMiles)} mi one-way`)
  }
  if (est.dumpLoads > 0) {
    parts.push(`Dump loads: ${qty(est.dumpLoads)}`)
  }
  parts.push(`Other equipment / notes: ${job.equipment || '—'}`)
  parts.push(`Job notes: ${job.notes || '—'}`)
  parts.push(
    `Site photos: ${
      photoCount ? `${photoCount} taken on site (not attached to this email)` : 'none'
    }`,
  )
  parts.push('')

  parts.push(heading('COST BREAKDOWN'))
  est.lineItems.forEach((item) => {
    const detail = item.tbd
      ? `${item.name} (priced separately)`
      : `${item.name} — ${qty(item.quantity)} ${item.unitLabel} x ${money(item.rate)}`
    parts.push(line(detail, item.tbd ? 'TBD' : money(item.cost)))
  })
  parts.push(
    line(
      `Labor — ${qty(est.laborHours)} hrs x ${qty(est.crewMembers)} crew x ${money(
        est.laborRate,
      )}/hr`,
      money(est.laborCost),
    ),
  )
  est.equipmentItems.forEach((item) => {
    parts.push(
      line(`${item.name} — ${qty(item.quantity)}d x ${money(item.rate)}`, money(item.cost)),
    )
  })
  if (est.travelCost > 0) {
    parts.push(
      line(
        `Travel — ${qty(est.driveMiles)}mi x2 x ${money(est.mileageRate)}/mi`,
        money(est.travelCost),
      ),
    )
  }
  if (est.fuelCost > 0) {
    parts.push(line('Equipment fuel', money(est.fuelCost)))
  }
  if (est.disposalCost > 0) {
    parts.push(
      line(
        `Disposal — ${qty(est.dumpLoads)} loads x ${money(est.dumpFee)}`,
        money(est.disposalCost),
      ),
    )
  }
  parts.push(thin)
  parts.push(line('TOTAL COST', money(est.totalCost)))
  parts.push(
    line(
      `Profit margin (${Math.round(est.profitMargin * 100)}% of quote)`,
      money(est.profitAmount),
    ),
  )
  parts.push(rule)
  parts.push(line('CUSTOMER QUOTE PRICE', money(est.quotePrice)))
  parts.push(rule)

  if (est.hasTbd) {
    const names = est.lineItems
      .filter((item) => item.tbd)
      .map((item) => item.name)
      .join(' and ')
    parts.push('')
    parts.push(`Note: quote excludes ${names} — to be priced separately.`)
  }

  if (est.belowMinimum) {
    parts.push('')
    parts.push(`Note: raised to the ${money(est.minJobCharge)} minimum job charge.`)
  }

  parts.push('')
  parts.push(SIGNOFF)

  return parts.join('\n')
}
