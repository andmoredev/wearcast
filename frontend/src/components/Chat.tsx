import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { WebSocketService, StreamEvent } from '../services/websocket'
import { useAuth } from '../contexts/AuthContext'

interface Message {
  id: string
  text: string
  thinking?: string
  sender: 'user' | 'agent'
  timestamp: Date
  error?: boolean
  streaming?: boolean
}

function Chat() {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(urlSessionId || null)
  const [streamingText, setStreamingText] = useState('')
  const [thinkingText, setThinkingText] = useState('')
  const [currentTool, setCurrentTool] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const initialQuerySent = useRef(false)
  const wsServiceRef = useRef<WebSocketService | null>(null)

  // Generate a session ID if we don't have one
  useEffect(() => {
    if (!sessionId) {
      const newSessionId = crypto.randomUUID()
      setSessionId(newSessionId)
      navigate(`/chat/${newSessionId}`, { replace: true })
    }
  }, [sessionId, navigate])

  // Connect (or reconnect) the WebSocket, fetching a fresh presigned URL
  const connectWebSocket = async () => {
    if (!sessionId || !user) return

    try {
      setConnectionStatus('connecting')

      // Tear down any existing connection
      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect()
      }

      const wsService = new WebSocketService()
      wsServiceRef.current = wsService

      wsService.on('stream_event', handleStreamEvent)
      wsService.on('complete', handleComplete)
      wsService.on('error', handleError)
      wsService.on('close', handleClose)

      await wsService.connect(sessionId)

      setConnectionStatus('connected')
      console.log('WebSocket connection ready')
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error)
      setConnectionStatus('disconnected')
    }
  }

  // Initialize WebSocket connection
  useEffect(() => {
    if (!sessionId || !user) return

    connectWebSocket()

    // Cleanup on unmount
    return () => {
      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect()
        wsServiceRef.current = null
      }
    }
  }, [sessionId, user])

  // Auto-reconnect when tab becomes visible or network is restored
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wsServiceRef.current?.isConnected()) {
        console.log('Tab active - reconnecting WebSocket')
        connectWebSocket()
      }
    }

    const handleOnline = () => {
      if (!wsServiceRef.current?.isConnected()) {
        console.log('Network restored - reconnecting WebSocket')
        connectWebSocket()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
    }
  }, [sessionId, user])

  // Handle WebSocket stream events
  const handleStreamEvent = (data: StreamEvent) => {
    const event = data.event
    if (!event) return

    // Handle tool usage - move accumulated text to thinking phase
    if (event.current_tool_use?.name) {
      const toolName = event.current_tool_use.name
      setCurrentTool(toolName)
      // Move any text accumulated so far into thinking
      setStreamingText(prev => {
        if (prev) {
          setThinkingText(t => t + prev)
        }
        return ''
      })
    }

    // Handle text streaming
    if (event.data) {
      setStreamingText(prev => prev + event.data)
    }

    // Log lifecycle events
    if (event.init_event_loop) {
      console.log('Agent initialized')
    } else if (event.start_event_loop) {
      console.log('Agent started processing')
    } else if (event.complete) {
      console.log('Agent completed')
    }
  }

  // Handle completion of streaming
  const handleComplete = () => {
    if (streamingText || thinkingText) {
      const agentMessage: Message = {
        id: Date.now().toString(),
        text: streamingText,
        ...(thinkingText ? { thinking: thinkingText } : {}),
        sender: 'agent',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, agentMessage])
      setStreamingText('')
      setThinkingText('')
    }

    setCurrentTool(null)
    setIsLoading(false)
  }

  // Handle WebSocket errors
  const handleError = (data: StreamEvent) => {
    console.error('WebSocket error:', data)

    const errorMessage: Message = {
      id: Date.now().toString(),
      text: data.message || data.error || 'An error occurred',
      sender: 'agent',
      timestamp: new Date(),
      error: true
    }

    setMessages(prev => [...prev, errorMessage])
    setStreamingText('')
    setThinkingText('')
    setCurrentTool(null)
    setIsLoading(false)
  }

  // Handle WebSocket close
  const handleClose = () => {
    setConnectionStatus('disconnected')
    console.log('WebSocket connection closed')
  }

  // Send message via WebSocket
  const handleSendMessage = () => {
    if (!inputText.trim() || isLoading || !wsServiceRef.current?.isConnected()) {
      if (!wsServiceRef.current?.isConnected()) {
        alert('WebSocket not connected. Please refresh the page.')
      }
      return
    }

    const queryText = inputText.trim()

    // Add user message to UI
    const userMessage: Message = {
      id: Date.now().toString(),
      text: queryText,
      sender: 'user',
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputText('')
    setIsLoading(true)
    setStreamingText('')
    setThinkingText('')

    // Send via WebSocket
    wsServiceRef.current.sendQuery(queryText, sessionId!, user?.sub)
  }

  // Auto-send initial query from Home page navigation
  useEffect(() => {
    const initialQuery = (location.state as any)?.initialQuery
    if (initialQuery && sessionId && !initialQuerySent.current && wsServiceRef.current?.isConnected()) {
      initialQuerySent.current = true
      setInputText(initialQuery)

      // Wait a bit for connection to stabilize
      setTimeout(() => {
        if (wsServiceRef.current?.isConnected()) {
          handleSendMessage()
        }
      }, 500)
    }
  }, [sessionId, location.state, connectionStatus])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="chat">
      <div className="chat-header">
        <div className="header-top">
          <button
            className="back-home-button"
            onClick={() => navigate('/')}
            title="Back to Home"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/>
              <path d="m12 19-7-7 7-7"/>
            </svg>
          </button>
          <h2>WearCast</h2>
          <div className={`connection-status ${connectionStatus}`}>
            <span className="status-dot"></span>
            <span className="status-text">
              {connectionStatus === 'connected' && 'Connected'}
              {connectionStatus === 'connecting' && 'Connecting'}
              {connectionStatus === 'disconnected' && 'Offline'}
            </span>
          </div>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map(message => (
          <div key={message.id} className={`message ${message.sender} ${message.error ? 'error' : ''}`}>
            <div className="message-content">
              {message.thinking && (
                <details className="thinking-section">
                  <summary>Thinking</summary>
                  <div className="thinking-content">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSanitize]}
                    >
                      {message.thinking}
                    </ReactMarkdown>
                  </div>
                </details>
              )}
              <div className="message-text">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSanitize]}
                >
                  {message.text}
                </ReactMarkdown>
              </div>
            </div>
            <div className="message-timestamp">
              {message.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {(streamingText || thinkingText) && (
          <div className="message agent streaming">
            <div className="message-content">
              {thinkingText && (
                <div className="thinking-section thinking-live">
                  <div className="thinking-label">Thinking...</div>
                  <div className="thinking-content">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSanitize]}
                    >
                      {thinkingText}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
              {currentTool && !streamingText && (
                <div className="tool-indicator">
                  <span className="tool-icon">&#128295;</span>
                  <span>Using <strong>{currentTool}</strong></span>
                </div>
              )}
              {streamingText && (
                <div className="message-text">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                  >
                    {streamingText}
                  </ReactMarkdown>
                </div>
              )}
            </div>
            <div className="streaming-indicator">
              <span className="streaming-dot"></span>
              <span className="streaming-dot"></span>
              <span className="streaming-dot"></span>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && !streamingText && !thinkingText && (
          <div className="message agent loading">
            <div className="message-content">
              <div className="loading-indicator">
                <span>Thinking</span>
                <div className="loading-dots">
                  <div className="loading-dot"></div>
                  <div className="loading-dot"></div>
                  <div className="loading-dot"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            connectionStatus === 'connected'
              ? 'Ask about a city - e.g. What about Chicago?'
              : 'Connecting...'
          }
          rows={3}
          disabled={isLoading || connectionStatus !== 'connected'}
        />
        <button
          onClick={handleSendMessage}
          disabled={isLoading || !inputText.trim() || connectionStatus !== 'connected'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m22 2-7 20-4-9-9-4z"/>
            <path d="M22 2 11 13"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

export default Chat
