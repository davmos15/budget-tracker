import { useMemo, useState } from 'react'
import { Loader, AlertTriangle } from 'lucide-react'
import { needsReview } from '../../lib/import/ledger'
import { todayISO, toISODate, addMonths, parseDate } from '../../lib/dates'
import TransactionList from './TransactionList'
import ReviewQueue from './ReviewQueue'
import ImportPanel from './ImportPanel'
import SpendingOverview from './SpendingOverview'

const VIEWS = [
  { id: 'overview', name: 'Overview' },
  { id: 'transactions', name: 'Transactions' },
  { id: 'review', name: 'Review' },
  { id: 'import', name: 'Import' }
]

export default function SpendingTab({ ledger, settings }) {
  const [view, setView] = useState(null)
  // Same window the Review screen opens on (last 12 months)
  const reviewCount = useMemo(() => {
    const since = toISODate(addMonths(parseDate(todayISO()), -12))
    return ledger.txns.filter(t => t.date >= since && needsReview(t)).length
  }, [ledger.txns])
  // Start on Import when there's nothing yet
  const current = view || (ledger.txns.length === 0 ? 'import' : 'overview')

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              current === v.id ? 'bg-brand-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}>
            {v.name}
            {v.id === 'review' && reviewCount > 0 && (
              <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${current === v.id ? 'bg-white/25' : 'bg-amber-100 text-amber-700'}`}>{reviewCount}</span>
            )}
          </button>
        ))}
      </div>

      {ledger.error && <div className="alert alert-danger text-sm"><AlertTriangle className="h-4 w-4" />{ledger.error}</div>}
      {ledger.loading ? (
        <div className="card p-8 flex justify-center"><Loader className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : (
        <>
          {current === 'overview' && <SpendingOverview ledger={ledger} settings={settings} />}
          {current === 'transactions' && <TransactionList ledger={ledger} settings={settings} />}
          {current === 'review' && <ReviewQueue ledger={ledger} settings={settings} />}
          {current === 'import' && <ImportPanel ledger={ledger} onDone={() => setView('review')} />}
        </>
      )}
    </div>
  )
}
