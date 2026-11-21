import { useMemo, useState } from 'react'
import { ScanSearch, ChevronDown, ChevronUp, Check, Plus, EyeOff, Link2, TrendingDown, TrendingUp, Loader } from 'lucide-react'
import { useFirebase } from '../contexts/FirebaseContext'
import { detectRecurring } from '../lib/recurring'
import { auditBills, applySuggestions, billsAccountFlows, CONFIRMED } from '../lib/billsAudit'
import { saveConfig } from '../lib/txStore'
import { transferPlan, formatMoney, PERIOD_NOUN } from '../lib/finance'
import { FREQUENCY_LABELS } from '../lib/schedule'
import { todayISO, toISODate, addMonths, parseDate, formatDate } from '../lib/dates'

const STATUS = {
  changed: { label: 'Different in the bank', badge: 'badge-warning' },
  stopped: { label: 'Stopped', badge: 'badge-danger' },
  missing: { label: 'Not seen — cancelled?', badge: 'badge-danger' },
  not_seen: { label: 'Not in bank data', badge: 'badge-info' },
  ok: { label: 'Matches', badge: 'badge-success' }
}

/** The bills account: the offset account, or one named like "bills". */
function billsAccountId(accounts) {
  return (accounts.find(a => a.kind === 'offset') || accounts.find(a => /bill/i.test(a.name)))?.id
}

/** "Check against bank data" panel for the Bills tab. Nothing changes until you press a button. */
export default function BillsCheck({ ledger, expenses, setExpenses, categories, people, salaries, settings }) {
  const { budgetId, budgetOwnerId } = useFirebase()
  const [open, setOpen] = useState(false)
  const [showOk, setShowOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const today = todayISO()
  const currency = settings.currency || '$'
  const money = (n, o) => formatMoney(n, currency, o)
  const dateFmt = settings.dateFormat || 'dd/MM/yyyy'

  const series = useMemo(() => detectRecurring(ledger.txns, { today }), [ledger.txns, today])
  const audit = useMemo(() => auditBills({
    expenses, series, today, txns: ledger.txns, accounts: ledger.config.accounts,
    links: ledger.config.billLinks, dismissed: ledger.config.billDismissed
  }), [expenses, series, today, ledger.txns, ledger.config])

  const flows = useMemo(() => {
    const id = billsAccountId(ledger.config.accounts)
    return id ? billsAccountFlows(ledger.txns, id, { from: toISODate(addMonths(parseDate(today), -12)), to: today }) : null
  }, [ledger.txns, ledger.config.accounts, today])

  const plans = useMemo(() => {
    const now = transferPlan({ expenses, people, salaries, settings })
    const fixed = transferPlan({ expenses: applySuggestions(expenses, audit, { categories }), people, salaries, settings })
    return { now, fixed }
  }, [expenses, audit, people, salaries, settings, categories])

  if (ledger.loading || ledger.txns.length === 0) return null

  const groups = { changed: [], stopped: [], missing: [], not_seen: [], ok: [] }
  audit.items.forEach(r => groups[r.status].push(r))
  const toFix = groups.changed.length + audit.newBills.filter(b => b.suggestion.fromBillsAccount).length
  // Likely bills first; stopped ones too (a bill may have moved to a new payee)
  const linkable = series.filter(s => s.isBill || (!s.active && s.count >= 3))

  const run = async (fn) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  const apply = (only, includeNew) => run(() => setExpenses(applySuggestions(expenses, audit, { only, includeNew, categories })))
  const link = (expenseId, key) => run(() => saveConfig(budgetOwnerId, budgetId, { billLinks: { ...ledger.config.billLinks, [expenseId]: key || null } }))
  const dismiss = (key) => run(() => saveConfig(budgetOwnerId, budgetId, { billDismissed: [...new Set([...ledger.config.billDismissed, key])] }))

  const describe = (s) => `${money(s.amount)} ${FREQUENCY_LABELS[s.frequency]?.toLowerCase() || s.frequency}`

  return (
    <div className="card overflow-hidden">
      <button className="w-full flex items-center justify-between gap-3 p-5 text-left" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-50 dark:bg-brand-900/40 rounded-xl"><ScanSearch className="h-5 w-5 text-brand-600" /></div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Check against bank data</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {toFix > 0 ? `${toFix} suggestion${toFix > 1 ? 's' : ''}` : 'Everything matches'} · bank data says bills cost {money(audit.totals.suggestedAnnual + audit.totals.newAnnual, { decimals: 0 })}/yr (budget: {money(audit.totals.budgetAnnual, { decimals: 0 })})
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5">
          {/* What it means for transfers */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Transfers needed</div>
              {people.map(p => {
                const a = plans.now.people[p.id]
                const b = plans.fixed.people[p.id]
                if (!a || !b) return null
                const up = b.perTransfer > a.perTransfer + 0.5
                return (
                  <div key={p.id} className="flex items-center justify-between mt-2 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">{p.name}</span>
                    <span className="tabular-nums">
                      {money(a.perTransfer)} → <strong className={up ? 'text-rose-600' : 'text-emerald-600'}>{money(b.perTransfer)}</strong>
                      <span className="text-slate-400"> /{PERIOD_NOUN[b.frequency] || b.frequency}</span>
                    </span>
                  </div>
                )
              })}
              <p className="text-xs text-slate-400 mt-2">If you accept every suggestion below.</p>
            </div>
            {flows && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Bills account, last 12 months</div>
                <div className="flex items-center gap-2 mt-2 text-sm">
                  {flows.net < 0 ? <TrendingDown className="h-4 w-4 text-rose-600" /> : <TrendingUp className="h-4 w-4 text-emerald-600" />}
                  <span>{money(flows.startBalance ?? 0, { decimals: 0 })} → {money(flows.endBalance ?? 0, { decimals: 0 })}</span>
                  <span className={flows.net < 0 ? 'text-rose-600' : 'text-emerald-600'}>({money(flows.net, { decimals: 0, signed: true })})</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  In {money(flows.moneyIn, { decimals: 0 })} · out {money(flows.moneyOut, { decimals: 0 })}
                  {(flows.outByKind.cc_repayment || flows.outByKind.card_unitemised) ? `, incl. ${money((flows.outByKind.cc_repayment || 0) + (flows.outByKind.card_unitemised || 0), { decimals: 0 })} of credit-card repayments` : ''}
                </p>
                {audit.variableBuffer > 0 && <p className="text-xs text-slate-500 mt-1">Bills that vary can run up to {money(audit.variableBuffer, { decimals: 0 })} over average — worth keeping as a buffer.</p>}
              </div>
            )}
          </div>

          {(groups.changed.length > 0 || audit.newBills.length > 0) && (
            <div className="flex justify-end">
              <button className="btn-primary" disabled={busy} onClick={() => apply(null, true)}>
                {busy ? <Loader className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept all suggestions
              </button>
            </div>
          )}

          {groups.changed.length > 0 && (
            <Section title="Different in the bank">
              {groups.changed.map(r => (
                <Row key={r.expense.id} r={r} money={money} dateFmt={dateFmt}
                  detail={<>Budget {money(r.expense.amount)} {FREQUENCY_LABELS[r.expense.frequency]?.toLowerCase()} → bank <strong>{money(r.suggestion.amount)} {FREQUENCY_LABELS[r.suggestion.frequency]?.toLowerCase()}</strong>{r.series?.priceChange && ` (went up ${formatDate(r.series.priceChange.date, dateFmt)})`}</>}
                  action={<button className="btn-secondary !py-1.5" disabled={busy} onClick={() => apply([r.expense.id], false)}><Check className="h-4 w-4" />Update</button>} />
              ))}
            </Section>
          )}

          {audit.newBills.length > 0 && (
            <Section title="Regular payments not in the budget">
              {audit.newBills.map(b => (
                <div key={b.series.key} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{b.series.merchant}</div>
                    <div className="text-xs text-slate-500">
                      {describe(b.suggestion)} · {b.series.count} payments since {formatDate(b.series.first, dateFmt)} · {money(b.series.annual, { decimals: 0 })} in the last year
                      {!b.suggestion.fromBillsAccount && ' · charged to a loan, not the bills account'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-secondary !py-1.5" disabled={busy} onClick={() => apply([b.series.key], true)}><Plus className="h-4 w-4" />Add</button>
                    <button className="btn-ghost !py-1.5" disabled={busy} onClick={() => dismiss(b.series.key)}><EyeOff className="h-4 w-4" />Not a bill</button>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {[...groups.stopped, ...groups.missing, ...groups.not_seen].length > 0 && (
            <Section title="Not matched to bank data">
              {[...groups.stopped, ...groups.missing, ...groups.not_seen].map(r => (
                <Row key={r.expense.id} r={r} money={money} dateFmt={dateFmt}
                  detail={r.status === 'stopped'
                    ? <>Last paid {formatDate(r.series.last, dateFmt)} to {r.series.merchant}</>
                    : r.status === 'missing' ? 'Set as an automatic payment but nothing like it in the last year' : 'Paid from somewhere not imported, or under another name'}
                  action={
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      <Link2 className="h-3.5 w-3.5" />
                      <select className="input !py-1 !text-xs max-w-[11rem]" value={ledger.config.billLinks[r.expense.id] || ''} disabled={busy}
                        onChange={(e) => link(r.expense.id, e.target.value)}>
                        <option value="">Link to a payee…</option>
                        <option value={CONFIRMED}>✓ Correct as is (paid in cash / elsewhere)</option>
                        {linkable.map(s => <option key={s.key} value={s.key}>{s.merchant} · {describe(s)}{s.active ? '' : ' (stopped)'}</option>)}
                      </select>
                    </label>
                  } />
              ))}
            </Section>
          )}

          {groups.ok.length > 0 && (
            <div>
              <button className="text-sm text-slate-500 flex items-center gap-1" onClick={() => setShowOk(!showOk)}>
                {showOk ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {groups.ok.length} bills match the bank
              </button>
              {showOk && groups.ok.map(r => (
                <Row key={r.expense.id} r={r} money={money} dateFmt={dateFmt}
                  detail={<>{r.confirmed ? 'Marked correct by you' : (r.series ? r.series.merchant : r.lastSeen?.merchant)} · {money(r.expense.amount)} {FREQUENCY_LABELS[r.expense.frequency]?.toLowerCase()}</>}
                  action={r.confirmed ? <button className="btn-ghost !py-1 text-xs" disabled={busy} onClick={() => link(r.expense.id, null)}>Undo</button> : undefined} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h4>
      <div className="divide-y divide-slate-100 dark:divide-slate-700">{children}</div>
    </div>
  )
}

function Row({ r, detail, action }) {
  const s = STATUS[r.status]
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-800 dark:text-slate-100">{r.expense.name}</span>
          <span className={`badge ${s.badge}`}>{s.label}</span>
          {r.linked && <span className="badge badge-brand">linked</span>}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">{detail}</div>
      </div>
      {action}
    </div>
  )
}
