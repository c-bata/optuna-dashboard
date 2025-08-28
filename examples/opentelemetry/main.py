from __future__ import annotations

import wsgiref.simple_server

from opentelemetry import metrics
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.metrics.export import ConsoleMetricExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.resources import Resource

import optuna_dashboard
from optuna_dashboard.opentelemetry import OpenTelemetryMiddleware


HOSTNAME = "0.0.0.0"
STORAGE_URL = "sqlite:///db.sqlite3"
OTEL_COLLECTOR_ENDPOINT = "http://localhost:4318/v1/metrics"


def main() -> None:
    resource = Resource.create({"service.name": "optuna-dashboard"})
    readers = [
        PeriodicExportingMetricReader(
            OTLPMetricExporter(endpoint=OTEL_COLLECTOR_ENDPOINT),
            export_interval_millis=1000,
            export_timeout_millis=5000,
        ),
    ]

    # If you want to see metrics in the console, uncomment the following line
    # readers.append(PeriodicExportingMetricReader(ConsoleMetricExporter()))

    # If you want to use PrometheusMetricReader, uncomment the following lines
    # from prometheus_client import start_http_server
    # from opentelemetry.exporter.prometheus import PrometheusMetricReader
    # print("Metrics endpoint: http://localhost:9464/metrics")
    # start_http_server(port=9464, addr="0.0.0.0")
    # readers.append(PrometheusMetricReader("optuna_dashboard"))

    metrics.set_meter_provider(MeterProvider(resource=resource, metric_readers=readers))

    # Start Optuna Dashboard with opentelemetry-instrumentation-wsgi middleware
    app = optuna_dashboard.wsgi(storage=STORAGE_URL)
    app = OpenTelemetryMiddleware(app)

    print("Starting Optuna Dashboard with Prometheus metrics...")
    print("Dashboard: http://localhost:8080")
    with wsgiref.simple_server.make_server(HOSTNAME, 8080, app) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    main()
