import { useMemo, useState } from 'react'
import { Upload, FileText, Loader, CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react'
import { useFirebase } from '../../contexts/FirebaseContext'
import { parseStatement } from '../../lib/import/parse'
import { rowsToTxns, buildLedger, guessAccount, needsReview } from '../../lib/import/ledger'
import { saveConfig, saveLedger } from '../../lib/txStore'

const ACCOUNT_KINDS = [
  { value: 'transaction', label: 'Everyday' },
  { value: 'offset', label: 'Offset' },
  { value: 'loan', label: 'Loan' },
  { value: 'card', label: 'Credit card' }
]

/** Pick CSV exports, match each to an account, preview, then save. */
export default function ImportPanel({ ledger, onDone }) {
  const { budgetId, budgetOwnerId } = useFirebase()
  const [files, setFiles] = useState([]) // { name, format, rows, errors, accountId, newAccount }
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const existingAccounts = ledger.config.accounts

  const pickFiles = async (e) => {
    setResult(null)
    setError('')
    const picked = await Promise.all([...e.target.files].map(async (file) => {
      // Read in the browser only — the file itself is never uploaded
      const parsed = parseStatement(await file.text())
      const guess = guessAccount(file.name, parsed.format)
      const match = existingAccounts.find(a => a.id === guess.id || a.name.toLowerCase() === guess.name.toLowerCase())
      return { name: file.name, ...parsed, accountId: match ? match.id : guess.id, newAccount: match ? null : guess }
    }))
    setFiles(picked)
    e.target.value = ''
  }

  const updateFile = (i, patch) => setFiles(files.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  const { accounts, preview, newNeedingReview } = useMemo(() => {
    // Accounts after this import: existing + any new ones from the files
    const accounts = [...existingAccounts]
    for (const f of files) {
      if (f.format && f.newAccount && !accounts.some(a => a.id === f.newAccount.id)) accounts.push(f.newAccount)
    }
    const usable = files.filter(f => f.format)
    if (!usable.length) return { accounts, preview: null, newNeedingReview: 0 }
    const incoming = usable.flatMap(f => rowsToTxns(f.rows, f.accountId))
    const preview = buildLedger(ledger.txns, incoming, { accounts, rules: ledger.config.rules })
    const stored = new Set(ledger.txns.map(t => t.id))
    const newIds = new Set(incoming.map(t => t.id).filter(id => !stored.has(id)))
    return { accounts, preview, newNeedingReview: preview.all.filter(t => newIds.has(t.id) && needsReview(t)).length }
  }, [files, existingAccounts, ledger.txns, ledger.config.rules])

  const commit = async () => {
    setSaving(true)
    setError('')
    try {
      await saveConfig(budgetOwnerId, budgetId, { accounts, rules: ledger.config.rules })
      const months = await saveLedger(budgetOwnerId, budgetId, ledger.byMonth, preview.all)
      setResult({ added: preview.added, duplicates: preview.duplicates, months, review: newNeedingReview })
      setFiles([])
    } catch (e) {
      setError(e.code === 'permission-denied' ? 'You don\'t have permission to import into this budget.' : 'Saving failed — nothing was reported as imported. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-brand-50 dark:bg-brand-900/40 rounded-xl"><Upload className="h-5 w-5 text-brand-600" /></div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900 dark:text-white">Import bank exports</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              ING (Date, Description, Credit, Debit, Balance) and Qantas card CSVs. Re-importing the same file is safe — transactions already here are skipped.
            </p>
            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> Files are read on this device. Only the transactions are saved, and only budget members can see them.
            </p>
          </div>
        </div>
        <label className="btn-primary mt-4 cursor-pointer w-full sm:w-auto">
          <FileText className="h-4 w-4" /> Choose CSV files
          <input type="file" accept=".csv,text/csv" multiple className="hidden" onChange={pickFiles} />
        </label>
      </div>

      {files.map((f, i) => (
        <div key={f.name} className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium text-slate-800 dark:text-slate-100 truncate">{f.name}</div>
            {f.format
              ? <span className="badge badge-info">{f.rows.length} rows · {f.format === 'ing' ? 'ING' : 'Qantas'}</span>
              : <span className="badge badge-danger">Not recognised</span>}
          </div>
          {f.format && (
            <div className="grid sm:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="input-label">Account</label>
                <select className="input" value={f.newAccount ? '__new' : f.accountId}
                  onChange={(e) => {
                    if (e.target.value === '__new') updateFile(i, { newAccount: guessAccount(f.name, f.format), accountId: guessAccount(f.name, f.format).id })
                    else updateFile(i, { accountId: e.target.value, newAccount: null })
                  }}>
                  {existingAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  <option value="__new">New account…</option>
                </select>
              </div>
              {f.newAccount && (
                <>
                  <div>
                    <label className="input-label">Name</label>
                    <input className="input" value={f.newAccount.name} onChange={(e) => updateFile(i, { newAccount: { ...f.newAccount, name: e.target.value } })} />
                  </div>
                  <div>
                    <label className="input-label">Type</label>
                    <select className="input" value={f.newAccount.kind} onChange={(e) => updateFile(i, { newAccount: { ...f.newAccount, kind: e.target.value } })}>
                      {ACCOUNT_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}
          {f.errors.length > 0 && (
            <div className="alert alert-warning mt-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                {f.format ? `${f.errors.length} row(s) couldn't be read and will be skipped:` : f.errors[0].reason}
                {f.format && <ul className="mt-1 text-xs">{f.errors.slice(0, 5).map(e => <li key={e.line}>Line {e.line}: {e.reason}</li>)}</ul>}
              </div>
            </div>
          )}
        </div>
      ))}

      {preview && (
        <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            <strong>{preview.added}</strong> new · {preview.duplicates} already imported · <strong>{newNeedingReview}</strong> will need a category
          </div>
          <button className="btn-success" disabled={saving || preview.added === 0} onClick={commit}>
            {saving ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Import {preview.added} transactions
          </button>
        </div>
      )}

      {error && <div className="alert alert-danger text-sm"><AlertTriangle className="h-4 w-4" />{error}</div>}
      {result && (
        <div className="alert alert-success text-sm">
          <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            Imported {result.added} transactions ({result.duplicates} skipped as already imported).
            {result.review > 0 && <> {result.review} need a category — <button className="underline font-medium" onClick={onDone}>review them</button>.</>}
          </div>
        </div>
      )}
    </div>
  )
}
