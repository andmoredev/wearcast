"""
WearCast Agent - AgentCore Runtime with WebSocket Streaming

A weather-based clothing advisor with:
- Real-time streaming via WebSocket
- Memory persistence across conversations
- JWT-based user authentication
- No tools — the model relies solely on its own knowledge and must say so

Required Environment Variables:
    - AGENTCORE_MEMORY_ID: AgentCore Memory resource ID for conversation persistence

Optional Environment Variables:
    - AWS_REGION: AWS region (default: us-east-1)
    - BEDROCK_MODEL_ID: Bedrock model ID (default: us.amazon.nova-lite-v1:0)
"""

import os
import json
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands.models import BedrockModel
from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager

app = BedrockAgentCoreApp()

# ============================================================================
# Configuration
# ============================================================================

AGENTCORE_MEMORY_ID = os.environ.get("AGENTCORE_MEMORY_ID")
AWS_REGION = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-lite-v1:0")

if not AGENTCORE_MEMORY_ID:
    raise ValueError("AGENTCORE_MEMORY_ID environment variable is required but not set")

# ============================================================================
# System prompt
# ============================================================================

SYSTEM_PROMPT_TEMPLATE = """You are WearCast, a friendly weather-based clothing advisor.

TODAY'S DATE: {today} ({day_of_week}).

You have NO TOOLS available. You must rely solely on your own general knowledge \
to answer, and you do not have access to real-time or forecast weather data.

Scope:
- Only discuss weather conditions and weather-based clothing/outfit recommendations.
- If the user asks about anything unrelated to weather or clothing for weather, \
politely decline and steer the conversation back to weather and outfit advice. \
Do not answer off-topic questions.

Disclosure requirement:
- Since you have no tools, you are NOT using live or verified weather data for any \
answer. Every response must explicitly state that you did not use a weather tool \
and that the information is based on general knowledge only, not real-time data.

Response style:
- Write 3–5 sentences so the token stream is visibly satisfying.
- Clearly state you have no access to a weather tool/live data.
- End with a clothing recommendation based on your best general knowledge of typical \
conditions, caveated as an estimate.
- Format responses in Markdown."""


def get_system_prompt() -> str:
    """Build system prompt with today's date injected for accurate date calculations."""
    from datetime import datetime
    now = datetime.utcnow()
    today_str = now.strftime("%Y-%m-%d")
    day_of_week = now.strftime("%A")
    return SYSTEM_PROMPT_TEMPLATE.format(today=today_str, day_of_week=day_of_week)


def create_session_manager(runtime_session_id: str, user_id: str = None):
    """Create AgentCore Memory session manager for conversation persistence."""
    actor_id = user_id if user_id else "user"

    config = AgentCoreMemoryConfig(
        memory_id=AGENTCORE_MEMORY_ID,
        session_id=runtime_session_id,
        actor_id=actor_id
    )

    return AgentCoreMemorySessionManager(
        agentcore_memory_config=config,
        region_name=AWS_REGION
    )


@app.websocket
async def websocket_handler(websocket, context):
    """
    WebSocket handler for real-time streaming agent responses.

    AWS SigV4 authentication is handled by AgentCore Runtime before this handler is called.
    User identity is passed via custom headers in the WebSocket connection.

    Args:
        websocket: WebSocket connection object
        context: Request context containing headers and request information
    """
    await websocket.accept()

    agent = None
    session_id = None

    try:
        # Extract user identity from custom headers
        # These are passed as query parameters with prefix X-Amzn-Bedrock-AgentCore-Runtime-Custom-
        # and received as lowercase headers in context.request_headers
        headers = context.request_headers or {}
        user_id = headers.get("x-amzn-bedrock-agentcore-runtime-custom-user-id")

        print(f"WebSocket connected - User: {user_id}, Context session: {context.session_id}")

        # Message loop — keep connection open for multi-turn conversation
        while True:
            data = await websocket.receive_json()
            request = data.get("request", "")
            msg_session_id = data.get("session_id")

            # Validate input
            if not request:
                await websocket.send_json({
                    "type": "error",
                    "error": "Missing required field: request"
                })
                continue

            if not msg_session_id:
                await websocket.send_json({
                    "type": "error",
                    "error": "Missing required field: session_id"
                })
                continue

            print(f"Request received - Session: {msg_session_id}")

            # Create agent on first message, or recreate if session changes
            if agent is None or msg_session_id != session_id:
                session_id = msg_session_id
                session_manager = create_session_manager(session_id, user_id)

                agent = Agent(
                    agent_id="wearcast",
                    model=BedrockModel(model_id=BEDROCK_MODEL_ID),
                    system_prompt=get_system_prompt(),
                    session_manager=session_manager,
                )
                print(f"Agent initialized - Model: {BEDROCK_MODEL_ID}, Session: {session_id}, Messages loaded: {len(agent.messages)}")

            print(f"Messages in context: {len(agent.messages)}")

            # Stream events back to client in real-time
            async for event in agent.stream_async(request):
                # Extract only JSON-serializable data from the event.
                # stream_async() can yield events containing non-serializable objects
                # (e.g. the Agent instance in completion events), so we pick out
                # the fields the client actually needs.
                client_event = None

                if event.get("data"):
                    client_event = {"data": event["data"]}

                elif event.get("current_tool_use"):
                    tool_use = event["current_tool_use"]
                    tool_name = tool_use.get("name")
                    if tool_name:
                        client_event = {"current_tool_use": {"name": tool_name, "tool_use_id": tool_use.get("tool_use_id")}}
                        print(f"Tool use: {tool_name}")

                elif event.get("init_event_loop"):
                    client_event = {"init_event_loop": True}

                elif event.get("complete"):
                    client_event = {"complete": True}

                # Only send events that have useful client-facing data
                if client_event is not None:
                    await websocket.send_json({
                        "type": "stream_event",
                        "event": client_event
                    })

            # Send completion signal for this turn
            await websocket.send_json({
                "type": "complete",
                "session_id": session_id
            })

            print(f"Response complete - Session: {session_id}, Messages: {len(agent.messages)}")

    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "error": "Invalid JSON in request"
            })
        except:
            pass  # Connection may already be closed

    except Exception as e:
        error_str = str(e)
        # WebSocket disconnect is expected when client closes the connection
        if "disconnect" in error_str.lower() or "closed" in error_str.lower():
            print(f"🔌 Client disconnected (session: {session_id})")
        else:
            print(f"❌ Error in websocket_handler: {error_str}")
            import traceback
            traceback.print_exc()

            try:
                await websocket.send_json({
                    "type": "error",
                    "error": error_str,
                    "message": "An error occurred while processing your request"
                })
            except:
                pass  # Connection may already be closed

    finally:
        try:
            await websocket.close()
            print(f"🔌 WebSocket connection closed (session: {session_id})")
        except:
            pass


@app.entrypoint
def invoke(payload):
    """
    HTTP entrypoint (legacy support).

    For real-time streaming, use the WebSocket endpoint instead.
    """
    request = payload.get("request", "")

    if not request:
        return {"error": "Please provide a request"}

    try:
        runtime_session_id = payload.get("session_id")
        user_id = payload.get("user_id")

        if not runtime_session_id:
            import uuid
            runtime_session_id = f"session_{uuid.uuid4().hex[:16]}"
            print(f"Warning: Generated session ID: {runtime_session_id}")

        session_manager = create_session_manager(runtime_session_id, user_id)

        agent = Agent(
            agent_id="wearcast",
            model=BedrockModel(model_id=BEDROCK_MODEL_ID),
            system_prompt=get_system_prompt(),
            session_manager=session_manager,
        )

        print(f"Agent initialized with model: {BEDROCK_MODEL_ID}, session: {runtime_session_id}")
        print(f"Messages loaded from memory: {len(agent.messages)}")

        result = agent(request)
        response_text = str(result)

        return {
            "request": request,
            "response": response_text,
        }

    except Exception as e:
        return {
            "error": "INTERNAL_SERVER_ERROR",
            "message": f"An error occurred while processing your request: {str(e)}",
        }


if __name__ == "__main__":
    app.run()
