import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function Navigation() {
  const { user, isAuthenticated, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = () => {
    signOut()
    navigate('/login')
  }

  return (
    <nav className="navigation">
      <div className="nav-brand">
        <h2>WearCast</h2>
      </div>
      <div className="nav-links">
        {isAuthenticated ? (
          <>
            <Link to="/" className="nav-link">Home</Link>
            <Link to="/chat" className="nav-link">Chat</Link>
            <span className="nav-user">{user?.email}</span>
            <button onClick={handleSignOut} className="nav-button">
              Sign Out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="nav-link">Sign In</Link>
            <Link to="/signup" className="nav-link">Sign Up</Link>
          </>
        )}
      </div>
    </nav>
  )
}

export default Navigation
