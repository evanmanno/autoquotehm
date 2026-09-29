// AutoQuoteMH — rate card and quote math.
// The values below are SEED defaults only. What a business actually runs on
// lives in Company Settings (set up during onboarding), persisted to
// localStorage — these just seed that screen the first time it opens.

export const PROFIT_MARGIN = 0.52
export const LABOR_RATE = 60 // per hour, per crew member
export const MILEAGE_RATE = 0.75 // $/mile, round trip -- covers vehicle wear + gas
export const DUMP_FEE = 65 // $/load
export const MIN_JOB_CHARGE = 250 // $
export const TRIP_MINIMUM = 0 // $ -- stored, not yet applied to the quote math

export const SERVICES = [
  { id: 'mulch', name: 'Mulch Installation', unit: 'yard', rate: 120, note: 'material + install' },
  { id: 'sod', name: 'Sod Installation', unit: 'sqft', rate: 0.9, note: 'material + install' },
  { id: 'grading', name: 'Lawn Grading & Leveling', unit: 'sqft', rate: 0.4 },
  { id: 'loam', name: 'Loam / Topsoil', unit: 'yard', rate: 120, note: 'material + install' },
  { id: 'hydroseeding', name: 'Hydroseeding', unit: 'sqft', rate: 0.2 },
  { id: 'cleanup', name: 'Spring Cleanup', unit: 'tbd' },
  { id: 'junk', name: 'Junk Removal', unit: 'tbd' },
  { id: 'gravel', name: 'Gravel', unit: 'yard', rate: 240, note: 'material + install' },
]

// Placeholder day-rates -- each business should confirm and edit its own real
// costs during onboarding before quoting clients.
export const EQUIPMENT = [
  { id: 'skidsteer', name: 'Skid Steer', rate: 150 },
  { id: 'trailer', name: 'Dump Trailer', rate: 60 },
  { id: 'miniex', name: 'Mini Excavator (rental)', rate: 275 },
  { id: 'chainsaw', name: 'Chainsaw / Handheld Tools', rate: 25 },
  { id: 'stumpgrinder', name: 'Stump Grinder (rental)', rate: 225 },
]

export const UNIT_LABEL = { yard: 'yd³', sqft: 'sq ft' }

export const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export const money = (n) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

export const qty = (n) =>
  n.toLocaleString('en-US', { maximumFractionDigits: 2 })

export const serviceById = (list, id) => list.find((s) => s.id === id)
export const equipmentById = (list, id) => list.find((e) => e.id === id)

export const makeId = () => `custom-${Math.random().toString(36).slice(2, 8)}`

// Square footage falls back to the property-wide number when a service has no
// override of its own.
export function serviceQuantity(service, job) {
  if (service.unit === 'yard') return num(job.yards[service.id])
  if (service.unit === 'sqft') {
    const override = job.serviceSqft[service.id]
    return override === '' || override == null
      ? num(job.squareFootage)
      : num(override)
  }
  return 0
}

export function estimate(job, company) {
  const materials = company.materials ?? SERVICES
  const equipmentList = company.equipment ?? EQUIPMENT
  const laborRate = num(company.laborRate) || LABOR_RATE
  const mileageRate =
    company.mileageRate === '' || company.mileageRate == null
      ? MILEAGE_RATE
      : num(company.mileageRate)
  const dumpFee =
    company.dumpFee === '' || company.dumpFee == null ? DUMP_FEE : num(company.dumpFee)
  const margin = company.defaultMargin ?? PROFIT_MARGIN
  const minJobCharge =
    company.minJobCharge === '' || company.minJobCharge == null
      ? MIN_JOB_CHARGE
      : num(company.minJobCharge)

  const lineItems = job.services
    .map((id) => {
      const service = serviceById(materials, id)
      if (!service) return null
      const quantity = serviceQuantity(service, job)
      // TBD services are quoted by hand later, so they never touch the totals.
      const tbd = service.unit === 'tbd'
      return {
        id,
        name: service.name,
        unit: service.unit,
        unitLabel: UNIT_LABEL[service.unit],
        rate: service.rate ?? 0,
        quantity,
        cost: tbd ? 0 : quantity * (service.rate ?? 0),
        tbd,
      }
    })
    .filter(Boolean)

  const equipmentItems = Object.entries(job.equipmentSelected ?? {})
    .filter(([, days]) => num(days) > 0)
    .map(([id, days]) => {
      const item = equipmentById(equipmentList, id)
      const quantity = num(days)
      return {
        id,
        name: item?.name ?? id,
        rate: item?.rate ?? 0,
        quantity,
        cost: quantity * (item?.rate ?? 0),
      }
    })

  const materialCost = lineItems.reduce((sum, item) => sum + item.cost, 0)
  const laborHours = num(job.laborHours)
  const crewMembers = num(job.crewMembers)
  const laborCost = laborHours * crewMembers * laborRate
  const equipmentCost = equipmentItems.reduce((sum, item) => sum + item.cost, 0)
  const driveMiles = num(job.driveMiles)
  const travelCost = driveMiles * 2 * mileageRate // round trip
  const fuelCost = num(job.fuelCost)
  const dumpLoads = num(job.dumpLoads)
  const disposalCost = dumpLoads * dumpFee
  const totalCost =
    materialCost + laborCost + equipmentCost + travelCost + fuelCost + disposalCost
  const rawQuotePrice = totalCost / (1 - margin)
  const belowMinimum = totalCost > 0 && rawQuotePrice < minJobCharge
  const quotePrice = belowMinimum ? minJobCharge : rawQuotePrice
  const profitAmount = quotePrice - totalCost

  return {
    lineItems,
    hasTbd: lineItems.some((item) => item.tbd),
    materialCost,
    laborHours,
    crewMembers,
    laborRate,
    laborCost,
    equipmentItems,
    equipmentCost,
    driveMiles,
    mileageRate,
    travelCost,
    fuelCost,
    dumpLoads,
    dumpFee,
    disposalCost,
    totalCost,
    profitAmount,
    profitMargin: margin,
    minJobCharge,
    belowMinimum,
    quotePrice,
  }
}
