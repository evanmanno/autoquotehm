// Renames the app everywhere it's shown. Usage (from the project folder):
//   node scripts/rename-app.mjs "NewName"
//   node scripts/rename-app.mjs "NewName" hello@newname.com
// Then run `bash ship.sh` and press Run in Xcode.
//
// Leaves the iPhone bundle ID (com.pricr.app) alone on purpose: customers never
// see it, and changing it after the App Store listing exists makes a new app.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const [newName, newEmail] = process.argv.slice(2)
if (!newName || !newName.trim()) {
  console.error('Usage: node scripts/rename-app.mjs "NewName" [support-email]')
  process.exit(1)
}
const name = newName.trim()

const brandPath = 'src/lib/brand.js'
const brand = readFileSync(brandPath, 'utf8')
const oldName = /export const APP_NAME = '([^']*)'/.exec(brand)[1]
const oldEmail = /export const SUPPORT_EMAIL = '([^']*)'/.exec(brand)[1]
const email = (newEmail || oldEmail).trim()

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const swap = (text) => {
  let t = text.replace(new RegExp(esc(oldName), 'g'), name)
  if (email !== oldEmail) t = t.replace(new RegExp(esc(oldEmail), 'g'), email)
  return t
}

const changed = []
const edit = (path, fn) => {
  if (!existsSync(path)) return
  const before = readFileSync(path, 'utf8')
  const after = fn(before)
  if (after !== before) {
    writeFileSync(path, after)
    changed.push(path)
  }
}

edit(brandPath, (t) =>
  t
    .replace(/export const APP_NAME = '[^']*'/, `export const APP_NAME = '${name.replace(/'/g, "\\'")}'`)
    .replace(/export const SUPPORT_EMAIL = '[^']*'/, `export const SUPPORT_EMAIL = '${email}'`),
)
for (const p of [
  'index.html',
  'public/manifest.webmanifest',
  'public/privacy.html',
  'public/terms.html',
  'public/support.html',
  'capacitor.config.json',
  'ios/App/App/Info.plist',
  'src/lib/plans.js',
]) {
  edit(p, swap)
}
edit('android/app/src/main/res/values/strings.xml', (t) =>
  t
    .replace(/(<string name="app_name">)[^<]*(<\/string>)/, `$1${name}$2`)
    .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, `$1${name}$2`),
)

console.log(`Renamed "${oldName}" -> "${name}"${email !== oldEmail ? `, support email -> ${email}` : ''}`)
console.log(changed.length ? `Updated:\n  ${changed.join('\n  ')}` : 'Nothing to change.')
console.log('\nNext: bash ship.sh, then press Run in Xcode.')
