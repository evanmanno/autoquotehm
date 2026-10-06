// AutoQuoteHM — rate card and quote math.
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
  // --- Maintenance (recurring / per-visit work) ---
  { id: 'maint-mow', name: 'Lawn Mowing', unit: 'each', rate: 55, note: 'per visit', category: 'maintenance' },
  { id: 'maint-trim', name: 'Weed Whacking / String Trimming', unit: 'each', rate: 25, note: 'per visit', category: 'maintenance' },
  { id: 'maint-edge', name: 'Edging (beds & walks)', unit: 'linear-ft', rate: 1.25, category: 'maintenance' },
  { id: 'maint-blow', name: 'Leaf Blowing / Blow-off', unit: 'each', rate: 30, note: 'per visit', category: 'maintenance' },
  { id: 'maint-weed', name: 'Weed Picking (beds)', unit: 'sqft', rate: 0.15, category: 'maintenance' },
  { id: 'maint-prune', name: 'Pruning / Hedge Trimming', unit: 'linear-ft', rate: 4, category: 'maintenance' },
  { id: 'cleanup', name: 'Spring Cleanup', unit: 'tbd', category: 'maintenance' },
  { id: 'maint-fall', name: 'Fall Cleanup / Leaf Removal', unit: 'tbd', category: 'maintenance' },
  { id: 'junk', name: 'Junk Removal', unit: 'tbd', category: 'maintenance' },
  // --- Landscape Construction (installs and one-time projects) ---
  { id: 'mulch', name: 'Mulch Installation', unit: 'yard', rate: 120, note: 'material + install', category: 'construction' },
  { id: 'sod', name: 'Sod Installation', unit: 'sqft', rate: 0.9, note: 'material + install', category: 'construction' },
  { id: 'grading', name: 'Lawn Grading & Leveling', unit: 'sqft', rate: 0.4, category: 'construction' },
  { id: 'loam', name: 'Loam / Topsoil', unit: 'yard', rate: 120, note: 'material + install', category: 'construction' },
  { id: 'hydroseeding', name: 'Hydroseeding', unit: 'sqft', rate: 0.2, category: 'construction' },
  { id: 'gravel', name: 'Gravel', unit: 'yard', rate: 240, note: 'material + install', category: 'construction' },
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

// A business picks its trade(s) during onboarding, which seeds its Materials
// list with a realistic starter rate card for that trade -- still fully
// editable/removable afterward. Every rate below is a placeholder, same as
// SERVICES/EQUIPMENT: confirm and adjust before quoting real customers.
export const INDUSTRIES = [
  { id: 'landscaping', name: 'Landscaping' },
  { id: 'hardscaping', name: 'Hardscaping' },
  { id: 'snow', name: 'Snow Plowing & Salting' },
]

// Snow jobs scale with how much fell. Each tier multiplies the base rate of any
// service flagged `depthScaled` (plowing, shoveling) -- salting is the same
// whether it fell 2" or 10", so it isn't. Placeholder multipliers: tune them to
// your own per-inch pricing in Company Settings.
export const SNOW_DEPTH = [
  { id: 'light', label: 'Under 3"', mult: 1 },
  { id: 'mid', label: '3–6"', mult: 1.35 },
  { id: 'heavy', label: '6–12"', mult: 1.8 },
  { id: 'storm', label: '12"+ storm', mult: 2.5 },
]

// Equipment follows the same pattern as INDUSTRY_SERVICES -- checking a trade
// also seeds the day-rate gear that trade typically bills separately.
export const INDUSTRY_EQUIPMENT = {
  landscaping: EQUIPMENT,
  hardscaping: [
    { id: 'hardscape-compactor', name: 'Plate Compactor', rate: 65 },
    { id: 'hardscape-miniex', name: 'Mini Excavator (rental)', rate: 275 },
  ],
  snow: [
    { id: 'snow-truck', name: 'Plow Truck', rate: 300 },
    { id: 'snow-pusher', name: 'Skid Steer w/ Snow Pusher', rate: 275 },
    { id: 'snow-spreader', name: 'Salt Spreader', rate: 60 },
    { id: 'snow-blower', name: 'Walkway Snow Blower', rate: 40 },
  ],
}

// Hardscape & construction starters. Part of the Landscaping trade too, so a
// landscape company sees all three tabs; the standalone Hardscaping trade seeds
// the same list.
export const HARDSCAPE_SERVICES = [
  { id: 'hardscape-patio', name: 'Paver Patio', unit: 'sqft', rate: 18, note: 'material + install', category: 'hardscape' },
  { id: 'hardscape-natural-patio', name: 'Natural Stone / Flagstone Patio', unit: 'sqft', rate: 28, note: 'material + install', category: 'hardscape' },
  { id: 'hardscape-walkway', name: 'Paver Walkway', unit: 'sqft', rate: 16, note: 'material + install', category: 'hardscape' },
  { id: 'hardscape-driveway', name: 'Paver Driveway', unit: 'sqft', rate: 20, note: 'material + install', category: 'hardscape' },
  { id: 'hardscape-wall', name: 'Retaining Wall', unit: 'linear-ft', rate: 45, note: 'material + install', category: 'hardscape' },
  { id: 'hardscape-seatwall', name: 'Seat Wall', unit: 'linear-ft', rate: 55, note: 'material + install', category: 'hardscape' },
  { id: 'hardscape-steps', name: 'Stone / Paver Steps', unit: 'each', rate: 150, note: 'per step', category: 'hardscape' },
  { id: 'hardscape-edging', name: 'Paver / Stone Edging', unit: 'linear-ft', rate: 9, category: 'hardscape' },
  { id: 'hardscape-base', name: 'Excavation & Base Prep', unit: 'sqft', rate: 4, note: 'dig + compacted base', category: 'hardscape' },
  { id: 'hardscape-firepit', name: 'Fire Pit Installation', unit: 'tbd', category: 'hardscape' },
]

export const INDUSTRY_SERVICES = {
  landscaping: [...SERVICES, ...HARDSCAPE_SERVICES],
  hardscaping: HARDSCAPE_SERVICES,
  // perVisit: the quantity is multiplied by the number of pushes/visits on the
  // job (1 for a one-off storm, e.g. 14 for a seasonal contract).
  // depthScaled: the rate is multiplied by the snow-depth tier.
  snow: [
    { id: 'snow-driveway', name: 'Residential Driveway Plowing', unit: 'each', rate: 30, note: 'per driveway, per push', perVisit: true, depthScaled: true, category: 'snow' },
    { id: 'snow-walkway', name: 'Walkway & Steps Shoveling', unit: 'each', rate: 18, note: 'per property, per visit', perVisit: true, depthScaled: true, category: 'snow' },
    { id: 'snow-lot', name: 'Commercial Lot Plowing', unit: 'sqft', rate: 0.007, note: 'per push', perVisit: true, depthScaled: true, category: 'snow' },
    { id: 'snow-salt', name: 'Salting / Deicing (lot or drive)', unit: 'sqft', rate: 0.008, note: 'material + spread', perVisit: true, category: 'snow' },
    { id: 'snow-sidewalk', name: 'Sidewalk Clearing & Salting', unit: 'linear-ft', rate: 0.5, perVisit: true, depthScaled: true, category: 'snow' },
    { id: 'snow-hauling', name: 'Snow Hauling / Removal', unit: 'tbd', category: 'snow' },
    { id: 'snow-seasonal', name: 'Seasonal Contract (flat rate)', unit: 'tbd', category: 'snow' },
  ],
}

// Tabs on the "Services Needed" step. A service's tab comes from its own
// `category`, or -- for services saved before categories existed -- from the
// starter service with the same id. Anything else lands in "Other".
export const CATEGORIES = [
  { id: 'maintenance', name: 'Maintenance' },
  { id: 'construction', name: 'Landscape Construction' },
  { id: 'hardscape', name: 'Hardscape & Construction' },
  { id: 'snow', name: 'Snow & Ice' },
  { id: 'other', name: 'Other' },
]

const SEED_CATEGORY = {}
Object.values(INDUSTRY_SERVICES).forEach((list) =>
  list.forEach((s) => {
    if (s.category) SEED_CATEGORY[s.id] = s.category
  }),
)

// Anything whose tab no longer exists (e.g. a retired trade) shows under Other.
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id))
export const categoryOf = (service) => {
  const id = service.category || SEED_CATEGORY[service.id] || 'other'
  return CATEGORY_IDS.has(id) ? id : 'other'
}

// Flags that make a snow service behave differently in the math; restored from
// the starter list so they survive an old save that didn't keep them.
const SEED_BY_ID = {}
Object.values(INDUSTRY_SERVICES).forEach((list) => list.forEach((s) => (SEED_BY_ID[s.id] = s)))
export const seedFlags = (id) => {
  const s = SEED_BY_ID[id]
  return s ? { perVisit: s.perVisit, depthScaled: s.depthScaled } : {}
}

export const UNIT_LABEL = { yard: 'yd³', sqft: 'sq ft', each: 'ea', 'linear-ft': 'lin ft' }

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
  if (service.unit === 'each' || service.unit === 'linear-ft') {
    return num(job.serviceQty?.[service.id])
  }
  return 0
}

export const snowDepthById = (id) => SNOW_DEPTH.find((d) => d.id === id) ?? SNOW_DEPTH[0]

export function estimate(job, company) {
  const materials = (company.materials ?? SERVICES).map((m) => ({ ...seedFlags(m.id), ...m }))
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
      // TBD services are quoted by hand later, so they never touch the totals.
      const tbd = service.unit === 'tbd'
      let quantity = serviceQuantity(service, job)
      let rate = service.rate ?? 0
      let name = service.name
      let visits = 1
      let depthLabel = ''
      const baseQuantity = quantity
      // Snow: more pushes multiply the quantity, deeper snow multiplies the rate.
      // Folding both into quantity/rate keeps every "qty x rate = cost" display
      // (quote screen, email, PDF) correct without special cases.
      if (!tbd && service.perVisit) {
        visits = Math.max(1, Math.round(num(job.snowVisits)) || 1)
        quantity *= visits
        if (visits > 1) name += ` — ${visits} visits`
      }
      if (!tbd && service.depthScaled) {
        const depth = snowDepthById(job.snowDepth)
        rate *= depth.mult
        depthLabel = depth.label
        name += ` (${depth.label} snow)`
      }
      return {
        id,
        name,
        unit: service.unit,
        unitLabel: UNIT_LABEL[service.unit],
        rate,
        quantity,
        baseName: service.name,
        baseQuantity,
        visits,
        depthLabel,
        cost: tbd ? 0 : quantity * rate,
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
