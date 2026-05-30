import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authService } from '../services/auth'
import { useAuth } from '../contexts/AuthContext'
import './Auth.css'

function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [confirmationCode, setConfirmationCode] = useState('')
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return 'Password must be at least 8 characters long'
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least one uppercase letter'
    }
    if (!/[a-z]/.test(pwd)) {
      return 'Password must contain at least one lowercase letter'
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must contain at least one number'
    }
    return null
  }

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    // Validate password strength
    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    setIsLoading(true)

    try {
      await authService.signUp(email, password)
      console.log('Signup successful, needs confirmation')
      setNeedsConfirmation(true)
    } catch (err: any) {
      console.error('Signup error:', err)

      if (err.code === 'UsernameExistsException') {
        setError('An account with this email already exists')
      } else if (err.code === 'InvalidPasswordException') {
        setError(err.message || 'Password does not meet requirements')
      } else if (err.code === 'InvalidParameterException') {
        setError('Invalid email or password format')
      } else {
        setError(err.message || 'Failed to create account. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmation = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await authService.confirmSignUp(email, confirmationCode)
      await authService.signIn(email, password)
      await refreshUser()
      console.log('Email confirmed and logged in')
      navigate('/')
    } catch (err: any) {
      console.error('Confirmation error:', err)

      if (err.code === 'CodeMismatchException') {
        setError('Invalid verification code. Please try again.')
      } else if (err.code === 'ExpiredCodeException') {
        setError('Verification code has expired. Click "Resend Code".')
      } else {
        setError(err.message || 'Failed to verify email. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendCode = async () => {
    setError('')
    setIsLoading(true)

    try {
      await authService.resendConfirmationCode(email)
      setError('Verification code resent! Check your email.')
    } catch (err: any) {
      console.error('Resend code error:', err)
      setError(err.message || 'Failed to resend code. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (needsConfirmation) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>Verify Your Email</h1>
          <p className="auth-subtitle">
            We've sent a verification code to <strong>{email}</strong>
          </p>

          <form onSubmit={handleConfirmation} className="auth-form">
            <div className="form-group">
              <label htmlFor="code">Verification Code</label>
              <input
                id="code"
                type="text"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                placeholder="Enter 6-digit code"
                required
                disabled={isLoading}
                maxLength={6}
                autoFocus
              />
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button
              type="submit"
              className="auth-button"
              disabled={isLoading}
            >
              {isLoading ? 'Verifying...' : 'Verify Email'}
            </button>

            <button
              type="button"
              className="auth-link-button"
              onClick={handleResendCode}
              disabled={isLoading}
            >
              Resend Code
            </button>

            <button
              type="button"
              className="auth-link-button"
              onClick={() => setNeedsConfirmation(false)}
              disabled={isLoading}
            >
              Back to Signup
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Create Account</h1>
        <p className="auth-subtitle">Sign up to start using AgentCore Chat</p>

        <form onSubmit={handleSignup} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              required
              disabled={isLoading}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              disabled={isLoading}
              autoComplete="new-password"
            />
            <small className="form-hint">
              Must be at least 8 characters with uppercase, lowercase, and number
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              required
              disabled={isLoading}
              autoComplete="new-password"
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button
            type="submit"
            className="auth-button"
            disabled={isLoading}
          >
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>

          <div className="auth-footer">
            <span>Already have an account?</span>
            <Link to="/login" className="auth-link">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Signup
