import { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { CalendarClock, Plus, Trash2, AlertTriangle, Pencil } from 'lucide-react'
import { buildScenario } from '../../lib/wealth'
import { project, EVENT_TYPES } from '../../lib/projection'
import { itemisedSince } from '../../lib/spending'
import { formatMoney } from '../../lib/finance'
import { todayISO, parseDate } from '../../lib/dates'

const monthName = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
const PLAN = '#2a78d6'
const BASE = '#94a3b8'

/** Assumptions, planned events, and the projection they produce. */
export default function PlanSection({ ledger, budget, wealth, assumptions, people, salaries, settings, saveWealth, savePlans }) {
  const today = todayISO()
  const currency = settings?.currency || '$'
  const money = (n, o = { decimals: 0 }) => formatMoney(n, currency, o)
  const plans = useMemo(() => budget?.plans || [], [budget?.plans])
  const [editing, setEditing] = useState(null) // event being added/edited

  // Base income/spending on the months since card spending was itemised (3–12)
  const window = useMemo(() => {
    const since = itemisedSince(ledger.txns, { today })
    if (!since) return 12
    const now = parseDate(today)
    return Math.max(3, Math.min(12, (now.getFullYear() - Number(since.slice(0, 4))) * 12 + now.getMonth() - (Number(since.slice(5)) - 1)))
  }, [ledger.txns, today])

  const scenario = useMemo(() => buildScenario({
    txns: ledger.txns, accounts: ledger.config.accounts, wealth, plans, budget: { people, salaries }, today, window
  }), [ledger.txns, ledger.config.accounts, wealth, plans, people, salaries, today, window])
  const withPlans = useMemo(() => project(scenario, { months: 480 }), [scenario])
  const baseline = useMemo(() => project({ ...scenario, events: [] }, { months: 480 }), [scenario])

  const near = withPlans.months.slice(0, 36).map((m, i) => ({ month: m.month, plan: m.cash, base: baseline.months[i].cash }))
  const hasPlans = plans.some(p => p.enabled !== false)
  const setAssumption = (k, v) => saveWealth({ ...wealth, assumptions: { ...(wealth.assumptions || {}), [k]: v } })
  const pct = (v) => (v == null ? '' : Math.round(v * 1000) / 10)
  const done = (r) => (Number.isFinite(r.debtFree) ? monthName(r.months[r.debtFree - 1].month) : null)
  const mortgageFree = (r) => {
    const dates = Object.values(r.payoffDates)
    return dates.length === scenario.loans.length && dates.length ? monthName(dates.sort().at(-1)) : 'after 2066'
  }
  const longView = withPlans.years.filter((y, i) => i % 2 === 0 || i < 4).slice(0, 16)

  const saveEvent = (e) => {
    const list = plans.some(p => p.id === e.id) ? plans.map(p => (p.id === e.id ? e : p)) : [...plans, e]
    savePlans(list)
    setEditing(null)
  }

  return (
    <div className="card p-5 space-y-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-brand-600" />
        <h3 className="font-semibold text-slate-900 dark:text-white">Plan ahead</h3>
      </div>

      {/* Assumptions */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <label className="space-y-1">
          <span className="input-label !mb-0">Income per month</span>
          <select className="input" value={assumptions.incomePerMonth ? 'custom' : assumptions.incomeSource}
            onChange={(e) => e.target.value === 'custom' ? setAssumption('incomePerMonth', Math.round(scenario.basis.actualIncomePerMonth)) : saveWealth({ ...wealth, assumptions: { ...(wealth.assumptions || {}), incomeSource: e.target.value, incomePerMonth: null } })}>
            <option value="actual">What the bank shows ({money(scenario.basis.actualIncomePerMonth)})</option>
            <option value="budget">Budget salaries</option>
            <option value="custom">Set my own</option>
          </select>
          {assumptions.incomePerMonth && <NumberInput value={assumptions.incomePerMonth} onSave={(v) => setAssumption('incomePerMonth', v)} />}
        </label>
        <label className="space-y-1">
          <span className="input-label !mb-0">Spending per month</span>
          <NumberInput value={assumptions.spendingPerMonth ?? ''} placeholder={`${Math.round(scenario.basis.actualSpendingPerMonth)} (actual)`} onSave={(v) => setAssumption('spendingPerMonth', v || null)} />
          <span className="text-xs text-slate-500">Leave blank to use the last {window} months. Excludes loan repayments.</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="input-label !mb-0">Pay rises %/yr</span>
            <NumberInput value={pct(assumptions.salaryGrowth)} onSave={(v) => setAssumption('salaryGrowth', (Number(v) || 0) / 100)} />
          </label>
          <label className="space-y-1">
            <span className="input-label !mb-0">Prices %/yr</span>
            <NumberInput value={pct(assumptions.inflation)} onSave={(v) => setAssumption('inflation', (Number(v) || 0) / 100)} />
          </label>
        </div>
        <label className="space-y-1">
          <span className="input-label !mb-0">Home value growth (% a year)</span>
          <NumberInput value={pct(assumptions.homeGrowth)} onSave={(v) => setAssumption('homeGrowth', (Number(v) || 0) / 100)} />
        </label>
      </div>

      {/* Events */}
      <div>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">What&apos;s coming up</h4>
          <button className="btn-secondary !py-1.5 text-sm" onClick={() => setEditing({ id: `p${Date.now()}`, type: 'one_off', name: '', date: scenario.start, enabled: true })}><Plus className="h-4 w-4" />Add</button>
        </div>
        {plans.length === 0 && !editing && <p className="text-sm text-slate-500 mt-2">Add trips, big purchases, time off work, pay rises, childcare ending, rate changes or extra repayments to see what they do to your cash and your mortgage.</p>}
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {plans.map(e => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <label className="flex items-center gap-3 min-w-0">
                <input type="checkbox" checked={e.enabled !== false} onChange={(ev) => saveEvent({ ...e, enabled: ev.target.checked })} />
                <span className="min-w-0">
                  <span className={`font-medium ${e.enabled === false ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>{e.name || EVENT_TYPES[e.type]?.label}</span>
                  <span className="block text-xs text-slate-500">{describeEvent(e, people, scenario.loans, money)}</span>
                </span>
              </label>
              <div className="flex gap-1">
                <button className="btn-ghost !p-1.5" title="Edit" onClick={() => setEditing(e)}><Pencil className="h-4 w-4" /></button>
                <button className="btn-ghost !p-1.5" title="Delete" onClick={() => savePlans(plans.filter(p => p.id !== e.id))}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
        {editing && <EventForm event={editing} people={people} loans={scenario.loans} onSave={saveEvent} onCancel={() => setEditing(null)} />}
      </div>

      {/* Warnings */}
      {withPlans.warnings.map(w => (
        <div key={w.month} className="alert alert-warning text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Cash runs out from <strong>{monthName(w.month)}</strong>{w.cause ? ` (${w.cause})` : ''}{w.lastMonth !== w.month ? ` until ${monthName(w.lastMonth)}` : ''}.
            At worst you&apos;d be <strong>{money(-w.worst)}</strong> short in {monthName(w.worstMonth)}, which would have to come from redraw or be saved up first.
          </span>
        </div>
      ))}

      {/* Next 3 years */}
      <div>
        <div className="flex items-baseline justify-between">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Cash over the next 3 years</h4>
          <span className="text-xs text-slate-500">lowest {money(withPlans.lowestCash.amount)} in {monthName(withPlans.lowestCash.month)}</span>
        </div>
        <div className="h-56 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={near} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} vertical={false} />
              <XAxis dataKey="month" tickFormatter={monthName} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis tickFormatter={(v) => money(v)} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={72} />
              <ReferenceLine y={0} stroke="#e34948" strokeDasharray="4 4" />
              <Tooltip formatter={(v, k) => [money(v), k === 'plan' ? 'With your plans' : 'If nothing changes']} labelFormatter={monthName} cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} />
              {hasPlans && <Line type="monotone" dataKey="base" stroke={BASE} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
              <Line type="monotone" dataKey="plan" stroke={PLAN} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 text-xs text-slate-600 dark:text-slate-300 mt-1">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: PLAN }} />{hasPlans ? 'With your plans' : 'Cash (offset + everyday)'}</span>
          {hasPlans && <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: BASE }} />If nothing changes</span>}
        </div>
        <p className="text-xs text-slate-500 mt-1">Starts from {money(scenario.cash)} cash. Surplus is assumed to stay in the offset, which lowers interest on the loan it&apos;s linked to.</p>
      </div>

      {/* Long view */}
      <div>
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">The long view</h4>
        <div className="grid sm:grid-cols-3 gap-3 mt-2">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-3"><div className="text-xs text-slate-500">Mortgage-free</div><div className="font-semibold">{mortgageFree(withPlans)}</div>{hasPlans && <div className="text-xs text-slate-500">without plans: {mortgageFree(baseline)}</div>}</div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-3"><div className="text-xs text-slate-500">Debt-free (incl. other debts)</div><div className="font-semibold">{done(withPlans) || 'after 2066'}</div></div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-3"><div className="text-xs text-slate-500">Net worth in 10 years</div><div className="font-semibold">{withPlans.months[119] ? money(withPlans.months[119].netWorth) : '—'}</div>{hasPlans && baseline.months[119] && <div className="text-xs text-slate-500">without plans: {money(baseline.months[119].netWorth)}</div>}</div>
        </div>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="text-xs text-slate-500 text-right"><th className="text-left font-medium py-1">End of</th><th className="font-medium">Mortgage</th><th className="font-medium">Other debts</th><th className="font-medium">Cash</th><th className="font-medium">Home</th><th className="font-medium">Net worth</th></tr></thead>
            <tbody>
              {longView.map(y => (
                <tr key={y.year} className="text-right border-t border-slate-100 dark:border-slate-700">
                  <td className="text-left py-1.5">{y.year}</td>
                  <td>{money(Object.values(y.loans).reduce((a, b) => a + b, 0))}</td>
                  <td>{money(Object.values(y.debts).reduce((a, b) => a + b, 0))}</td>
                  <td>{money(y.cash)}</td>
                  <td>{money(y.homeValue)}</td>
                  <td className="font-semibold">{money(y.netWorth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mt-2">A guide, not a promise: rates, pay and prices will move. Based on the last {window} months of real income and spending.</p>
      </div>
    </div>
  )
}

function NumberInput({ value, onSave, placeholder }) {
  const [v, setV] = useState(value ?? '')
  const [prev, setPrev] = useState(value)
  if (value !== prev) { setPrev(value); setV(value ?? '') }
  return <input className="input" inputMode="decimal" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => onSave(v === '' ? null : Number(v))} />
}

function describeEvent(e, people, loans, money) {
  const person = people.find(p => String(p.id) === String(e.person))?.name
  const loan = loans.find(l => l.id === e.loanId)?.name
  const when = e.endDate ? `${monthName(e.date)} – ${monthName(e.endDate)}` : `from ${monthName(e.date)}`
  switch (e.type) {
    case 'one_off': return `${monthName(e.date)} · ${money(e.amount, { decimals: 0, signed: true })}`
    case 'recurring': return `${when} · ${money(e.amount, { decimals: 0, signed: true })}/month`
    case 'income_change': return `${person || 'Someone'} · from ${monthName(e.date)} · ${e.percent ? `${e.percent > 0 ? '+' : ''}${e.percent}%` : ''}${e.amount ? ` ${money(e.amount, { decimals: 0, signed: true })}/month` : ''}`
    case 'leave': return `${person || 'Someone'} · ${when} · ${e.percentOfPay ?? 0}% of pay`
    case 'rate_change': return `${loan || 'All loans'} · from ${monthName(e.date)} · ${e.rate}%`
    case 'extra_repayment': return `${loan || 'Dearest loan'} · ${when} · +${money(e.amount)}/month`
    case 'lump_sum': return `${loan || 'Dearest loan'} · ${monthName(e.date)} · ${money(e.amount)}`
    default: return ''
  }
}

function EventForm({ event, people, loans, onSave, onCancel }) {
  const [e, setE] = useState(event)
  const fields = EVENT_TYPES[e.type].fields
  const set = (k, v) => setE({ ...e, [k]: v })
  // Keep what's typed (so "-" or "1." work) and turn it into numbers on save
  const num = (k) => (ev) => set(k, ev.target.value)
  const toNum = (v) => (v === '' || v === undefined || v === null || !isFinite(Number(v)) ? undefined : Number(v))
  const valid = e.date && (!fields.includes('person') || e.person) && (!fields.includes('amount') || e.type === 'income_change' || toNum(e.amount))
  const save = () => onSave({ ...e, ...Object.fromEntries(['amount', 'percent', 'percentOfPay', 'rate'].filter(k => k in e).map(k => [k, toNum(e[k])])) })
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 mt-3 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <label><span className="input-label">Type</span>
          <select className="input" value={e.type} onChange={(ev) => setE({ id: e.id, enabled: e.enabled, name: e.name, date: e.date, type: ev.target.value })}>
            {Object.entries(EVENT_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </select>
        </label>
        <label><span className="input-label">Name</span><input className="input" value={e.name || ''} placeholder="e.g. Israel trip" onChange={(ev) => set('name', ev.target.value)} /></label>
      </div>
      <p className="text-xs text-slate-500">{EVENT_TYPES[e.type].help}</p>
      <div className="grid sm:grid-cols-3 gap-3">
        {fields.includes('person') && (
          <label><span className="input-label">Who</span>
            <select className="input" value={e.person || ''} onChange={(ev) => set('person', ev.target.value)}>
              <option value="">Choose…</option>
              {people.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
            </select>
          </label>
        )}
        {fields.includes('loanId') && (
          <label><span className="input-label">Loan</span>
            <select className="input" value={e.loanId || ''} onChange={(ev) => set('loanId', ev.target.value || undefined)}>
              <option value="">{e.type === 'rate_change' ? 'All loans' : 'Highest rate'}</option>
              {loans.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
        <label><span className="input-label">{fields.includes('endDate') ? 'From' : 'When'}</span><input className="input" type="month" value={e.date || ''} onChange={(ev) => set('date', ev.target.value)} /></label>
        {fields.includes('endDate') && <label><span className="input-label">Until (optional)</span><input className="input" type="month" value={e.endDate || ''} onChange={(ev) => set('endDate', ev.target.value || undefined)} /></label>}
        {fields.includes('amount') && (
          <label><span className="input-label">{e.type === 'income_change' ? '$ per month (optional)' : e.type === 'recurring' ? '$ per month (− cost, + saving)' : e.type === 'one_off' ? '$ (− cost, + windfall)' : '$'}</span>
            <input className="input" inputMode="decimal" value={e.amount ?? ''} onChange={num('amount')} />
          </label>
        )}
        {fields.includes('percent') && <label><span className="input-label">% change</span><input className="input" inputMode="decimal" value={e.percent ?? ''} onChange={num('percent')} /></label>}
        {fields.includes('percentOfPay') && <label><span className="input-label">% of pay while off</span><input className="input" inputMode="decimal" value={e.percentOfPay ?? ''} onChange={num('percentOfPay')} /></label>}
        {fields.includes('rate') && <label><span className="input-label">New rate (%)</span><input className="input" inputMode="decimal" value={e.rate ?? ''} onChange={num('rate')} /></label>}
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={!valid} onClick={save}>Save</button>
      </div>
    </div>
  )
}
