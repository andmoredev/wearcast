import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import UserMenu from './UserMenu'
import './Layout.css'

interface LayoutProps {
  children: ReactNode
}

function Layout({ children }: LayoutProps) {
  return (
    <div className="layout">
      <header className="layout-header">
        <Link to="/" className="layout-brand">WearCast</Link>
        <UserMenu />
      </header>
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}

export default Layout
