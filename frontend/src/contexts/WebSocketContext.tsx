import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import { WebSocketService, StreamEvent } from '../services/websocket'
import { useAuth } from './AuthContext'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

type WebSocketEventListener = (data: StreamEvent) => void

interface WebSocketContextType {
  sessionId: string | null
  setSessionId: (id: string) => void
  connectionStatus: ConnectionStatus
  sendQuery: (text: string) => void
  isConnected: boolean
  on: (eventType: string, callback: WebSocketEventListener) => void
  off: (eventType: string, callback: WebSocketEventListener) => void
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const wsServiceRef = useRef<WebSocketService | null>(null)
  const listenersRef = useRef<Map<string, Set<WebSocketEventListener>>>(new Map())

  // Forward events from WebSocketService to registered listeners
  const emitToListeners = useCallback((eventType: string, data: StreamEvent) => {
    listenersRef.current.get(eventType)?.forEach(cb => cb(data))
  }, [])

  // Connect (or reconnect) the WebSocket
  const connectWebSocket = useCallback(async () => {
    if (!sessionId || !user) return

    try {
      setConnectionStatus('connecting')

      // Tear down any existing connection
      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect()
      }

      const wsService = new WebSocketService()
      wsServiceRef.current = wsService

      // Wire up internal event forwarding
      wsService.on('stream_event', (data) => emitToListeners('stream_event', data))
      wsService.on('complete', (data) => emitToListeners('complete', data))
      wsService.on('error', (data) => emitToListeners('error', data))
      wsService.on('close', (data) => {
        setConnectionStatus('disconnected')
        emitToListeners('close', data)
      })

      await wsService.connect(sessionId)
      setConnectionStatus('connected')
      console.log('WebSocket connection ready (from context)')
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error)
      setConnectionStatus('disconnected')
    }
  }, [sessionId, user, emitToListeners])

  // Initialize WebSocket connection when sessionId and user are available
  useEffect(() => {
    if (!sessionId || !user) return

    connectWebSocket()

    return () => {
      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect()
        wsServiceRef.current = null
      }
    }
  }, [sessionId, user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reconnect when tab becomes visible or network is restored
  useEffect(() => {
    if (!sessionId || !user) return

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
  }, [sessionId, user, connectWebSocket])

  // Send a query through the WebSocket
  const sendQuery = useCallback((text: string) => {
    if (!wsServiceRef.current?.isConnected() || !sessionId) {
      emitToListeners('error', {
        type: 'error',
        error: 'WebSocket connection is not open'
      })
      return
    }
    wsServiceRef.current.sendQuery(text, sessionId, user?.sub)
  }, [sessionId, user, emitToListeners])

  // Register an event listener
  const on = useCallback((eventType: string, callback: WebSocketEventListener) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set())
    }
    listenersRef.current.get(eventType)!.add(callback)
  }, [])

  // Unregister an event listener
  const off = useCallback((eventType: string, callback: WebSocketEventListener) => {
    listenersRef.current.get(eventType)?.delete(callback)
  }, [])

  const value: WebSocketContextType = {
    sessionId,
    setSessionId,
    connectionStatus,
    sendQuery,
    isConnected: connectionStatus === 'connected',
    on,
    off,
  }

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
}

export function useWebSocket() {
  const context = useContext(WebSocketContext)
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }
  return context
}
