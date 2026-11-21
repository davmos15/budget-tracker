import { useState, useMemo, useEffect } from 'react'
import { Plus, X, AlertTriangle, CheckCircle2, Edit2, ChevronUp, ChevronDown, ArrowRightLeft, Info, Undo2, CalendarPlus, TrendingDown } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import InfoTooltip from './InfoTooltip'
import { billsSnapshot, billOwnersMatter, forecast, formatMoney, annualAmount, perPeriod, isAutoPay, markBillPaid, paymentTypeInfo, SPLIT_METHODS, PERIOD_NOUN, isBill } from '../lib/finance'
import { FREQUENCY_LABELS, describeSchedule } from '../lib/schedule'
import { formatShort, relativeDays, todayISO, diffDays, today, formatDate } from '../lib/dates'

export default function BillAllocation({
  expenses,
  setExpenses,
  salaries,
  people,
  categories,
  settings,
  setSettings,
  staticAmounts,
  setStaticAmounts,
  onOpenSettings
}) {
  const [showAddStatic, setShowAddStatic] = useState(false)
  const [editingStatic, setEditingStatic] = useState(null)
  const [balanceInput, setBalanceInput] = useState(settings.billsAccountBalance ?? '')
  const [cardInput, setCardInput] = useState(settings.cardOwing ?? '')
  const [sortKey, setSortKey] = useState('due')
  const [sortDir, setSortDir] = useState('asc')
  const [showHow, setShowHow] = useState(false)
  const [undo, setUndo] = useState(null) // { id, prev: {lastPaid, nextDueDate}, name }

  // Pick up changes made elsewhere (e.g. by the other person on the budget)
  useEffect(() => { setBalanceInput(settings.billsAccountBalance ?? '') }, [settings.billsAccountBalance])
  useEffect(() => { setCardInput(settings.cardOwing ?? '') }, [settings.cardOwing])

  const currency = settings.currency || '$'
  const money = (n, opts) => formatMoney(n, currency, opts)
  const dateFmt = settings.dateFormat || 'dd/MM/yyyy'

  const inputs = useMemo(() => ({
    expenses, people, salaries, settings, staticAmounts,
    balance: settings.billsAccountBalance,
    cardOwing: settings.cardOwing
  }), [expenses, people, salaries, settings, staticAmounts])
  const snap = useMemo(() => billsSnapshot(inputs), [inputs])
  const fc = useMemo(() => forecast({ ...inputs, days: 60 }), [inputs])

  const commitNumber = (key, raw) => {
    const value = raw === '' || raw === null ? null : parseFloat(raw)
    if (raw !== '' && isNaN(value)) return
    if ((settings[key] ?? null) === value) return
    const patch = { [key]: value }
    if (key === 'billsAccountBalance') patch.billsBalanceUpdated = todayISO()
    setSettings({ ...settings, ...patch })
  }

  const updateBill = (id, patch) => {
    setExpenses(expenses.map(e => (e.id === id ? { ...e, ...patch } : e)))
  }

  const handleMarkPaid = (bill) => {
    setUndo({ id: bill.id, name: bill.name, prev: { lastPaid: bill.lastPaid || '', nextDueDate: bill.nextDueDate || '' } })
    updateBill(bill.id, markBillPaid(bill))
  }

  const handleUndo = () => {
    if (!undo) return
    updateBill(undo.id, undo.prev)
    setUndo(null)
  }

  const handleSaveStatic = (item) => {
    if (editingStatic) {
      setStaticAmounts(staticAmounts.map(s => (s.id === editingStatic.id ? { ...item, id: s.id } : s)))
    } else {
      setStaticAmounts([...staticAmounts, { ...item, id: Date.now() }])
    }
    setShowAddStatic(false)
    setEditingStatic(null)
  }

  const handleDeleteStatic = (id) => {
    if (window.confirm('Remove this buffer?')) setStaticAmounts(staticAmounts.filter(s => s.id !== id))
  }

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const rows = useMemo(() => {
    const list = snap.bills.map(({ bill, status }) => ({
      bill,
      status,
      perFortnight: perPeriod(annualAmount(bill), 'fortnightly'),
      category: categories.find(c => c.id === bill.categoryId),
      person: people.find(p => p.id === bill.personId)
    }))
    const val = (r) => {
      switch (sortKey) {
        case 'name': return r.bill.name.toLowerCase()
        case 'amount': return r.perFortnight
        case 'accrued': return r.status.accrued
        case 'due': return r.status.active ? (r.status.nextDue ? +r.status.nextDue : Infinity) : Infinity + 1
        default: return 0
      }
    }
    const sorted = [...list].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0))
    return sortDir === 'desc' ? sorted.reverse() : sorted
  }, [snap, sortKey, sortDir, categories, people])

  const attention = rows.filter(r => r.status.active && (
    !r.status.fund && ((r.status.scheduled && !isAutoPay(r.bill) && r.status.daysUntilDue <= 7) || !r.status.scheduled)
  ))

  const totalPerFortnight = rows.reduce((s, r) => s + r.perFortnight, 0)
  const excludedCount = expenses.filter(e => (e.itemType || 'expense') === 'expense' && !isBill(e)).length
  const balanceAge = settings.billsBalanceUpdated ? diffDays(settings.billsBalanceUpdated, today()) : null
  const method = snap.plan.method
  const anyMissingSchedule = Object.values(snap.plan.people).some(p => p.missingSchedule)

  const SortHeader = ({ label, field, className = '' }) => (
    <th className={`table-header cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700 ${className}`} onClick={() => handleSort(field)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === field ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronUp className="h-3 w-3 opacity-0" />}
      </span>
    </th>
  )

  const DueCell = ({ status, bill }) => {
    if (!status.active) return <span className="text-xs text-slate-400">{bill.paused ? 'Paused' : 'Ended'}</span>
    if (status.fund) {
      return (
        <div>
          <p className="text-sm text-emerald-600 font-medium">Building up</p>
          <p className="text-[11px] text-slate-400">never due</p>
        </div>
      )
    }
    if (!status.scheduled) {
      return (
        <label className="inline-flex items-center gap-1 text-xs text-amber-600 cursor-pointer">
          <CalendarPlus className="h-3.5 w-3.5" />
          <input
            type="date"
            className="input py-0.5 px-1.5 text-xs w-[130px]"
            onChange={(e) => e.target.value && updateBill(bill.id, { nextDueDate: e.target.value })}
            title="Add the next due date"
          />
        </label>
      )
    }
    const cls = status.overdue ? 'text-rose-600 font-semibold' : status.daysUntilDue <= 3 ? 'text-amber-600 font-medium' : 'text-slate-600 dark:text-slate-300'
    return (
      <div>
        <p className={`text-sm ${cls}`}>{formatShort(status.nextDue)}</p>
        <p className={`text-[11px] ${status.overdue ? 'text-rose-500' : 'text-slate-400'}`}>
          {status.overdue ? `${status.daysOverdue} day${status.daysOverdue === 1 ? '' : 's'} overdue` : status.debitedToday ? 'Came out today' : relativeDays(status.nextDue)}
        </p>
      </div>
    )
  }

  const AccruedCell = ({ status }) => {
    const pct = Math.max(0, Math.min(100, status.fraction * 100))
    return (
      <div className="min-w-[96px]">
        <p className={`text-sm font-semibold ${status.overdue ? 'text-rose-600' : status.accrued > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
          {status.paidAhead ? 'Paid ahead' : money(status.accrued)}
        </p>
        {status.active && status.scheduled && (
          <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full mt-1 overflow-hidden" title={`${Math.round(status.fraction * 100)}% of ${money(status.amount)}`}>
            <div className={`h-full rounded-full ${status.overdue ? 'bg-rose-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    )
  }

  const PayButton = ({ bill, status }) => {
    if (!status.active || isAutoPay(bill) || status.fund) return null
    const urgent = status.overdue || (status.scheduled && status.daysUntilDue <= 7)
    return (
      <button
        onClick={() => handleMarkPaid(bill)}
        className={urgent ? 'btn-primary text-xs px-2.5 py-1' : 'btn-ghost text-xs px-2.5 py-1 text-brand-600'}
        title="Record that you've paid this bill — moves it to the next due date"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Paid
      </button>
    )
  }

  const chartData = fc.series.map(p => ({ ...p, label: formatShort(p.date) }))

  return (
    <div className="space-y-6">
      {undo && (
        <div className="alert alert-success">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm flex-1"><strong>{undo.name}</strong> marked as paid.</p>
          <button onClick={handleUndo} className="btn-ghost text-xs px-3 py-1.5"><Undo2 className="h-3.5 w-3.5" />Undo</button>
          <button onClick={() => setUndo(null)} className="p-1 opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Snapshot */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-brand p-6 text-white">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-lg font-semibold">Bills account</h2>
            <InfoTooltip text="Enter what's in the bills account now. 'Required today' is what should already be set aside for every bill (each one builds up day by day until it's due), plus your credit card balance and buffers, plus what builds up until everyone's next transfer, minus those transfers." />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div>
              <label className="text-white/70 text-sm font-medium mb-1 block">Account balance</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 font-semibold">{currency}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={balanceInput}
                  onChange={(e) => setBalanceInput(e.target.value)}
                  onBlur={() => commitNumber('billsAccountBalance', balanceInput)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  className="w-full pl-8 pr-3 py-2.5 bg-white/15 border border-white/20 rounded-xl text-white text-xl font-bold placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
                  placeholder="0.00"
                />
              </div>
              <p className={`text-xs mt-1 ${balanceAge !== null && balanceAge > 7 ? 'text-amber-200' : 'text-white/50'}`}>
                {settings.billsBalanceUpdated
                  ? `Updated ${balanceAge === 0 ? 'today' : `${balanceAge} day${balanceAge === 1 ? '' : 's'} ago`}${balanceAge > 7 ? ' — worth refreshing' : ''}`
                  : 'Check your bank and enter it here'}
              </p>
            </div>

            <div>
              <label className="text-white/70 text-sm font-medium mb-1 block">Credit card owing</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 font-semibold">{currency}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={cardInput}
                  onChange={(e) => setCardInput(e.target.value)}
                  onBlur={() => commitNumber('cardOwing', cardInput)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  className="w-full pl-8 pr-3 py-2.5 bg-white/15 border border-white/20 rounded-xl text-white text-xl font-bold placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
                  placeholder="0.00"
                />
              </div>
              <p className="text-xs text-white/50 mt-1">Bills put on the card, to repay from this account</p>
            </div>

            <div>
              <p className="text-white/70 text-sm font-medium mb-1">Required today</p>
              <p className="text-3xl font-bold">{money(snap.required)}</p>
              <button onClick={() => setShowHow(!showHow)} className="text-xs text-white/60 hover:text-white mt-1 inline-flex items-center gap-1">
                <Info className="h-3 w-3" /> How is this worked out?
              </button>
            </div>

            <div>
              <p className="text-white/70 text-sm font-medium mb-1">{snap.surplus === null ? 'Surplus / shortfall' : snap.surplus >= 0 ? 'Surplus' : 'Shortfall'}</p>
              {snap.surplus === null ? (
                <p className="text-3xl font-bold text-white/40">—</p>
              ) : (
                <p className={`text-3xl font-bold ${snap.surplus >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {money(snap.surplus, { signed: true })}
                </p>
              )}
              <p className="text-xs text-white/60 mt-1">
                {snap.surplus === null ? 'Enter your balance to see' : snap.surplus >= 0 ? 'More than needed — could move to savings' : 'Top up the account by this much'}
              </p>
            </div>
          </div>
        </div>

        {showHow && (
          <div className="p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-sm animate-slide-down">
            <dl className="space-y-1.5 max-w-md">
              <Row label={`Set aside so far for ${snap.bills.filter(b => b.status.active).length} bills`} value={money(snap.accruedBills)} />
              {snap.cardOwing > 0 && <Row label="Credit card to repay" value={money(snap.cardOwing)} />}
              {snap.staticTotal > 0 && <Row label="Buffers" value={money(snap.staticTotal)} />}
              {snap.checkpoint && (
                <>
                  <Row label={`Bills build up by ${formatShort(snap.checkpoint)}`} value={`+${money(snap.buildUp)}`} />
                  <Row label={`Transfers arriving by ${formatShort(snap.checkpoint)}`} value={`−${money(snap.incoming)}`} />
                </>
              )}
              <div className="border-t border-slate-200 dark:border-slate-600 pt-1.5">
                <Row label="Needed to be on track" value={money(Math.max(0, snap.onTrack))} />
              </div>
              {snap.cashNeed > snap.onTrack && (
                <Row label="…but bills due before transfers land need" value={money(snap.cashNeed)} />
              )}
              <div className="border-t border-slate-200 dark:border-slate-600 pt-1.5">
                <Row label={<strong>Required today</strong>} value={<strong>{money(snap.required)}</strong>} />
              </div>
            </dl>
            <p className="text-xs text-slate-500 mt-3 max-w-2xl">
              Each bill builds up a little every day, so on its due date the full amount is there.
              {snap.checkpoint
                ? ` If the account holds this much today, it will have the right amount set aside for every bill once everyone's next transfer has landed (${formatShort(snap.checkpoint)}).`
                : ' Add pay dates so upcoming transfers can be taken into account.'}
              {' '}Transfers dated today are assumed to have already arrived.
            </p>
          </div>
        )}

        {/* Transfers */}
        <div className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Transfers into this account</h3>
            </div>
            {people.length > 1 && (
              <select
                value={method}
                onChange={(e) => setSettings({ ...settings, transferSplit: e.target.value })}
                className="input py-1.5 text-sm w-auto"
                title="How the bills are shared"
              >
                {SPLIT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {people.map(person => {
              const p = snap.plan.people[person.id]
              if (!p) return null
              return (
                <div key={person.id} className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar person={person} />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white text-sm">{person.name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {p.schedule ? describeSchedule(p.schedule) : 'No pay/transfer schedule yet'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-slate-900 dark:text-white">{money(p.perTransfer)}</p>
                      <p className="text-xs text-slate-400">{p.frequency ? `per ${PERIOD_NOUN[p.frequency]}` : '—'}</p>
                      {method === 'custom' && (() => {
                        const pts = settings.peopleTransferSettings?.[person.id] || {}
                        if (pts.topUp) return <p className="text-[11px] text-brand-500">tops up the rest</p>
                        if (pts.amountType === 'percent') return <p className="text-[11px] text-brand-500">{Number(pts.percentOfIncome) || 0}% of pay</p>
                        return null
                      })()}
                    </div>
                  </div>
                  {p.nextDate && (
                    <p className="text-xs text-slate-500 mt-2">
                      Next transfer <span className="font-medium text-slate-700 dark:text-slate-200">{formatShort(p.nextDate)}</span> ({relativeDays(p.nextDate)})
                    </p>
                  )}
                  {p.schedule?.estimated && (
                    <button onClick={onOpenSettings} className="text-xs text-amber-600 mt-2 font-medium hover:underline block">
                      Pay date was estimated from old settings — check it on the Income tab →
                    </button>
                  )}
                  {p.missingSchedule && (
                    <button onClick={onOpenSettings} className="text-xs text-amber-600 mt-2 font-medium hover:underline">
                      Add a pay date for {person.name} so transfers can be planned →
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <p className="text-xs text-slate-500 mt-3">
            Bills cost <strong>{money(perPeriod(snap.plan.annualNeeded, 'fortnightly'))}</strong> a fortnight
            ({money(perPeriod(snap.plan.annualNeeded, 'monthly'))} a month). {SPLIT_METHODS.find(m => m.value === method)?.help}{' '}
            <button onClick={onOpenSettings} className="text-brand-600 hover:underline">Change in Settings</button>
          </p>

          {snap.plan.shortfallAnnual > 1 && (
            <div className="alert alert-warning mt-3">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <p className="text-sm">
                Planned transfers fall short of your bills by {money(perPeriod(snap.plan.shortfallAnnual, 'fortnightly'))} a fortnight.
                {anyMissingSchedule ? ' Someone is missing a pay date.' : method === 'custom' ? ' Mark someone as "tops up the rest" in Settings.' : ''}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Forecast */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white">Next 60 days</h3>
            <InfoTooltip text="Projected balance if the planned transfers go in and bills come out on their due dates. The dashed line is what should be set aside on each day — staying above it means you're on track." />
          </div>
          <p className="text-xs text-slate-500">
            Lowest balance <strong className={fc.lowest.balance < 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}>{money(fc.lowest.balance)}</strong> on {formatShort(fc.lowest.date)}
            {fc.startAssumed && ' (assuming you start with the required amount)'}
          </p>
        </div>
        {fc.lowest.balance < 0 && !fc.startAssumed && (
          <div className="alert alert-danger mb-3">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <p className="text-sm">At this rate the account goes {money(fc.lowest.balance)} overdrawn on {formatShort(fc.lowest.date)}. Top it up before then.</p>
          </div>
        )}
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" minTickGap={48} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => money(v, { decimals: 0 })} width={70} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(v, name) => [money(v), name === 'balance' ? 'Projected balance' : 'Should be set aside']}
              labelStyle={{ color: '#334155', fontWeight: 600 }}
              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
            />
            <ReferenceLine y={0} stroke="#f43f5e" strokeOpacity={0.4} />
            <Line type="stepAfter" dataKey="balance" stroke="#4f46e5" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="reserve" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Needs attention */}
      {attention.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Needs attention
          </h3>
          <div className="space-y-2">
            {attention.map(({ bill, status }) => (
              <div key={bill.id} className={`flex items-center justify-between gap-3 p-3 rounded-xl ${status.overdue ? 'bg-rose-50 dark:bg-rose-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{bill.name} · {money(status.amount)}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {!status.scheduled
                      ? 'No due date — add one so it is set aside correctly'
                      : status.overdue
                        ? `Was due ${formatShort(status.nextDue)} (${relativeDays(status.nextDue)})`
                        : `Due ${formatShort(status.nextDue)} (${relativeDays(status.nextDue)}) — pay manually`}
                  </p>
                </div>
                {status.scheduled ? <PayButton bill={bill} status={status} /> : <DueCell bill={bill} status={status} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bills list */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Bills paid from this account</h3>
            {excludedCount > 0 && (
              <p className="text-xs text-slate-400 mt-0.5">{excludedCount} other expense{excludedCount === 1 ? ' is' : 's are'} paid from elsewhere and not counted here</p>
            )}
          </div>
          <span className="badge badge-brand">{rows.length}</span>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No bills yet — add them on the Budget tab.</p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
                    <SortHeader label="Bill" field="name" />
                    <SortHeader label="Per fortnight" field="amount" className="text-right" />
                    <SortHeader label="Set aside now" field="accrued" />
                    <SortHeader label="Next due" field="due" />
                    <th className="table-header text-right"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {rows.map(({ bill, status, perFortnight, category, person }) => (
                    <tr key={bill.id} className={`${status.overdue ? 'bg-rose-50/40 dark:bg-rose-900/10' : ''} ${!status.active ? 'opacity-50' : ''}`}>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: category?.color || '#cbd5e1' }} />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 dark:text-white text-sm">{bill.name}</p>
                            <p className="text-xs text-slate-400">
                              {money(status.amount)} {FREQUENCY_LABELS[bill.frequency]?.toLowerCase()} · {paymentTypeInfo(bill.paymentType).short}
                              {person && billOwnersMatter(settings, people) && <> · {person.name}</>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="table-cell text-right text-sm text-slate-700 dark:text-slate-300">{money(perFortnight)}</td>
                      <td className="table-cell"><AccruedCell status={status} /></td>
                      <td className="table-cell"><DueCell status={status} bill={bill} /></td>
                      <td className="table-cell text-right"><PayButton bill={bill} status={status} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                    <td className="table-cell text-sm font-semibold">Total</td>
                    <td className="table-cell text-right text-sm font-semibold">{money(totalPerFortnight)}</td>
                    <td className="table-cell text-sm font-semibold">{money(snap.accruedBills)}</td>
                    <td className="table-cell" colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
              {rows.map(({ bill, status, perFortnight, category }) => (
                <div key={bill.id} className={`p-4 ${status.overdue ? 'bg-rose-50/40' : ''} ${!status.active ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: category?.color || '#cbd5e1' }} />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{bill.name}</p>
                        <p className="text-[11px] text-slate-400">{money(status.amount)} {FREQUENCY_LABELS[bill.frequency]?.toLowerCase()} · {money(perFortnight)}/fn</p>
                      </div>
                    </div>
                    <PayButton bill={bill} status={status} />
                  </div>
                  <div className="flex items-end justify-between mt-2 gap-3">
                    <AccruedCell status={status} />
                    <div className="text-right"><DueCell status={status} bill={bill} /></div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Buffers */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Buffers</h3>
            <p className="text-xs text-slate-400 mt-0.5">Fixed amounts to always keep in the account (e.g. a safety buffer or a one-off gift)</p>
          </div>
          <button onClick={() => { setEditingStatic(null); setShowAddStatic(true) }} className="btn-primary text-sm">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        {staticAmounts.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">None yet</p>
        ) : (
          <div className="space-y-2">
            {staticAmounts.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/40 rounded-xl">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.description}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{money(item.amount)}</span>
                  <button onClick={() => { setEditingStatic(item); setShowAddStatic(true) }} className="p-1 rounded-lg text-slate-400 hover:text-brand-600"><Edit2 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDeleteStatic(item.id)} className="p-1 rounded-lg text-slate-400 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {settings.billsBalanceUpdated && (
        <p className="text-center text-xs text-slate-400">Balance last entered {formatDate(settings.billsBalanceUpdated, dateFmt)}</p>
      )}

      {showAddStatic && (
        <StaticAmountModal existing={editingStatic} onSave={handleSaveStatic} onClose={() => { setShowAddStatic(false); setEditingStatic(null) }} />
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="text-slate-600 dark:text-slate-300">{label}</dt>
      <dd className="text-slate-900 dark:text-white tabular-nums">{value}</dd>
    </div>
  )
}

function Avatar({ person }) {
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0" style={{ backgroundColor: person.color }}>
      {person.name?.charAt(0).toUpperCase()}
    </div>
  )
}

function StaticAmountModal({ existing, onSave, onClose }) {
  const [description, setDescription] = useState(existing?.description || '')
  const [amount, setAmount] = useState(existing?.amount ?? '')

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({ description: description.trim(), amount: parseFloat(amount) || 0 })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{existing ? 'Edit' : 'Add'} buffer</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="input-label">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Safety buffer" className="input" required autoFocus />
          </div>
          <div>
            <label className="input-label">Amount</label>
            <input type="number" inputMode="decimal" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" placeholder="0.00" required />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1">{existing ? 'Save' : 'Add'}</button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
