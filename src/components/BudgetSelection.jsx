import { useState, useEffect } from 'react'
import { collection, doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { Plus, Share2, LogOut, Loader, FileText, Users } from 'lucide-react'

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
      
      // If user document doesn't exist, create it
      if (!userDoc.exists()) {
        console.log('Creating user document on budget load...')
        await setDoc(userDocRef, {
          email: user.email,
          name: user.displayName || user.email,
          budgets: []
        })
        setBudgets([])
        setLoading(false)
        return
      }
      
      const userData = userDoc.data()
      
      if (userData?.budgets?.length > 0) {
        const budgetPromises = userData.budgets.map(budgetId => 
          getDoc(doc(db, 'budgets', budgetId))
        )
        const budgetDocs = await Promise.all(budgetPromises)
        const budgetData = budgetDocs
          .filter(doc => doc.exists())
          .map((doc, index) => ({
            id: userData.budgets[index],
            ...doc.data()?.info
          }))
        setBudgets(budgetData)
      } else {
        setBudgets([])
      }
    } catch (error) {
      console.error('Error loading budgets:', error)
      console.error('User UID:', user.uid)
      console.error('User email:', user.email)
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
      // First check if user document exists
      const userDocRef = doc(db, 'users', user.uid)
      const userDoc = await getDoc(userDocRef)
      
      if (!userDoc.exists()) {
        console.log('Creating user document first...')
        await setDoc(userDocRef, {
          email: user.email,
          name: user.displayName || user.email,
          budgets: []
        })
      }
      
      const budgetCode = generateBudgetCode()
      const budgetId = `budget_${Date.now()}_${user.uid}`
      
      // Create budget document
      await setDoc(doc(db, 'budgets', budgetId), {
        info: {
          name,
          code: budgetCode,
          createdBy: user.uid,
          createdByName: user.displayName || user.email,
          members: [user.uid],
          admins: [user.uid], // Budget creator is default admin
          createdAt: serverTimestamp()
        },
        expenses: [],
        people: [
          { id: 1, name: user.displayName?.split(' ')[0] || 'Me', color: '#8b5cf6' }
        ],
        categories: [
          { id: 1, name: 'Transportation', color: '#ef4444' },
          { id: 2, name: 'Entertainment', color: '#f59e0b' },
          { id: 3, name: 'Health', color: '#10b981' },
          { id: 4, name: 'Utilities', color: '#6366f1' },
          { id: 5, name: 'Food', color: '#ec4899' },
          { id: 6, name: 'Other', color: '#8b5cf6' }
        ],
        settings: {
          dateFormat: 'MM/dd/yyyy',
          transferFrequency: 'fortnightly',
          currency: '$',
          peopleTransferSettings: {}
        },
        salaries: [],
        lastTransfers: {},
        staticAmounts: []
      })
      
      // Update user document
      await updateDoc(doc(db, 'users', user.uid), {
        budgets: arrayUnion(budgetId)
      })
      
      // Reload budgets
      await loadUserBudgets()
      setShowCreateModal(false)
    } catch (error) {
      console.error('Error creating budget:', error)
      console.error('Error details:', error.code, error.message)
      if (error.code === 'permission-denied') {
        setError('Permission denied. Please check Firestore rules.')
      } else {
        setError(`Failed to create budget: ${error.message}`)
      }
    }
  }

  const joinBudget = async (code) => {
    try {
      // Find budget by code
      const budgetsQuery = query(collection(db, 'budgets'), where('info.code', '==', code.toUpperCase()))
      const querySnapshot = await getDocs(budgetsQuery)
      
      if (querySnapshot.empty) {
        setError('Invalid budget code')
        return
      }
      
      const budgetDoc = querySnapshot.docs[0]
      const budgetId = budgetDoc.id
      const budgetData = budgetDoc.data()
      
      // Check if user is already a member using UID (unique per Google account)
      if (budgetData.info.members.includes(user.uid)) {
        setError('You are already a member of this budget')
        return
      }
      
      // First ensure user document exists
      const userDocRef = doc(db, 'users', user.uid)
      const userDoc = await getDoc(userDocRef)
      
      if (!userDoc.exists()) {
        console.log('Creating user document for joining user...')
        await setDoc(userDocRef, {
          email: user.email,
          name: user.displayName || user.email,
          budgets: []
        })
      }
      
      // Add user to budget members
      await updateDoc(doc(db, 'budgets', budgetId), {
        'info.members': arrayUnion(user.uid)
      })
      
      // Add budget to user's budgets
      await updateDoc(doc(db, 'users', user.uid), {
        budgets: arrayUnion(budgetId)
      })
      
      // Reload budgets
      await loadUserBudgets()
      setShowJoinModal(false)
      setError('')
    } catch (error) {
      console.error('Error joining budget:', error)
      console.error('User UID:', user.uid)
      console.error('User email:', user.email)
      setError(`Failed to join budget: ${error.message}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-2xl font-bold text-gray-900">Budget Tracker</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user.email}</span>
              <button
                onClick={onLogout}
                className="text-gray-500 hover:text-gray-700 flex items-center gap-2"
              >
                <LogOut className="h-5 w-5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Your Budgets</h2>
          <p className="text-gray-600">Select a budget to manage or create a new one</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {budgets.map((budget) => (
            <button
              key={budget.id}
              onClick={() => onSelectBudget(budget.id)}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 text-left"
            >
              <div className="flex items-start justify-between mb-4">
                <FileText className="h-8 w-8 text-blue-600" />
                <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded">
                  {budget.code}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{budget.name}</h3>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Users className="h-4 w-4" />
                <span>{budget.members?.length || 1} member{budget.members?.length !== 1 ? 's' : ''}</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Created by {budget.createdByName}
              </p>
            </button>
          ))}

          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg hover:bg-blue-100 hover:border-blue-400 transition-colors p-6 flex flex-col items-center justify-center gap-3"
          >
            <Plus className="h-8 w-8 text-blue-600" />
            <span className="text-blue-600 font-medium">Create New Budget</span>
          </button>

          <button
            onClick={() => setShowJoinModal(true)}
            className="bg-green-50 border-2 border-dashed border-green-300 rounded-lg hover:bg-green-100 hover:border-green-400 transition-colors p-6 flex flex-col items-center justify-center gap-3"
          >
            <Share2 className="h-8 w-8 text-green-600" />
            <span className="text-green-600 font-medium">Join Existing Budget</span>
          </button>
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-semibold mb-4">Create New Budget</h3>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Budget Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Family Budget 2024"
              required
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400"
            >
              {loading ? 'Creating...' : 'Create Budget'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors"
            >
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-semibold mb-4">Join Existing Budget</h3>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Budget Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-center text-lg"
              placeholder="ABC123"
              maxLength={6}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter the 6-character code shared by the budget owner
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-400"
            >
              {loading ? 'Joining...' : 'Join Budget'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}