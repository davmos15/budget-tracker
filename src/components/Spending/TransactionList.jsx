import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useFirebase } from '../../contexts/FirebaseContext'
import { buildLedger, KIND_LABELS, EDITABLE_KINDS, needsReview } from '../../lib/import/ledger'
import { DEFAULT_CATEGORIES } from '../../lib/import/categorise'
import { saveLedger } from '../../lib/txStore'
import { formatMoney } from '../../lib/finance'
import { formatDate } from '../../lib/dates'

const HIDDEN_BY_DEFAULT = new Set(['transfer', 'cc_repayment', 'loan_repayment'])
const PAGE = 100

/** Searchable list of imported transactions with inline category/kind edits. */
export default function TransactionList({ ledger, settings }) {
  const { budgetId, budgetOwnerId } = useFirebase()
  const [query, setQuery] = useState('')
  const [account, setAccount] = useState('')
  const [kind, setKind] = useState('')
  const [category, setCategory] = useState('')
  const [month, setMonth] = useState('')
  const [showTransfers, setShowTransfers] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const [editing, setEditing] = useState(null)
  const symbol = settings?.currency || '$'
  const dateFormat = settings?.dateFormat || 'dd/MM/yyyy'

  const accountsById = useMemo(() => Object.fromEntries(ledger.config.accounts.map(a => [a.id, a])), [ledger.config.accounts])
  const months = useMemo(() => Object.keys(ledger.byMonth).sort().reverse(), [ledger.byMonth])
  const categories = useMemo(() => {
    const used = new Set(ledger.txns.map(t => t.category).filter(Boolean))
    return [...new Set([...DEFAULT_CATEGORIES.map(c => c.name), ...used])].sort()
  }, [ledger.txns])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ledger.txns.filter(t =>
      (showTransfers || kind || !HIDDEN_BY_DEFAULT.has(t.kind)) &&
      (!account || t.accountId === account) &&
      (!kind || t.kind === kind) &&
      (!category || (category === '__none' ? needsReview(t) : t.category === category)) &&
      (!month || t.date.startsWith(month)) &&
      (!q || `${t.merchant} ${t.rawDesc} ${t.label || ''}`.toLowerCase().includes(q))
    )
  }, [ledger.txns, query, account, kind, category, month, showTransfers])

  const sum = filtered.reduce((n, t) => n + t.amount, 0)

  const saveEdit = async (t, patch) => {
    const txns = ledger.txns.map(x => {
      if (x.id !== t.id) return x
      const out = { ...x, reviewed: true }
      if (patch.kind) { out.kind = patch.kind; out.kindLocked = true }
      if (patch.category !== undefined) { out.category = patch.category || null; out.source = 'manual' }
      return out
    })
    const { all } = buildLedger(txns, [], { accounts: ledger.config.accounts, rules: ledger.config.rules })
    await saveLedger(budgetOwnerId, budgetId, ledger.byMonth, all)
    setEditing(null)
  }

  if (ledger.txns.length === 0) {
    return <div className="card p-8 text-center text-slate-500">No transactions yet — use Import to add your bank exports.</div>
  }

  return (
    <div className="space-y-3">
      <div className="card p-3 space-y-2">
        <div className="relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9" placeholder="Search payee, description or note" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE) }} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">All months</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="input" value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">All accounts</option>
            {ledger.config.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            <option value="__none">Needs review</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showTransfers} onChange={(e) => setShowTransfers(e.target.checked)} />
            Show transfers and repayments
          </label>
          <span>{filtered.length} transactions · net {formatMoney(sum, symbol, { signed: true })}</span>
        </div>
      </div>

      <div className="card divide-y divide-slate-100 dark:divide-slate-700">
        {filtered.slice(0, shown).map(t => (
          <div key={t.id} className="p-3">
            <div className="flex items-start justify-between gap-3">
              <button className="text-left min-w-0 flex-1" onClick={() => setEditing(editing === t.id ? null : t.id)}>
                <div className="font-medium text-slate-800 dark:text-slate-100 truncate">{t.merchant}</div>
                <div className="text-xs text-slate-500 truncate">
                  {formatDate(t.date, dateFormat)} · {accountsById[t.accountId]?.name || t.accountId}
                  {' · '}{t.category || <span className="text-amber-600">{needsReview(t) ? 'needs review' : KIND_LABELS[t.kind]}</span>}
                  {t.category && !['spend', 'income'].includes(t.kind) && ` · ${KIND_LABELS[t.kind]}`}
                  {t.label && ` · "${t.label}"`}
                </div>
              </button>
              <div className={`tabular-nums font-medium shrink-0 ${t.amount < 0 ? 'text-slate-800 dark:text-slate-100' : 'text-emerald-600'}`}>
                {formatMoney(t.amount, symbol, { signed: true })}
              </div>
            </div>
            {editing === t.id && (
              <div className="mt-2 grid sm:grid-cols-2 gap-2">
                <div className="sm:col-span-2 text-xs text-slate-400 break-all">{t.rawDesc}</div>
                <select className="input" value={t.kind} onChange={(e) => saveEdit(t, { kind: e.target.value })}>
                  {[...new Set([t.kind, ...EDITABLE_KINDS])].map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                </select>
                <select className="input" value={t.category || ''} onChange={(e) => saveEdit(t, { category: e.target.value })}>
                  <option value="">No category</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>
        ))}
      </div>
      {filtered.length > shown && (
        <button className="btn-secondary w-full" onClick={() => setShown(shown + PAGE)}>Show more</button>
      )}
    </div>
  )
}
