"""Middleware and decorators for OpenTelemetry instrumentation."""

from __future__ import annotations

import functools
import logging
import time
from typing import Any
from typing import Callable

from bottle import request
from bottle import response

from ._metrics import get_metrics
from ._telemetry import get_tracer

logger = logging.getLogger(__name__)


def api_telemetry(endpoint_name: str) -> Callable[[Any], Any]:
    """
    Decorator to add telemetry to API endpoints.
    
    Args:
        endpoint_name: Name of the endpoint for metrics labeling
    """
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            tracer = get_tracer("optuna_dashboard.api")
            metrics = get_metrics()
            
            start_time = time.time()
            
            # Extract request information
            method = request.environ.get("REQUEST_METHOD", "UNKNOWN")
            
            # Start tracing span
            span_name = f"{method} {endpoint_name}"
            
            if tracer:
                with tracer.start_as_current_span(span_name) as span:
                    # Add span attributes
                    span.set_attribute("http.method", method)
                    span.set_attribute("http.route", endpoint_name)
                    span.set_attribute("http.scheme", request.environ.get("wsgi.url_scheme", "http"))
                    
                    try:
                        result = func(*args, **kwargs)
                        status_code = getattr(response, 'status_code', 200)
                        span.set_attribute("http.status_code", status_code)
                        return result
                    except Exception as e:
                        status_code = 500
                        span.set_attribute("http.status_code", status_code)
                        span.record_exception(e)
                        metrics.record_error(type(e).__name__, endpoint_name)
                        raise
                    finally:
                        duration = time.time() - start_time
                        metrics.record_api_request(method, endpoint_name, status_code, duration)
            else:
                # Fallback without tracing
                status_code = 200
                try:
                    result = func(*args, **kwargs)
                    status_code = getattr(response, 'status_code', 200)
                    return result
                except Exception as e:
                    status_code = 500
                    metrics.record_error(type(e).__name__, endpoint_name)
                    raise
                finally:
                    duration = time.time() - start_time
                    metrics.record_api_request(method, endpoint_name, status_code, duration)
            
        return wrapper
    return decorator


def storage_telemetry(operation: str) -> Callable[[Any], Any]:
    """
    Decorator to add telemetry to storage operations.
    
    Args:
        operation: Name of the storage operation
    """
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            tracer = get_tracer("optuna_dashboard.storage")
            metrics = get_metrics()
            
            start_time = time.time()
            
            if tracer:
                with tracer.start_as_current_span(f"storage.{operation}") as span:
                    span.set_attribute("storage.operation", operation)
                    
                    try:
                        result = func(*args, **kwargs)
                        metrics.record_storage_operation(operation, time.time() - start_time, True)
                        return result
                    except Exception as e:
                        span.record_exception(e)
                        metrics.record_storage_operation(operation, time.time() - start_time, False)
                        raise
            else:
                # Fallback without tracing
                try:
                    result = func(*args, **kwargs)
                    metrics.record_storage_operation(operation, time.time() - start_time, True)
                    return result
                except Exception as e:
                    metrics.record_storage_operation(operation, time.time() - start_time, False)
                    raise
            
        return wrapper
    return decorator
