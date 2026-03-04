"""
Status Tracker Service
Provides real-time status updates for long-running operations like MinerU and Gemini.
"""

from typing import Optional, Dict, Any, Callable, List
from datetime import datetime
from enum import Enum
import asyncio


class ServiceName(str, Enum):
    BACKEND = "backend"
    MINERU = "mineru"
    GEMINI = "gemini"


class OperationStatus:
    """Status of a single operation."""
    
    def __init__(
        self,
        service: ServiceName,
        step: str = "",
        progress: int = 0,
        message: str = "",
        is_active: bool = False
    ):
        self.service = service
        self.step = step
        self.progress = progress
        self.message = message
        self.is_active = is_active
        self.started_at: Optional[datetime] = None
        self.updated_at: datetime = datetime.now()
    
    def to_dict(self) -> Dict[str, Any]:
        elapsed = 0
        if self.started_at:
            elapsed = (datetime.now() - self.started_at).total_seconds()
        
        return {
            "service": self.service.value,
            "step": self.step,
            "progress": self.progress,
            "message": self.message,
            "is_active": self.is_active,
            "elapsed_seconds": int(elapsed),
            "updated_at": self.updated_at.isoformat()
        }


class StatusTracker:
    """
    Singleton status tracker for all services.
    Maintains current status and notifies subscribers.
    """
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._statuses: Dict[ServiceName, OperationStatus] = {
            ServiceName.BACKEND: OperationStatus(ServiceName.BACKEND, message="Connected", is_active=True),
            ServiceName.MINERU: OperationStatus(ServiceName.MINERU, message="Ready"),
            ServiceName.GEMINI: OperationStatus(ServiceName.GEMINI, message="Ready"),
        }
        self._subscribers: List[asyncio.Queue] = []
        self._initialized = True
    
    def get_status(self, service: ServiceName) -> OperationStatus:
        """Get current status for a service."""
        return self._statuses.get(service)
    
    def get_all_statuses(self) -> Dict[str, Any]:
        """Get all service statuses."""
        return {
            name.value: status.to_dict()
            for name, status in self._statuses.items()
        }
    
    async def update_status(
        self,
        service: ServiceName,
        step: str = "",
        progress: int = 0,
        message: str = "",
        is_active: bool = True
    ):
        """Update status for a service and notify subscribers."""
        status = self._statuses.get(service)
        if not status:
            status = OperationStatus(service)
            self._statuses[service] = status
        
        # Update fields
        if not status.is_active and is_active:
            status.started_at = datetime.now()
        
        status.step = step
        status.progress = progress
        status.message = message
        status.is_active = is_active
        status.updated_at = datetime.now()
        
        # Notify subscribers
        await self._notify_subscribers()
    
    def clear_status(self, service: ServiceName):
        """Clear active status for a service."""
        status = self._statuses.get(service)
        if status:
            status.is_active = False
            status.step = ""
            status.progress = 0
            status.message = "Ready"
            status.started_at = None
            status.updated_at = datetime.now()
    
    def subscribe(self) -> asyncio.Queue:
        """Subscribe to status updates. Returns a queue for receiving updates."""
        queue = asyncio.Queue()
        self._subscribers.append(queue)
        return queue
    
    def unsubscribe(self, queue: asyncio.Queue):
        """Unsubscribe from status updates."""
        if queue in self._subscribers:
            self._subscribers.remove(queue)
    
    async def _notify_subscribers(self):
        """Send current status to all subscribers."""
        data = self.get_all_statuses()
        for queue in self._subscribers:
            try:
                await queue.put(data)
            except Exception:
                pass  # Ignore failed notifications


# Global instance
status_tracker = StatusTracker()


# Convenience functions
async def update_mineru_status(step: str, progress: int, message: str = ""):
    """Update MinerU operation status."""
    await status_tracker.update_status(
        ServiceName.MINERU,
        step=step,
        progress=progress,
        message=message,
        is_active=True
    )


async def update_gemini_status(step: str, progress: int, message: str = ""):
    """Update Gemini operation status."""
    await status_tracker.update_status(
        ServiceName.GEMINI,
        step=step,
        progress=progress,
        message=message,
        is_active=True
    )


def clear_mineru_status():
    """Clear MinerU status after operation completes."""
    status_tracker.clear_status(ServiceName.MINERU)


def clear_gemini_status():
    """Clear Gemini status after operation completes."""
    status_tracker.clear_status(ServiceName.GEMINI)
