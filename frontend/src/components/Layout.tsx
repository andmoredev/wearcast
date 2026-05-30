import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import UserMenu from './UserMenu'
import './Layout.css'

interface LayoutProps {
  children: ReactNode
}

function Layout({ children }: LayoutProps) {
  const navigate = useNavigate()

  return (
    <div className="layout">
      <header className="layout-header">
        <a className="layout-brand" onClick={() => navigate('/')}>WearCast</a>
        <UserMenu />
      </header>
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}

export default Layout
