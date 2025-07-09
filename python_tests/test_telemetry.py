"""Tests for OpenTelemetry integration."""

import os
import pytest
from unittest import mock

from optuna_dashboard._telemetry import OPENTELEMETRY_AVAILABLE
from optuna_dashboard._telemetry import initialize_telemetry
from optuna_dashboard._telemetry import instrument_bottle_app
from optuna_dashboard._telemetry import get_tracer
from optuna_dashboard._telemetry import get_meter


class TestTelemetryConfiguration:
    """Test OpenTelemetry configuration."""
    
    def test_opentelemetry_availability(self) -> None:
        """Test that OpenTelemetry availability is detected correctly."""
        # This test will pass regardless of whether OpenTelemetry is installed
        # since we handle both cases gracefully
        assert isinstance(OPENTELEMETRY_AVAILABLE, bool)
    
    def test_initialize_telemetry_disabled(self) -> None:
        """Test telemetry initialization when disabled."""
        with mock.patch.dict(os.environ, {"OTEL_SDK_DISABLED": "true"}):
            # Should not raise any exceptions
            initialize_telemetry()
    
    def test_initialize_telemetry_not_available(self) -> None:
        """Test telemetry initialization when OpenTelemetry is not available."""
        with mock.patch("optuna_dashboard._telemetry.OPENTELEMETRY_AVAILABLE", False):
            # Should not raise any exceptions
            initialize_telemetry()
    
    def test_get_tracer_not_available(self) -> None:
        """Test get_tracer when OpenTelemetry is not available."""
        with mock.patch("optuna_dashboard._telemetry.OPENTELEMETRY_AVAILABLE", False):
            tracer = get_tracer("test")
            assert tracer is None
    
    def test_get_meter_not_available(self) -> None:
        """Test get_meter when OpenTelemetry is not available."""
        with mock.patch("optuna_dashboard._telemetry.OPENTELEMETRY_AVAILABLE", False):
            meter = get_meter("test")
            assert meter is None
    
    def test_instrument_bottle_app_disabled(self) -> None:
        """Test bottle app instrumentation when disabled."""
        app = object()  # Mock bottle app
        
        with mock.patch.dict(os.environ, {"OTEL_SDK_DISABLED": "true"}):
            result = instrument_bottle_app(app)
            assert result is app  # Should return the same app without modification
    
    def test_instrument_bottle_app_not_available(self) -> None:
        """Test bottle app instrumentation when OpenTelemetry is not available."""
        app = object()  # Mock bottle app
        
        with mock.patch("optuna_dashboard._telemetry.OPENTELEMETRY_AVAILABLE", False):
            result = instrument_bottle_app(app)
            assert result is app  # Should return the same app without modification


class TestMetrics:
    """Test custom metrics functionality."""
    
    def test_metrics_creation_without_opentelemetry(self) -> None:
        """Test that metrics can be created even without OpenTelemetry."""
        from optuna_dashboard._metrics import OptunaMetrics
        
        with mock.patch("optuna_dashboard._metrics.get_meter", return_value=None):
            metrics = OptunaMetrics()
            # Should not raise any exceptions
            metrics.record_api_request("GET", "/api/studies", 200, 0.1)
            metrics.record_storage_operation("get_study", 0.05)
            metrics.record_error("ValueError", "/api/studies")
    
    def test_get_metrics_singleton(self) -> None:
        """Test that get_metrics returns the same instance."""
        from optuna_dashboard._metrics import get_metrics
        
        metrics1 = get_metrics()
        metrics2 = get_metrics()
        assert metrics1 is metrics2


class TestTelemetryMiddleware:
    """Test telemetry middleware functionality."""
    
    def test_api_telemetry_decorator_without_opentelemetry(self) -> None:
        """Test API telemetry decorator when OpenTelemetry is not available."""
        from optuna_dashboard._telemetry_middleware import api_telemetry
        
        @api_telemetry("/test")
        def test_function():
            return "test_result"
        
        # Should work without OpenTelemetry
        result = test_function()
        assert result == "test_result"
    
    def test_storage_telemetry_decorator_without_opentelemetry(self) -> None:
        """Test storage telemetry decorator when OpenTelemetry is not available."""
        from optuna_dashboard._telemetry_middleware import storage_telemetry
        
        @storage_telemetry("test_operation")
        def test_function():
            return "test_result"
        
        # Should work without OpenTelemetry
        result = test_function()
        assert result == "test_result"
    
    def test_api_telemetry_decorator_with_exception(self) -> None:
        """Test API telemetry decorator when function raises exception."""
        from optuna_dashboard._telemetry_middleware import api_telemetry
        
        @api_telemetry("/test")
        def test_function():
            raise ValueError("test error")
        
        # Should re-raise the exception
        with pytest.raises(ValueError, match="test error"):
            test_function()
    
    def test_storage_telemetry_decorator_with_exception(self) -> None:
        """Test storage telemetry decorator when function raises exception."""
        from optuna_dashboard._telemetry_middleware import storage_telemetry
        
        @storage_telemetry("test_operation")
        def test_function():
            raise ValueError("test error")
        
        # Should re-raise the exception
        with pytest.raises(ValueError, match="test error"):
            test_function()


@pytest.mark.skipif(not OPENTELEMETRY_AVAILABLE, reason="OpenTelemetry not available")
class TestTelemetryWithOpenTelemetry:
    """Test telemetry functionality when OpenTelemetry is available."""
    
    def test_initialize_telemetry_success(self) -> None:
        """Test successful telemetry initialization."""
        # This test will only run if OpenTelemetry is available
        initialize_telemetry()
        
        # Should be able to get tracer and meter
        tracer = get_tracer("test")
        meter = get_meter("test")
        
        assert tracer is not None
        assert meter is not None
