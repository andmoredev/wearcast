import API_CONFIG from '../config/api';
import { getUserId } from './userService';

export interface QueryRequest {
  request: string;
  sessionId?: string;
}

export interface QueryResult {
  sessionId: string;
  request: string;
  response: string;
  status: string;
}

export interface QueryErrorResponse {
  error: string;
  message: string;
}

export interface PresignedWebSocketUrl {
  wsUrl: string;
  sessionId: string;
  userId: string;
  expiresIn: number;
  message: string;
}

export class ApiService {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = API_CONFIG.baseUrl;
  }

  private getUserId(): string {
    return getUserId();
  }

  async getPresignedWebSocketUrl(sessionId: string, accessToken: string): Promise<PresignedWebSocketUrl> {
    const url = `${this.baseUrl}/websocket/connect`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to get presigned URL:', response.status, errorText);
        throw new Error(`Failed to get presigned WebSocket URL: ${response.status}`);
      }

      return await response.json() as PresignedWebSocketUrl;
    } catch (error) {
      console.error('Error getting presigned WebSocket URL:', error);
      throw error;
    }
  }

  async sendQuery(request: QueryRequest): Promise<QueryResult> {
    const url = `${this.baseUrl}${API_CONFIG.endpoints.query}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': this.getUserId(),
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData: QueryErrorResponse;
        try {
          errorData = await response.json();
        } catch {
          if (response.status === 504) {
            throw new Error('REQUEST_TIMEOUT: The request timed out. Please try again.');
          }
          throw new Error(`NETWORK_ERROR: Request failed with status ${response.status}.`);
        }

        const errorType = errorData.error || 'UNKNOWN_ERROR';
        const errorMessage = errorData.message || 'An error occurred while processing your request.';
        throw new Error(`${errorType}: ${errorMessage}`);
      }

      const data: QueryResult = await response.json();
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('REQUEST_TIMEOUT: The request timed out. Please try again.');
      }

      if (error instanceof TypeError) {
        if (error.message.includes('fetch') || error.message.includes('network')) {
          throw new Error('NETWORK_ERROR: Unable to connect to the server. Please check your internet connection.');
        }
      }

      throw error;
    }
  }
}

export const apiService = new ApiService();
