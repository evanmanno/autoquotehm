import { supabase } from './supabaseClient'
import { consentMeta } from './consent'

export async function getInitialSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
  return () => data.subscription.unsubscribe()
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: consentMeta() } })
  if (error) throw error
  return data
}

// Records agreement to the market-insights terms for an already signed-in
// account. Returns the updated user.
export async function recordConsent() {
  const { data, error } = await supabase.auth.updateUser({ data: consentMeta() })
  if (error) throw error
  return data.user
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// Changes the password for the signed-in account. The current password is
// checked first (a fresh sign-in), so a borrowed unlocked phone can't change it.
export async function changePassword(email, currentPassword, newPassword) {
  const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
  if (checkError) {
    const err = new Error('wrong-current')
    err.code = 'wrong-current'
    throw err
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

// Permanently deletes this login and (for an owner) their business. Needs
// supabase/migration_14_delete_account.sql. Signs out locally afterwards.
export async function deleteMyAccount() {
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw error
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // the login is already gone on the server
  }
}
