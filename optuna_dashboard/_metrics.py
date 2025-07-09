"""Custom metrics for Optuna Dashboard using OpenTelemetry."""

from __future__ import annotations

import logging
from typing import Any
from typing import Dict

from ._telemetry import get_meter

logger = logging.getLogger(__name__)


class OptunaMetrics:
    """Custom metrics collector for Optuna Dashboard."""
    
    def __init__(self) -> None:
        self.meter = get_meter("optuna_dashboard.metrics")
        self._setup_metrics()
    
    def _setup_metrics(self) -> None:
        """Setup custom metrics instruments."""
        if self.meter is None:
            logger.info("OpenTelemetry meter not available. Metrics will not be collected.")
            return
        
        # API request metrics
        self.api_request_counter = self.meter.create_counter(
            name="optuna_api_requests_total",
            description="Total number of API requests",
            unit="1"
        )
        
        self.api_request_duration = self.meter.create_histogram(
            name="optuna_api_request_duration_seconds",
            description="Duration of API requests in seconds",
            unit="s"
        )
        
        # Study metrics
        self.study_count_gauge = self.meter.create_up_down_counter(
            name="optuna_studies_total",
            description="Total number of studies",
            unit="1"
        )
        
        self.trial_count_gauge = self.meter.create_up_down_counter(
            name="optuna_trials_total",
            description="Total number of trials",
            unit="1"
        )
        
        # Storage operation metrics
        self.storage_operation_counter = self.meter.create_counter(
            name="optuna_storage_operations_total",
            description="Total number of storage operations",
            unit="1"
        )
        
        self.storage_operation_duration = self.meter.create_histogram(
            name="optuna_storage_operation_duration_seconds",
            description="Duration of storage operations in seconds",
            unit="s"
        )
        
        # Error metrics
        self.error_counter = self.meter.create_counter(
            name="optuna_errors_total",
            description="Total number of errors",
            unit="1"
        )
    
    def record_api_request(self, method: str, endpoint: str, status_code: int, duration: float) -> None:
        """Record API request metrics."""
        if self.meter is None:
            return
        
        attributes = {
            "method": method,
            "endpoint": endpoint,
            "status_code": str(status_code),
        }
        
        self.api_request_counter.add(1, attributes)
        self.api_request_duration.record(duration, attributes)
    
    def record_study_count(self, count: int) -> None:
        """Record current study count."""
        if self.meter is None:
            return
        
        # Note: This should be implemented as a gauge when available
        # For now, we use an up_down_counter
        pass
    
    def record_trial_count(self, study_id: int, count: int) -> None:
        """Record trial count for a study."""
        if self.meter is None:
            return
        
        attributes = {"study_id": str(study_id)}
        # Note: This should be implemented as a gauge when available
        pass
    
    def record_storage_operation(self, operation: str, duration: float, success: bool = True) -> None:
        """Record storage operation metrics."""
        if self.meter is None:
            return
        
        attributes = {
            "operation": operation,
            "success": str(success),
        }
        
        self.storage_operation_counter.add(1, attributes)
        self.storage_operation_duration.record(duration, attributes)
    
    def record_error(self, error_type: str, endpoint: str | None = None) -> None:
        """Record error occurrence."""
        if self.meter is None:
            return
        
        attributes = {"error_type": error_type}
        if endpoint:
            attributes["endpoint"] = endpoint
        
        self.error_counter.add(1, attributes)


# Global metrics instance
_metrics_instance: OptunaMetrics | None = None


def get_metrics() -> OptunaMetrics:
    """Get the global metrics instance."""
    global _metrics_instance
    if _metrics_instance is None:
        _metrics_instance = OptunaMetrics()
    return _metrics_instance
