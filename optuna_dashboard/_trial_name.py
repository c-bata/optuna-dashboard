from __future__ import annotations

from typing import Any
import optuna


SYSTEM_ATTR_TRIAL_NAME = "name"


def set_trial_name(trial: optuna.trial.Trial, name: str) -> None:
    storage = trial.storage
    storage.set_trial_system_attr(trial._trial_id, "name", name)


def get_trial_name(trial_system_attrs: dict[str, Any]) -> None:
    return trial_system_attrs.get(SYSTEM_ATTR_TRIAL_NAME)
