import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { StreamEvent } from '../services/websocket'
import { useWebSocket } from '../contexts/WebSocketContext'

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
  const { sessionId, setSessionId, connectionStatus, sendQuery, isConnected, on, off } = useWebSocket()

  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [thinkingText, setThinkingText] = useState('')
  const [currentTool, setCurrentTool] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const initialQuerySent = useRef(false)

  // Refs to track streaming state for use in event handler closures
  const streamingTextRef = useRef('')
  const thinkingTextRef = useRef('')

  // Ensure the context has the session ID from the URL (or generate one)
  useEffect(() => {
    if (urlSessionId && urlSessionId !== sessionId) {
      setSessionId(urlSessionId)
    } else if (!sessionId) {
      const newSessionId = crypto.randomUUID()
      setSessionId(newSessionId)
      navigate(`/chat/${newSessionId}`, { replace: true })
    } else if (sessionId && !urlSessionId) {
      navigate(`/chat/${sessionId}`, { replace: true })
    }
  }, [urlSessionId, sessionId, setSessionId, navigate])

  // Handle WebSocket stream events
  const handleStreamEvent = useCallback((data: StreamEvent) => {
    const event = data.event
    if (!event) return

    // Handle tool usage - move accumulated text to thinking phase
    if (event.current_tool_use?.name) {
      const toolName = event.current_tool_use.name
      setCurrentTool(toolName)
      // Move any text accumulated so far into thinking
      const currentStreaming = streamingTextRef.current
      if (currentStreaming) {
        const newThinking = thinkingTextRef.current + currentStreaming
        thinkingTextRef.current = newThinking
        setThinkingText(newThinking)
      }
      streamingTextRef.current = ''
      setStreamingText('')
    }

    // Handle text streaming
    if (event.data) {
      const newStreaming = streamingTextRef.current + event.data
      streamingTextRef.current = newStreaming
      setStreamingText(newStreaming)
    }

    // Log lifecycle events
    if (event.init_event_loop) {
      console.log('Agent initialized')
    } else if (event.start_event_loop) {
      console.log('Agent started processing')
    } else if (event.complete) {
      console.log('Agent completed')
    }
  }, [])

  // Handle completion of streaming
  const handleComplete = useCallback(() => {
    const currentStreaming = streamingTextRef.current
    const currentThinking = thinkingTextRef.current

    if (currentStreaming || currentThinking) {
      const agentMessage: Message = {
        id: Date.now().toString(),
        text: currentStreaming,
        ...(currentThinking ? { thinking: currentThinking } : {}),
        sender: 'agent',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, agentMessage])
    }

    streamingTextRef.current = ''
    thinkingTextRef.current = ''
    setStreamingText('')
    setThinkingText('')
    setCurrentTool(null)
    setIsLoading(false)
  }, [])

  // Handle WebSocket errors
  const handleError = useCallback((data: StreamEvent) => {
    console.error('WebSocket error:', data)

    const errorMessage: Message = {
      id: Date.now().toString(),
      text: data.message || data.error || 'An error occurred',
      sender: 'agent',
      timestamp: new Date(),
      error: true
    }

    setMessages(prev => [...prev, errorMessage])
    streamingTextRef.current = ''
    thinkingTextRef.current = ''
    setStreamingText('')
    setThinkingText('')
    setCurrentTool(null)
    setIsLoading(false)
  }, [])

  // Register/unregister event listeners on the WebSocket context
  useEffect(() => {
    on('stream_event', handleStreamEvent)
    on('complete', handleComplete)
    on('error', handleError)

    return () => {
      off('stream_event', handleStreamEvent)
      off('complete', handleComplete)
      off('error', handleError)
    }
  }, [on, off, handleStreamEvent, handleComplete, handleError])

  // Shared helper: constructs user message, updates UI state, and sends via WebSocket
  const sendMessage = (text: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputText('')
    setIsLoading(true)
    streamingTextRef.current = ''
    thinkingTextRef.current = ''
    setStreamingText('')
    setThinkingText('')

    sendQuery(text)
  }

  // Send message via WebSocket
  const handleSendMessage = () => {
    if (!inputText.trim() || isLoading || !isConnected) {
      if (!isConnected) {
        alert('WebSocket not connected. Please refresh the page.')
      }
      return
    }

    sendMessage(inputText.trim())
  }

  // Auto-send initial query from Home page navigation
  useEffect(() => {
    const initialQuery = (location.state as any)?.initialQuery
    if (initialQuery && sessionId && !initialQuerySent.current && isConnected) {
      initialQuerySent.current = true
      sendMessage(initialQuery)
    }
  }, [sessionId, location.state, connectionStatus, isConnected]) // eslint-disable-line react-hooks/exhaustive-deps

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
          {sessionId && (
            <div className={`connection-status ${connectionStatus}`}>
              <span className="status-dot"></span>
              <span className="status-text">
                {connectionStatus === 'connected' && 'Connected'}
                {connectionStatus === 'connecting' && 'Connecting'}
                {connectionStatus === 'disconnected' && 'Offline'}
              </span>
            </div>
          )}
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
          {isLoading ? (
            <div className="button-spinner"></div>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m22 2-7 20-4-9-9-4z"/>
              <path d="M22 2 11 13"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

export default Chat
