"""OpenTelemetry configuration for Optuna Dashboard."""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# Optional OpenTelemetry imports
try:
    from opentelemetry import metrics
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.exporter.prometheus import PrometheusMetricReader
    from opentelemetry.instrumentation.bottle import BottleInstrumentor
    from opentelemetry.instrumentation.wsgi import OpenTelemetryMiddleware
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.semantic_conventions.resource import ResourceAttributes
    OPENTELEMETRY_AVAILABLE = True
except ImportError:
    logger.info("OpenTelemetry packages not available. Telemetry features will be disabled.")
    OPENTELEMETRY_AVAILABLE = False


def _get_resource() -> Any:
    """Create OpenTelemetry resource with service information."""
    if not OPENTELEMETRY_AVAILABLE:
        return None
    
    return Resource.create({
        ResourceAttributes.SERVICE_NAME: "optuna-dashboard",
        ResourceAttributes.SERVICE_VERSION: "1.0.0",  # TODO: Get from package version
        ResourceAttributes.SERVICE_NAMESPACE: "optuna",
    })


def _setup_tracing() -> None:
    """Setup OpenTelemetry tracing."""
    if not OPENTELEMETRY_AVAILABLE:
        return
    
    resource = _get_resource()
    
    # Create tracer provider
    tracer_provider = TracerProvider(resource=resource)
    
    # Setup OTLP exporter if endpoint is configured
    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
    if otlp_endpoint:
        otlp_exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
        tracer_provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
        logger.info(f"OTLP trace exporter configured for endpoint: {otlp_endpoint}")
    
    # Set as global tracer provider
    trace.set_tracer_provider(tracer_provider)


def _setup_metrics() -> None:
    """Setup OpenTelemetry metrics."""
    if not OPENTELEMETRY_AVAILABLE:
        return
    
    resource = _get_resource()
    
    metric_readers = []
    
    # Setup Prometheus exporter if enabled
    prometheus_port = os.getenv("OTEL_EXPORTER_PROMETHEUS_PORT")
    if prometheus_port:
        prometheus_reader = PrometheusMetricReader(port=int(prometheus_port))
        metric_readers.append(prometheus_reader)
        logger.info(f"Prometheus metric exporter configured on port: {prometheus_port}")
    
    # Setup OTLP exporter if endpoint is configured
    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT")
    if otlp_endpoint:
        otlp_exporter = OTLPMetricExporter(endpoint=otlp_endpoint)
        otlp_reader = PeriodicExportingMetricReader(otlp_exporter, export_interval_millis=30000)
        metric_readers.append(otlp_reader)
        logger.info(f"OTLP metric exporter configured for endpoint: {otlp_endpoint}")
    
    # Create meter provider
    meter_provider = MeterProvider(resource=resource, metric_readers=metric_readers)
    
    # Set as global meter provider
    metrics.set_meter_provider(meter_provider)


def initialize_telemetry() -> None:
    """Initialize OpenTelemetry tracing and metrics."""
    if not OPENTELEMETRY_AVAILABLE:
        logger.info("OpenTelemetry packages not available. Skipping telemetry initialization.")
        return
    
    # Check if telemetry is enabled
    if not os.getenv("OTEL_SDK_DISABLED", "false").lower() == "false":
        logger.info("OpenTelemetry is disabled via OTEL_SDK_DISABLED")
        return
    
    logger.info("Initializing OpenTelemetry telemetry")
    
    try:
        _setup_tracing()
        _setup_metrics()
        logger.info("OpenTelemetry telemetry initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize OpenTelemetry: {e}")
        raise


def instrument_bottle_app(app: Any) -> Any:
    """Instrument Bottle application with OpenTelemetry."""
    if not OPENTELEMETRY_AVAILABLE:
        logger.info("OpenTelemetry not available. Returning app without instrumentation.")
        return app
    
    if os.getenv("OTEL_SDK_DISABLED", "false").lower() == "true":
        return app
    
    try:
        # Instrument Bottle
        BottleInstrumentor().instrument_app(app)
        logger.info("Bottle application instrumented with OpenTelemetry")
        
        # Add WSGI middleware for additional instrumentation
        app = OpenTelemetryMiddleware(app)
        logger.info("WSGI middleware added for OpenTelemetry")
        
        return app
    except Exception as e:
        logger.error(f"Failed to instrument Bottle app: {e}")
        return app


def get_tracer(name: str) -> Any:
    """Get a tracer instance."""
    if not OPENTELEMETRY_AVAILABLE:
        return None
    return trace.get_tracer(name)


def get_meter(name: str) -> Any:
    """Get a meter instance."""
    if not OPENTELEMETRY_AVAILABLE:
        return None
    return metrics.get_meter(name)
