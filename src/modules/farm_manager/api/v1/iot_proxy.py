"""
IoT Proxy API Routes

Proxy endpoints for IoT controller communication to handle CORS and provide a secure gateway.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status, Request
from typing import Any, Dict, Optional
from urllib.parse import unquote
import httpx
import logging

from ...middleware.auth import get_current_active_user, CurrentUser
from ...utils.responses import SuccessResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/iot-proxy", tags=["iot-proxy"])


@router.get(
    "",
    response_model=SuccessResponse[Dict[str, Any]],
    summary="Proxy GET request to IoT controller"
)
async def proxy_get_request(
    url: str = Query(..., description="URL-encoded target URL of the IoT controller endpoint"),
    apiKey: Optional[str] = Query(None, description="API key to forward to IoT controller (X-API-Key header)"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Proxy a GET request to an IoT controller (Raspberry Pi/ESP32).

    **Purpose:**
    - Handles CORS issues (IoT devices typically don't have CORS headers)
    - Provides a secure gateway for IoT communication
    - Allows frontend to fetch sensor and relay data through the API

    **Query Parameters:**
    - `url`: URL-encoded full URL of the IoT controller endpoint
      Example: `http://192.168.1.100:8090/sensors`

    **Security:**
    - Requires authentication (any logged-in user can access)
    - 5-second timeout to prevent hanging requests
    - Validates URL format
    - Only allows HTTP GET requests

    **Use Cases:**
    - Frontend fetches sensor data from IoT controller
    - Frontend queries relay status from IoT controller
    - Discover available sensors and relays

    **Example Frontend Usage:**
    ```javascript
    const controllerUrl = `http://${block.iotController.address}:${block.iotController.port}/sensors`;
    const encodedUrl = encodeURIComponent(controllerUrl);
    const response = await fetch(`/api/v1/farm/iot-proxy?url=${encodedUrl}`);
    const data = await response.json();
    ```

    **Returns:**
    The response from the IoT controller as-is (JSON or plain text)
    """
    # Decode URL
    decoded_url = unquote(url)

    logger.info(f"[IoT Proxy] GET request from user {current_user.email} to {decoded_url}")

    # Validate URL format (basic security check)
    if not decoded_url.startswith(('http://', 'https://')):
        logger.warning(f"[IoT Proxy] Invalid URL format: {decoded_url}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid URL format. URL must start with http:// or https://"
        )

    # Reason: Use httpx for async HTTP requests with timeout to prevent hanging
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Reason: Forward API key as X-API-Key header if provided
            headers = {}
            if apiKey:
                headers["X-API-Key"] = apiKey

            response = await client.get(decoded_url, headers=headers)

            # Reason: Check if response is successful before processing
            response.raise_for_status()

            # Reason: Try to parse JSON, fallback to text if not JSON
            try:
                data = response.json()
            except Exception:
                data = {"response": response.text}

            logger.info(f"[IoT Proxy] Successfully proxied GET request to {decoded_url}")

            return SuccessResponse(
                data=data,
                message="IoT controller request successful"
            )

    except httpx.TimeoutException:
        logger.error(f"[IoT Proxy] Timeout connecting to {decoded_url}")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"Timeout connecting to IoT controller at {decoded_url}"
        )
    except httpx.HTTPStatusError as e:
        logger.error(f"[IoT Proxy] HTTP error from {decoded_url}: {e.response.status_code}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"IoT controller returned error: {e.response.status_code}"
        )
    except httpx.RequestError as e:
        logger.error(f"[IoT Proxy] Request error to {decoded_url}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect to IoT controller: {str(e)}"
        )
    except Exception as e:
        logger.error(f"[IoT Proxy] Unexpected error proxying to {decoded_url}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while proxying the request"
        )


@router.put(
    "",
    response_model=SuccessResponse[Dict[str, Any]],
    summary="Proxy PUT request to IoT controller (for relay control)"
)
async def proxy_put_request(
    url: str = Query(..., description="URL-encoded target URL of the IoT controller endpoint"),
    apiKey: Optional[str] = Query(None, description="API key to forward to IoT controller (X-API-Key header)"),
    request: Request = None,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Proxy a PUT request to an IoT controller (for relay control).

    **Purpose:**
    - Handles CORS issues for PUT requests
    - Allows frontend to control relays through the API
    - Provides a secure gateway for IoT control commands

    **Query Parameters:**
    - `url`: URL-encoded full URL of the IoT controller endpoint
      Example: `http://192.168.1.100:8090/relays/1`

    **Request Body:**
    The request body is forwarded as-is to the IoT controller.
    Typically JSON for relay control:
    ```json
    {
      "state": "on"
    }
    ```

    **Security:**
    - Requires authentication (any logged-in user can control)
    - 5-second timeout to prevent hanging requests
    - Validates URL format
    - Only allows HTTP PUT requests

    **Use Cases:**
    - Frontend controls irrigation relays
    - Frontend controls lighting relays
    - Frontend controls ventilation relays

    **Example Frontend Usage:**
    ```javascript
    const controllerUrl = `http://${block.iotController.address}:${block.iotController.port}/relays/1`;
    const encodedUrl = encodeURIComponent(controllerUrl);
    const response = await fetch(`/api/v1/farm/iot-proxy?url=${encodedUrl}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'on' })
    });
    ```

    **Returns:**
    The response from the IoT controller as-is
    """
    # Decode URL
    decoded_url = unquote(url)

    logger.info(f"[IoT Proxy] PUT request from user {current_user.email} to {decoded_url}")

    # Validate URL format
    if not decoded_url.startswith(('http://', 'https://')):
        logger.warning(f"[IoT Proxy] Invalid URL format: {decoded_url}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid URL format. URL must start with http:// or https://"
        )

    # Reason: Get request body to forward to IoT controller
    try:
        body = await request.body()
    except Exception as e:
        logger.error(f"[IoT Proxy] Failed to read request body: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to read request body"
        )

    # Reason: Use httpx for async HTTP requests with timeout
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Reason: Forward the request body, content-type header, and API key
            headers = {}
            if request.headers.get("content-type"):
                headers["content-type"] = request.headers.get("content-type")
            # Reason: Forward API key as X-API-Key header if provided (required for Pi relay control)
            if apiKey:
                headers["X-API-Key"] = apiKey

            response = await client.put(
                decoded_url,
                content=body,
                headers=headers
            )

            # Reason: Check if response is successful
            response.raise_for_status()

            # Reason: Try to parse JSON, fallback to text
            try:
                data = response.json()
            except Exception:
                data = {"response": response.text}

            logger.info(f"[IoT Proxy] Successfully proxied PUT request to {decoded_url}")

            return SuccessResponse(
                data=data,
                message="IoT controller control command successful"
            )

    except httpx.TimeoutException:
        logger.error(f"[IoT Proxy] Timeout connecting to {decoded_url}")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"Timeout connecting to IoT controller at {decoded_url}"
        )
    except httpx.HTTPStatusError as e:
        logger.error(f"[IoT Proxy] HTTP error from {decoded_url}: {e.response.status_code}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"IoT controller returned error: {e.response.status_code}"
        )
    except httpx.RequestError as e:
        logger.error(f"[IoT Proxy] Request error to {decoded_url}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect to IoT controller: {str(e)}"
        )
    except Exception as e:
        logger.error(f"[IoT Proxy] Unexpected error proxying to {decoded_url}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while proxying the request"
        )
