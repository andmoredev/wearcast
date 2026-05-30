/**
 * WebSocket Service
 *
 * Handles real-time WebSocket connections to AgentCore Runtime
 * via SigV4 presigned URLs. Reconnection is managed by the Chat component
 * using visibility/network events, not internally.
 */

import { authService } from './auth';
import { apiService } from './api';

export interface StreamEvent {
  type: 'stream_event' | 'complete' | 'error' | 'auth_success';
  event?: any;
  session_id?: string;
  error?: string;
  message?: string;
}

export type EventListener = (event: StreamEvent) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<EventListener>> = new Map();
  private authenticationCompleted = false;

  /**
   * Connect to WebSocket using AWS SigV4 presigned URL
   */
  async connect(sessionId: string): Promise<void> {
    try {
      const accessToken = await authService.getAccessToken();
      if (!accessToken) {
        throw new Error('Not authenticated - no access token');
      }

      // Request presigned WebSocket URL from backend (JWT-authenticated)
      const presignedData = await apiService.getPresignedWebSocketUrl(sessionId, accessToken);

      return new Promise((resolve, reject) => {
        try {
          this.ws = new WebSocket(presignedData.wsUrl);

          this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.authenticationCompleted = true;
            resolve();
          };

          this.ws.onmessage = (event) => {
            try {
              const data: StreamEvent = JSON.parse(event.data);

              this.emit('message', data);

              if (data.type) {
                this.emit(data.type, data);
              }
            } catch (error) {
              console.error('Failed to parse WebSocket message:', error);
            }
          };

          this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);

            this.emit('error', {
              type: 'error',
              error: 'WebSocket connection error'
            });

            if (!this.authenticationCompleted) {
              reject(new Error('WebSocket connection failed'));
            }
          };

          this.ws.onclose = (event) => {
            console.log('WebSocket closed:', event.code, event.reason);

            if (event.code === 4401 || event.code === 1008) {
              this.emit('error', {
                type: 'error',
                error: 'Authentication failed - invalid or expired token'
              });
              reject(new Error('Authentication failed'));
              return;
            }

            this.emit('close', { type: 'complete' });
          };
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      throw error;
    }
  }


  /**
   * Send a query to the agent
   */
  sendQuery(request: string, sessionId: string, userId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit('error', {
        type: 'error',
        error: 'WebSocket connection is not open'
      });
      return;
    }

    this.ws.send(JSON.stringify({
      request,
      session_id: sessionId,
      user_id: userId
    }));
  }

  /**
   * Register an event listener
   */
  on(eventType: string, callback: EventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)?.add(callback);
  }

  /**
   * Unregister an event listener
   */
  off(eventType: string, callback: EventListener): void {
    this.listeners.get(eventType)?.delete(callback);
  }

  /**
   * Emit an event to all registered listeners
   */
  private emit(eventType: string, data: StreamEvent): void {
    this.listeners.get(eventType)?.forEach((callback) => callback(data));
  }

  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.listeners.clear();
    this.authenticationCompleted = false;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.authenticationCompleted;
  }

  /**
   * Get current connection state
   */
  getReadyState(): number | null {
    return this.ws?.readyState ?? null;
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
