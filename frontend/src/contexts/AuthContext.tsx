import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authService, UserInfo } from '../services/auth'

interface AuthContextType {
  user: UserInfo | null
  isLoading: boolean
  isAuthenticated: boolean
  signOut: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = async () => {
    try {
      const isAuth = await authService.isAuthenticated()
      if (isAuth) {
        const userInfo = await authService.getUserInfo()
        setUser(userInfo)
      } else {
        setUser(null)
      }
    } catch (error) {
      console.error('Failed to refresh user:', error)
      setUser(null)
    }
  }

  useEffect(() => {
    const checkAuth = async () => {
      await refreshUser()
      setIsLoading(false)
    }

    checkAuth()
  }, [])

  const signOut = () => {
    authService.signOut()
    setUser(null)
  }

  const value = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    signOut,
    refreshUser
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
