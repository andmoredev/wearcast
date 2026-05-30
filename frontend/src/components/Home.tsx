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
      <div className="home-header">
        <h1>AgentCore Chatbot</h1>
        <p>Ask me anything - I'm here to help</p>
      </div>

      <div className="home-chat-container">
        <form onSubmit={handleSubmit} className="home-chat-form">
          <div className="home-input-container">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="What would you like to know?"
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

      <div className="home-examples">
        <p className="examples-label">Try asking:</p>
        <div className="example-queries">
          <button
            className="example-query"
            onClick={() => setQuery("What can you help me with?")}
          >
            "What can you help me with?"
          </button>
          <button
            className="example-query"
            onClick={() => setQuery("Explain how to get started with AWS Bedrock")}
          >
            "Explain how to get started with AWS Bedrock"
          </button>
          <button
            className="example-query"
            onClick={() => setQuery("Help me brainstorm ideas for my project")}
          >
            "Help me brainstorm ideas for my project"
          </button>
        </div>
      </div>
    </div>
  )
}

export default Home
