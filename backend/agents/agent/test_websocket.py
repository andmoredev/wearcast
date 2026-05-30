#!/usr/bin/env python3
"""
WebSocket Test Client for AgentCore Runtime (local development)

Connects to the local agent's WebSocket endpoint, sends a request,
and prints streamed response events in real-time.

Usage:
    python test_websocket.py                          # interactive mode
    python test_websocket.py "What can you help me with?"  # one-shot
    python test_websocket.py --session my-session-id "Hello"
"""

import asyncio
import json
import sys
import uuid
import argparse

try:
    import websockets
except ImportError:
    print("Missing dependency: pip install websockets")
    sys.exit(1)


async def test_websocket(uri: str, request: str, session_id: str):
    """Connect to WebSocket, send a request, and print streamed events."""
    print(f"\n--- Connecting to {uri} ---")
    print(f"Session: {session_id}")
    print(f"Request: {request}\n")

    try:
        async with websockets.connect(
            uri,
            open_timeout=10,
            ping_interval=20,
            ping_timeout=10,
        ) as ws:
            print("Connected.\n")

            # Send the request
            payload = {
                "request": request,
                "session_id": session_id,
            }
            await ws.send(json.dumps(payload))
            print("Request sent. Waiting for response...\n")

            # Receive streamed events
            full_response = []
            async for raw_message in ws:
                msg = json.loads(raw_message)
                msg_type = msg.get("type", "unknown")

                if msg_type == "stream_event":
                    event = msg.get("event", {})

                    # Text chunk — print inline
                    if "data" in event:
                        chunk = event["data"]
                        full_response.append(chunk)
                        print(chunk, end="", flush=True)

                    # Tool use
                    elif "current_tool_use" in event:
                        tool = event["current_tool_use"]
                        name = tool.get("name")
                        if name:
                            print(f"\n[tool: {name}]", flush=True)

                    # Event loop init
                    elif event.get("init_event_loop"):
                        pass  # silent

                    # Completion
                    elif event.get("complete"):
                        pass  # handled by "complete" type below

                elif msg_type == "complete":
                    sid = msg.get("session_id", "")
                    print(f"\n\n--- Complete (session: {sid}) ---\n")
                    break

                elif msg_type == "error":
                    error = msg.get("error", "unknown error")
                    detail = msg.get("message", "")
                    print(f"\n[ERROR] {error}")
                    if detail:
                        print(f"        {detail}")
                    break

                else:
                    # Print any unexpected message types for debugging
                    print(f"\n[{msg_type}] {json.dumps(msg, indent=2)}")

            return "".join(full_response)

    except websockets.exceptions.InvalidStatus as e:
        print(f"WebSocket handshake failed: {e.response.status_code}")
        if hasattr(e.response, "body"):
            print(f"Body: {e.response.body.decode()}")
        return None
    except ConnectionRefusedError:
        print("Connection refused — is the agent running on port 8080?")
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None


async def interactive_mode(uri: str, session_id: str):
    """Interactive REPL: type messages, see streamed responses."""
    print("=== Interactive WebSocket Test Client ===")
    print(f"Server:  {uri}")
    print(f"Session: {session_id}")
    print('Type a message and press Enter. Type "quit" to exit.\n')

    while True:
        try:
            request = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            break

        if not request or request.lower() in ("quit", "exit", "q"):
            print("Bye!")
            break

        print()  # blank line before response
        await test_websocket(uri, request, session_id)


def main():
    parser = argparse.ArgumentParser(description="WebSocket test client for local agent")
    parser.add_argument("request", nargs="?", default=None, help="Message to send (omit for interactive mode)")
    parser.add_argument("--host", default="localhost", help="Agent host (default: localhost)")
    parser.add_argument("--port", default="8080", help="Agent port (default: 8080)")
    parser.add_argument("--session", default=None, help="Session ID (auto-generated if omitted)")
    args = parser.parse_args()

    uri = f"ws://{args.host}:{args.port}/ws"
    session_id = args.session or str(uuid.uuid4())

    if args.request:
        asyncio.run(test_websocket(uri, args.request, session_id))
    else:
        asyncio.run(interactive_mode(uri, session_id))


if __name__ == "__main__":
    main()
