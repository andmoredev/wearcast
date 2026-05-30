import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authService } from '../services/auth'
import { useAuth } from '../contexts/AuthContext'
import './Auth.css'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [confirmationCode, setConfirmationCode] = useState('')
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await authService.signIn(email, password)
      console.log('Login successful, refreshing user context...')
      await refreshUser()
      console.log('User context updated, redirecting...')
      navigate('/')
    } catch (err: any) {
      console.error('Login error:', err)

      if (err.code === 'UserNotConfirmedException') {
        setNeedsConfirmation(true)
        setError('Please verify your email. Enter the confirmation code sent to your email.')
      } else if (err.code === 'NotAuthorizedException') {
        setError('Incorrect email or password')
      } else if (err.code === 'UserNotFoundException') {
        setError('No account found with this email')
      } else {
        setError(err.message || 'Failed to sign in. Please try again.')
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
      navigate('/')
    } catch (err: any) {
      console.error('Confirmation error:', err)
      setError(err.message || 'Failed to confirm email. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendCode = async () => {
    setError('')
    setIsLoading(true)

    try {
      await authService.resendConfirmationCode(email)
      setError('Confirmation code resent! Check your email.')
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
            Enter the verification code sent to {email}
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
              Back to Login
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Welcome Back</h1>
        <p className="auth-subtitle">Sign in to continue to AgentCore Chat</p>

        <form onSubmit={handleLogin} className="auth-form">
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
              placeholder="Enter your password"
              required
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button
            type="submit"
            className="auth-button"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>

          <div className="auth-footer">
            <Link to="/forgot-password" className="auth-link">
              Forgot password?
            </Link>
            <span className="auth-divider">•</span>
            <Link to="/signup" className="auth-link">
              Create account
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Login
