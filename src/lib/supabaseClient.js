import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing Supabase env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
      'Copy .env.example to .env.local and fill them in.',
  )
}

let native = false
try {
  native = Capacitor.isNativePlatform()
} catch {
  // plain browser
}

// Inside the iPhone/Android app, keep the login in the phone's own app storage
// (iOS UserDefaults / Android SharedPreferences). The web view's localStorage
// can be wiped by iOS or lost when the app is closed, which signed people out
// every time they reopened the app. In a browser nothing changes.
const nativeStorage = {
  async getItem(key) {
    const { value } = await Preferences.get({ key })
    if (value != null) return value
    // One-time move of a login saved by older versions of the app.
    try {
      const old = window.localStorage.getItem(key)
      if (old != null) {
        await Preferences.set({ key, value: old })
        return old
      }
    } catch {
      // storage unavailable
    }
    return null
  },
  async setItem(key, value) {
    await Preferences.set({ key, value })
  },
  async removeItem(key) {
    await Preferences.remove({ key })
    try {
      window.localStorage.removeItem(key)
    } catch {
      // storage unavailable
    }
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    ...(native ? { storage: nativeStorage, detectSessionInUrl: false } : {}),
  },
})
