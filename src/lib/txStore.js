// Firestore storage for imported transactions (app side).
//
//   users/{owner}/budgets/{budget}/txMonths/{YYYY-MM}  { month, transactions, updatedAt }
//   users/{owner}/budgets/{budget}/txMeta/config       { accounts, rules, billLinks, billDismissed }
//
// Only budget members can read or write these (see firestore.rules).

import { collection, doc, writeBatch, setDoc, getDocs, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { changedMonths } from './import/ledger'

const budgetPath = (ownerId, budgetId) => ['users', ownerId, 'budgets', budgetId]

export const monthsRef = (ownerId, budgetId) => collection(db, ...budgetPath(ownerId, budgetId), 'txMonths')
export const configRef = (ownerId, budgetId) => doc(db, ...budgetPath(ownerId, budgetId), 'txMeta', 'config')

// Firestore rejects undefined values
const clean = (t) => Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined))

/** Write whole months ({ 'YYYY-MM': txns }). Empty months are deleted. */
export async function saveMonths(ownerId, budgetId, byMonth) {
  const entries = Object.entries(byMonth)
  // Small batches: a commit is capped at 10 MB and a month can be ~100 KB
  for (let i = 0; i < entries.length; i += 25) {
    const batch = writeBatch(db)
    for (const [month, txns] of entries.slice(i, i + 25)) {
      const ref = doc(monthsRef(ownerId, budgetId), month)
      if (txns.length === 0) batch.delete(ref)
      else batch.set(ref, { month, transactions: txns.map(clean), updatedAt: serverTimestamp() })
    }
    await batch.commit()
  }
}

export async function saveConfig(ownerId, budgetId, config) {
  const data = { updatedAt: serverTimestamp() }
  if (config.accounts) data.accounts = config.accounts.map(clean)
  if (config.rules) data.rules = config.rules.map(clean)
  // Bills check: { expenseId: seriesKey } links and series keys marked "not a bill"
  if (config.billLinks) data.billLinks = config.billLinks
  if (config.billDismissed) data.billDismissed = config.billDismissed
  await setDoc(configRef(ownerId, budgetId), data, { merge: true })
}

/** Remove every imported transaction and setting (used when a budget is deleted). */
export async function deleteLedger(ownerId, budgetId) {
  const months = await getDocs(monthsRef(ownerId, budgetId))
  const refs = [...months.docs.map(d => d.ref), configRef(ownerId, budgetId)]
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db)
    refs.slice(i, i + 400).forEach(r => batch.delete(r))
    await batch.commit()
  }
}

/** Save only the months that differ from what's stored. Returns how many were written. */
export async function saveLedger(ownerId, budgetId, storedByMonth, nextTxns) {
  const changed = changedMonths(storedByMonth, nextTxns)
  await saveMonths(ownerId, budgetId, changed)
  return Object.keys(changed).length
}
