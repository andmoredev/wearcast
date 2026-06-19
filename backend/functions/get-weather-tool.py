"""
Get Weather Tool - Lambda function for AgentCore Gateway.

This Lambda implements the get_weather tool behind an AgentCore Gateway.
It follows the "one tool per Lambda" design pattern where the gateway
invokes this function when an agent calls the get_weather tool via MCP.

INPUT FORMAT:
    - event: Contains tool arguments directly (city name)
    - context.client_context.custom['bedrockAgentCoreToolName']: Full tool name with target prefix

OUTPUT FORMAT:
    - Return object with 'content' array containing response data
    - No HTTP status codes or headers needed (gateway handles HTTP layer)
"""

import json
import logging
import urllib.request
import urllib.parse

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# WMO weather interpretation codes to human-readable condition strings
_WMO_CONDITIONS = {
    0: "clear sky",
    1: "mainly clear",
    2: "partly cloudy",
    3: "overcast",
    45: "foggy",
    48: "icy fog",
    51: "light drizzle",
    53: "moderate drizzle",
    55: "heavy drizzle",
    61: "light rain",
    63: "moderate rain",
    65: "heavy rain",
    71: "light snow",
    73: "moderate snow",
    75: "heavy snow",
    77: "snow grains",
    80: "light showers",
    81: "moderate showers",
    82: "heavy showers",
    85: "light snow showers",
    86: "heavy snow showers",
    95: "thunderstorm",
    96: "thunderstorm with light hail",
    99: "thunderstorm with heavy hail",
}


def get_weather(city: str) -> dict:
    """Get current weather conditions for a city.

    Makes two calls to Open-Meteo (no API key required):
    1. Geocoding to resolve city name to lat/lon.
    2. Forecast for current temperature, feels-like, precipitation, and wind.

    Args:
        city: City name to look up (e.g. "Indianapolis", "Chicago").

    Returns:
        Dict with keys: city, temperature, feels_like, precipitation, wind_speed, condition.
        All temperatures in fahrenheit, wind in km/h, precipitation in mm.
        Returns {"error": str} if the city is not found.
    """
    # Step 1 - geocode
    geo_url = (
        "https://geocoding-api.open-meteo.com/v1/search"
        f"?name={urllib.parse.quote(city)}&count=1"
    )
    with urllib.request.urlopen(geo_url, timeout=10) as resp:
        geo_data = json.loads(resp.read())

    results = geo_data.get("results")
    if not results:
        return {"error": f"City not found: {city}"}

    place = results[0]
    lat, lon = place["latitude"], place["longitude"]
    resolved_name = place.get("name", city)

    # Step 2 - current conditions
    forecast_url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        "&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m"
        "&temperature_unit=fahrenheit"
    )
    with urllib.request.urlopen(forecast_url, timeout=10) as resp:
        forecast_data = json.loads(resp.read())

    current = forecast_data["current"]
    code = current["weather_code"]
    condition = _WMO_CONDITIONS.get(code, f"weather code {code}")

    return {
        "city": resolved_name,
        "temperature": current["temperature_2m"],
        "feels_like": current["apparent_temperature"],
        "precipitation": current["precipitation"],
        "wind_speed": current["wind_speed_10m"],
        "condition": condition,
    }


def handler(event, context):
    """
    Get Weather tool Lambda handler for AgentCore Gateway.

    This Lambda follows the "one tool per Lambda" design pattern where each
    Lambda function implements exactly one tool.

    Args:
        event (dict): Tool arguments passed directly from gateway.
            Expected: {"city": "CityName"}
        context: Lambda context with AgentCore metadata in client_context.custom.

    Returns:
        dict: Response object with 'content' array or 'error' string.
    """
    logger.info(f"Received event: {json.dumps(event)}")

    try:
        # Get tool name from context and strip the target prefix
        delimiter = "___"
        original_tool_name = context.client_context.custom["bedrockAgentCoreToolName"]
        tool_name = original_tool_name[
            original_tool_name.index(delimiter) + len(delimiter):
        ]

        logger.info(f"Processing tool: {tool_name}")

        if tool_name == "get_weather":
            city = event.get("city", "")
            if not city:
                return {"error": "Missing required argument: city"}

            result = get_weather(city)

            if "error" in result:
                return {"content": [{"type": "text", "text": json.dumps(result)}]}

            return {"content": [{"type": "text", "text": json.dumps(result)}]}
        else:
            logger.error(f"Unexpected tool name: {tool_name}")
            return {
                "error": f"This Lambda only supports 'get_weather', received: {tool_name}"
            }

    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return {"error": f"Internal server error: {str(e)}"}
