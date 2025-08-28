from __future__ import annotations

from typing import TYPE_CHECKING

import wrapt
from opentelemetry import metrics
from opentelemetry.instrumentation.instrumentor import BaseInstrumentor
from opentelemetry.instrumentation.utils import unwrap
from opentelemetry.metrics import MeterProvider
from opentelemetry.instrumentation.wsgi import OpenTelemetryMiddleware

import optuna_dashboard

if TYPE_CHECKING:
    from typing import Any
    from typing import Collection


__all__ = [
    "OptunaDashboardInstrumentor"
]


class OptunaDashboardInstrumentor(BaseInstrumentor):
    def instrumentation_dependencies(self) -> Collection[str]:
        return []

    def _instrument(self, **kwargs: Any) -> None:
        meter_provider: MeterProvider | None = kwargs.get("meter_provider")
        tracer_provider = kwargs.get("tracer_provider")
        
        meter = metrics.get_meter(
            "optuna_dashboard",
            optuna_dashboard.__version__,
            meter_provider,
        )

        def wrap_create_app(wrapped, instance, args, kwargs):  # type: ignore
            app = wrapped(*args, **kwargs)
            return OpenTelemetryMiddleware(
                app, 
                tracer_provider=tracer_provider,
                meter_provider=meter_provider
            )

        trials_histogram = meter.create_histogram(
            name="optuna_dashboard_trials_total",
            unit="trials",
            description="Number of trials retrieved by get_trials function",
        )

        def wrap_get_trials(wrapped, instance, args, kwargs):  # type: ignore
            trials = wrapped(*args, **kwargs)
            # get_trials signature: (in_memory_cache, storage, study_id)
            study_id = args[2] if len(args) > 2 else kwargs.get("study_id", "unknown")
            trials_histogram.record(
                len(trials),
                attributes={
                    "study_id": str(study_id),
                    "from_cache": "unknown",
                },
            )
            return trials

        from optuna_dashboard import _storage, _app

        wrapt.wrap_function_wrapper(_storage, "get_trials", wrap_get_trials)
        wrapt.wrap_function_wrapper(_app, "get_trials", wrap_get_trials)
        wrapt.wrap_function_wrapper(_app, "create_app", wrap_create_app)

    def _uninstrument(self, **kwargs: Any) -> None:
        from optuna_dashboard import _storage, _app

        unwrap(_app, "create_app")
        unwrap(_storage, "get_trials")
        unwrap(_app, "get_trials")
