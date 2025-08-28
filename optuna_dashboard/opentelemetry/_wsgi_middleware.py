from __future__ import annotations

import typing

from bottle import Bottle
from opentelemetry.instrumentation.wsgi import OpenTelemetryMiddleware as OtelWsgiMiddleware


if typing.TYPE_CHECKING:
    from typing import Callable
    from typing import Iterable

    from _typeshed import OptExcInfo
    from _typeshed.wsgi import WSGIApplication
    from _typeshed.wsgi import WSGIEnvironment
    from _typeshed.wsgi import StartResponse


class OpenTelemetryMiddleware:
    def __init__(self, app: WSGIApplication | Bottle) -> None:
        self.app = OtelWsgiMiddleware(app)

    def __call__(self, env: WSGIEnvironment, start_response: StartResponse) -> Iterable[bytes]:
        return self.app(env, start_response)
