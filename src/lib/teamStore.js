import { supabase } from './supabaseClient'

// ---------------------------------------------------------------------------
// Invites: the owner creates one in Team, shares the link, and the teammate
// opens it, signs up (or signs in) with the invited email, and is joined to
// the company. The token waits in localStorage so it survives the sign-up /
// email-confirmation round trip.
// ---------------------------------------------------------------------------

const INVITE_KEY = 'aqhm-pending-invite'

// Call once on app start: moves ?invite=<token> from the URL into storage and
// cleans the address bar. Returns true if there is a pending invite.
export function captureInviteFromUrl() {
  try {
    const url = new URL(window.location.href)
    const token = url.searchParams.get('invite')
    if (token) {
      localStorage.setItem(INVITE_KEY, token)
      url.searchParams.delete('invite')
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    }
    return Boolean(localStorage.getItem(INVITE_KEY))
  } catch {
    return false
  }
}

export const getPendingInvite = () => {
  try {
    return localStorage.getItem(INVITE_KEY)
  } catch {
    return null
  }
}

export const clearPendingInvite = () => {
  try {
    localStorage.removeItem(INVITE_KEY)
  } catch {
    // storage unavailable -- nothing to clear
  }
}

export const inviteLink = (token) => `${window.location.origin}/?invite=${token}`

// Joins the signed-in user to the inviting company. Returns { ok, message }.
// A "wrong email" error keeps the token so the right account can still use it.
export async function acceptPendingInvite() {
  const token = getPendingInvite()
  if (!token) return { ok: true, joined: false }
  const { error } = await supabase.rpc('accept_invite', { p_token: token })
  if (error) {
    if (!/sign in with that email/i.test(error.message || '')) clearPendingInvite()
    return { ok: false, message: error.message || 'Could not use this invite link.' }
  }
  clearPendingInvite()
  return { ok: true, joined: true }
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

const toMember = (row) => ({
  userId: row.user_id,
  companyId: row.company_id,
  role: row.role,
  email: row.email ?? '',
  displayName: row.display_name ?? '',
  phone: row.phone ?? '',
  createdAt: row.created_at,
})

export async function fetchMyMember(userId) {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? toMember(data) : null
}

export async function listMembers(companyId) {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toMember)
}

export async function removeMember(companyId, userId) {
  const { error } = await supabase
    .from('members')
    .delete()
    .eq('company_id', companyId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function setMyProfile(displayName, phone) {
  const { error } = await supabase.rpc('set_my_profile', {
    p_name: displayName,
    p_phone: phone,
  })
  if (error) throw error
}

const toInvite = (row) => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name ?? '',
  token: row.token,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
})

export async function listInvites(companyId) {
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('company_id', companyId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toInvite)
}

export async function createInvite(companyId, email, displayName) {
  const { data, error } = await supabase
    .from('invites')
    .insert({
      company_id: companyId,
      email: email.trim().toLowerCase(),
      display_name: (displayName || '').trim(),
    })
    .select()
    .single()
  if (error) throw error
  return toInvite(data)
}

export async function revokeInvite(id) {
  const { error } = await supabase.from('invites').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Saved quotes
// ---------------------------------------------------------------------------

export const QUOTE_STATUSES = ['draft', 'sent', 'won', 'lost']

const toQuote = (row) => ({
  id: row.id,
  customerName: row.customer_name ?? '',
  customerPhone: row.customer_phone ?? '',
  address: row.job_address ?? '',
  total: Number(row.total ?? 0),
  margin: Number(row.margin ?? 0),
  status: row.status ?? 'draft',
  createdBy: row.created_by,
  createdByName: row.created_by_name ?? '',
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? row.created_at,
  job: row.job ?? null,
})

// Inserts a quote, or updates it when `id` is given. On update the status is
// only touched when one is passed, so reopening a "won" quote never resets it.
export async function saveQuote({ id, companyId, job, est, status, createdByName }) {
  const fields = {
    customer_name: job.customerName || '',
    customer_phone: job.phone || '',
    job_address: job.address || '',
    line_items: est.lineItems,
    margin: est.profitMargin,
    total: est.quotePrice,
    job,
    estimate: {
      quotePrice: est.quotePrice,
      totalCost: est.totalCost,
      profitAmount: est.profitAmount,
      profitMargin: est.profitMargin,
      laborHours: est.laborHours,
      crewMembers: est.crewMembers,
    },
    ...(status ? { status } : {}),
  }

  if (id) {
    const { data, error } = await supabase
      .from('quotes')
      .update(fields)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return toQuote(data)
  }

  const { data, error } = await supabase
    .from('quotes')
    .insert({
      ...fields,
      company_id: companyId,
      created_by_name: createdByName || '',
      status: status || 'draft',
    })
    .select()
    .single()
  if (error) throw error
  return toQuote(data)
}

export async function listQuotes(companyId) {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []).map(toQuote)
}

export async function setQuoteStatus(id, status) {
  const { error } = await supabase.from('quotes').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deleteQuote(id) {
  const { error } = await supabase.from('quotes').delete().eq('id', id)
  if (error) throw error
}

// Quotes created so far this calendar month; the monthly plan limit counts
// these. (UTC month, the same boundary as the database trigger in migration_08_plans.sql.)
export async function countQuotesThisMonth(companyId) {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const { count, error } = await supabase
    .from('quotes')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .gte('created_at', start.toISOString())
  if (error) throw error
  return count ?? 0
}
