import emailjs from '@emailjs/browser'
import { money } from './pricing'
import { buildEmailBody } from './emailBody'

export { buildEmailBody }

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

export const isConfigured = Boolean(SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY)

export async function sendQuote(job, est, photoCount, company) {
  if (!isConfigured) {
    throw new Error(
      'EmailJS is not configured. Add VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID and VITE_EMAILJS_PUBLIC_KEY to .env.local, then restart the dev server.',
    )
  }

  const recipient = company?.contactEmail?.trim()
  if (!recipient) {
    throw new Error(
      'No quotes contact email is set. Add one under Business in Company Settings before sending.',
    )
  }

  const customer = job.customerName.trim() || 'New customer'

  return emailjs.send(
    SERVICE_ID,
    TEMPLATE_ID,
    {
      to_email: recipient,
      subject: `Job Estimate — ${customer} — ${money(est.quotePrice)}`,
      customer_name: customer,
      customer_phone: job.phone || '—',
      property_address: job.address || '—',
      crew: job.crew,
      prepared_by: company?.crewMemberName || '—',
      quote_price: money(est.quotePrice),
      total_cost: money(est.totalCost),
      profit_amount: money(est.profitAmount),
      message: buildEmailBody(job, est, photoCount, company),
      reply_to: recipient,
    },
    { publicKey: PUBLIC_KEY },
  )
}
