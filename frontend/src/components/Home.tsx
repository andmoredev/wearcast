import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function Home() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!query.trim()) return

    // Generate a session ID and navigate to chat
    const sessionId = crypto.randomUUID()
    navigate(`/chat/${sessionId}`, { state: { initialQuery: query.trim() } })
    setQuery('')
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  return (
    <div className="home">
      <div className="home-header animate-fade-in">
        <span className="home-icon">&#9925;</span>
        <h1>WearCast</h1>
        <p>Your AI-powered weather styling assistant</p>
      </div>

      <div className="home-chat-container animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <form onSubmit={handleSubmit} className="home-chat-form">
          <div className="home-input-container">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about a city - e.g. What should I wear in Indianapolis today?"
              className="home-chat-input"
              rows={3}
            />
            <button
              type="submit"
              disabled={!query.trim()}
              className="home-send-button"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m22 2-7 20-4-9-9-4z"/>
                <path d="M22 2 11 13"/>
              </svg>
            </button>
          </div>
        </form>
      </div>

      <div className="home-examples animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <p className="examples-label">Try asking:</p>
        <div className="example-queries">
          <button
            className="example-query"
            onClick={() => setQuery("What should I wear in Indianapolis today?")}
          >
            &#127782; Indianapolis today
          </button>
          <button
            className="example-query"
            onClick={() => setQuery("What's the weather like in Chicago and how should I dress?")}
          >
            &#127783; Chicago outfit
          </button>
          <button
            className="example-query"
            onClick={() => setQuery("I'm heading to Seattle - do I need a rain jacket?")}
          >
            &#127746; Seattle rain check
          </button>
        </div>
      </div>
    </div>
  )
}

export default Home
