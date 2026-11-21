import { useEffect, useMemo, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { useFirebase } from '../contexts/FirebaseContext'
import { monthsRef, configRef } from '../lib/txStore'

/**
 * Live imported transactions + import settings for the open budget.
 * Returns { loading, error, txns (newest first), byMonth, config: { accounts, rules } }.
 */
export function useLedger() {
  const { budgetId, budgetOwnerId } = useFirebase()
  const [byMonth, setByMonth] = useState({})
  const [config, setConfig] = useState({ accounts: [], rules: [] })
  const [loaded, setLoaded] = useState({ months: false, config: false })
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!budgetId || !budgetOwnerId) return
    setLoaded({ months: false, config: false })
    const fail = (e) => { setError(e.code === 'permission-denied' ? 'You don\'t have access to this budget\'s transactions.' : 'Could not load transactions.') }
    const unMonths = onSnapshot(monthsRef(budgetOwnerId, budgetId), (snap) => {
      const next = {}
      snap.forEach(d => { next[d.id] = d.data().transactions || [] })
      setByMonth(next)
      setLoaded(l => ({ ...l, months: true }))
    }, fail)
    const unConfig = onSnapshot(configRef(budgetOwnerId, budgetId), (snap) => {
      const d = snap.exists() ? snap.data() : {}
      setConfig({ accounts: d.accounts || [], rules: d.rules || [] })
      setLoaded(l => ({ ...l, config: true }))
    }, fail)
    return () => { unMonths(); unConfig() }
  }, [budgetId, budgetOwnerId])

  const txns = useMemo(
    () => Object.values(byMonth).flat().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [byMonth]
  )

  return { loading: !(loaded.months && loaded.config) && !error, error, txns, byMonth, config }
}
