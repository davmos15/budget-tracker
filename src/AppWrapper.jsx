import { useState } from 'react'
import { useFirebase } from './contexts/FirebaseContext'
import Login from './components/Auth/Login'
import Signup from './components/Auth/Signup'
import BudgetSelection from './components/BudgetSelection'
import BudgetApp from './components/BudgetApp'
import { Loader } from 'lucide-react'

export default function AppWrapper() {
  const { user, loading, selectBudget, budgetId, logout } = useFirebase()
  const [showLogin, setShowLogin] = useState(true)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading Budget Tracker...</p>
        </div>
      </div>
    )
  }

  // Not authenticated - show login/signup
  if (!user) {
    return showLogin ? (
      <Login onSwitchToSignup={() => setShowLogin(false)} />
    ) : (
      <Signup onSwitchToLogin={() => setShowLogin(true)} />
    )
  }

  // Authenticated but no budget selected - show budget selection
  if (!budgetId) {
    return (
      <BudgetSelection
        user={user}
        onSelectBudget={selectBudget}
        onLogout={logout}
      />
    )
  }

  // Authenticated and budget selected - show main app
  return (
    <BudgetApp
      onBack={() => selectBudget(null)}
    />
  )
}