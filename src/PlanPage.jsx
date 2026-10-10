import { useEffect, useState } from 'react'
import { ENTERPRISE_EMAIL, PLANS, getPlan, nextReset } from './lib/plans'
import { listMembers } from './lib/teamStore'
import { getLang, tr, useLang } from './lib/i18n'

const money = (n) => `$${n.toLocaleString('en-US')}`

// Settings > Manage plan: current plan + this month's usage, and the three
// self-serve plans with upgrade/switch buttons. Only the owner can change plans.
export default function PlanPage({ company, used, isOwner, onChangePlan }) {
  useLang()
  const current = getPlan(company.plan)
  const [members, setMembers] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    listMembers(company.id)
      .then((m) => live && setMembers(m.length))
      .catch(() => live && setMembers(null))
    return () => {
      live = false
    }
  }, [company.id])

  const usedCount = used ?? 0
  const pct = Math.min(100, Math.round((usedCount / current.quotes) * 100))
  const level = pct >= 100 ? 'full' : pct >= 80 ? 'high' : ''
  const reset = nextReset().toLocaleDateString(getLang() === 'es' ? 'es-US' : 'en-US', {
    month: 'long',
    day: 'numeric',
  })

  const blocker = (p) => {
    if (used != null && usedCount > p.quotes)
      return tr('You have already used {n} quotes this month.', { n: usedCount })
    if (members != null && members > p.estimators)
      return tr('You have {n} people on your team. This plan allows {max}.', {
        n: members,
        max: p.estimators,
      })
    return ''
  }

  const confirm = async (p) => {
    setBusy(true)
    setError('')
    try {
      await onChangePlan(p.id)
      setConfirming(null)
    } catch (err) {
      console.error('Plan change failed:', err)
      setError(tr('Could not change your plan. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="plan-page">
      <section className="plan-usage">
        <div className="plan-usage-top">
          <span className="plan-usage-name">
            {tr('Current plan')}: <strong>{tr(current.name)}</strong>
          </span>
          <span className="plan-usage-price">
            {money(current.price)}
            {tr('/month')}
          </span>
        </div>
        <div className={`plan-meter ${level}`} aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="plan-usage-text">
          {tr('{used} of {max} quotes used this month', { used: usedCount, max: current.quotes })}
          {' · '}
          {tr('Resets {date}', { date: reset })}
        </p>
        {level === 'full' && (
          <p className="banner warn">
            {tr("You've used every quote on your plan this month. Upgrade to keep quoting.")}
          </p>
        )}
      </section>

      {!isOwner && <p className="subgroup-hint">{tr('Only the owner can change the plan.')}</p>}
      {error && <p className="auth-error">{error}</p>}

      <div className="plan-cards">
        {PLANS.map((p) => {
          const isCurrent = p.id === current.id
          const isUp = p.price > current.price
          const why = !isCurrent && !isUp ? blocker(p) : ''
          return (
            <section key={p.id} className={`plan-card ${isCurrent ? 'current' : ''}`}>
              <header>
                <h3>{tr(p.name)}</h3>
                {p.popular && <span className="plan-tag">{tr('Most popular')}</span>}
                {isCurrent && <span className="plan-tag on">{tr('Current')}</span>}
              </header>
              <p className="plan-price">
                {money(p.price)}
                <small>{tr('/month')}</small>
              </p>
              <ul>
                <li>{tr('Up to {n} quotes a month', { n: p.quotes })}</li>
                <li>
                  {p.estimators === 1
                    ? tr('1 estimator login')
                    : tr('{n} estimator logins', { n: p.estimators })}
                </li>
                <li>{tr('Your own pricing, branded PDFs, photos and snow quoting')}</li>
              </ul>
              {isOwner && !isCurrent && confirming !== p.id && (
                <>
                  <button
                    type="button"
                    className={`btn ${isUp ? 'primary' : 'ghost'}`}
                    disabled={Boolean(why)}
                    onClick={() => setConfirming(p.id)}
                  >
                    {isUp ? tr('Upgrade to {plan}', { plan: tr(p.name) }) : tr('Switch to {plan}', { plan: tr(p.name) })}
                  </button>
                  {why && <p className="plan-why">{why}</p>}
                </>
              )}
              {isOwner && confirming === p.id && (
                <div className="s-confirm">
                  <p>
                    {tr('Switch to {plan} for {price} a month?', {
                      plan: tr(p.name),
                      price: money(p.price),
                    })}{' '}
                    {tr('Billing is not connected yet, so nothing is charged and the change applies right away.')}
                  </p>
                  <div className="s-confirm-row">
                    <button type="button" className="btn ghost" onClick={() => setConfirming(null)} disabled={busy}>
                      {tr('Cancel')}
                    </button>
                    <button type="button" className="btn primary" onClick={() => confirm(p)} disabled={busy}>
                      {busy ? tr('Saving...') : tr('Confirm')}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>

      <section className="plan-card enterprise">
        <h3>{tr('Enterprise')}</h3>
        <p className="subgroup-hint">
          {tr('More than 500 quotes a month, more than 10 estimators, or several locations.')}
        </p>
        <a
          className="btn ghost"
          href={`mailto:${ENTERPRISE_EMAIL}?subject=${encodeURIComponent('Pricr Enterprise')}`}
        >
          {tr('Contact us')}
        </a>
      </section>
    </div>
  )
}
