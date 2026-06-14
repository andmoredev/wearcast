# Local Development

## Prerequisites

- Python 3.12+
- AWS credentials configured (`aws configure` or env vars)
- The CloudFormation stack deployed (to get the Memory ID)

## 1. Set up the virtual environment

```bash
cd backend/agents/agent

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install websockets   # for the test client
```

## 2. Get the Memory ID from CloudFormation

```bash
# Replace with your stack name
STACK_NAME="backstage-animation-studio"

export AGENTCORE_MEMORY_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='AgentCoreMemoryId'].OutputValue" \
  --output text)

echo "Memory ID: $AGENTCORE_MEMORY_ID"
```

## 3. Run the agent locally

The agent starts on port 8080 with two endpoints:
- **HTTP**: `POST /invocations` (legacy, synchronous)
- **WebSocket**: `ws://localhost:8080/ws` (streaming)

```bash
export AGENTCORE_MEMORY_ID=<your-memory-id>
# Optional overrides:
# export AWS_REGION=us-east-1
# export BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0

python agent.py
```

You should see output like:
```
INFO:     Started server process
INFO:     Uvicorn running on http://0.0.0.0:8080
```

## 4. Test with WebSocket (streaming)

In a separate terminal (with the venv activated):

### One-shot message
```bash
python test_websocket.py "What can you help me with?"
```

### Interactive mode (multi-turn conversation)
```bash
python test_websocket.py
```

This opens a REPL where you type messages and see streamed responses. The session ID persists across messages so the agent remembers context.

### With a specific session ID
```bash
python test_websocket.py --session my-test-session "Hello!"
```

## 5. Test with HTTP (legacy, non-streaming)

```bash
curl -X POST http://localhost:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{
    "request": "Hello! What can you help me with?",
    "session_id": "9f3c8a9b-7a7b-4b62-9b7f-5bbf7db0e7a1",
    "user_id": "user1"
  }'
```

## WebSocket Message Format

### Client sends:
```json
{
  "request": "Your question here",
  "session_id": "uuid-string"
}
```

### Server streams back:

**Text chunks** (streamed as they are generated):
```json
{
  "type": "stream_event",
  "event": { "data": "Here is a chunk of text..." }
}
```

**Tool usage**:
```json
{
  "type": "stream_event",
  "event": { "current_tool_use": { "name": "memory" } }
}
```

**Completion**:
```json
{
  "type": "complete",
  "session_id": "uuid-string"
}
```

**Error**:
```json
{
  "type": "error",
  "error": "description of the error"
}
```
