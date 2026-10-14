import { useState } from 'react'
import logoIcon from './assets/logo-icon.png'
import { tr, useLang } from './lib/i18n'
import LangToggle from './LangToggle'

// The "what we use and what we never use" details, shared by the sign-up form
// and the one-time screen existing accounts see.
function ConsentDetails() {
  return (
    <details className="consent-details">
      <summary>{tr('What we use and what we never use')}</summary>
      <ul>
        <li>{tr('We use: the rates and margins you set, which services you quote, quote totals, general area (such as town or ZIP code) and dates.')}</li>
        <li>{tr('We never use or share: customer names, phone numbers, emails or addresses, your photos or your company name.')}</li>
        <li>{tr('Numbers are combined across several businesses and shown as averages and ranges, so no company can be picked out.')}</li>
        <li>{tr('To stop contributing, delete your business data in Settings.')}</li>
      </ul>
    </details>
  )
}

// Intro + details + the checkbox. `checked` / `onChange` are controlled by the
// parent so the sign-up button can stay disabled until it's ticked.
export function ConsentFields({ checked, onChange }) {
  useLang()
  return (
    <div className="consent">
      <h2>{tr('Market insights')}</h2>
      <p>
        {tr('Pricr turns quote data from businesses on Pricr into a weekly market newsletter: average prices, typical margins and snow pricing trends in your area, so everyone can price with confidence.')}
      </p>
      <p>
        {tr('We combine data from many businesses. We never publish your company name, your customers\' names or addresses, or your individual prices.')}
      </p>
      <ConsentDetails />
      <label className="consent-check">
        <input
          type="checkbox"
          required
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          {tr('I agree that Pricr may collect my business\'s prices and quote totals (never customer names or contact details) and combine them into anonymous market reports and a weekly newsletter.')}
        </span>
      </label>
    </div>
  )
}

// Full screen shown once to anyone signed in who hasn't agreed to the current
// version yet (accounts created before this existed, or after a wording bump).
export function ConsentGate({ onAccept, onSignOut }) {
  useLang()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (busy || !checked) return
    setBusy(true)
    setError('')
    try {
      await onAccept()
    } catch (err) {
      setError(err?.message || tr('Something went wrong. Try again.'))
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand">
            <span className="mark">
              <img src={logoIcon} alt="" />
            </span>
            <span className="brand-text">Pricr</span>
          </div>
          <LangToggle />
        </div>
      </header>
      <main className="content">
        <div className="hero consent-hero">
          <h1>{tr('One quick thing before you start')}</h1>
          <form className="auth-form consent-form" onSubmit={submit}>
            <ConsentFields checked={checked} onChange={setChecked} />
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="btn primary auth-submit" disabled={busy || !checked}>
              {busy ? tr('Please wait...') : tr('Agree and continue')}
            </button>
          </form>
          <button type="button" className="link-plain" onClick={onSignOut}>
            {tr('Sign out')}
          </button>
        </div>
      </main>
    </div>
  )
}
