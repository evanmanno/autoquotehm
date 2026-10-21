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

// Where people download the app. Both come from build settings so they can be
// filled in the moment each store listing is live; an empty one is simply not
// offered. Set in .env.local and in Vercel:
//   VITE_IOS_APP_URL      e.g. https://apps.apple.com/app/id1234567890
//   VITE_ANDROID_APP_URL  e.g. https://play.google.com/store/apps/details?id=com.pricr.app
export function appStoreLinks() {
  const clean = (v) => (v || '').trim()
  return {
    ios: clean(import.meta.env.VITE_IOS_APP_URL),
    android: clean(import.meta.env.VITE_ANDROID_APP_URL),
  }
}

// Which phone the page is open on, so we can lead with the right store.
export function devicePlatform() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || ''
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  // iPadOS reports itself as a Mac with a touch screen.
  if (/macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) return 'ios'
  return 'desktop'
}

// Public pages (privacy, terms, support) live on the web app. Used for links
// from inside the app, so they always open the live site.
export function pageUrl(page) {
  const base = appUrl() || 'https://autoquotehm.vercel.app'
  return `${base}/${page}`
}

// Opens a public page: a new tab on the web, Safari/Chrome inside the phone app.
export function openPage(page) {
  window.open(pageUrl(page), '_blank', 'noopener')
}
