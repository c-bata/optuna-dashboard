#!/usr/bin/env python3
"""
Test script for OpenTelemetry integration with Optuna Dashboard.

This script demonstrates how to run Optuna Dashboard with OpenTelemetry
instrumentation enabled.
"""

import os
import tempfile
import time

import optuna

from optuna_dashboard import run_server


def create_sample_study() -> None:
    """Create a sample study with some trials for testing."""
    
    def objective(trial):
        x = trial.suggest_float('x', -10, 10)
        y = trial.suggest_float('y', -10, 10)
        return x**2 + y**2
    
    # Create a study
    study = optuna.create_study(direction='minimize')
    study.optimize(objective, n_trials=20)
    
    print(f"Created study '{study.study_name}' with {len(study.trials)} trials")


if __name__ == "__main__":
    # Set up OpenTelemetry environment variables for testing
    os.environ.setdefault("OTEL_SERVICE_NAME", "optuna-dashboard-test")
    os.environ.setdefault("OTEL_EXPORTER_PROMETHEUS_PORT", "9090")
    os.environ.setdefault("OTEL_TRACES_SAMPLER", "traceidratio")
    os.environ.setdefault("OTEL_TRACES_SAMPLER_ARG", "1.0")
    
    # Create a temporary database
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    print(f"Using temporary database: {db_path}")
    
    # Set the storage URL for Optuna
    storage_url = f"sqlite:///{db_path}"
    os.environ["OPTUNA_STORAGE"] = storage_url
    
    # Create sample data
    print("Creating sample study...")
    create_sample_study()
    
    print("\nStarting Optuna Dashboard with OpenTelemetry...")
    print("Dashboard will be available at: http://localhost:8080")
    print("Prometheus metrics will be available at: http://localhost:9090/metrics")
    print("\nPress Ctrl+C to stop the server")
    
    try:
        # Start the dashboard server
        run_server(
            storage=storage_url,
            host="localhost",
            port=8080,
            debug=True
        )
    except KeyboardInterrupt:
        print("\nShutting down server...")
    finally:
        # Clean up
        try:
            os.unlink(db_path)
            print(f"Cleaned up temporary database: {db_path}")
        except OSError:
            pass
