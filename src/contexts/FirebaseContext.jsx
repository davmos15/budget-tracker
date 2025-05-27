import { createContext, useContext, useState, useEffect } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'

const FirebaseContext = createContext({})

export function useFirebase() {
  return useContext(FirebaseContext)
}

export function FirebaseProvider({ children }) {
  const [user, setUser] = useState(null)
  const [budget, setBudget] = useState(null)
  const [budgetId, setBudgetId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [budgetLoading, setBudgetLoading] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!budgetId) {
      setBudget(null)
      return
    }

    setBudgetLoading(true)
    const unsubscribe = onSnapshot(
      doc(db, 'budgets', budgetId),
      (doc) => {
        if (doc.exists()) {
          setBudget({ id: doc.id, ...doc.data() })
        }
        setBudgetLoading(false)
      },
      (error) => {
        console.error('Error listening to budget:', error)
        setBudgetLoading(false)
      }
    )

    return unsubscribe
  }, [budgetId])

  const selectBudget = (id) => {
    setBudgetId(id)
  }

  const logout = async () => {
    try {
      await signOut(auth)
      setBudget(null)
      setBudgetId(null)
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const value = {
    user,
    budget,
    budgetId,
    loading,
    budgetLoading,
    selectBudget,
    logout
  }

  return (
    <FirebaseContext.Provider value={value}>
      {children}
    </FirebaseContext.Provider>
  )
}