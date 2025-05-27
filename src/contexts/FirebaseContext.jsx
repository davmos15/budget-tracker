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
  const [budgetOwnerId, setBudgetOwnerId] = useState(null)
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
    if (!budgetId || !budgetOwnerId || !user) {
      setBudget(null)
      return
    }

    setBudgetLoading(true)
    const unsubscribe = onSnapshot(
      doc(db, 'users', budgetOwnerId, 'budgets', budgetId),
      (doc) => {
        if (doc.exists()) {
          setBudget({ id: doc.id, ownerId: budgetOwnerId, ...doc.data() })
        }
        setBudgetLoading(false)
      },
      (error) => {
        console.error('Error listening to budget:', error)
        setBudgetLoading(false)
      }
    )

    return unsubscribe
  }, [budgetId, budgetOwnerId, user])

  const selectBudget = ({budgetId, ownerId}) => {
    setBudgetId(budgetId)
    setBudgetOwnerId(ownerId)
  }

  const logout = async () => {
    try {
      await signOut(auth)
      setBudget(null)
      setBudgetId(null)
      setBudgetOwnerId(null)
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const value = {
    user,
    budget,
    budgetId,
    budgetOwnerId,
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