from __future__ import annotations

from typing import Collection
from opentelemetry.instrumentation.instrumentor import BaseInstrumentor
from opentelemetry.metrics import get_meter
from bottle import Bottle


class OptunaDashboardInstrumentor(BaseInstrumentor):
    def instrumentation_dependencies(self) -> Collection[str]:
        return ["opentelemetry-instrumentation-wsgi"]
    
    def instrument(self, **kwargs):
        # Auto-instrumentation logic
        pass
    
    def uninstrument(self, **kwargs):
        # Cleanup logic
        pass
