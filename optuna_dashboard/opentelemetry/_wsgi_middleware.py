from __future__ import annotations

import typing
import functools

from bottle import Bottle
from opentelemetry import metrics
from opentelemetry.instrumentation.wsgi import OpenTelemetryMiddleware as OtelWsgiMiddleware


if typing.TYPE_CHECKING:
    from typing import Iterable

    from _typeshed import OptExcInfo
    from _typeshed.wsgi import WSGIApplication
    from _typeshed.wsgi import WSGIEnvironment
    from _typeshed.wsgi import StartResponse


class OpenTelemetryMiddleware:
    def __init__(
        self,
        app: WSGIApplication | Bottle,
        *,
        meter_provider: metrics.MeterProvider | None = None,
    ) -> None:
        """
        Args:
            app: A Bottle object.
            meter_provider: Optional meter provider to use. If omitted, the current globally configured one is used.
        """
        self._app = OtelWsgiMiddleware(app, meter_provider=meter_provider)
        self._meter_provider = meter_provider

        self._setup_metrics_instrumentation()

    def _setup_metrics_instrumentation(self) -> None:
        """Setup OpenTelemetry metrics instrumentation for optuna-dashboard."""
        from optuna_dashboard import _storage
        from optuna_dashboard import __version__

        meter = metrics.get_meter(
            "optuna_dashboard",
            __version__,
            self._meter_provider,
        )

        trials_histogram = meter.create_histogram(
            name="optuna_dashboard_trials_total",
            unit="trials",
            description="Number of trials retrieved by get_trials function",
        )

        original_get_trials = _storage.get_trials

        @functools.wraps(original_get_trials)
        def instrumented_get_trials(*args, **kwargs):  # type: ignore
            # Call the original function
            trials = original_get_trials(*args, **kwargs)

            # Record the number of trials as a metric
            study_id = args[2] if len(args) > 2 else kwargs.get("study_id", "unknown")
            trials_histogram.record(
                len(trials),
                attributes={
                    "study_id": str(study_id),
                    "from_cache": "unknown",  # Could be enhanced to detect cache hits
                },
            )
            return trials
        _storage.get_trials = instrumented_get_trials

    def __call__(self, env: WSGIEnvironment, start_response: StartResponse) -> Iterable[bytes]:
        return self._app(env, start_response)
