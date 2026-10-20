// "Oct 25, 2026 · 9:30 AM" from the quote's job date ("2026-10-25") and
// start time ("09:30"). Either part can be blank; returns '' when both are.
export function formatJobWhen(job) {
  const parts = []
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(job?.jobDate || '')
  if (d) {
    // Built from its parts so the date never shifts a day across time zones.
    const date = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]))
    parts.push(date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }))
  }
  const t = /^(\d{1,2}):(\d{2})/.exec(job?.jobTime || '')
  if (t) {
    const h = Number(t[1])
    parts.push(`${h % 12 || 12}:${t[2]} ${h < 12 ? 'AM' : 'PM'}`)
  }
  return parts.join(' · ')
}
