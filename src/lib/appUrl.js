// The public web address of Pricr, used in links we hand to other people
// (team invites, approval emails).
//
// In a browser this is always the address the page is open on, so it can
// never be mistyped in a setting. Inside the iPhone/Android app the page
// address is a private "capacitor://localhost", which is useless to anyone
// else, so only there does the live web address come from VITE_APP_URL.
import { Capacitor } from '@capacitor/core'

export function appUrl() {
  let native = false
  try {
    native = Capacitor.isNativePlatform()
  } catch {
    // not running under Capacitor
  }
  if (!native) return window.location.origin
  return (import.meta.env.VITE_APP_URL || '').trim().replace(/\/+$/, '')
}
