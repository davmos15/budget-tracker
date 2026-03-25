import { useState, useEffect } from 'react'
import { collection, doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { Plus, Share2, LogOut, Loader, FileText, Users, Wallet, ArrowRight, X } from 'lucide-react'

export default function BudgetSelection({ user, onSelectBudget, onLogout }) {
  const [budgets, setBudgets] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadUserBudgets()
  }, [user])

  const loadUserBudgets = async () => {
    try {
      const userDocRef = doc(db, 'users', user.uid)
      const userDoc = await getDoc(userDocRef)

      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          email: user.email,
          name: user.displayName || user.email,
          sharedBudgets: []
        })
        setBudgets([])
        setLoading(false)
        return
      }

      const userData = userDoc.data()
      const allBudgets = []

      const ownBudgetsRef = collection(db, 'users', user.uid, 'budgets')
      const ownBudgetsSnapshot = await getDocs(ownBudgetsRef)

      ownBudgetsSnapshot.forEach(doc => {
        allBudgets.push({
          id: doc.id,
          ownerId: user.uid,
          isOwner: true,
          ...doc.data().info
        })
      })

      if (userData.sharedBudgets?.length > 0) {
        for (const sharedBudget of userData.sharedBudgets) {
          try {
            const budgetDoc = await getDoc(doc(db, 'users', sharedBudget.ownerId, 'budgets', sharedBudget.budgetId))
            if (budgetDoc.exists()) {
              const budgetData = budgetDoc.data()
              if (budgetData.info.members?.includes(user.uid)) {
                allBudgets.push({
                  id: sharedBudget.budgetId,
                  ownerId: sharedBudget.ownerId,
                  isOwner: false,
                  ...budgetData.info
                })
              }
            }
          } catch (error) {
            console.error('Error loading shared budget:', error)
          }
        }
      }

      setBudgets(allBudgets)
    } catch (error) {
      console.error('Error loading budgets:', error)
      setError('Failed to load budgets')
    } finally {
      setLoading(false)
    }
  }

  const generateBudgetCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  const createBudget = async (name) => {
    try {
      const userDocRef = doc(db, 'users', user.uid)
      const userDoc = await getDoc(userDocRef)

      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          email: user.email,
          name: user.displayName || user.email,
          budgets: []
        })
      }

      const budgetCode = generateBudgetCode()
      const budgetId = `budget_${Date.now()}_${user.uid}`

      await setDoc(doc(db, 'users', user.uid, 'budgets', budgetId), {
        info: {
          name,
          code: budgetCode,
          createdBy: user.uid,
          createdByName: user.displayName || user.email,
          members: [user.uid],
          admins: [user.uid],
          createdAt: serverTimestamp()
        },
        expenses: [],
        people: [
          { id: 1, name: user.displayName?.split(' ')[0] || 'Me', color: '#6366f1' }
        ],
        categories: [
          { id: 1, name: 'Transportation', color: '#ef4444' },
          { id: 2, name: 'Entertainment', color: '#f59e0b' },
          { id: 3, name: 'Health', color: '#10b981' },
          { id: 4, name: 'Utilities', color: '#6366f1' },
          { id: 5, name: 'Food', color: '#ec4899' },
          { id: 6, name: 'Subscriptions', color: '#8b5cf6' },
          { id: 7, name: 'Housing', color: '#0ea5e9' },
          { id: 8, name: 'Insurance', color: '#14b8a6' }
        ],
        settings: {
          dateFormat: 'dd/MM/yyyy',
          transferFrequency: 'fortnightly',
          currency: '$',
          peopleTransferSettings: {}
        },
        salaries: [],
        lastTransfers: {},
        staticAmounts: []
      })

      // Write code lookup doc for join functionality
      await setDoc(doc(db, 'budgetCodes', budgetCode), {
        ownerId: user.uid,
        budgetId: budgetId,
        name: name,
        createdAt: serverTimestamp()
      })

      setShowCreateModal(false)
      onSelectBudget({ budgetId, ownerId: user.uid, isNew: true })
    } catch (error) {
      console.error('Error creating budget:', error)
      if (error.code === 'permission-denied') {
        setError('Permission denied. Please check Firestore rules.')
      } else {
        setError(`Failed to create budget: ${error.message}`)
      }
    }
  }

  const joinBudget = async (code) => {
    try {
      // Look up budget via the budgetCodes collection
      const codeDoc = await getDoc(doc(db, 'budgetCodes', code.toUpperCase()))

      if (!codeDoc.exists()) {
        setError('Invalid budget code')
        return
      }

      const { ownerId: ownerUserId, budgetId } = codeDoc.data()

      // Verify the budget still exists
      const budgetRef = doc(db, 'users', ownerUserId, 'budgets', budgetId)
      const budgetDoc = await getDoc(budgetRef)

      if (!budgetDoc.exists()) {
        setError('This budget no longer exists')
        return
      }

      const budgetData = budgetDoc.data()

      if (budgetData.info.members.includes(user.uid)) {
        setError('You are already a member of this budget')
        return
      }

      await updateDoc(budgetRef, {
        'info.members': arrayUnion(user.uid)
      })

      await updateDoc(doc(db, 'users', user.uid), {
        sharedBudgets: arrayUnion({
          budgetId: budgetId,
          ownerId: ownerUserId,
          joinedAt: serverTimestamp()
        })
      })

      await loadUserBudgets()
      setShowJoinModal(false)
      setError('')
    } catch (error) {
      console.error('Error joining budget:', error)
      setError(`Failed to join budget: ${error.message}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 rounded-2xl mb-4">
            <Loader className="h-8 w-8 animate-spin text-brand-600" />
          </div>
          <p className="text-slate-500 font-medium">Loading your budgets...</p>
        </div>
      </div>
    )
  }

  const budgetColors = [
    'from-indigo-500 to-purple-600',
    'from-emerald-500 to-teal-600',
    'from-orange-500 to-rose-600',
    'from-cyan-500 to-blue-600',
    'from-pink-500 to-violet-600',
    'from-amber-500 to-orange-600',
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-brand">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                <Wallet className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-xl font-bold text-white">Budget Tracker</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-white/70 hidden sm:block">{user.email}</span>
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-white/90 text-sm transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* Hero section */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 pt-8">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            {budgets.length > 0 ? 'Your Budgets' : 'Get Started'}
          </h2>
          <p className="text-white/70 text-lg">
            {budgets.length > 0
              ? 'Select a budget to manage or create a new one'
              : 'Create your first budget to start tracking your finances'}
          </p>
        </div>
      </div>

      {/* Budget cards - pulled up into hero */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8">
        {error && (
          <div className="alert alert-danger mb-6">
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
          {budgets.map((budget, index) => (
            <button
              key={budget.id}
              onClick={() => onSelectBudget({budgetId: budget.id, ownerId: budget.ownerId})}
              className="card p-0 text-left group animate-slide-up overflow-hidden"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className={`h-2 bg-gradient-to-r ${budgetColors[index % budgetColors.length]}`} />
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-xl bg-gradient-to-br ${budgetColors[index % budgetColors.length]} text-white`}>
                    <FileText className="h-5 w-5" />
                  </div>
                  <span className="text-xs text-slate-400 font-mono bg-slate-50 px-2.5 py-1 rounded-lg">
                    {budget.code}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2 group-hover:text-brand-600 transition-colors">
                  {budget.name}
                </h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Users className="h-4 w-4" />
                    <span>{budget.members?.length || 1} member{budget.members?.length !== 1 ? 's' : ''}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-brand-500 group-hover:translate-x-1 transition-all" />
                </div>
                {!budget.isOwner && (
                  <div className="mt-3">
                    <span className="badge badge-info">Shared by {budget.createdByName}</span>
                  </div>
                )}
              </div>
            </button>
          ))}

          {/* Create new */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="card border-2 border-dashed border-brand-200 bg-brand-50/50 hover:bg-brand-50 hover:border-brand-300 p-6 flex flex-col items-center justify-center gap-3 min-h-[180px] transition-all group"
          >
            <div className="p-3 bg-brand-100 rounded-2xl group-hover:bg-brand-200 transition-colors">
              <Plus className="h-6 w-6 text-brand-600" />
            </div>
            <span className="text-brand-700 font-semibold">Create New Budget</span>
            <span className="text-brand-500 text-sm">Start fresh with a new budget</span>
          </button>

          {/* Join existing */}
          <button
            onClick={() => setShowJoinModal(true)}
            className="card border-2 border-dashed border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300 p-6 flex flex-col items-center justify-center gap-3 min-h-[180px] transition-all group"
          >
            <div className="p-3 bg-emerald-100 rounded-2xl group-hover:bg-emerald-200 transition-colors">
              <Share2 className="h-6 w-6 text-emerald-600" />
            </div>
            <span className="text-emerald-700 font-semibold">Join Existing Budget</span>
            <span className="text-emerald-500 text-sm">Enter a budget code to join</span>
          </button>
        </div>

        {/* Buy Me a Coffee */}
        <div className="flex justify-center mt-4 mb-8">
          <a
            href="https://www.buymeacoffee.com/nadavmoskow"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all hover:scale-105"
            style={{ backgroundColor: '#FFDD00', color: '#000000', fontFamily: 'Cookie, cursive', fontSize: '18px' }}
          >
            <img src="https://cdn.buymeacoffee.com/buttons/bmc-new-btn-logo.svg" alt="" className="h-5 w-5" />
            <span>Support this website</span>
          </a>
        </div>
      </div>

      {showCreateModal && (
        <CreateBudgetModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createBudget}
        />
      )}

      {showJoinModal && (
        <JoinBudgetModal
          onClose={() => {
            setShowJoinModal(false)
            setError('')
          }}
          onJoin={joinBudget}
          error={error}
        />
      )}
    </div>
  )
}

function CreateBudgetModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    await onCreate(name)
    setLoading(false)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Create New Budget</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <label className="input-label">Budget Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="e.g., Family Budget 2026"
              required
            />
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Creating...' : 'Create Budget'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function JoinBudgetModal({ onClose, onJoin, error }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    await onJoin(code)
    setLoading(false)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Join Existing Budget</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="alert alert-danger mb-4">
              <span className="text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label className="input-label">Budget Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="input font-mono text-center text-xl tracking-widest"
                placeholder="ABC123"
                maxLength={6}
                required
              />
              <p className="text-xs text-slate-400 mt-2">
                Enter the 6-character code shared by the budget owner
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="btn-success flex-1"
              >
                {loading ? 'Joining...' : 'Join Budget'}
              </button>
              <button type="button" onClick={onClose} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
