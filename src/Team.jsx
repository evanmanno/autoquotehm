import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { money } from './pricing'
import { getPlan, SHOW_PLANS } from './lib/plans'
import { getLocale, tr } from './lib/i18n'
import { appStoreLinks } from './lib/appUrl'
import { APP_NAME } from './lib/brand'
import {
  QUOTE_STATUSES,
  createInvite,
  deleteQuote,
  inviteLink,
  listInvites,
  listMembers,
  listQuotes,
  removeMember,
  revokeInvite,
  setMemberRole,
  setMyProfile,
  setQuoteStatus,
} from './lib/teamStore'
import { INVITE_ROLES, roleLabelKey } from './lib/roles'

const errText = (err, fallback) => err?.message || fallback

const fmtDate = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Saved quotes: every member sees the whole company's quotes. Tap one to
// reopen it, mark it sent / won / lost, or (owner or author) delete it.
// ---------------------------------------------------------------------------

const STATUS_LABEL = {
  draft: 'Draft',
  pending: 'Needs approval',
  changes: 'Changes requested',
  approved: 'Approved',
  sent: 'Sent',
  won: 'Won',
  lost: 'Lost',
}

// "Draft" also lists quotes that were sent back for changes.
const FILTERS = ['all', 'pending', 'approved', 'sent', 'won', 'lost', 'draft']
const inFilter = (q, f) =>
  f === 'all' || q.status === f || (f === 'draft' && q.status === 'changes')

// Owners and managers can set any status; an estimator can only move a quote
// along once it has been approved or sent.
const statusOptions = (q, canApprove) => {
  if (canApprove) return QUOTE_STATUSES
  const ok = new Set([q.status])
  if (q.status === 'approved') ok.add('sent')
  if (['sent', 'won', 'lost'].includes(q.status)) ['sent', 'won', 'lost'].forEach((s) => ok.add(s))
  return QUOTE_STATUSES.filter((s) => ok.has(s))
}

export function SavedQuotes({ companyId, isOwner, canApprove = false, userId, onOpen }) {
  const firstLoad = useRef(true)
  const [quotes, setQuotes] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const rows = await listQuotes(companyId)
      setQuotes(rows)
      // Approvers land on what needs them first.
      if (firstLoad.current && canApprove && rows.some((q) => q.status === 'pending')) setFilter('pending')
      firstLoad.current = false
    } catch (err) {
      setError(errText(err, tr('Could not load saved quotes.')))
      setQuotes([])
    }
  }, [companyId, canApprove])

  useEffect(() => {
    load()
  }, [load])

  const changeStatus = async (q, status) => {
    setQuotes((all) => all.map((x) => (x.id === q.id ? { ...x, status } : x)))
    try {
      await setQuoteStatus(q.id, status)
    } catch (err) {
      setError(errText(err, tr('Could not update that quote.')))
      load()
    }
  }

  const remove = async (q) => {
    if (!window.confirm(tr('Delete the quote for {name}?', { name: q.customerName || tr('this customer') }))) return
    try {
      await deleteQuote(q.id)
      setQuotes((all) => all.filter((x) => x.id !== q.id))
    } catch (err) {
      setError(errText(err, tr('Could not delete that quote.')))
    }
  }

  const totals = useMemo(() => {
    const sum = (status) =>
      (quotes ?? []).filter((q) => q.status === status).reduce((s, q) => s + q.total, 0)
    return { sent: sum('sent'), won: sum('won'), lost: sum('lost') }
  }, [quotes])

  const pendingCount = (quotes ?? []).filter((q) => q.status === 'pending').length

  const shown = (quotes ?? []).filter(
    (q) =>
      inFilter(q, filter) &&
      (!query.trim() ||
        `${q.customerName} ${q.address} ${q.createdByName}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())),
  )
  // Approvers see what is waiting on them first.
  if (canApprove) shown.sort((a, b) => (b.status === 'pending') - (a.status === 'pending'))

  return (
    <section className="card">
      <header className="card-head">
        <h2>{tr("Saved quotes")}</h2>
        <p>{tr("Every quote your team builds is saved here automatically.")}</p>
      </header>

      {quotes && quotes.length > 0 && (
        <div className="tq-summary">
          <div>
            <small>{tr("Waiting")}</small>
            <strong>{money(totals.sent)}</strong>
          </div>
          <div>
            <small>{tr("Won")}</small>
            <strong className="won">{money(totals.won)}</strong>
          </div>
          <div>
            <small>{tr("Lost")}</small>
            <strong>{money(totals.lost)}</strong>
          </div>
        </div>
      )}

      <div className="tq-controls">
        <input
          type="text"
          placeholder={tr("Search customer, address or teammate")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="segmented small wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={filter === f ? 'on' : ''}
              onClick={() => setFilter(f)}
            >
              {tr(f === 'all' ? 'All' : STATUS_LABEL[f])}
              {f === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="banner error">{error}</p>}
      {quotes === null && <p className="tq-empty">{tr("Loading…")}</p>}
      {quotes && quotes.length === 0 && !error && (
        <p className="tq-empty">
          {tr("No saved quotes yet. Build one on the New quote tab and it shows up here.")}
        </p>
      )}
      {quotes && quotes.length > 0 && shown.length === 0 && (
        <p className="tq-empty">{tr("Nothing matches that.")}</p>
      )}

      <ul className="tq-list">
        {shown.map((q) => (
          <li key={q.id} className="tq-item">
            <button type="button" className="tq-main" onClick={() => onOpen(q)}>
              <span className="tq-top">
                <strong>{q.customerName || tr('Unnamed customer')}</strong>
                <span className="tq-price">{money(q.total)}</span>
              </span>
              <span className="tq-sub">
                {q.address || tr('No address')}
              </span>
              <span className="tq-sub">
                {fmtDate(q.createdAt)}
                {q.createdByName ? ` · ${q.createdByName}` : ''}
              </span>
              {q.status === 'pending' && canApprove && (
                <span className="tq-flag">{tr('Tap to review and approve')}</span>
              )}
              {q.status === 'changes' && q.reviewNote && (
                <span className="tq-flag warn">
                  {q.reviewedByName ? `${q.reviewedByName}: ` : ''}
                  {q.reviewNote}
                </span>
              )}
            </button>
            <div className="tq-actions">
              <select
                value={q.status}
                onChange={(e) => changeStatus(q, e.target.value)}
                className={`tq-status tq-${q.status}`}
                aria-label={tr("Quote status")}
              >
                {statusOptions(q, canApprove).map((s) => (
                  <option key={s} value={s}>
                    {tr(STATUS_LABEL[s])}
                  </option>
                ))}
              </select>
              {(isOwner || q.createdBy === userId) && (
                <button type="button" className="tq-link danger" onClick={() => remove(q)}>
                  {tr("Delete")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Team: owner invites teammates and removes them; everyone can see the team
// and edit their own "prepared by" name and phone.
// ---------------------------------------------------------------------------

export function Team({ company, isOwner, me, userId, onProfileSaved }) {
  const [members, setMembers] = useState(null)
  const [invites, setInvites] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [name, setName] = useState(me?.displayName ?? '')
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [savingProfile, setSavingProfile] = useState(false)

  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('estimator')
  const [inviting, setInviting] = useState(false)
  const [freshLink, setFreshLink] = useState(null) // { email, url }
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      setMembers(await listMembers(company.id))
      if (isOwner) setInvites(await listInvites(company.id))
    } catch (err) {
      setError(errText(err, tr('Could not load your team.')))
      setMembers([])
    }
  }, [company.id, isOwner])

  useEffect(() => {
    load()
  }, [load])

  const saveProfile = async () => {
    setSavingProfile(true)
    setNotice('')
    try {
      await setMyProfile(name.trim(), phone.trim())
      onProfileSaved?.({ displayName: name.trim(), phone: phone.trim() })
      setNotice(tr('Saved.'))
      load()
    } catch (err) {
      setError(errText(err, tr('Could not save your details.')))
    } finally {
      setSavingProfile(false)
    }
  }

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(''), 1800)
    } catch {
      window.prompt(tr('Copy this invite link:'), text)
    }
  }

  // Opens the phone's share sheet (text, email, etc.) when available.
  const shareInvite = async (url, email) => {
    const text = url
      ? tr('Join {team} on Pricr. Sign up with {email} using this link: {url}', {
          team: company.businessName || tr('our team'),
          email,
          url,
        })
      : `Join ${company.businessName || tr('our team')} on ${APP_NAME}. Download the app and sign up with this email: ${email}`
    const { ios, android } = appStoreLinks()
    const appLines = []
    if (ios) appLines.push(`iPhone: ${ios}`)
    if (android) appLines.push(`Android: ${android}`)
    const fullText = appLines.length
      ? `${text}\n\n${tr('Get the Pricr app:')}\n${appLines.join('\n')}`
      : text
    if (navigator.share) {
      try {
        await navigator.share({ title: tr('Team invite'), text: fullText })
        return
      } catch (err) {
        if (err?.name === 'AbortError') return
      }
    }
    copy(appLines.length ? fullText : url || text, 'fresh')
  }

  const sendInvite = async (e) => {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email || inviting) return
    const plan = getPlan(company.plan)
    // While plans are hidden (pilot), nobody is held to the estimator cap.
    if (SHOW_PLANS && (members?.length ?? 0) + invites.length >= plan.estimators) {
      setError(
        tr('Your {plan} plan includes {n} estimator logins. Upgrade your plan to add more people.', {
          plan: tr(plan.name),
          n: plan.estimators,
        }),
      )
      return
    }
    setInviting(true)
    setError('')
    try {
      const inv = await createInvite(company.id, email, inviteName, inviteRole)
      setFreshLink({ email: inv.email, url: inviteLink(inv.token) })
      setInviteEmail('')
      setInviteName('')
      load()
    } catch (err) {
      setError(errText(err, tr('Could not create that invite.')))
    } finally {
      setInviting(false)
    }
  }

  const revoke = async (inv) => {
    try {
      await revokeInvite(inv.id)
      if (freshLink?.email === inv.email) setFreshLink(null)
      load()
    } catch (err) {
      setError(errText(err, tr('Could not cancel that invite.')))
    }
  }

  const changeRole = async (m, role) => {
    setMembers((all) => all.map((x) => (x.userId === m.userId ? { ...x, role } : x)))
    try {
      await setMemberRole(company.id, m.userId, role)
    } catch (err) {
      setError(errText(err, tr('Could not change that role.')))
      load()
    }
  }

  const remove = async (m) => {
    if (!window.confirm(tr('Remove {who} from {team}?', { who: m.displayName || m.email, team: company.businessName || tr('the team') }))) return
    try {
      await removeMember(company.id, m.userId)
      load()
    } catch (err) {
      setError(errText(err, tr('Could not remove that person.')))
    }
  }

  return (
    <>
      <section className="card">
        <header className="card-head">
          <h2>{tr("Team")}</h2>
          <p>
            {isOwner
              ? tr('Invite estimators to quote under your company. They use your prices and see every saved quote.')
              : tr("You're on {name}'s team. You quote with the company's prices.", { name: company.businessName || tr('this company') })}
          </p>
        </header>

        {error && <p className="banner error">{error}</p>}
        {members === null && <p className="tq-empty">{tr("Loading…")}</p>}

        <ul className="team-list">
          {(members ?? []).map((m) => (
            <li key={m.userId} className="team-item">
              <div>
                <strong>{m.displayName || m.email || tr('Teammate')}</strong>
                {m.userId === userId && <span className="pill you">{tr("You")}</span>}
                <span className={`pill ${m.role}`}>{tr(roleLabelKey(m.role))}</span>
                <small>{m.email}</small>
              </div>
              {isOwner && m.role !== 'owner' && (
                <span className="tq-actions team-actions">
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m, e.target.value)}
                    className="tq-status"
                    aria-label={tr('Role')}
                  >
                    {INVITE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {tr(roleLabelKey(r))}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="tq-link danger" onClick={() => remove(m)}>
                    {tr("Remove")}
                  </button>
                </span>
              )}
              {!isOwner && m.userId === userId && (
                <button type="button" className="tq-link danger" onClick={() => remove(m)}>
                  {tr("Leave")}
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="subgroup-hint team-roles-hint">
          {tr('Owner and Managers can approve quotes and send them. Estimators send their quotes for approval first.')}
        </p>
      </section>

      <section className="card">
        <header className="card-head">
          <h2>{tr("Your details")}</h2>
          <p>{tr("Shown as \"prepared by\" on the quotes you send.")}</p>
        </header>
        <label className="field">
          <span className="label">{tr("Your name")}</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Casey Rivera" />
        </label>
        <label className="field">
          <span className="label">{tr("Your phone")}</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            type="tel"
            inputMode="tel"
          />
        </label>
        <div className="team-save">
          <button type="button" className="btn primary" onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? tr('Saving…') : tr('Save')}
          </button>
          {notice && <span className="team-notice">{notice}</span>}
        </div>
      </section>

      {isOwner && (
        <section className="card">
          <header className="card-head">
            <h2>{tr('Invite a teammate')}</h2>
            <p>
              {tr("They sign up with the email you enter here. You'll get a link to text or email them. It works once and expires in 14 days.")}
            </p>
          </header>

          <form onSubmit={sendInvite}>
            <label className="field">
              <span className="label">{tr("Name (optional)")}</span>
              <input
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Casey Rivera"
              />
            </label>
            <label className="field">
              <span className="label">
                {tr('Email')}<em>{tr("required")}</em>
              </span>
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="casey@yourcompany.com"
                type="email"
                inputMode="email"
                autoCapitalize="none"
              />
            </label>
            <label className="field">
              <span className="label">{tr('Role')}</span>
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="unit-select">
                {INVITE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {tr(roleLabelKey(r))}
                  </option>
                ))}
              </select>
              <small className="field-hint">
                {inviteRole === 'manager'
                  ? tr('Can approve quotes and send them without approval.')
                  : tr('Builds quotes and sends them for approval.')}
              </small>
            </label>
            <div className="team-save">
              <button type="submit" className="btn primary" disabled={inviting || !inviteEmail.trim()}>
                {inviting ? tr('Creating…') : tr('Create invite link')}
              </button>
            </div>
          </form>

          {freshLink && (
            <div className="invite-box">
              <p>
                {tr('Send this link to')} <strong>{freshLink.email}</strong>:
              </p>
              {freshLink.url && <code>{freshLink.url}</code>}
              <button type="button" className="btn primary small" onClick={() => shareInvite(freshLink.url, freshLink.email)}>
                {tr('Text or email this link')}
              </button>{' '}
              <button type="button" className="btn ghost small" onClick={() => copy(freshLink.url, 'fresh')}>
                {copied === 'fresh' ? tr('Copied') : tr('Copy link')}
              </button>
              {(appStoreLinks().ios || appStoreLinks().android) && (
                <p className="subgroup-hint">
                  {tr('The message also includes links to download the app.')}
                </p>
              )}
              <p className="subgroup-hint">
                {tr('They must sign up with exactly this email. After they join, they quote with your prices.')}
              </p>
            </div>
          )}

          {invites.length > 0 && (
            <>
              <h3 className="team-sub">{tr("Waiting to join")}</h3>
              <ul className="team-list">
                {invites.map((inv) => (
                  <li key={inv.id} className="team-item">
                    <div>
                      <strong>{inv.displayName || inv.email}</strong>
                      <span className={`pill ${inv.role}`}>{tr(roleLabelKey(inv.role))}</span>
                      <small>
                        {inv.email} · {tr('expires')} {fmtDate(inv.expiresAt)}
                      </small>
                    </div>
                    <span className="tq-actions">
                      <button
                        type="button"
                        className="tq-link"
                        onClick={() => copy(inviteLink(inv.token), inv.id)}
                      >
                        {copied === inv.id ? tr('Copied') : tr('Copy link')}
                      </button>
                      <button type="button" className="tq-link danger" onClick={() => revoke(inv)}>
                        {tr("Cancel")}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  )
}
