# AgentCore Chatbot

AI-powered chatbot built on AWS Bedrock AgentCore Runtime with real-time WebSocket streaming and conversation memory.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────────────┐
│   React UI  │────▶│  API Gateway +   │────▶│  Lambda Functions       │
│  (Cognito)  │     │  Cognito Auth    │     │  - websocket-connect    │
└──────┬──────┘     └──────────────────┘     │  - websocket-info       │
       │                                      │  - agentcore-invoke     │
       │  WebSocket (SigV4 presigned URL)     └────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐     ┌──────────────────┐
│  AgentCore Runtime               │────▶│  AgentCore Memory│
│  (Strands Agent + Bedrock LLM)   │     │  (Persistence)   │
└──────────────────────────────────┘     └──────────────────┘
```

- **Frontend**: React + TypeScript with Cognito authentication (S3 + CloudFront)
- **Backend**: AWS Lambda + API Gateway + Step Functions (SAM)
- **AI/ML**: AgentCore Runtime with real-time WebSocket streaming
- **Agent**: Strands framework (Python) with AgentCore Memory for conversation persistence
- **Auth**: Cognito User Pool (JWT) for API Gateway; SigV4 presigned URLs for AgentCore WebSocket

### Authentication Flow

1. User signs in via Cognito (JWT token)
2. JWT authenticates REST API calls to API Gateway
3. Lambda generates a SigV4 presigned WebSocket URL using its IAM role
4. Browser connects directly to AgentCore Runtime via the presigned URL
5. Agent streams responses back over the WebSocket connection

## Project Structure

```
backend/
  agents/agent/           # AgentCore agent (Python/Strands)
    agent.py              # WebSocket + HTTP handlers, streaming, memory
    requirements.txt      # Python dependencies
  functions/              # Lambda functions (Node.js)
    websocket-connect.js  # SigV4 presigned URL generation
    agentcore-invoke.js   # HTTP invocation (legacy)
  workflows/              # Step Functions state machine
  template.yaml           # SAM template (backend infra)
  openapi.yaml            # API Gateway spec with Cognito authorizer
frontend/
  src/
    components/           # React components (Chat, Login, Signup, etc.)
    contexts/             # Auth context (Cognito integration)
    services/             # API, WebSocket, and auth services
  template.yaml           # SAM template (S3 + CloudFront)
```

## Getting Started

```bash
./setup-local-dev.sh
```

Or manually:

```bash
# Backend
cd backend && sam build && sam deploy --guided

# Frontend
cd frontend && npm install && npm run dev
```

## Environment Variables

### Backend (Agent - set in SAM template)

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENTCORE_MEMORY_ID` | Yes | AgentCore Memory resource ID |
| `AWS_REGION` | No | AWS region (default: us-east-1) |
| `BEDROCK_MODEL_ID` | No | Bedrock model ID (default: us.amazon.nova-lite-v1:0) |

### Frontend (set in `.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | API Gateway endpoint URL |
| `VITE_COGNITO_USER_POOL_ID` | Yes | Cognito User Pool ID |
| `VITE_COGNITO_CLIENT_ID` | Yes | Cognito App Client ID |
