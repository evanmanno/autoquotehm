// The public web address of Pricr, used in links we hand to other people
// (team invites, approval emails). In a browser that's just the current
// address. Inside the iPhone/Android app the page address is a private
// "capacitor://localhost", which is useless to anyone else, so the live web
// address comes from VITE_APP_URL instead.
import { Capacitor } from '@capacitor/core'

export function appUrl() {
  const fixed = (import.meta.env.VITE_APP_URL || '').trim().replace(/\/+$/, '')
  if (fixed) return fixed
  try {
    if (Capacitor.isNativePlatform()) return ''
  } catch {
    // not running under Capacitor
  }
  return window.location.origin
}
