import { useState, useEffect } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useFirebase } from '../contexts/FirebaseContext'
import { DollarSign, Receipt, CreditCard, Calculator, Settings, Info, Share2, ArrowLeft, Loader } from 'lucide-react'
import Dashboard from './Dashboard'
import Expenses from './Expenses'
import Salaries from './Salaries'
import BillAllocation from './BillAllocation'
import SettingsPage from './Settings'
import ShareBudgetModal from './ShareBudgetModal'

export default function BudgetApp({ onBack }) {
  const { user, budget, budgetId, budgetOwnerId, budgetLoading } = useFirebase()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [showShareModal, setShowShareModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Local state that mirrors Firebase data
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [people, setPeople] = useState([])
  const [salaries, setSalaries] = useState([])
  const [settings, setSettings] = useState({})
  const [lastTransfers, setLastTransfers] = useState({})
  const [staticAmounts, setStaticAmounts] = useState([])

  // Load data from Firebase budget
  useEffect(() => {
    if (budget) {
      setExpenses(budget.expenses || [])
      setCategories(budget.categories || [])
      setPeople(budget.people || [])
      setSalaries(budget.salaries || [])
      setSettings(budget.settings || {})
      setLastTransfers(budget.lastTransfers || {})
      setStaticAmounts(budget.staticAmounts || [])
    }
  }, [budget])

  // Save data to Firebase
  const saveToFirebase = async (field, data) => {
    if (!budgetId || !budgetOwnerId) return
    
    setSaving(true)
    try {
      await updateDoc(doc(db, 'users', budgetOwnerId, 'budgets', budgetId), {
        [field]: data
      })
    } catch (error) {
      console.error('Error saving to Firebase:', error)
      alert('Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Wrapper functions to update local state and Firebase
  const updateExpenses = (newExpenses) => {
    setExpenses(newExpenses)
    saveToFirebase('expenses', newExpenses)
  }

  const updateCategories = (newCategories) => {
    setCategories(newCategories)
    saveToFirebase('categories', newCategories)
  }

  const updatePeople = (newPeople) => {
    setPeople(newPeople)
    saveToFirebase('people', newPeople)
  }

  const updateSalaries = (newSalaries) => {
    setSalaries(newSalaries)
    saveToFirebase('salaries', newSalaries)
  }

  const updateSettings = (newSettings) => {
    setSettings(newSettings)
    saveToFirebase('settings', newSettings)
  }

  const updateLastTransfers = (newTransfers) => {
    setLastTransfers(newTransfers)
    saveToFirebase('lastTransfers', newTransfers)
  }

  const updateStaticAmounts = (newAmounts) => {
    setStaticAmounts(newAmounts)
    saveToFirebase('staticAmounts', newAmounts)
  }

  const tabs = [
    { id: 'dashboard', name: 'Dashboard', icon: DollarSign },
    { id: 'expenses', name: 'Expenses', icon: Receipt },
    { id: 'salaries', name: 'Salaries', icon: CreditCard },
    { id: 'allocation', name: 'Bill Allocation', icon: Calculator },
    { id: 'settings', name: 'Settings', icon: Settings }
  ]

  if (budgetLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading budget...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">{budget?.info?.name || 'Budget Tracker'}</h1>
              {saving && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader className="h-4 w-4 animate-spin" />
                  Saving...
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowShareModal(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Share2 className="h-4 w-4" />
                <span className="hidden sm:inline">Share</span>
              </button>
              <div className="relative group">
                <Info className="h-5 w-5 text-gray-400 hover:text-gray-600 cursor-help" />
                <div className="absolute right-0 top-8 w-64 p-3 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Track expenses, manage salaries, and allocate bills between multiple people.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <tab.icon className="h-5 w-5" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="py-6">
          {activeTab === 'dashboard' && (
            <Dashboard
              expenses={expenses}
              salaries={salaries}
              people={people}
              categories={categories}
              settings={settings}
            />
          )}
          {activeTab === 'expenses' && (
            <Expenses
              expenses={expenses}
              setExpenses={updateExpenses}
              categories={categories}
              setCategories={updateCategories}
              people={people}
              settings={settings}
            />
          )}
          {activeTab === 'salaries' && (
            <Salaries
              salaries={salaries}
              setSalaries={updateSalaries}
              people={people}
              setPeople={updatePeople}
              settings={settings}
            />
          )}
          {activeTab === 'allocation' && (
            <BillAllocation
              expenses={expenses}
              setExpenses={updateExpenses}
              salaries={salaries}
              people={people}
              categories={categories}
              settings={settings}
              lastTransfers={lastTransfers}
              setLastTransfers={updateLastTransfers}
              staticAmounts={staticAmounts}
              setStaticAmounts={updateStaticAmounts}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsPage
              settings={settings}
              setSettings={updateSettings}
              people={people}
              budgetCode={budget?.info?.code}
              budgetName={budget?.info?.name}
            />
          )}
        </div>
      </div>

      {showShareModal && (
        <ShareBudgetModal
          budgetCode={budget?.info?.code}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  )
}