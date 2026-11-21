import { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Home, Wallet, Landmark, HandCoins, Pencil, Check, X, Plus, Trash2 } from 'lucide-react'
import { netWorthNow, netWorthHistory, loans as loanList, DEFAULT_ASSUMPTIONS } from '../../lib/wealth'
import { extraRepaymentScenario } from '../../lib/mortgage'
import { formatMoney } from '../../lib/finance'
import { todayISO, toISODate, addMonths, parseDate, formatDate } from '../../lib/dates'
import PlanSection from './PlanSection'

const monthName = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
const yearsMonths = (m) => (Number.isFinite(m) ? `${Math.floor(m / 12)}y ${m % 12}m` : 'never at this repayment')

export default function WealthTab({ ledger, budget, settings, people, salaries, saveWealth, savePlans }) {
  const today = todayISO()
  const currency = settings?.currency || '$'
  const money = (n, o = { decimals: 0 }) => formatMoney(n, currency, o)
  const dateFmt = settings?.dateFormat || 'dd/MM/yyyy'
  const wealth = useMemo(() => budget?.wealth || {}, [budget?.wealth])
  const accounts = ledger.config.accounts

  const nw = useMemo(() => netWorthNow({ txns: ledger.txns, accounts, wealth, today }), [ledger.txns, accounts, wealth, today])
  const history = useMemo(() => {
    const first = ledger.txns.filter(t => accounts.find(a => a.id === t.accountId)?.kind === 'loan').reduce((m, t) => (t.date < m ? t.date : m), today)
    // Start the month after the loans begin (the first month is usually half set up)
    const from = toISODate(addMonths(parseDate(first.slice(0, 7) + '-01'), 1)).slice(0, 7)
    return netWorthHistory({ txns: ledger.txns, accounts, wealth, from, to: today.slice(0, 7) })
  }, [ledger.txns, accounts, wealth, today])
  const loanData = useMemo(() => loanList({ txns: ledger.txns, accounts, wealth, today }), [ledger.txns, accounts, wealth, today])

  const yearAgo = history.find(h => h.month === toISODate(addMonths(parseDate(today), -12)).slice(0, 7))
  const owing = nw.loans.reduce((s, l) => s + l.balance, 0)
  const save = (patch) => saveWealth({ ...wealth, ...patch })

  if (ledger.loading) return null
  if (!accounts.some(a => a.kind === 'loan')) {
    return <div className="card p-8 text-center text-slate-500">Import your loan and offset account exports (Spending → Import) to see your mortgage and net worth here.</div>
  }

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-brand p-6 text-white">
          <div className="text-sm text-white/70">Net worth</div>
          <div className="text-4xl font-semibold tabular-nums mt-1">{money(nw.netWorth)}</div>
          {yearAgo && <div className="text-sm text-white/80 mt-1">{money(nw.netWorth - yearAgo.netWorth, { decimals: 0, signed: true })} over 12 months (home value changes not counted unless you update it)</div>}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-100 dark:divide-slate-700">
          <HomeValue value={nw.home} wealth={wealth} save={save} money={money} dateFmt={dateFmt} />
          <Tile icon={Wallet} label="Cash" value={money(nw.cash)} sub={nw.cashAccounts.map(a => a.name).join(' + ')} />
          <Tile icon={Landmark} label="Mortgage" value={money(-owing)} sub={`Equity ${money(nw.equity)}`} />
          <Tile icon={HandCoins} label="Other debts" value={money(-nw.debts.reduce((s, d) => s + d.balance, 0))} sub={nw.debts.map(d => d.name).join(', ') || 'None'} />
        </div>
      </div>

      {/* History */}
      {history.length > 1 && (
        <div className="card p-4">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Net worth over time</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthName} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis tickFormatter={(v) => money(v)} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={72} />
                <Tooltip content={<HistoryTip money={money} />} cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} />
                <Line type="monotone" dataKey="netWorth" stroke="#2a78d6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-500 mt-2">Loan and cash balances come from your bank exports; the home value is whatever you last entered.</p>
        </div>
      )}

      {/* Loans */}
      <div className="grid lg:grid-cols-2 gap-4">
        {loanData.map(l => <LoanCard key={l.id} l={l} accounts={accounts} wealth={wealth} save={save} money={money} />)}
      </div>

      <ExtraRepayments loans={loanData} money={money} today={today} />

      <OtherDebts debts={nw.debts} wealth={wealth} save={save} money={money} dateFmt={dateFmt} />

      <PlanSection ledger={ledger} budget={budget} wealth={wealth} assumptions={{ ...DEFAULT_ASSUMPTIONS, ...(wealth.assumptions || {}) }}
        people={people} salaries={salaries} settings={settings} saveWealth={saveWealth} savePlans={savePlans} />
    </div>
  )
}

function Tile({ icon, label, value, sub, children }) {
  const Icon = icon
  return (
    <div className="p-4">
      <div className="flex items-center gap-1.5 text-xs text-slate-500"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="text-xl font-semibold tabular-nums text-slate-900 dark:text-white mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5 truncate">{sub}</div>}
      {children}
    </div>
  )
}

function HomeValue({ value, wealth, save, money, dateFmt }) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const last = [...(wealth.homeValues || [])].sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  const commit = () => {
    const v = Number(String(input).replace(/[^0-9.]/g, ''))
    if (v > 0) save({ homeValues: [...(wealth.homeValues || []).filter(h => h.date !== todayISO()), { date: todayISO(), value: v }] })
    setEditing(false)
  }
  return (
    <Tile icon={Home} label="Home value" value={editing ? '' : money(value)} sub={!editing && (last ? `as of ${formatDate(last.date, dateFmt)}` : 'Enter an estimate')}>
      {editing ? (
        <div className="flex gap-1 mt-1">
          <input className="input !py-1" autoFocus inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commit()} placeholder="e.g. 1100000" />
          <button className="btn-primary !px-2 !py-1" onClick={commit}><Check className="h-4 w-4" /></button>
          <button className="btn-ghost !px-2 !py-1" onClick={() => setEditing(false)}><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <button className="text-xs text-brand-600 mt-1 flex items-center gap-1" onClick={() => { setInput(value || ''); setEditing(true) }}><Pencil className="h-3 w-3" />Update</button>
      )}
    </Tile>
  )
}

function LoanCard({ l, accounts, wealth, save, money }) {
  const cfg = wealth.loans?.[l.id] || {}
  const [rateInput, setRateInput] = useState(cfg.rate != null ? (cfg.rate * 100).toFixed(2) : '')
  const setLoan = (patch) => save({ loans: { ...(wealth.loans || {}), [l.id]: { ...cfg, ...patch } } })
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold text-slate-900 dark:text-white">{l.name}</h3>
        <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{money(l.balance)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-sm">
        <dt className="text-slate-500">Interest rate</dt>
        <dd className="text-right">
          <span className="inline-flex items-center gap-1">
            <input className="input !w-20 !py-1 text-right" value={rateInput} placeholder={l.inferredRate != null ? (l.inferredRate * 100).toFixed(2) : ''}
              onChange={(e) => setRateInput(e.target.value)}
              onBlur={() => setLoan({ rate: rateInput === '' ? null : Number(rateInput) / 100 })} />%
          </span>
          <div className="text-xs text-slate-400">{cfg.rate != null ? 'set by you' : 'worked out from interest charged'}</div>
        </dd>
        <dt className="text-slate-500">Repayment</dt><dd className="text-right tabular-nums">{money(l.repayment, { decimals: 2 })}/month</dd>
        <dt className="text-slate-500">Interest, last 12 months</dt><dd className="text-right tabular-nums">{money(l.interestLast12)}</dd>
        <dt className="text-slate-500">Paid off, last 12 months</dt><dd className="text-right tabular-nums">{l.principalLast12 != null ? money(l.principalLast12) : '—'}</dd>
        <dt className="text-slate-500">Paid off by</dt>
        <dd className="text-right">{l.payoff.date ? monthName(l.payoff.date) : 'never at this repayment'}<div className="text-xs text-slate-400">{Number.isFinite(l.payoff.totalInterest) ? `${money(l.payoff.totalInterest)} more interest` : ''}</div></dd>
        <dt className="text-slate-500">Offset account</dt>
        <dd className="text-right">
          <select className="input !py-1 !w-auto" value={cfg.offsetAccountId || ''} onChange={(e) => setLoan({ offsetAccountId: e.target.value || null })}>
            <option value="">None</option>
            {accounts.filter(a => a.kind === 'offset' || a.kind === 'transaction').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {l.offsetAccountId && <div className="text-xs text-slate-400">{money(l.offsetBalance)} saving ~{money(l.offsetSavingPerYear)}/yr</div>}
        </dd>
      </dl>
    </div>
  )
}

function ExtraRepayments({ loans, money, today }) {
  const [extra, setExtra] = useState(500)
  const r = useMemo(() => extraRepaymentScenario(loans.map(l => ({ balance: l.balance, rate: l.rate, repayment: l.repayment, offsetBalance: l.offsetAccountId ? l.offsetBalance : 0 })), { extraPerMonth: extra }), [loans, extra])
  const done = (m) => (Number.isFinite(m) && m < 720 ? monthName(toISODate(addMonths(parseDate(today), m)).slice(0, 7)) : 'not within 60 years')
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-slate-900 dark:text-white">What if we paid a bit more?</h3>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <span className="text-sm text-slate-600 dark:text-slate-300">Extra each month</span>
        <input type="range" min="0" max="3000" step="50" value={extra} onChange={(e) => setExtra(Number(e.target.value))} className="flex-1 min-w-[10rem] accent-brand-600" />
        <span className="tabular-nums font-semibold w-20 text-right">{money(extra)}</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mt-4">
        <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-3"><div className="text-xs text-slate-500">Mortgage-free</div><div className="font-semibold">{done(r.with.months)}</div><div className="text-xs text-slate-500">instead of {done(r.without.months)}</div></div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-3"><div className="text-xs text-slate-500">Sooner by</div><div className="font-semibold">{yearsMonths(r.monthsSaved)}</div></div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-3"><div className="text-xs text-slate-500">Interest saved</div><div className="font-semibold text-emerald-600">{money(r.interestSaved)}</div></div>
      </div>
      <p className="text-xs text-slate-500 mt-2">Extra goes to the loan with the higher rate first; when one loan is paid off its repayment rolls onto the other. Money sitting in the offset has a similar effect on a variable loan.</p>
    </div>
  )
}

function OtherDebts({ debts, wealth, save, money, dateFmt }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', startBalance: '', startDate: todayISO(), repayment: '' })
  const remove = (id) => save({ debts: (wealth.debts || []).filter(d => d.id !== id) })
  const add = () => {
    if (!form.name || !Number(form.startBalance)) return
    save({ debts: [...(wealth.debts || []), { id: `d${Date.now()}`, name: form.name, startBalance: Number(form.startBalance), startDate: form.startDate, repayment: Number(form.repayment) || 0 }] })
    setAdding(false)
    setForm({ name: '', startBalance: '', startDate: todayISO(), repayment: '' })
  }
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 dark:text-white">Other debts</h3>
        <button className="btn-ghost !py-1.5 text-sm" onClick={() => setAdding(!adding)}><Plus className="h-4 w-4" />Add</button>
      </div>
      <p className="text-xs text-slate-500 mt-1">Repayments are the transactions marked &quot;Debt repayment&quot; (Spending → Transactions) since the start date.</p>
      {debts.map(d => (
        <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3 border-b border-slate-100 dark:border-slate-700 last:border-0">
          <div>
            <div className="font-medium text-slate-800 dark:text-slate-100">{d.name}</div>
            <div className="text-xs text-slate-500">Started at {money(d.startBalance)} on {formatDate(d.startDate, dateFmt)} · {d.payments} repayments ({money(d.repaid)}){d.repayment ? ` · ${money(d.repayment)}/month` : ''}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tabular-nums">{money(d.balance)}</span>
            <button className="btn-ghost !p-1.5" title="Remove" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      ))}
      {adding && (
        <div className="grid sm:grid-cols-5 gap-2 mt-3 items-end">
          <input className="input sm:col-span-2" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Amount at start" inputMode="numeric" value={form.startBalance} onChange={(e) => setForm({ ...form, startBalance: e.target.value })} />
          <input className="input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <input className="input" placeholder="Repayment / month" inputMode="numeric" value={form.repayment} onChange={(e) => setForm({ ...form, repayment: e.target.value })} />
          <button className="btn-primary sm:col-span-5" onClick={add}>Save debt</button>
        </div>
      )}
    </div>
  )
}

function HistoryTip({ active, payload, money }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 p-3 text-xs space-y-0.5">
      <div className="font-semibold text-slate-900 dark:text-white">{monthName(p.month)} · {money(p.netWorth)}</div>
      <div className="text-slate-600 dark:text-slate-300">Home {money(p.home)}</div>
      <div className="text-slate-600 dark:text-slate-300">Cash {money(p.cash)}</div>
      <div className="text-slate-600 dark:text-slate-300">Mortgage −{money(p.loans)}</div>
      {p.debts > 0 && <div className="text-slate-600 dark:text-slate-300">Other debts −{money(p.debts)}</div>}
    </div>
  )
}
