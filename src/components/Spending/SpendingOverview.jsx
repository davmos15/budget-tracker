import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { TrendingUp, TrendingDown, Sparkles, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { categoryStats, monthlyTotals, periodFactor, highlights, cashflow, merchantsIn, itemisedSince, byAccount } from '../../lib/spending'
import { formatMoney } from '../../lib/finance'
import { todayISO, toISODate, addMonths, parseDate } from '../../lib/dates'

// Categorical palette (fixed order, validated for colour-blind separation); the rest fold into "Other"
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7']
const OTHER = '#a8a29e'
const PERIODS = [['weekly', 'Week'], ['fortnightly', 'Fortnight'], ['monthly', 'Month'], ['yearly', 'Year']]
const monthLabel = (m) => new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString('en-AU', { month: 'short' })

export default function SpendingOverview({ ledger, settings }) {
  const today = todayISO()
  const currency = settings?.currency || '$'
  const money = (n, o = { decimals: 0 }) => formatMoney(n, currency, o)
  const [period, setPeriod] = useState('monthly')
  const since = useMemo(() => itemisedSince(ledger.txns, { today }), [ledger.txns, today])
  // Months since card spending became itemised (min 3), else 12
  const itemisedMonths = useMemo(() => {
    if (!since) return null
    const now = parseDate(today)
    const n = (now.getFullYear() - Number(since.slice(0, 4))) * 12 + now.getMonth() - (Number(since.slice(5)) - 1)
    return Math.max(3, Math.min(12, n))
  }, [since, today])
  const [windowChoice, setWindowChoice] = useState(null)
  const window = windowChoice ?? itemisedMonths ?? 12
  const [open, setOpen] = useState(null)

  const stats = useMemo(() => categoryStats(ledger.txns, { today, window }), [ledger.txns, today, window])
  const months = useMemo(() => monthlyTotals(ledger.txns, { months: 13, today }).slice(0, -1), [ledger.txns, today])
  const notes = useMemo(() => highlights(ledger.txns, { today, window }), [ledger.txns, today, window])
  const range = useMemo(() => {
    const now = parseDate(today)
    const end = new Date(now.getFullYear(), now.getMonth(), 0) // last day of previous month
    const start = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), -window)
    return { from: toISODate(start), to: toISODate(end) }
  }, [today, window])
  const flow = useMemo(() => cashflow(ledger.txns, range), [ledger.txns, range])
  const paidFrom = useMemo(() => byAccount(ledger.txns, range), [ledger.txns, range])

  const f = periodFactor(period)
  const per = (total) => (total / window) * f
  const noun = PERIODS.find(p => p[0] === period)[1].toLowerCase()

  // Colour follows the category, by its rank in the 12-month chart, so it doesn't repaint when the window changes
  const chartCats = useMemo(() => {
    const totals = {}
    months.forEach(m => Object.entries(m.byCategory).forEach(([c, v]) => { totals[c] = (totals[c] || 0) + v }))
    return Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, SERIES.length).map(([c]) => c)
  }, [months])
  const colorOf = (c) => SERIES[chartCats.indexOf(c)] || OTHER
  const chartData = months.map(m => {
    const row = { month: monthLabel(m.month), key: m.month, Other: 0 }
    Object.entries(m.byCategory).forEach(([c, v]) => { if (chartCats.includes(c)) row[c] = Math.max(0, v); else row.Other += Math.max(0, v) })
    return row
  })
  const accountName = (id) => ledger.config.accounts.find(a => a.id === id)?.name || id

  if (ledger.txns.length === 0) return <div className="card p-8 text-center text-slate-500">Import some transactions to see where the money goes.</div>

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1">
          {PERIODS.map(([id, label]) => (
            <button key={id} onClick={() => setPeriod(id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${period === id ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>
              Per {label.toLowerCase()}
            </button>
          ))}
        </div>
        <select className="input !w-auto !py-2" value={window} onChange={(e) => setWindowChoice(Number(e.target.value))}>
          {itemisedMonths && itemisedMonths !== 12 && <option value={itemisedMonths}>Last {itemisedMonths} months (card fully itemised)</option>}
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
        </select>
      </div>
      {since && window > itemisedMonths && (
        <div className="alert alert-info text-sm"><Info className="h-4 w-4 shrink-0 mt-0.5" />Before {monthLabel(since)} {since.slice(0, 4)} card purchases weren&apos;t itemised, so part of that spending shows as &quot;Card (unitemised)&quot; instead of its real category.</div>
      )}

      {/* Headline figures */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={`Spending per ${noun}`} value={money(per(flow.spending))} />
        <Stat label={`Income per ${noun}`} value={money(per(flow.income))} />
        <Stat label={`Mortgage per ${noun}`} value={money(per(flow.mortgage))} sub={`incl. ${money(per(flow.interest))} interest`} />
        <Stat label={`Left over per ${noun}`} value={money(per(flow.leftOver))} tone={flow.leftOver < 0 ? 'bad' : 'good'} sub={flow.debt ? `after ${money(per(flow.debt))} loan repayments` : undefined} />
      </div>

      {/* Monthly chart */}
      <div className="card p-4">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="font-semibold text-slate-900 dark:text-white">Spending by month</h3>
          <span className="text-xs text-slate-500">last 12 complete months</span>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => money(v)} />
              <Tooltip cursor={{ fill: '#94a3b8', fillOpacity: 0.12 }} content={<MonthTooltip money={money} cats={[...chartCats, 'Other']} colorOf={colorOf} />} />
              {[...chartCats, 'Other'].map((c, i, all) => (
                <Bar key={c} dataKey={c} stackId="s" fill={colorOf(c)} stroke="var(--chart-gap, #fff)" strokeWidth={1}
                  radius={i === all.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
          {[...chartCats, 'Other'].map(c => (
            <span key={c} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(c) }} />{c}
            </span>
          ))}
        </div>
      </div>

      {/* Highlights */}
      {notes.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-600" />Worth a look</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
            {notes.slice(0, 6).map((n, i) => (
              <li key={i} className="flex items-start gap-2">
                {n.type === 'up' && <><TrendingUp className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" /><span><strong>{n.category}</strong> is running at {money(n.recentAvg * f)}/{noun} over the last 3 months, {Math.round(n.change * 100)}% above normal ({money(n.monthlyAvg * f)}).</span></>}
                {n.type === 'down' && <><TrendingDown className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /><span><strong>{n.category}</strong> is down to {money(n.recentAvg * f)}/{noun}, {Math.round(-n.change * 100)}% below normal.</span></>}
                {n.type === 'new_payee' && <><Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" /><span>New: <strong>{n.merchant}</strong> — {n.count} payments, {money(n.total)} in the last 90 days{n.category ? ` (${n.category})` : ''}.</span></>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Categories */}
      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        <div className="p-4 flex items-baseline justify-between">
          <h3 className="font-semibold text-slate-900 dark:text-white">Categories</h3>
          <span className="text-xs text-slate-500">average per {noun} · this month so far</span>
        </div>
        {stats.filter(s => s.monthlyAvg > 0 || s.thisMonth > 0).map(s => {
          const max = stats[0]?.monthlyAvg || 1
          const isOpen = open === s.category
          return (
            <div key={s.category}>
              <button className="w-full p-3 text-left" onClick={() => setOpen(isOpen ? null : s.category)}>
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: colorOf(s.category) }} />
                  <span className="flex-1 min-w-0 truncate font-medium text-slate-800 dark:text-slate-100">{s.category}</span>
                  {s.change !== null && Math.abs(s.change) >= 0.2 && s.monthlyAvg >= 50 && (
                    <span className={`text-xs ${s.change > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{s.change > 0 ? '▲' : '▼'} {Math.round(Math.abs(s.change) * 100)}%</span>
                  )}
                  <span className="tabular-nums font-semibold text-slate-900 dark:text-white w-24 text-right">{money(s.monthlyAvg * f)}</span>
                  <span className="tabular-nums text-xs text-slate-500 w-20 text-right">{money(s.thisMonth)}</span>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>
                <div className="ml-5 mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(1, (s.monthlyAvg / max) * 100)}%`, background: colorOf(s.category) }} />
                </div>
              </button>
              {isOpen && <CategoryDetail s={s} ledger={ledger} range={range} money={money} color={colorOf(s.category)} />}
            </div>
          )
        })}
      </div>

      {/* Paid from */}
      <div className="card p-4">
        <h3 className="font-semibold text-slate-900 dark:text-white">Paid from</h3>
        <div className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {Object.entries(paidFrom).sort((a, b) => b[1] - a[1]).map(([id, v]) => (
            <div key={id} className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">{accountName(id)}</span><span className="tabular-nums">{money(per(v))}/{noun}</span></div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">Averages over the {window} complete months to the end of last month. Transfers between your accounts and card repayments are left out so nothing is counted twice.</p>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${tone === 'bad' ? 'text-rose-600' : tone === 'good' ? 'text-emerald-600' : 'text-slate-900 dark:text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function MonthTooltip({ active, payload, label, money, cats, colorOf }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const total = cats.reduce((a, c) => a + (row[c] || 0), 0)
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 p-3 text-xs">
      <div className="font-semibold text-slate-900 dark:text-white mb-1">{label} · {money(total)}</div>
      {cats.filter(c => row[c] > 0).sort((a, b) => row[b] - row[a]).map(c => (
        <div key={c} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className="h-2 w-2 rounded-sm" style={{ background: colorOf(c) }} /><span className="flex-1">{c}</span><span className="tabular-nums">{money(row[c])}</span>
        </div>
      ))}
    </div>
  )
}

function CategoryDetail({ s, ledger, range, money, color }) {
  const payees = useMemo(() => merchantsIn(ledger.txns, s.category, range), [ledger.txns, s.category, range])
  const data = s.series.map(p => ({ month: monthLabel(p.month), amount: Math.max(0, p.amount) }))
  return (
    <div className="px-4 pb-4 grid md:grid-cols-2 gap-4">
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip cursor={{ fill: '#94a3b8', fillOpacity: 0.12 }} formatter={(v) => [money(v), s.category]} />
            <Bar dataKey="amount" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Top payees</div>
        {payees.map(p => (
          <div key={p.merchant} className="flex justify-between text-sm py-0.5">
            <span className="truncate text-slate-700 dark:text-slate-200">{p.merchant} <span className="text-slate-400">×{p.count}</span></span>
            <span className="tabular-nums">{money(p.total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
