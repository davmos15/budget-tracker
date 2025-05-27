import { useState, useEffect } from 'react'
import { Save, Info, Globe, Calendar, RefreshCw, User, Share2, Trash2, AlertTriangle, Users, Shield, UserMinus } from 'lucide-react'
import { useFirebase } from '../contexts/FirebaseContext'
import { auth, db } from '../firebase'
import { deleteUser } from 'firebase/auth'
import { doc, getDoc, updateDoc, deleteDoc, arrayRemove, arrayUnion } from 'firebase/firestore'
import ShareBudgetModal from './ShareBudgetModal'

export default function SettingsPage({ settings, setSettings, people, budgetCode, budgetName }) {
  const { user, budget, budgetId } = useFirebase()
  const [localSettings, setLocalSettings] = useState({
    ...settings,
    peopleTransferSettings: settings.peopleTransferSettings || {}
  })
  const [showSaved, setShowSaved] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [showManageUsers, setShowManageUsers] = useState(false)
  const [budgetUsers, setBudgetUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  const dateFormats = [
    { value: 'MM/dd/yyyy', label: 'MM/DD/YYYY (US)', example: '05/27/2025' },
    { value: 'dd/MM/yyyy', label: 'DD/MM/YYYY (EU)', example: '27/05/2025' },
    { value: 'yyyy-MM-dd', label: 'YYYY-MM-DD (ISO)', example: '2025-05-27' },
    { value: 'dd-MM-yyyy', label: 'DD-MM-YYYY', example: '27-05-2025' },
    { value: 'MMM dd, yyyy', label: 'MMM DD, YYYY', example: 'May 27, 2025' },
    { value: 'dd MMM yyyy', label: 'DD MMM YYYY', example: '27 May 2025' }
  ]

  const transferFrequencies = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'fortnightly', label: 'Fortnightly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' }
  ]

  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const weekNumbers = ['1st', '2nd', '3rd', '4th', 'Last']

  const currencies = [
    { value: '$', label: '$' },
    { value: '€', label: '€' },
    { value: '£', label: '£' },
    { value: '¥', label: '¥' },
    { value: '₹', label: '₹' },
    { value: '₽', label: '₽' },
    { value: 'R', label: 'R' },
    { value: '₩', label: '₩' }
  ]

  const initializePersonSettings = (personId) => {
    if (!localSettings.peopleTransferSettings[personId]) {
      setLocalSettings({
        ...localSettings,
        peopleTransferSettings: {
          ...localSettings.peopleTransferSettings,
          [personId]: {
            frequency: 'fortnightly',
            type: 'dayOfWeek',
            dayOfWeek: 'Friday',
            dayOfMonth: 1,
            weekNumber: '1st',
            weekDayOfMonth: 'Monday'
          }
        }
      })
    }
  }

  const updatePersonTransferSettings = (personId, field, value) => {
    setLocalSettings({
      ...localSettings,
      peopleTransferSettings: {
        ...localSettings.peopleTransferSettings,
        [personId]: {
          ...localSettings.peopleTransferSettings[personId],
          [field]: value
        }
      }
    })
  }

  const handleSave = () => {
    setSettings(localSettings)
    setShowSaved(true)
    setTimeout(() => setShowSaved(false), 3000)
  }

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(localSettings)

  const getDateFormatExample = (format) => {
    const dateFormat = dateFormats.find(f => f.value === format)
    return dateFormat ? dateFormat.example : new Date().toLocaleDateString()
  }

  // Check if current user is admin
  const isAdmin = budget?.info?.admins?.includes(user.uid) || budget?.info?.createdBy === user.uid

  // Load budget users
  useEffect(() => {
    if (showManageUsers && budget?.info?.members) {
      loadBudgetUsers()
    }
  }, [showManageUsers, budget])

  const loadBudgetUsers = async () => {
    setLoadingUsers(true)
    try {
      const userPromises = budget.info.members.map(async (userId) => {
        const userDoc = await getDoc(doc(db, 'users', userId))
        const userData = userDoc.data()
        return {
          uid: userId,
          email: userData?.email || 'Unknown',
          name: userData?.name || userData?.email || 'Unknown',
          isAdmin: budget.info.admins?.includes(userId) || budget.info.createdBy === userId,
          isCreator: budget.info.createdBy === userId
        }
      })
      const users = await Promise.all(userPromises)
      setBudgetUsers(users)
    } catch (error) {
      console.error('Error loading users:', error)
    }
    setLoadingUsers(false)
  }

  const removeUserFromBudget = async (userId) => {
    if (!isAdmin || userId === user.uid) return
    
    try {
      await updateDoc(doc(db, 'budgets', budgetId), {
        'info.members': arrayRemove(userId),
        'info.admins': arrayRemove(userId)
      })
      
      await updateDoc(doc(db, 'users', userId), {
        budgets: arrayRemove(budgetId)
      })
      
      // Reload users
      loadBudgetUsers()
    } catch (error) {
      console.error('Error removing user:', error)
    }
  }

  const toggleAdminStatus = async (userId) => {
    if (!isAdmin || userId === budget.info.createdBy) return
    
    try {
      const isUserAdmin = budget.info.admins?.includes(userId)
      
      if (isUserAdmin) {
        await updateDoc(doc(db, 'budgets', budgetId), {
          'info.admins': arrayRemove(userId)
        })
      } else {
        await updateDoc(doc(db, 'budgets', budgetId), {
          'info.admins': arrayUnion(userId)
        })
      }
      
      // Reload the budget to get updated admin list
      window.location.reload()
    } catch (error) {
      console.error('Error updating admin status:', error)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteLoading(true)
    setDeleteError('')
    
    try {
      // Get all user's budgets
      const userDoc = await getDoc(doc(db, 'users', user.uid))
      const userData = userDoc.data()
      const userBudgets = userData?.budgets || []
      
      // Process each budget
      for (const budgetId of userBudgets) {
        const budgetRef = doc(db, 'budgets', budgetId)
        const budgetDoc = await getDoc(budgetRef)
        
        if (budgetDoc.exists()) {
          const budgetData = budgetDoc.data()
          const members = budgetData.info.members || []
          const createdBy = budgetData.info.createdBy
          
          if (createdBy === user.uid && members.length === 1) {
            // User is sole owner - delete the budget
            await deleteDoc(budgetRef)
          } else {
            // Remove user from budget members
            await updateDoc(budgetRef, {
              'info.members': arrayRemove(user.uid)
            })
            
            // If user was the creator, we might want to assign a new owner
            // For now, we'll leave the budget without changing ownership
          }
        }
      }
      
      // Delete user document
      await deleteDoc(doc(db, 'users', user.uid))
      
      // Delete Firebase Auth account
      await deleteUser(auth.currentUser)
      
      // The auth state listener will handle the redirect
    } catch (error) {
      console.error('Error deleting account:', error)
      if (error.code === 'auth/requires-recent-login') {
        setDeleteError('Please log out and log in again before deleting your account.')
      } else {
        setDeleteError('Failed to delete account. Please try again.')
      }
      setDeleteLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-lg shadow p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
          {showSaved && (
            <div className="text-sm text-green-600 flex items-center gap-2">
              <Save className="h-4 w-4" />
              Settings saved successfully
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-5 w-5 text-gray-400" />
              <label className="text-sm font-medium text-gray-700">Currency Symbol</label>
              <div className="relative group">
                <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                <div className="absolute left-0 top-6 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Select the currency symbol to display throughout the app
                </div>
              </div>
            </div>
            <select
              value={localSettings.currency}
              onChange={(e) => setLocalSettings({ ...localSettings, currency: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {currencies.map(currency => (
                <option key={currency.value} value={currency.value}>
                  {currency.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-5 w-5 text-gray-400" />
              <label className="text-sm font-medium text-gray-700">Date Format</label>
              <div className="relative group">
                <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                <div className="absolute left-0 top-6 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Choose how dates are displayed in the application
                </div>
              </div>
            </div>
            <select
              value={localSettings.dateFormat}
              onChange={(e) => setLocalSettings({ ...localSettings, dateFormat: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {dateFormats.map(format => (
                <option key={format.value} value={format.value}>
                  {format.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Example: {getDateFormatExample(localSettings.dateFormat)}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="h-5 w-5 text-gray-400" />
              <label className="text-sm font-medium text-gray-700">Default Transfer Frequency</label>
              <div className="relative group">
                <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                <div className="absolute left-0 top-6 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Default frequency for new people. Individual settings below override this.
                </div>
              </div>
            </div>
            <select
              value={localSettings.transferFrequency}
              onChange={(e) => setLocalSettings({ ...localSettings, transferFrequency: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {transferFrequencies.map(freq => (
                <option key={freq.value} value={freq.value}>
                  {freq.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t">
          <div className="flex items-center gap-2 mb-4">
            <User className="h-5 w-5 text-gray-400" />
            <h3 className="text-lg font-semibold">Transfer Settings by Person</h3>
          </div>
          
          <div className="space-y-6">
            {people.map(person => {
              if (!localSettings.peopleTransferSettings[person.id]) {
                initializePersonSettings(person.id)
              }
              const personSettings = localSettings.peopleTransferSettings[person.id]
              
              return (
                <div key={person.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: person.color }} />
                    <h4 className="font-medium">{person.name}</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                      <select
                        value={personSettings?.frequency || 'fortnightly'}
                        onChange={(e) => updatePersonTransferSettings(person.id, 'frequency', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {transferFrequencies.map(freq => (
                          <option key={freq.value} value={freq.value}>
                            {freq.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Transfer On</label>
                      <select
                        value={personSettings?.type || 'dayOfWeek'}
                        onChange={(e) => updatePersonTransferSettings(person.id, 'type', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="dayOfWeek">Specific Day of Week</option>
                        <option value="dayOfMonth">Specific Day of Month</option>
                        <option value="weekDayOfMonth">Specific Week & Day of Month</option>
                      </select>
                    </div>

                    {personSettings?.type === 'dayOfWeek' && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
                        <select
                          value={personSettings?.dayOfWeek || 'Friday'}
                          onChange={(e) => updatePersonTransferSettings(person.id, 'dayOfWeek', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {weekDays.map(day => (
                            <option key={day} value={day}>{day}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {personSettings?.type === 'dayOfMonth' && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Day of Month (1-28)</label>
                        <input
                          type="number"
                          min="1"
                          max="28"
                          value={personSettings?.dayOfMonth || 1}
                          onChange={(e) => updatePersonTransferSettings(person.id, 'dayOfMonth', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}

                    {personSettings?.type === 'weekDayOfMonth' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Week</label>
                          <select
                            value={personSettings?.weekNumber || '1st'}
                            onChange={(e) => updatePersonTransferSettings(person.id, 'weekNumber', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {weekNumbers.map(week => (
                              <option key={week} value={week}>{week}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                          <select
                            value={personSettings?.weekDayOfMonth || 'Monday'}
                            onChange={(e) => updatePersonTransferSettings(person.id, 'weekDayOfMonth', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {weekDays.map(day => (
                              <option key={day} value={day}>{day}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mt-2">
                    Example: {personSettings?.frequency} on{' '}
                    {personSettings?.type === 'dayOfWeek' && `every ${personSettings?.dayOfWeek}`}
                    {personSettings?.type === 'dayOfMonth' && `the ${personSettings?.dayOfMonth}${personSettings?.dayOfMonth === 1 ? 'st' : personSettings?.dayOfMonth === 2 ? 'nd' : personSettings?.dayOfMonth === 3 ? 'rd' : 'th'} of each month`}
                    {personSettings?.type === 'weekDayOfMonth' && `the ${personSettings?.weekNumber} ${personSettings?.weekDayOfMonth} of each month`}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t">
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={`w-full py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
              hasChanges
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Save className="h-4 w-4" />
            Save Settings
          </button>
        </div>
      </div>

      {budgetCode && (
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Budget Sharing</h3>
            <button
              onClick={() => setShowShareModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Share2 className="h-4 w-4" />
              Share Budget
            </button>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-2">Share this code with others to give them access to this budget:</p>
            <div className="flex items-center gap-4">
              <div className="text-2xl font-mono font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded">
                {budgetCode}
              </div>
              <div className="text-sm text-gray-500">
                <p>Budget: {budgetName}</p>
                <p className="text-xs mt-1">Anyone with this code can join and edit this budget</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAdmin && budgetCode && (
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Shield className="h-5 w-5 text-gray-400" />
              Manage Users
            </h3>
            <button
              onClick={() => setShowManageUsers(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <Users className="h-4 w-4" />
              View Users
            </button>
          </div>
          
          <div className="text-sm text-gray-600">
            <p>As an admin, you can:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Remove users from the budget</li>
              <li>Promote users to admin role</li>
              <li>View all budget members</li>
            </ul>
          </div>
        </div>
      )}

      <div className="bg-blue-50 rounded-lg p-4 md:p-6">
        <h3 className="font-semibold text-blue-900 mb-2">About Budget Tracker</h3>
        <p className="text-sm text-blue-800 mb-4">
          This budget tracking application helps you manage expenses, track income from multiple sources, 
          and calculate fair bill allocations between multiple people.
        </p>
        
        <div className="space-y-2 text-sm text-blue-700">
          <p className="flex items-center gap-2">
            <span className="font-medium">Version:</span> 1.0.0
          </p>
          <p className="flex items-center gap-2">
            <span className="font-medium">Features:</span> Expense tracking, Income management, Bill allocation, Multi-person support
          </p>
        </div>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-lg p-4 md:p-6">
        <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </h3>
        <p className="text-sm text-red-800 mb-4">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Delete Account
        </button>
      </div>

      {showShareModal && (
        <ShareBudgetModal
          budgetCode={budgetCode}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {showDeleteModal && (
        <DeleteAccountModal
          onClose={() => {
            setShowDeleteModal(false)
            setDeleteError('')
          }}
          onConfirm={handleDeleteAccount}
          loading={deleteLoading}
          error={deleteError}
        />
      )}

      {showManageUsers && (
        <ManageUsersModal
          onClose={() => setShowManageUsers(false)}
          users={budgetUsers}
          loading={loadingUsers}
          currentUserId={user.uid}
          onRemoveUser={removeUserFromBudget}
          onToggleAdmin={toggleAdminStatus}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}

function DeleteAccountModal({ onClose, onConfirm, loading, error }) {
  const [confirmText, setConfirmText] = useState('')
  const canDelete = confirmText === 'DELETE'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-100 rounded-full">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Delete Account</h3>
        </div>
        
        <div className="space-y-4">
          <div className="text-sm text-gray-600 space-y-2">
            <p>This action will permanently delete:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Your account and all personal data</li>
              <li>All budgets where you are the sole owner</li>
              <li>Your access to shared budgets</li>
            </ul>
            <p className="font-semibold text-red-600 mt-3">This action cannot be undone!</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type DELETE to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Type DELETE here"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onConfirm}
              disabled={!canDelete || loading}
              className={`flex-1 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                canDelete && !loading
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete Account
                </>
              )}
            </button>
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors disabled:bg-gray-100 disabled:text-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ManageUsersModal({ onClose, users, loading, currentUserId, onRemoveUser, onToggleAdmin, isAdmin }) {
  const [confirmRemove, setConfirmRemove] = useState(null)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Users className="h-5 w-5" />
            Budget Members
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8">
              <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-gray-600">Loading users...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.uid} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{user.name}</p>
                        {user.isCreator && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Creator</span>
                        )}
                        {user.isAdmin && !user.isCreator && (
                          <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">Admin</span>
                        )}
                        {user.uid === currentUserId && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">You</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{user.email}</p>
                    </div>
                    
                    {isAdmin && user.uid !== currentUserId && (
                      <div className="flex items-center gap-2">
                        {!user.isCreator && (
                          <button
                            onClick={() => onToggleAdmin(user.uid)}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 ${
                              user.isAdmin
                                ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                          >
                            <Shield className="h-3 w-3" />
                            {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                          </button>
                        )}
                        
                        {confirmRemove === user.uid ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-red-600">Remove?</span>
                            <button
                              onClick={() => {
                                onRemoveUser(user.uid)
                                setConfirmRemove(null)
                              }}
                              className="px-2 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmRemove(null)}
                              className="px-2 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmRemove(user.uid)}
                            className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded-lg hover:bg-red-200 transition-colors flex items-center gap-1"
                          >
                            <UserMinus className="h-3 w-3" />
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t">
          <button
            onClick={onClose}
            className="w-full bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}