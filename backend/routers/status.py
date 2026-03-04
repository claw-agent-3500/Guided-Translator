"""
Status Router
Provides SSE endpoint for real-time status updates.
"""

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse
import asyncio
import json

from services.status_tracker import status_tracker

router = APIRouter(prefix="/api/status", tags=["status"])


@router.get("/stream")
async def status_stream():
    """
    Server-Sent Events endpoint for real-time status updates.
    Clients can subscribe to receive status updates for all services.
    """
    async def event_generator():
        queue = status_tracker.subscribe()
        try:
            # Send initial status
            initial = status_tracker.get_all_statuses()
            yield {
                "event": "status",
                "data": json.dumps(initial)
            }
            
            # Send heartbeat and updates
            heartbeat_interval = 10  # seconds
            last_heartbeat = asyncio.get_event_loop().time()
            
            while True:
                try:
                    # Wait for update with timeout for heartbeat
                    try:
                        data = await asyncio.wait_for(queue.get(), timeout=heartbeat_interval)
                        yield {
                            "event": "status",
                            "data": json.dumps(data)
                        }
                        last_heartbeat = asyncio.get_event_loop().time()
                    except asyncio.TimeoutError:
                        # Send heartbeat to keep connection alive
                        current_time = asyncio.get_event_loop().time()
                        if current_time - last_heartbeat >= heartbeat_interval:
                            yield {
                                "event": "heartbeat",
                                "data": json.dumps({"timestamp": current_time})
                            }
                            last_heartbeat = current_time
                except Exception as e:
                    yield {
                        "event": "error",
                        "data": json.dumps({"message": str(e)})
                    }
                    break
                    
        finally:
            status_tracker.unsubscribe(queue)
    
    return EventSourceResponse(event_generator())


@router.get("")
async def get_status():
    """Get current status of all services (polling endpoint)."""
    return status_tracker.get_all_statuses()
