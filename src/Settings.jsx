import { useState } from 'react'
import './settings.css'
import { getTheme, setTheme } from './lib/theme'
import LangToggle from './LangToggle'
import { tr } from './lib/i18n'
import { APP_NAME, SUPPORT_EMAIL } from './lib/brand'
import { openPage } from './lib/appUrl'
import { SHOW_PLANS } from './lib/plans'
import { changePassword } from './lib/auth'

// Small stroke icons (24x24 grid) so the settings list reads like an app.
const ICONS = {
  user: 'M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  building: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  truck: 'M1 6h13v10H1zM14 9h4l4 4v3h-8zM5.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  card: 'M2 5h20v14H2zM2 10h20',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  cube: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  doc: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h8',
  percent: 'M19 5 5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  chevron: 'M9 6l6 6-6 6',
}

function Icon({ name }) {
  return (
    <svg
      className="s-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  )
}

function Row({ icon, title, sub, onClick, danger, disabled, badge }) {
  return (
    <button
      type="button"
      className={`s-row ${danger ? 'danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="s-row-icon">
        <Icon name={icon} />
      </span>
      <span className="s-row-text">
        <strong>{title}</strong>
        {sub && <small>{sub}</small>}
      </span>
      {badge ? <span className="s-badge">{badge}</span> : null}
      {!disabled && !danger && (
        <span className="s-chev">
          <Icon name="chevron" />
        </span>
      )}
    </button>
  )
}

function Group({ title, children }) {
  return (
    <section className="s-group">
      {title && <h3>{title}</h3>}
      <div className="s-list">{children}</div>
    </section>
  )
}

// The Settings tab: one place for the business, pricing, team and account.
// Owners see everything; estimators only see their own profile, the team and
// sign-out. `onEdit(step)` opens the business editor on a given step.
export function SettingsHub({
  company,
  me,
  isOwner,
  email,
  memberCount,
  onEdit,
  onOpenTeam,
  onOpenGeneral,
}) {
  const name = me?.displayName || company.crewMemberName || email || tr('You')
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  const materialCount = (company.materials ?? []).length
  const equipmentCount = (company.equipment ?? []).length
  const marginPct = Math.round((company.defaultMargin ?? 0.5) * 100)
  const customMaterialCount = (company.customMaterials ?? []).length
  const employeeCount = (company.employees ?? []).length

  return (
    <div className="settings">
      <div className="s-profile">
        <span className="s-avatar" aria-hidden="true">
          {initial}
        </span>
        <div className="s-profile-text">
          <strong>{name}</strong>
          <small>{company.businessName || tr('Your business')}</small>
          <span className={`pill ${isOwner ? 'owner' : ''}`} style={{ marginLeft: 0 }}>
            {isOwner ? tr('Owner') : tr('Estimator')}
          </span>
        </div>
      </div>

      {isOwner && (
        <Group title={tr("Business settings")}>
          <Row
            icon="building"
            title={tr("Business profile & branding")}
            sub={company.businessName || tr('Name, contact info, logo, brand color')}
            onClick={() => onEdit(2)}
          />
          <Row
            icon="list"
            title={tr("Services you offer")}
            sub={tr(materialCount === 1 ? '{n} service · type in everything you do' : '{n} services · type in everything you do', { n: materialCount })}
            onClick={() => onEdit(3)}
          />
          <Row
            icon="tag"
            title={tr("Service pricing")}
            sub={tr("Rates, units and notes for each service")}
            onClick={() => onEdit(4)}
          />
          <Row
            icon="cube"
            title={tr("Materials")}
            sub={tr(customMaterialCount === 1 ? '{n} material · what each one costs you' : '{n} materials · what each one costs you', { n: customMaterialCount })}
            onClick={() => onEdit(5)}
          />
          <Row
            icon="truck"
            title={tr("Equipment")}
            sub={tr(equipmentCount === 1 ? '{n} item · day rates' : '{n} items · day rates', { n: equipmentCount })}
            onClick={() => onEdit(6)}
          />
          <Row
            icon="sliders"
            title={tr("Rates, margins & employees")}
            sub={
              tr('Target margin {pct}%', { pct: marginPct }) +
              ' · ' +
              tr(employeeCount === 1 ? '{n} employee' : '{n} employees', { n: employeeCount }) +
              (company.salesTaxRate ? tr(' · {rate}% sales tax', { rate: company.salesTaxRate }) : '')
            }
            onClick={() => onEdit(7)}
          />
          <Row
            icon="doc"
            title={tr("Terms & payment")}
            sub={company.terms ? tr('Custom terms on every quote') : tr('Payment terms and conditions on every quote')}
            onClick={() => onEdit(8)}
          />
        </Group>
      )}

      <Group title={tr("Team settings")}>
        <Row
          icon="users"
          title={isOwner ? tr('Team & invites') : tr('Your team')}
          sub={
            isOwner
              ? tr('Invite estimators by email, remove people')
              : tr('See who is on your team and update your name')
          }
          onClick={onOpenTeam}
        />
      </Group>

      <Group title={tr("Account")}>
        <Row
          icon="user"
          title={tr("General settings")}
          sub={tr("Password, language, appearance and sign out")}
          onClick={onOpenGeneral}
        />
      </Group>

      <p className="saved-note">{APP_NAME}</p>
    </div>
  )
}

// Change-password form: the current password is asked for, then the new one twice.
function ChangePassword({ email }) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const reset = () => {
    setCurrent('')
    setNext('')
    setAgain('')
    setError('')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setError('')
    if (next.length < 6) return setError(tr('Use at least 6 characters.'))
    if (next !== again) return setError(tr("The new passwords don't match."))
    if (next === current) return setError(tr('Pick a different password than your current one.'))
    setBusy(true)
    try {
      await changePassword(email, current, next)
      reset()
      setOpen(false)
      setDone(true)
    } catch (err) {
      setError(
        err?.code === 'wrong-current'
          ? tr("The current password isn't right.")
          : err?.message || tr('Something went wrong. Try again.'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <>
        <Row
          icon="lock"
          title={tr('Change password')}
          sub={done ? tr('Password updated.') : tr('Choose a new password for this account')}
          onClick={() => {
            setDone(false)
            setOpen(true)
          }}
        />
      </>
    )
  }

  return (
    <form className="s-password" onSubmit={submit}>
      <label className="field">
        <span className="label">{tr('Current password')}</span>
        <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">{tr('New password')}</span>
        <input type="password" required minLength={6} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder={tr('At least 6 characters')} />
      </label>
      <label className="field">
        <span className="label">{tr('Confirm new password')}</span>
        <input type="password" required minLength={6} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      </label>
      {error && <p className="auth-error">{error}</p>}
      <div className="s-confirm-row">
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            reset()
            setOpen(false)
          }}
        >
          {tr('Cancel')}
        </button>
        <button type="submit" className="btn primary" disabled={busy || !current || !next || !again}>
          {busy ? tr('Please wait...') : tr('Update password')}
        </button>
      </div>
    </form>
  )
}

// General settings: the account itself (password, sign out, delete), how the
// app looks and which language it speaks, plus the owner's own name and plan.
export function GeneralSettings({ isOwner, email, plan, used, onEdit, onOpenPlan, onSignOut, onDeleteAccount }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const deleteWord = tr('DELETE')
  const deleteReady = deleteText.trim().toUpperCase() === deleteWord.toUpperCase()
  const runDelete = async () => {
    if (deleting || !deleteReady) return
    setDeleting(true)
    setDeleteError('')
    try {
      await onDeleteAccount()
    } catch (err) {
      console.error('Account delete failed:', err)
      setDeleteError(tr("Couldn't delete your account. Check your connection and try again, or contact support."))
      setDeleting(false)
    }
  }
  const [theme, setThemeState] = useState(getTheme)

  return (
    <div className="settings">
      <Group title={tr("Account")}>
        <div className="s-account">
          <small>{tr('Signed in as {email}', { email })}</small>
        </div>
        <ChangePassword email={email} />
      </Group>

      <Group title={tr("Appearance")}>
        <div className="s-theme" role="radiogroup" aria-label={tr("Theme")}>
          {[
            ['dark', tr('Dark')],
            ['light', tr('Light')],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={theme === id}
              className={`s-theme-opt ${theme === id ? 'on' : ''}`}
              onClick={() => setThemeState(setTheme(id))}
            >
              <span className={`s-theme-swatch ${id}`} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </Group>

      <Group title={tr("Language")}>
        <div className="s-lang">
          <LangToggle />
          <p className="s-lang-hint">{tr("Quotes and PDFs your customers receive stay in English.")}</p>
          <p className="s-lang-hint">{tr("Translations are new. If something reads wrong, tell us and we'll fix it.")}</p>
        </div>
      </Group>

      <Group title={tr("General settings")}>
        {isOwner && (
          <Row
            icon="user"
            title={tr("My name & phone")}
            sub={tr("Shown as 'prepared by' on your quotes")}
            onClick={() => onEdit(1)}
          />
        )}
        {isOwner && plan && SHOW_PLANS && (
          <Row
            icon="card"
            title={tr('Manage plan')}
            sub={
              used != null
                ? tr('{plan} · {used} of {max} quotes used this month', {
                    plan: tr(plan.name),
                    used,
                    max: plan.quotes,
                  })
                : tr(plan.name)
            }
            onClick={onOpenPlan}
          />
        )}
        <Row
          icon="logout"
          title={tr("Sign out")}
          sub={email ? tr('Signed in as {email}', { email }) : undefined}
          onClick={onSignOut}
        />
      </Group>

      <Group title={tr("Help & legal")}>
        <Row icon="help" title={tr("Support")} sub={SUPPORT_EMAIL} onClick={() => openPage('support')} />
        <Row icon="lock" title={tr("Privacy policy")} onClick={() => openPage('privacy')} />
        <Row icon="doc" title={tr("Terms of service")} onClick={() => openPage('terms')} />
      </Group>

      <Group title={tr("Danger zone")}>
        {!confirmDelete ? (
          <Row
            icon="trash"
            title={tr("Delete my account")}
            sub={tr("Permanently delete your login and data")}
            danger
            onClick={() => setConfirmDelete(true)}
          />
        ) : (
          <div className="s-confirm">
            <p>
              {isOwner
                ? tr("This permanently deletes your login and your whole business from Pricr: services, rates, quotes and your team's access. It can't be undone.")
                : tr("This permanently deletes your login and removes you from your team. Quotes you made stay with the business. It can't be undone.")}
            </p>
            <label className="s-delete-type">
              <span>{tr('Type {word} to confirm', { word: deleteWord })}</span>
              <input
                type="text"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
              />
            </label>
            {deleteError && <p className="s-delete-error">{deleteError}</p>}
            <div className="s-confirm-row">
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setConfirmDelete(false)
                  setDeleteText('')
                  setDeleteError('')
                }}
              >
                {tr("Cancel")}
              </button>
              <button type="button" className="btn danger" disabled={deleting || !deleteReady} onClick={runDelete}>
                {deleting ? tr('Deleting…') : tr('Delete my account')}
              </button>
            </div>
          </div>
        )}
      </Group>

    </div>
  )
}

// Wraps a sub-page (like Team) with a back link to the Settings list.
export function SettingsPage({ title, onBack, children }) {
  return (
    <div className="settings">
      <button type="button" className="s-back" onClick={onBack}>
        <span className="s-back-chev">
          <Icon name="chevron" />
        </span>
        {tr("Settings")}
      </button>
      <h2 className="s-title">{title}</h2>
      {children}
    </div>
  )
}
