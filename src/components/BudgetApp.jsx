import { useState, useEffect } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useFirebase } from '../contexts/FirebaseContext'
import { LayoutDashboard, Receipt, CreditCard, Calculator, Settings, Share2, ArrowLeft, Loader, Wallet, ChevronRight } from 'lucide-react'
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

  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [people, setPeople] = useState([])
  const [salaries, setSalaries] = useState([])
  const [settings, setSettings] = useState({})
  const [lastTransfers, setLastTransfers] = useState({})
  const [staticAmounts, setStaticAmounts] = useState([])

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
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { id: 'expenses', name: 'Expenses', icon: Receipt },
    { id: 'salaries', name: 'Income', icon: CreditCard },
    { id: 'allocation', name: 'Bills', icon: Calculator },
    { id: 'settings', name: 'Settings', icon: Settings }
  ]

  if (budgetLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 rounded-2xl mb-4">
            <Loader className="h-8 w-8 animate-spin text-brand-600" />
          </div>
          <p className="text-slate-500 font-medium">Loading budget...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top header bar */}
      <div className="bg-gradient-brand shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/80 hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-white/20 rounded-lg">
                  <Wallet className="h-4 w-4 text-white" />
                </div>
                <h1 className="text-lg font-semibold text-white truncate max-w-[200px] sm:max-w-none">
                  {budget?.info?.name || 'Budget Tracker'}
                </h1>
              </div>
              {saving && (
                <div className="flex items-center gap-1.5 text-xs text-white/60">
                  <Loader className="h-3 w-3 animate-spin" />
                  Saving...
                </div>
              )}
            </div>
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-xl text-white text-sm transition-colors"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Share</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab navigation - desktop only (mobile uses bottom nav) */}
      <div className="hidden sm:block bg-white border-b border-slate-100 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={activeTab === tab.id ? 'nav-tab-active' : 'nav-tab-inactive'}
              >
                <tab.icon className="h-4 w-4" />
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="animate-fade-in">
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
              setSettings={updateSettings}
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

      {/* Mobile bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg sm:hidden z-40">
        <nav className="flex justify-around py-2 px-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
                activeTab === tab.id
                  ? 'text-brand-600'
                  : 'text-slate-400'
              }`}
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{tab.name}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Bottom padding for mobile nav */}
      <div className="h-20 sm:hidden" />

      {showShareModal && (
        <ShareBudgetModal
          budgetCode={budget?.info?.code}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  )
}
