import { useState, useEffect } from 'react'
import { Save, Globe, Calendar, RefreshCw, User, Share2, Trash2, AlertTriangle, Users, Shield, UserMinus, Check, X } from 'lucide-react'
import { useFirebase } from '../contexts/FirebaseContext'
import { auth, db } from '../firebase'
import { deleteUser } from 'firebase/auth'
import { doc, getDoc, updateDoc, deleteDoc, arrayRemove, arrayUnion, collection, getDocs } from 'firebase/firestore'
import ShareBudgetModal from './ShareBudgetModal'

export default function SettingsPage({ settings, setSettings, people, budgetCode, budgetName, onBack }) {
  const { user, budget, budgetId, budgetOwnerId } = useFirebase()
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
  const [showDeleteBudgetModal, setShowDeleteBudgetModal] = useState(false)
  const [deleteBudgetLoading, setDeleteBudgetLoading] = useState(false)
  const [deleteBudgetError, setDeleteBudgetError] = useState('')
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
    { value: '₩', label: '₩' },
    { value: 'NZ$', label: 'NZ$' },
    { value: 'C$', label: 'C$' }
  ]

  // Initialize transfer settings for any people that don't have them yet
  useEffect(() => {
    const pts = localSettings.peopleTransferSettings || {}
    const missing = people.filter(p => !pts[p.id])
    if (missing.length > 0) {
      const updated = { ...pts }
      missing.forEach(p => {
        updated[p.id] = {
          frequency: 'fortnightly',
          type: 'dayOfWeek',
          dayOfWeek: 'Friday',
          dayOfMonth: 1,
          weekNumber: '1st',
          weekDayOfMonth: 'Monday'
        }
      })
      setLocalSettings(prev => ({ ...prev, peopleTransferSettings: updated }))
    }
  }, [people])

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

  const isAdmin = budget?.info?.admins?.includes(user.uid) || budget?.info?.createdBy === user.uid

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
      setBudgetUsers(await Promise.all(userPromises))
    } catch (error) {
      console.error('Error loading users:', error)
    }
    setLoadingUsers(false)
  }

  const removeUserFromBudget = async (userId) => {
    if (!isAdmin || userId === user.uid || !budgetOwnerId) return
    try {
      await updateDoc(doc(db, 'users', budgetOwnerId, 'budgets', budgetId), {
        'info.members': arrayRemove(userId),
        'info.admins': arrayRemove(userId)
      })
      const userDoc = await getDoc(doc(db, 'users', userId))
      if (userDoc.exists()) {
        const userData = userDoc.data()
        const updatedSharedBudgets = (userData.sharedBudgets || []).filter(
          sb => !(sb.budgetId === budgetId && sb.ownerId === budgetOwnerId)
        )
        await updateDoc(doc(db, 'users', userId), { sharedBudgets: updatedSharedBudgets })
      }
      loadBudgetUsers()
    } catch (error) {
      console.error('Error removing user:', error)
    }
  }

  const toggleAdminStatus = async (userId) => {
    if (!isAdmin || userId === budget.info.createdBy || !budgetOwnerId) return
    try {
      const isUserAdmin = budget.info.admins?.includes(userId)
      if (isUserAdmin) {
        await updateDoc(doc(db, 'users', budgetOwnerId, 'budgets', budgetId), {
          'info.admins': arrayRemove(userId)
        })
      } else {
        await updateDoc(doc(db, 'users', budgetOwnerId, 'budgets', budgetId), {
          'info.admins': arrayUnion(userId)
        })
      }
      // Reload user list to reflect changes
      await loadBudgetUsers()
    } catch (error) {
      console.error('Error updating admin status:', error)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid))
      const userData = userDoc.data()
      const ownBudgetsRef = collection(db, 'users', user.uid, 'budgets')
      const ownBudgetsSnapshot = await getDocs(ownBudgetsRef)
      for (const budgetDoc of ownBudgetsSnapshot.docs) {
        await deleteDoc(budgetDoc.ref)
      }
      if (userData?.sharedBudgets?.length > 0) {
        for (const sharedBudget of userData.sharedBudgets) {
          try {
            await updateDoc(doc(db, 'users', sharedBudget.ownerId, 'budgets', sharedBudget.budgetId), {
              'info.members': arrayRemove(user.uid),
              'info.admins': arrayRemove(user.uid)
            })
          } catch (error) {
            console.error('Error removing user from shared budget:', error)
          }
        }
      }
      await deleteDoc(doc(db, 'users', user.uid))
      await deleteUser(auth.currentUser)
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

  const handleDeleteBudget = async () => {
    setDeleteBudgetLoading(true)
    setDeleteBudgetError('')
    try {
      const isOwner = budget?.info?.createdBy === user.uid
      if (isOwner) {
        // Delete the budget doc
        await deleteDoc(doc(db, 'users', user.uid, 'budgets', budgetId))
        // Delete the budget code lookup
        if (budget?.info?.code) {
          try {
            await deleteDoc(doc(db, 'budgetCodes', budget.info.code))
          } catch (e) {
            // Ignore if code doc doesn't exist
          }
        }
        // Remove from all members' sharedBudgets
        const members = budget?.info?.members || []
        for (const memberId of members) {
          if (memberId === user.uid) continue
          try {
            const memberDoc = await getDoc(doc(db, 'users', memberId))
            if (memberDoc.exists()) {
              const memberData = memberDoc.data()
              const updated = (memberData.sharedBudgets || []).filter(
                sb => !(sb.budgetId === budgetId && sb.ownerId === user.uid)
              )
              await updateDoc(doc(db, 'users', memberId), { sharedBudgets: updated })
            }
          } catch (e) {
            console.error('Error cleaning up member:', e)
          }
        }
      } else {
        // Not owner - just leave the budget
        await updateDoc(doc(db, 'users', budgetOwnerId, 'budgets', budgetId), {
          'info.members': arrayRemove(user.uid),
          'info.admins': arrayRemove(user.uid)
        })
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (userDoc.exists()) {
          const userData = userDoc.data()
          const updated = (userData.sharedBudgets || []).filter(
            sb => !(sb.budgetId === budgetId && sb.ownerId === budgetOwnerId)
          )
          await updateDoc(doc(db, 'users', user.uid), { sharedBudgets: updated })
        }
      }
      onBack()
    } catch (error) {
      console.error('Error deleting budget:', error)
      setDeleteBudgetError('Failed to delete budget. Please try again.')
      setDeleteBudgetLoading(false)
    }
  }

  const getOrdinalSuffix = (n) => {
    if (n === 1) return 'st'
    if (n === 2) return 'nd'
    if (n === 3) return 'rd'
    return 'th'
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Save bar */}
      {hasChanges && (
        <div className="sticky top-16 z-20 animate-slide-down">
          <div className="card p-3 flex items-center justify-between bg-brand-50 border-brand-200">
            <p className="text-sm text-brand-700 font-medium">You have unsaved changes</p>
            <button onClick={handleSave} className="btn-primary text-sm py-1.5">
              <Save className="h-4 w-4" />
              Save Settings
            </button>
          </div>
        </div>
      )}

      {showSaved && (
        <div className="alert alert-success animate-slide-down">
          <Check className="h-4 w-4" />
          <span className="text-sm font-medium">Settings saved successfully</span>
        </div>
      )}

      {/* General Settings */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-6">General Settings</h2>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-slate-400" />
              <label className="input-label mb-0">Currency Symbol</label>
            </div>
            <select
              value={localSettings.currency}
              onChange={(e) => setLocalSettings({ ...localSettings, currency: e.target.value })}
              className="input"
            >
              {currencies.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <label className="input-label mb-0">Date Format</label>
            </div>
            <select
              value={localSettings.dateFormat}
              onChange={(e) => setLocalSettings({ ...localSettings, dateFormat: e.target.value })}
              className="input"
            >
              {dateFormats.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <p className="text-xs text-slate-400 mt-1.5">
              Preview: {getDateFormatExample(localSettings.dateFormat)}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="h-4 w-4 text-slate-400" />
              <label className="input-label mb-0">Default Transfer Frequency</label>
            </div>
            <select
              value={localSettings.transferFrequency}
              onChange={(e) => setLocalSettings({ ...localSettings, transferFrequency: e.target.value })}
              className="input"
            >
              {transferFrequencies.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Transfer Settings by Person */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-6">
          <User className="h-5 w-5 text-slate-400" />
          <h3 className="text-lg font-semibold text-slate-900">Transfer Schedule by Person</h3>
        </div>

        <div className="space-y-4">
          {people.map(person => {
            const ps = localSettings.peopleTransferSettings?.[person.id]
            if (!ps) return null

            return (
              <div key={person.id} className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-6 h-6 rounded-full" style={{ backgroundColor: person.color }} />
                  <h4 className="font-medium text-slate-900">{person.name}</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="input-label text-xs">Frequency</label>
                    <select
                      value={ps.frequency || 'fortnightly'}
                      onChange={(e) => updatePersonTransferSettings(person.id, 'frequency', e.target.value)}
                      className="input text-sm py-2"
                    >
                      {transferFrequencies.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="input-label text-xs">Transfer On</label>
                    <select
                      value={ps.type || 'dayOfWeek'}
                      onChange={(e) => updatePersonTransferSettings(person.id, 'type', e.target.value)}
                      className="input text-sm py-2"
                    >
                      <option value="dayOfWeek">Day of Week</option>
                      <option value="dayOfMonth">Day of Month</option>
                      <option value="weekDayOfMonth">Week & Day of Month</option>
                    </select>
                  </div>

                  {ps.type === 'dayOfWeek' && (
                    <div className="md:col-span-2">
                      <label className="input-label text-xs">Day</label>
                      <select
                        value={ps.dayOfWeek || 'Friday'}
                        onChange={(e) => updatePersonTransferSettings(person.id, 'dayOfWeek', e.target.value)}
                        className="input text-sm py-2"
                      >
                        {weekDays.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  )}

                  {ps.type === 'dayOfMonth' && (
                    <div className="md:col-span-2">
                      <label className="input-label text-xs">Day of Month (1-28)</label>
                      <input
                        type="number"
                        min="1"
                        max="28"
                        value={ps.dayOfMonth || 1}
                        onChange={(e) => updatePersonTransferSettings(person.id, 'dayOfMonth', parseInt(e.target.value))}
                        className="input text-sm py-2"
                      />
                    </div>
                  )}

                  {ps.type === 'weekDayOfMonth' && (
                    <>
                      <div>
                        <label className="input-label text-xs">Week</label>
                        <select
                          value={ps.weekNumber || '1st'}
                          onChange={(e) => updatePersonTransferSettings(person.id, 'weekNumber', e.target.value)}
                          className="input text-sm py-2"
                        >
                          {weekNumbers.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="input-label text-xs">Day</label>
                        <select
                          value={ps.weekDayOfMonth || 'Monday'}
                          onChange={(e) => updatePersonTransferSettings(person.id, 'weekDayOfMonth', e.target.value)}
                          className="input text-sm py-2"
                        >
                          {weekDays.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                </div>

                <p className="text-xs text-slate-400 mt-3">
                  {ps.frequency} on{' '}
                  {ps.type === 'dayOfWeek' && `every ${ps.dayOfWeek}`}
                  {ps.type === 'dayOfMonth' && `the ${ps.dayOfMonth}${getOrdinalSuffix(ps.dayOfMonth)} of each month`}
                  {ps.type === 'weekDayOfMonth' && `the ${ps.weekNumber} ${ps.weekDayOfMonth} of each month`}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Budget Sharing */}
      {budgetCode && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Budget Sharing</h3>
            <button onClick={() => setShowShareModal(true)} className="btn-primary text-sm">
              <Share2 className="h-4 w-4" />
              Share
            </button>
          </div>
          <div className="bg-brand-50 rounded-xl p-4 flex items-center gap-4">
            <div className="text-2xl font-mono font-bold text-brand-600 bg-white px-5 py-2.5 rounded-xl shadow-sm tracking-widest">
              {budgetCode}
            </div>
            <div>
              <p className="text-sm font-medium text-brand-800">{budgetName}</p>
              <p className="text-xs text-brand-600 mt-0.5">Anyone with this code can join</p>
            </div>
          </div>
        </div>
      )}

      {/* Manage Users */}
      {isAdmin && budgetCode && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-slate-400" />
              <h3 className="text-lg font-semibold text-slate-900">Manage Users</h3>
            </div>
            <button onClick={() => setShowManageUsers(true)} className="btn-secondary text-sm">
              <Users className="h-4 w-4" />
              View Users
            </button>
          </div>
          <p className="text-sm text-slate-500">Remove users, promote to admin, or view all budget members.</p>
        </div>
      )}

      {/* Danger Zone */}
      <div className="card border-rose-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-rose-500" />
          <h3 className="font-semibold text-rose-900">Danger Zone</h3>
        </div>

        <div className="space-y-4">
          <div className="bg-rose-50 rounded-xl p-4">
            <p className="text-sm font-medium text-rose-800 mb-1">
              {budget?.info?.createdBy === user.uid ? 'Delete this budget' : 'Leave this budget'}
            </p>
            <p className="text-xs text-rose-600 mb-3">
              {budget?.info?.createdBy === user.uid
                ? 'This will permanently delete the budget and remove all members.'
                : 'You will be removed from this shared budget.'}
            </p>
            <button onClick={() => setShowDeleteBudgetModal(true)} className="btn-danger text-sm">
              <Trash2 className="h-4 w-4" />
              {budget?.info?.createdBy === user.uid ? 'Delete Budget' : 'Leave Budget'}
            </button>
          </div>

          <div className="bg-rose-50 rounded-xl p-4">
            <p className="text-sm font-medium text-rose-800 mb-1">Delete your account</p>
            <p className="text-xs text-rose-600 mb-3">
              Once you delete your account, there is no going back.
            </p>
            <button onClick={() => setShowDeleteModal(true)} className="btn-danger text-sm">
              <Trash2 className="h-4 w-4" />
              Delete Account
            </button>
          </div>
        </div>
      </div>

      {showShareModal && (
        <ShareBudgetModal budgetCode={budgetCode} onClose={() => setShowShareModal(false)} />
      )}

      {showDeleteModal && (
        <DeleteAccountModal
          onClose={() => { setShowDeleteModal(false); setDeleteError('') }}
          onConfirm={handleDeleteAccount}
          loading={deleteLoading}
          error={deleteError}
        />
      )}

      {showDeleteBudgetModal && (
        <DeleteBudgetModal
          onClose={() => { setShowDeleteBudgetModal(false); setDeleteBudgetError('') }}
          onConfirm={handleDeleteBudget}
          loading={deleteBudgetLoading}
          error={deleteBudgetError}
          isOwner={budget?.info?.createdBy === user.uid}
          budgetName={budgetName}
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
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="p-2 bg-rose-100 rounded-xl">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">Delete Account</h3>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-sm text-slate-600 space-y-2">
            <p>This will permanently delete:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-slate-500">
              <li>Your account and all personal data</li>
              <li>All budgets where you are the sole owner</li>
              <li>Your access to shared budgets</li>
            </ul>
          </div>

          {error && <div className="alert alert-danger"><span className="text-sm">{error}</span></div>}

          <div>
            <label className="input-label">Type DELETE to confirm</label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="input"
              placeholder="Type DELETE here"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onConfirm}
              disabled={!canDelete || loading}
              className="btn-danger flex-1"
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
            <button onClick={onClose} disabled={loading} className="btn-secondary flex-1">
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
    <div className="modal-overlay">
      <div className="modal-content max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-400" />
            <h3 className="text-lg font-semibold text-slate-900">Budget Members</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="h-8 w-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-slate-500">Loading users...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((u) => (
                <div key={u.uid} className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900">{u.name}</p>
                        {u.isCreator && <span className="badge badge-info">Creator</span>}
                        {u.isAdmin && !u.isCreator && <span className="badge badge-brand">Admin</span>}
                        {u.uid === currentUserId && <span className="badge badge-success">You</span>}
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{u.email}</p>
                    </div>

                    {isAdmin && u.uid !== currentUserId && (
                      <div className="flex items-center gap-2">
                        {!u.isCreator && (
                          <button
                            onClick={() => onToggleAdmin(u.uid)}
                            className={`btn text-xs px-3 py-1.5 ${
                              u.isAdmin ? 'bg-brand-50 text-brand-700 hover:bg-brand-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            <Shield className="h-3 w-3" />
                            {u.isAdmin ? 'Remove Admin' : 'Make Admin'}
                          </button>
                        )}

                        {confirmRemove === u.uid ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-rose-600">Sure?</span>
                            <button
                              onClick={() => { onRemoveUser(u.uid); setConfirmRemove(null) }}
                              className="btn-danger text-xs px-2 py-1"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmRemove(null)}
                              className="btn-secondary text-xs px-2 py-1"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmRemove(u.uid)}
                            className="btn text-xs px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100"
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

        <div className="p-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary w-full">Close</button>
        </div>
      </div>
    </div>
  )
}

function DeleteBudgetModal({ onClose, onConfirm, loading, error, isOwner, budgetName }) {
  const [confirmText, setConfirmText] = useState('')
  const canDelete = confirmText === 'DELETE'

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="p-2 bg-rose-100 rounded-xl">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">
            {isOwner ? 'Delete Budget' : 'Leave Budget'}
          </h3>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-sm text-slate-600 space-y-2">
            {isOwner ? (
              <>
                <p>This will permanently delete <strong>{budgetName}</strong>:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-slate-500">
                  <li>All expenses, income, and settings</li>
                  <li>All members will lose access</li>
                  <li>The budget sharing code will stop working</li>
                </ul>
              </>
            ) : (
              <p>You will be removed from <strong>{budgetName}</strong> and lose access to all its data.</p>
            )}
          </div>

          {error && <div className="alert alert-danger"><span className="text-sm">{error}</span></div>}

          <div>
            <label className="input-label">Type DELETE to confirm</label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="input"
              placeholder="Type DELETE here"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onConfirm}
              disabled={!canDelete || loading}
              className="btn-danger flex-1"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {isOwner ? 'Deleting...' : 'Leaving...'}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  {isOwner ? 'Delete Budget' : 'Leave Budget'}
                </>
              )}
            </button>
            <button onClick={onClose} disabled={loading} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
