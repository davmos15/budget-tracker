import { useMemo, useState } from 'react'
import { CheckCircle, Loader, HelpCircle } from 'lucide-react'
import { useFirebase } from '../../contexts/FirebaseContext'
import { reviewGroups, ruleFromGroup, buildLedger, KIND_LABELS, EDITABLE_KINDS } from '../../lib/import/ledger'
import { DEFAULT_CATEGORIES } from '../../lib/import/categorise'
import { saveConfig, saveLedger } from '../../lib/txStore'
import { formatMoney } from '../../lib/finance'
import { formatDate, todayISO, addMonths, toISODate, parseDate } from '../../lib/dates'

const COUNTED = new Set(['spend', 'income', 'refund', 'fee'])

/** Transactions that need a human, grouped by merchant. One answer can become a rule. */
export default function ReviewQueue({ ledger, settings }) {
  const { user, budgetId, budgetOwnerId } = useFirebase()
  // Estimates use the last 12 months, so start there
  const [recentOnly, setRecentOnly] = useState(true)
  const since = useMemo(() => toISODate(addMonths(parseDate(todayISO()), -12)), [])
  const groups = useMemo(
    () => reviewGroups(recentOnly ? ledger.txns.filter(t => t.date >= since) : ledger.txns),
    [ledger.txns, recentOnly, since]
  )
  const [limit, setLimit] = useState(25)
  const symbol = settings?.currency || '$'
  const dateFormat = settings?.dateFormat || 'dd/MM/yyyy'
  const categoryNames = useMemo(() => {
    const used = new Set(ledger.txns.map(t => t.category).filter(Boolean))
    return [...new Set([...DEFAULT_CATEGORIES.map(c => c.name), ...used])].sort()
  }, [ledger.txns])

  if (ledger.txns.length === 0) {
    return <div className="card p-8 text-center text-slate-500">Import some transactions first.</div>
  }
  const rangeToggle = (
    <div className="flex gap-2 text-sm">
      {[[true, 'Last 12 months'], [false, 'All time']].map(([v, label]) => (
        <button key={label} onClick={() => setRecentOnly(v)}
          className={`px-3 py-1.5 rounded-lg ${recentOnly === v ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
          {label}
        </button>
      ))}
    </div>
  )

  if (groups.length === 0) {
    return (
      <div className="space-y-3">{rangeToggle}<div className="card p-8 text-center">
        <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
        <p className="font-medium text-slate-800 dark:text-slate-100">All caught up</p>
        <p className="text-sm text-slate-500 mt-1">Every transaction {recentOnly ? 'in the last 12 months ' : ''}has a category.</p>
      </div></div>
    )
  }

  const total = groups.reduce((n, g) => n + g.count, 0)
  return (
    <div className="space-y-3">
      {rangeToggle}
      <div className="alert alert-info text-sm">
        <HelpCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>{total} transactions from {groups.length} payees need a category. Biggest first. Answers marked "Remember" apply to this payee from now on, including future imports.</div>
      </div>
      {groups.slice(0, limit).map(g => (
        <ReviewGroup key={g.key} group={g} categories={categoryNames} symbol={symbol} dateFormat={dateFormat}
          onSave={async (set, remember) => {
            const ids = new Set(g.ids)
            let rules = ledger.config.rules
            let txns = ledger.txns
            if (remember) {
              rules = [ruleFromGroup(g, set, { createdBy: user.uid }), ...rules] // newest first wins
              await saveConfig(budgetOwnerId, budgetId, { accounts: ledger.config.accounts, rules })
            } else {
              txns = txns.map(t => {
                if (!ids.has(t.id)) return t
                const out = { ...t, kind: set.kind || t.kind, kindLocked: !!set.kind || t.kindLocked, reviewed: true }
                if (set.category !== undefined) { out.category = set.category; out.source = 'manual' }
                return out
              })
            }
            const { all } = buildLedger(txns, [], { accounts: ledger.config.accounts, rules })
            await saveLedger(budgetOwnerId, budgetId, ledger.byMonth, all)
          }} />
      ))}
      {groups.length > limit && (
        <button className="btn-secondary w-full" onClick={() => setLimit(limit + 25)}>Show more ({groups.length - limit} left)</button>
      )}
    </div>
  )
}

function ReviewGroup({ group, categories, symbol, dateFormat, onSave }) {
  const isTransfer = group.type === 'transfer'
  const [kind, setKind] = useState(isTransfer ? 'transfer' : (group.total >= 0 ? 'income' : 'spend'))
  const [category, setCategory] = useState('')
  const [remember, setRemember] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const needsCategory = COUNTED.has(kind)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const set = needsCategory ? { kind, category } : { kind }
      await onSave(set, remember)
    } catch {
      setError('Could not save. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{group.merchant}</div>
          <div className="text-xs text-slate-500">
            {group.count} × · {formatDate(group.first, dateFormat)}{group.first !== group.last && ` – ${formatDate(group.last, dateFormat)}`}
            {isTransfer && ' · transfer to an account we don\'t know'}
          </div>
        </div>
        <div className={`font-semibold tabular-nums ${group.total < 0 ? 'text-slate-900 dark:text-white' : 'text-emerald-600'}`}>
          {formatMoney(group.total, symbol, { signed: true })}
        </div>
      </div>
      <ul className="mt-2 space-y-0.5">
        {group.samples.map((s, i) => (
          <li key={i} className="text-xs text-slate-400 truncate">{formatDate(s.date, dateFormat)} · {formatMoney(s.amount, symbol)} · {s.rawDesc}</li>
        ))}
      </ul>
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 mt-3 items-end">
        <div>
          <label className="input-label">This is</label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {EDITABLE_KINDS.map(k => <option key={k} value={k}>{k === 'transfer' ? 'Transfer between our accounts' : KIND_LABELS[k]}</option>)}
          </select>
        </div>
        <div>
          <label className="input-label">Category</label>
          <select className="input" value={category} disabled={!needsCategory} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{needsCategory ? 'Choose…' : 'Not needed'}</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button className="btn-primary" disabled={saving || (needsCategory && !category)} onClick={save}>
          {saving ? <Loader className="h-4 w-4 animate-spin" /> : 'Save'}
        </button>
      </div>
      <label className="flex items-center gap-2 mt-2 text-sm text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember for "{group.merchant}"
      </label>
      {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
    </div>
  )
}
