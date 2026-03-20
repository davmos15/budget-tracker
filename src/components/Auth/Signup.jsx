import { useState } from 'react'
import { createUserWithEmailAndPassword, updateProfile, signInWithPopup } from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, googleProvider, db } from '../../firebase'
import { Mail, Lock, User, AlertCircle, UserPlus, Wallet } from 'lucide-react'

export default function Signup({ onSwitchToLogin }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const createUserDocument = async (user) => {
    const userRef = doc(db, 'users', user.uid)
    await setDoc(userRef, {
      email: user.email,
      name: user.displayName || name,
      createdAt: serverTimestamp(),
      budgets: []
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password should be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(userCredential.user, { displayName: name })
      await createUserDocument(userCredential.user)
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignUp = async () => {
    setError('')
    setLoading(true)

    try {
      const result = await signInWithPopup(auth, googleProvider)
      await createUserDocument(result.user)
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-2.5 bg-gradient-brand rounded-xl text-white">
              <Wallet className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold text-gradient">Budget Tracker</h1>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Create your account</h2>
          <p className="mt-2 text-slate-500">Start managing your finances today</p>
        </div>

        <div className="card p-8">
          {error && (
            <div className="alert alert-danger mb-6">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="input-label">Full name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input pl-11"
                  placeholder="John Doe"
                  required
                />
              </div>
            </div>

            <div>
              <label className="input-label">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-11"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pl-11"
                    placeholder="Min 6 chars"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="input-label">Confirm</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input pl-11"
                    placeholder="Re-enter"
                    required
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus className="h-4.5 w-4.5" />
                  Create Account
                </>
              )}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-white text-slate-400">or</span>
              </div>
            </div>

            <button
              onClick={handleGoogleSignUp}
              disabled={loading}
              className="mt-4 btn-secondary w-full"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign up with Google
            </button>
          </div>

          <div className="mt-6 text-center text-sm">
            <span className="text-slate-500">Already have an account? </span>
            <button
              onClick={onSwitchToLogin}
              className="text-brand-600 hover:text-brand-800 font-semibold"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
