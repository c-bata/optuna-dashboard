# OpenTelemetry Integration

Optuna Dashboard supports OpenTelemetry for observability and monitoring. This integration provides:

1. **Distributed Tracing**: Track requests across the API server and frontend
2. **Custom Metrics**: Monitor study counts, trial performance, and API usage
3. **Error Tracking**: Capture and trace errors across the application

## Installation

To use OpenTelemetry features, install the optional dependencies:

```bash
pip install optuna-dashboard[opentelemetry]
```

## Configuration

OpenTelemetry can be configured using environment variables:

### Basic Configuration

```bash
# Enable OpenTelemetry (default: enabled)
export OTEL_SDK_DISABLED=false

# Service identification
export OTEL_SERVICE_NAME=optuna-dashboard
export OTEL_SERVICE_VERSION=1.0.0
```

### Tracing Configuration

#### Using Jaeger (via OTLP)

```bash
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:14250
export OTEL_TRACES_SAMPLER=traceidratio
export OTEL_TRACES_SAMPLER_ARG=1.0  # Sample 100% of traces
```

#### Using Generic OTLP Collector

```bash
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://your-collector:4317
export OTEL_EXPORTER_OTLP_HEADERS="x-api-key=your-api-key"
```

### Metrics Configuration

#### Prometheus Metrics

```bash
# Expose metrics on Prometheus format
export OTEL_EXPORTER_PROMETHEUS_PORT=9090
```

#### OTLP Metrics

```bash
export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:4317
export OTEL_METRIC_EXPORT_INTERVAL=30000  # Export every 30 seconds
```

## Available Metrics

### API Metrics

- `optuna_api_requests_total`: Total number of API requests
- `optuna_api_request_duration_seconds`: Duration of API requests
- `optuna_errors_total`: Total number of errors

### Study Metrics

- `optuna_studies_total`: Total number of studies
- `optuna_trials_total`: Total number of trials per study

### Storage Metrics

- `optuna_storage_operations_total`: Total number of storage operations
- `optuna_storage_operation_duration_seconds`: Duration of storage operations

## Example Usage

### Development Setup with Jaeger and Prometheus

1. Start Jaeger (using Docker):

```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 14250:14250 \
  jaegertracing/all-in-one:latest
```

2. Configure environment:

```bash
export OTEL_SERVICE_NAME=optuna-dashboard
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:14250
export OTEL_EXPORTER_PROMETHEUS_PORT=9090
export OTEL_TRACES_SAMPLER=traceidratio
export OTEL_TRACES_SAMPLER_ARG=1.0
```

3. Start Optuna Dashboard:

```bash
optuna-dashboard sqlite:///example.db
```

4. Access observability tools:
   - Jaeger UI: http://localhost:16686
   - Prometheus metrics: http://localhost:9090/metrics
   - Dashboard: http://localhost:8080

### Production Setup

For production deployments, use a proper OTLP collector and adjust sampling rates:

```bash
export OTEL_SERVICE_NAME=optuna-dashboard
export OTEL_EXPORTER_OTLP_ENDPOINT=https://your-collector:4317
export OTEL_EXPORTER_OTLP_HEADERS="x-api-key=your-api-key"
export OTEL_TRACES_SAMPLER=traceidratio
export OTEL_TRACES_SAMPLER_ARG=0.1  # Sample 10% of traces
```

## Testing

Use the provided test script to verify your OpenTelemetry setup:

```bash
python examples/test_opentelemetry.py
```

This script will:
1. Create a sample study with trials
2. Start the dashboard with OpenTelemetry enabled
3. Expose Prometheus metrics on port 9090

## Troubleshooting

### OpenTelemetry Not Working

1. Verify that OpenTelemetry packages are installed:
   ```bash
   pip list | grep opentelemetry
   ```

2. Check that environment variables are set correctly:
   ```bash
   echo $OTEL_SERVICE_NAME
   echo $OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
   ```

3. Look for OpenTelemetry initialization messages in the logs.

### No Metrics Available

1. Ensure that the Prometheus port is not blocked:
   ```bash
   curl http://localhost:9090/metrics
   ```

2. Check that the `OTEL_EXPORTER_PROMETHEUS_PORT` environment variable is set.

### No Traces Visible

1. Verify that your tracing backend is running and accessible.
2. Check the sampling configuration - you might be sampling too few traces.
3. Ensure the OTLP endpoint is correct and reachable.

## Disabling OpenTelemetry

To completely disable OpenTelemetry:

```bash
export OTEL_SDK_DISABLED=true
```

Or simply don't install the OpenTelemetry dependencies - the dashboard will work normally without them.
