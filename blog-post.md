# Skip the Middleman: Connecting Your UI Directly to an AI Agent via WebSocket

**TL;DR:** Instead of routing every user message through REST APIs, Lambda functions, and back — what if your browser could talk directly to your AI agent over a persistent WebSocket connection? That's exactly what we built with WearCast, a weather-based clothing advisor powered by AWS Bedrock AgentCore. The result: real-time streaming, lower latency, and a dramatically simpler data path — all without sacrificing security.

---

## The Problem with the Traditional Approach

Most AI chat applications follow a familiar pattern:

```
User → REST API → Lambda → AI Service → Lambda → REST API → User
```

Every message makes a round trip through multiple intermediaries. The response waits until the entire generation is complete, and then it all comes back at once. For a chat interface, this feels sluggish. Users stare at a spinner while the model generates hundreds of tokens they could already be reading.

Even if you add Server-Sent Events or long-polling, you're still stitching together a real-time experience on top of infrastructure that wasn't designed for it.

**What if we just... skipped the middleman?**

## The Architecture: Browser ↔ Agent, Direct Connection

Here's the core idea behind WearCast:

```
┌─────────────┐          ┌──────────────────┐
│   React UI  │─── JWT ─▶│  API Gateway +   │──▶ Lambda (presigned URL)
│  (Cognito)  │          │  Cognito Auth    │
└──────┬──────┘          └──────────────────┘
       │
       │  WebSocket (SigV4 presigned URL)
       │  ← No middleman! Direct connection →
       ▼
┌──────────────────────────────────┐     ┌──────────────────┐
│  AgentCore Runtime               │────▶│  AgentCore Memory│
│  (Strands Agent + Bedrock LLM)   │     │  (Persistence)   │
└──────────────────────────────────┘     └──────────────────┘
```

The browser connects **directly** to the AI agent over a WebSocket. No Lambda sits in the middle proxying tokens. No API Gateway WebSocket API managing connection state. The agent streams tokens directly to the user's browser as they're generated.

The only time we touch traditional infrastructure is during the **initial handshake** — where we exchange a JWT for a presigned URL. After that, it's a direct, bidirectional pipe.

---

## How It Works: The Three-Step Dance

### Step 1: Authenticate the User (Cognito JWT)

The user signs in through Amazon Cognito and receives a JWT token. This is standard — nothing unusual here.

```typescript
// Frontend authenticates and gets an access token
const accessToken = await authService.getAccessToken();
```

### Step 2: Exchange JWT for a Presigned WebSocket URL

Here's where it gets interesting. The frontend makes a single REST call to our backend:

```typescript
const presignedData = await apiService.getPresignedWebSocketUrl(sessionId, accessToken);
```

Behind the scenes, a Lambda function:
1. Validates the JWT (API Gateway's Cognito Authorizer handles this)
2. Uses its IAM role to generate an **AWS SigV4 presigned WebSocket URL** pointing directly at the AgentCore Runtime
3. Embeds the user's identity and session ID as query parameters in the signed URL
4. Returns the presigned URL to the browser

```javascript
// Lambda: Generate presigned WebSocket URL
const wsHost = `bedrock-agentcore.${region}.amazonaws.com`;
const wsPath = `/runtimes/${runtimeArn}/ws`;

const signer = new SignatureV4({
  service: 'bedrock-agentcore',
  region,
  credentials,
  sha256: Sha256
});

const signedRequest = await signer.presign(request, { expiresIn: 300 });
const presignedWsUrl = formatSignedUrl(signedRequest).replace('https://', 'wss://');
```

The presigned URL is valid for 5 minutes — long enough to establish the connection, short enough to limit exposure.

### Step 3: Connect Directly to the Agent

The browser opens a WebSocket connection using the presigned URL. **No custom headers needed** — all authentication is embedded in the URL's query parameters via SigV4.

```typescript
this.ws = new WebSocket(presignedData.wsUrl);
```

Once connected, the browser sends messages directly to the agent and receives streaming responses in real-time:

```typescript
// Send a message
ws.send(JSON.stringify({
  request: "What should I wear in Chicago today?",
  session_id: sessionId,
  user_id: userId
}));

// Receive streaming tokens
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.event?.data) {
    // Append token to the UI immediately
    appendToStream(data.event.data);
  }
};
```

That's it. The browser is now talking directly to the AI agent. Every token streams in as it's generated. No Lambda in the hot path. No API Gateway WebSocket managing frames.

---

## Why This Matters

### 1. True Real-Time Streaming

Every token arrives at the browser the moment the model generates it. There's no buffering layer, no Lambda invocation overhead per chunk, no API Gateway frame management. The experience feels instant and fluid.

### 2. Simpler Architecture

The traditional approach requires:
- An API Gateway WebSocket API with `$connect`, `$disconnect`, and `$default` routes
- Lambda functions to manage connection IDs in DynamoDB
- Another Lambda to post messages back via `@connections`
- Complex error handling for disconnections and reconnections

Our approach requires:
- One Lambda that generates a presigned URL
- The browser's native WebSocket API
- The agent itself

That's it. The entire "real-time infrastructure" is a single Lambda function.

### 3. Lower Cost

No Lambda invocations per streaming chunk. No DynamoDB reads/writes for connection management. No API Gateway WebSocket message charges. You pay for the AgentCore Runtime and one Lambda invocation per session establishment.

### 4. Persistent Connections

The WebSocket stays open for multi-turn conversations. The agent maintains state across messages within the same connection — no need to reload context on every request.

---

## Adding Memory: Conversations That Persist

A direct WebSocket connection is great, but what happens when the user closes their browser and comes back? Without memory, the agent starts fresh every time.

WearCast uses **AgentCore Memory** — a managed service that persists conversation history across sessions:

```python
from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager

def create_session_manager(runtime_session_id, user_id):
    config = AgentCoreMemoryConfig(
        memory_id=AGENTCORE_MEMORY_ID,
        session_id=runtime_session_id,
        actor_id=user_id
    )
    return AgentCoreMemorySessionManager(
        agentcore_memory_config=config,
        region_name=AWS_REGION
    )
```

When the agent initializes, the session manager automatically loads previous messages from memory. When the conversation ends, new messages are persisted. The user can close their laptop, come back hours later, and pick up right where they left off.

The memory is scoped by **session ID** and **actor ID** (user), so each user's conversations are isolated and private.

### Infrastructure-as-Code

The memory resource is declared right alongside the runtime in the SAM template:

```yaml
AgentCoreShortTermMemory:
  Type: AWS::BedrockAgentCore::Memory
  Properties:
    Name: WearCast
    Description: Short-term memory for agent conversation persistence
    MemoryExecutionRoleArn: !GetAtt AgentCoreRole.Arn
    EventExpiryDuration: 30  # days
```

The memory ID is passed to the agent as an environment variable — no connection strings, no database provisioning, no schema management.

---

## Adding Tools: Giving the Agent Capabilities

An agent without tools is just a chatbot. Tools turn it into something that can take action in the real world.

WearCast includes a `get_weather` tool that fetches real forecast data from Open-Meteo (no API key required):

```python
@tool
def get_weather(city: str, date: str = "today") -> dict:
    """Get weather conditions for a city, current or up to 16 days ahead.
    
    Args:
        city: City name (e.g. "Indianapolis", "Chicago")
        date: "today" for current, or YYYY-MM-DD for forecast
    """
    # Geocode the city
    geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1"
    # ... fetch coordinates ...
    
    # Get weather data
    forecast_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&..."
    # ... fetch and return weather data ...
```

The beauty of the Strands framework is that tools are just decorated Python functions. The `@tool` decorator handles:
- Generating the tool schema for the LLM
- Parsing the LLM's tool-use requests
- Executing the function and returning results to the model

On the frontend, tool usage is communicated through the same WebSocket stream:

```typescript
if (event.current_tool_use?.name) {
  setCurrentTool(event.current_tool_use.name);
  // Show "Using get_weather..." indicator
}
```

The user sees the agent "thinking," then using a tool, then formulating its response — all streaming in real-time. It feels like watching someone work, not waiting for an answer.

---

## The Security Model

"But wait — isn't it dangerous to let browsers connect directly to your AI agent?"

Not when you layer the security correctly:

1. **Authentication**: Cognito JWT validates the user's identity before any presigned URL is generated
2. **Authorization**: The Lambda's IAM role determines what AgentCore resources can be accessed — following least-privilege
3. **Short-lived credentials**: Presigned URLs expire in 5 minutes — only valid long enough to establish the connection
4. **User identity propagation**: The user's ID is embedded in the signed URL as a custom header, so the agent knows who it's talking to
5. **SigV4 signing**: The connection URL is cryptographically signed — it can't be tampered with or reused

```javascript
// User identity travels with the signed URL
queryParams['X-Amzn-Bedrock-AgentCore-Runtime-Custom-User-Id'] = userId;

// The agent receives it as a header
headers = context.request_headers
user_id = headers.get("x-amzn-bedrock-agentcore-runtime-custom-user-id")
```

The browser never sees AWS credentials. The Lambda's role does the signing. The user's identity is cryptographically bound to the connection.

---

## The Complete Flow in 30 Seconds

1. User logs in → gets Cognito JWT
2. Frontend calls `POST /websocket/connect` with JWT
3. Lambda validates JWT, generates SigV4 presigned WebSocket URL
4. Frontend opens `new WebSocket(presignedUrl)`
5. Connection lands directly on AgentCore Runtime
6. Agent loads conversation history from AgentCore Memory
7. User sends message over WebSocket
8. Agent processes, uses tools if needed, streams response token-by-token
9. Frontend renders each token as it arrives
10. Connection stays open for follow-up messages

No Lambda in the streaming path. No API Gateway managing frames. Just a browser talking to an agent.

---

## When Should You Use This Pattern?

This architecture shines when:

- **Real-time streaming matters** — chat interfaces, live collaboration, voice agents
- **Multi-turn conversations are the norm** — the persistent connection avoids repeated handshakes
- **You want simplicity** — fewer moving parts means fewer things that break at 2 AM
- **Cost is a concern** — eliminating per-message Lambda invocations adds up fast

It may not be the right fit when:
- You need complex request/response transformation before reaching the agent
- Your agent needs to be invoked by non-browser clients (batch processing, scheduled tasks)
- You need API Gateway features like throttling, request validation, or usage plans on every message

For the non-streaming use case, WearCast also includes a traditional REST path through Step Functions — but honestly, once you've experienced the WebSocket approach, it's hard to go back.

---

## Try It Yourself

WearCast is open source and deployable with a single `sam deploy`. The entire infrastructure — Cognito, API Gateway, Lambda, AgentCore Runtime, AgentCore Memory — is defined in one SAM template.

The key components:
- **`backend/functions/websocket-connect.js`** — The presigned URL generator (the only "middleman")
- **`backend/agents/agent/agent.py`** — The agent with WebSocket streaming, memory, and tools
- **`frontend/src/services/websocket.ts`** — The browser-side WebSocket client
- **`backend/template.yaml`** — The complete infrastructure definition

The future of AI applications isn't request/response. It's persistent, streaming connections where the UI and the agent are in constant dialogue. Skip the middleman. Connect directly.

---

*Built with AWS Bedrock AgentCore, Strands Agents SDK, and a healthy disregard for unnecessary infrastructure.*
