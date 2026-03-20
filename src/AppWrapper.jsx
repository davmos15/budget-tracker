import { useState } from 'react'
import { useFirebase } from './contexts/FirebaseContext'
import Login from './components/Auth/Login'
import Signup from './components/Auth/Signup'
import BudgetSelection from './components/BudgetSelection'
import BudgetApp from './components/BudgetApp'
import { Loader, Wallet } from 'lucide-react'

export default function AppWrapper() {
  const { user, loading, selectBudget, budgetId, logout } = useFirebase()
  const [showLogin, setShowLogin] = useState(true)

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 rounded-2xl mb-4 animate-pulse-soft">
            <Wallet className="h-8 w-8 text-brand-600" />
          </div>
          <p className="text-slate-500 font-medium">Loading Budget Tracker...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return showLogin ? (
      <Login onSwitchToSignup={() => setShowLogin(false)} />
    ) : (
      <Signup onSwitchToLogin={() => setShowLogin(true)} />
    )
  }

  if (!budgetId) {
    return (
      <BudgetSelection
        user={user}
        onSelectBudget={selectBudget}
        onLogout={logout}
      />
    )
  }

  return <BudgetApp onBack={() => selectBudget(null)} />
}
