import { useCallback, useEffect, useMemo, useState } from 'react'
import { money } from './pricing'
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
  setMyProfile,
  setQuoteStatus,
} from './lib/teamStore'

const errText = (err, fallback) => err?.message || fallback

const fmtDate = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Saved quotes: every member sees the whole company's quotes. Tap one to
// reopen it, mark it sent / won / lost, or (owner or author) delete it.
// ---------------------------------------------------------------------------

const FILTERS = ['all', ...QUOTE_STATUSES]

export function SavedQuotes({ companyId, isOwner, userId, onOpen }) {
  const [quotes, setQuotes] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      setQuotes(await listQuotes(companyId))
    } catch (err) {
      setError(errText(err, 'Could not load saved quotes.'))
      setQuotes([])
    }
  }, [companyId])

  useEffect(() => {
    load()
  }, [load])

  const changeStatus = async (q, status) => {
    setQuotes((all) => all.map((x) => (x.id === q.id ? { ...x, status } : x)))
    try {
      await setQuoteStatus(q.id, status)
    } catch (err) {
      setError(errText(err, 'Could not update that quote.'))
      load()
    }
  }

  const remove = async (q) => {
    if (!window.confirm(`Delete the quote for ${q.customerName || 'this customer'}?`)) return
    try {
      await deleteQuote(q.id)
      setQuotes((all) => all.filter((x) => x.id !== q.id))
    } catch (err) {
      setError(errText(err, 'Could not delete that quote.'))
    }
  }

  const totals = useMemo(() => {
    const sum = (status) =>
      (quotes ?? []).filter((q) => q.status === status).reduce((s, q) => s + q.total, 0)
    return { sent: sum('sent'), won: sum('won'), lost: sum('lost') }
  }, [quotes])

  const shown = (quotes ?? []).filter(
    (q) =>
      (filter === 'all' || q.status === filter) &&
      (!query.trim() ||
        `${q.customerName} ${q.address} ${q.createdByName}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())),
  )

  return (
    <section className="card">
      <header className="card-head">
        <h2>Saved quotes</h2>
        <p>Every quote your team builds is saved here automatically.</p>
      </header>

      {quotes && quotes.length > 0 && (
        <div className="tq-summary">
          <div>
            <small>Waiting</small>
            <strong>{money(totals.sent)}</strong>
          </div>
          <div>
            <small>Won</small>
            <strong className="won">{money(totals.won)}</strong>
          </div>
          <div>
            <small>Lost</small>
            <strong>{money(totals.lost)}</strong>
          </div>
        </div>
      )}

      <div className="tq-controls">
        <input
          type="text"
          placeholder="Search customer, address or teammate"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="segmented small">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={filter === f ? 'on' : ''}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="banner error">{error}</p>}
      {quotes === null && <p className="tq-empty">Loading…</p>}
      {quotes && quotes.length === 0 && !error && (
        <p className="tq-empty">
          No saved quotes yet. Build one on the New quote tab and it shows up here.
        </p>
      )}
      {quotes && quotes.length > 0 && shown.length === 0 && (
        <p className="tq-empty">Nothing matches that.</p>
      )}

      <ul className="tq-list">
        {shown.map((q) => (
          <li key={q.id} className="tq-item">
            <button type="button" className="tq-main" onClick={() => onOpen(q)}>
              <span className="tq-top">
                <strong>{q.customerName || 'Unnamed customer'}</strong>
                <span className="tq-price">{money(q.total)}</span>
              </span>
              <span className="tq-sub">
                {q.address || 'No address'}
              </span>
              <span className="tq-sub">
                {fmtDate(q.createdAt)}
                {q.createdByName ? ` · ${q.createdByName}` : ''}
              </span>
            </button>
            <div className="tq-actions">
              <select
                value={q.status}
                onChange={(e) => changeStatus(q, e.target.value)}
                className={`tq-status tq-${q.status}`}
                aria-label="Quote status"
              >
                {QUOTE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
              {(isOwner || q.createdBy === userId) && (
                <button type="button" className="tq-link danger" onClick={() => remove(q)}>
                  Delete
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
  const [inviting, setInviting] = useState(false)
  const [freshLink, setFreshLink] = useState(null) // { email, url }
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      setMembers(await listMembers(company.id))
      if (isOwner) setInvites(await listInvites(company.id))
    } catch (err) {
      setError(errText(err, 'Could not load your team.'))
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
      setNotice('Saved.')
      load()
    } catch (err) {
      setError(errText(err, 'Could not save your details.'))
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
      window.prompt('Copy this invite link:', text)
    }
  }

  const sendInvite = async (e) => {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email || inviting) return
    setInviting(true)
    setError('')
    try {
      const inv = await createInvite(company.id, email, inviteName)
      setFreshLink({ email: inv.email, url: inviteLink(inv.token) })
      setInviteEmail('')
      setInviteName('')
      load()
    } catch (err) {
      setError(errText(err, 'Could not create that invite.'))
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
      setError(errText(err, 'Could not cancel that invite.'))
    }
  }

  const remove = async (m) => {
    if (!window.confirm(`Remove ${m.displayName || m.email} from ${company.businessName || 'the team'}?`)) return
    try {
      await removeMember(company.id, m.userId)
      load()
    } catch (err) {
      setError(errText(err, 'Could not remove that person.'))
    }
  }

  return (
    <>
      <section className="card">
        <header className="card-head">
          <h2>Team</h2>
          <p>
            {isOwner
              ? 'Invite estimators to quote under your company. They use your prices and see every saved quote.'
              : `You're on ${company.businessName || 'this company'}'s team. You quote with the company's prices.`}
          </p>
        </header>

        {error && <p className="banner error">{error}</p>}
        {members === null && <p className="tq-empty">Loading…</p>}

        <ul className="team-list">
          {(members ?? []).map((m) => (
            <li key={m.userId} className="team-item">
              <div>
                <strong>{m.displayName || m.email || 'Teammate'}</strong>
                {m.userId === userId && <span className="pill you">You</span>}
                <span className={`pill ${m.role}`}>{m.role === 'owner' ? 'Owner' : 'Estimator'}</span>
                <small>{m.email}</small>
              </div>
              {isOwner && m.role !== 'owner' && (
                <button type="button" className="tq-link danger" onClick={() => remove(m)}>
                  Remove
                </button>
              )}
              {!isOwner && m.userId === userId && (
                <button type="button" className="tq-link danger" onClick={() => remove(m)}>
                  Leave
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <header className="card-head">
          <h2>Your details</h2>
          <p>Shown as "prepared by" on the quotes you send.</p>
        </header>
        <label className="field">
          <span className="label">Your name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Casey Rivera" />
        </label>
        <label className="field">
          <span className="label">Your phone</span>
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
            {savingProfile ? 'Saving…' : 'Save'}
          </button>
          {notice && <span className="team-notice">{notice}</span>}
        </div>
      </section>

      {isOwner && (
        <section className="card">
          <header className="card-head">
            <h2>Invite an estimator</h2>
            <p>
              They sign up with the email you enter here. You'll get a link to text or email
              them. It works once and expires in 14 days.
            </p>
          </header>

          <form onSubmit={sendInvite}>
            <label className="field">
              <span className="label">Name (optional)</span>
              <input
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Casey Rivera"
              />
            </label>
            <label className="field">
              <span className="label">
                Email<em>required</em>
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
            <div className="team-save">
              <button type="submit" className="btn primary" disabled={inviting || !inviteEmail.trim()}>
                {inviting ? 'Creating…' : 'Create invite link'}
              </button>
            </div>
          </form>

          {freshLink && (
            <div className="invite-box">
              <p>
                Send this link to <strong>{freshLink.email}</strong>:
              </p>
              <code>{freshLink.url}</code>
              <button type="button" className="btn ghost small" onClick={() => copy(freshLink.url, 'fresh')}>
                {copied === 'fresh' ? 'Copied' : 'Copy link'}
              </button>
            </div>
          )}

          {invites.length > 0 && (
            <>
              <h3 className="team-sub">Waiting to join</h3>
              <ul className="team-list">
                {invites.map((inv) => (
                  <li key={inv.id} className="team-item">
                    <div>
                      <strong>{inv.displayName || inv.email}</strong>
                      <small>
                        {inv.email} · expires {fmtDate(inv.expiresAt)}
                      </small>
                    </div>
                    <span className="tq-actions">
                      <button
                        type="button"
                        className="tq-link"
                        onClick={() => copy(inviteLink(inv.token), inv.id)}
                      >
                        {copied === inv.id ? 'Copied' : 'Copy link'}
                      </button>
                      <button type="button" className="tq-link danger" onClick={() => revoke(inv)}>
                        Cancel
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
