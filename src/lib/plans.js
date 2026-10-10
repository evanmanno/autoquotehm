// Pricr plans. Prices and limits match the pricing doc (Door 1 / Door 3 tiers).
// `quotes` is how many NEW quotes a company can start per calendar month and
// `estimators` is how many logins (owner + invited estimators) it can have.
export const PLANS = [
  { id: 'starter', name: 'Starter', price: 299, quotes: 50, estimators: 1 },
  { id: 'pro', name: 'Pro', price: 499, quotes: 150, estimators: 3, popular: true },
  { id: 'business', name: 'Business', price: 999, quotes: 500, estimators: 10 },
]

// Plan and price screens are hidden for now (demos). Quote limits still apply.
// Flip to true to bring Settings > Manage plan back.
export const SHOW_PLANS = false

export const ENTERPRISE_EMAIL = 'info@pricr.com'

export const getPlan = (id) => PLANS.find((p) => p.id === id) ?? PLANS[0]

// Quotes are counted per calendar month, in the viewer's local time.
export const monthStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1)
export const nextReset = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 1)
