import * as Optuna from "@optuna/entity"

export type SQLite3Driver = {
  exec(options: {
    sql: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (...args: any[]) => void
  }): void
  close(): void
}

export const loadSQLite3Storage = (
  db: SQLite3Driver,
  setter: (setter: (prev: Optuna.Study[]) => Optuna.Study[]) => void
): void => {
  try {
    const schemaVersion = getSchemaVersion(db)
    if (!isSupportedSchema(schemaVersion)) {
      return
    }
    const studies = getStudies(db, schemaVersion)
    setter((prev) => [...prev, ...studies])
  } finally {
    db.close()
  }
}

const getSchemaVersion = (db: SQLite3Driver): string => {
  let schemaVersion = ""
  db.exec({
    sql: "SELECT version_num FROM alembic_version LIMIT 1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (vals: any[]) => {
      schemaVersion = vals[0]
    },
  })
  return schemaVersion
}

const isSupportedSchema = (schemaVersion: string): boolean => {
  const lowestVersion = "v2.6.0.a" // supported: "v3.2.0.a", "v3.0.0.{a,b,c,d}", "v2.6.0.a"
  if (schemaVersion === lowestVersion) return true
  return isGreaterSchemaVersion(schemaVersion, lowestVersion)
}

const isGreaterSchemaVersion = (
  leftVersion: string,
  rightVersion: string
): boolean => {
  // return leftVersion > rightVersion
  const leftSuffix = leftVersion.split(".").reverse()[0]
  const rightSuffix = rightVersion.split(".").reverse()[0]
  leftVersion = leftVersion.replace(/\D/g, "")
  rightVersion = rightVersion.replace(/\D/g, "")

  const left = Number(leftVersion)
  const right = Number(rightVersion)
  if (left === right) return leftSuffix > rightSuffix
  return left > right
}

const getStudies = (
  db: SQLite3Driver,
  schemaVersion: string
): Optuna.Study[] => {
  const studies: Optuna.Study[] = []
  db.exec({
    sql:
      "SELECT s.study_id, s.study_name, sd.direction, sd.objective" +
      " FROM studies AS s INNER JOIN study_directions AS sd" +
      " ON s.study_id = sd.study_id ORDER BY sd.study_direction_id",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (vals: any[]) => {
      const studyId = vals[0]
      const studyName = vals[1]
      const direction: Optuna.StudyDirection =
        vals[2] === "MINIMIZE" ? "minimize" : "maximize"
      const objective = vals[3]

      const trials = getTrials(db, studyId, schemaVersion)
      const union_search_space: Optuna.SearchSpaceItem[] = []
      const union_user_attrs: Optuna.AttributeSpec[] = []
      let intersection_search_space: Set<Optuna.SearchSpaceItem> = new Set()
      trials.forEach((trial) => {
        const userAttrs = getTrialUserAttributes(db, trial.trial_id)
        userAttrs.forEach((attr) => {
          if (union_user_attrs.findIndex((s) => s.key === attr.key) === -1) {
            union_user_attrs.push({ key: attr.key, sortable: false })
          }
        })

        const params = getTrialParams(db, trial.trial_id)
        const param_names = new Set<string>()
        params.forEach((param) => {
          param_names.add(param.name)
          if (
            union_search_space.findIndex((s) => s.name === param.name) === -1
          ) {
            union_search_space.push({ name: param.name })
          }
        })
        if (intersection_search_space.size === 0) {
          param_names.forEach((s) => {
            intersection_search_space.add({
              name: s,
            })
          })
        } else {
          intersection_search_space = new Set(
            Array.from(intersection_search_space).filter((s) =>
              param_names.has(s.name)
            )
          )
        }
        trial.params = params
        trial.user_attrs = userAttrs
      })

      if (objective === 0) {
        studies.push({
          study_id: studyId,
          study_name: studyName,
          directions: [direction],
          union_search_space: union_search_space,
          intersection_search_space: Array.from(intersection_search_space),
          union_user_attrs: union_user_attrs,
          trials: trials,
        })
        return
      }
      const index = studies.findIndex((s) => s.study_id === studyId)
      studies[index].directions.push(direction)
    },
  })
  return studies
}

const getTrials = (
  db: SQLite3Driver,
  studyId: number,
  schemaVersion: string
): Optuna.Trial[] => {
  const trials: Optuna.Trial[] = []
  db.exec({
    sql:
      "SELECT trial_id, number, state, datetime_start, datetime_complete FROM trials" +
      ` WHERE study_id = ${studyId} ORDER BY number`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (vals: any[]) => {
      const trialId = vals[0]
      const state: Optuna.TrialState =
        vals[2] === "COMPLETE"
          ? "Complete"
          : vals[2] === "PRUNED"
            ? "Pruned"
            : vals[2] === "RUNNING"
              ? "Running"
              : vals[2] === "WAITING"
                ? "Waiting"
                : "Fail"
      const trial: Optuna.Trial = {
        trial_id: trialId,
        number: vals[1],
        study_id: studyId,
        state: state,
        values: getTrialValues(db, trialId, schemaVersion),
        intermediate_values: getTrialIntermediateValues(
          db,
          trialId,
          schemaVersion
        ),
        params: [], // Set this column later
        user_attrs: [], // Set this column later
        datetime_start: vals[3],
        datetime_complete: vals[4],
      }
      trials.push(trial)
    },
  })
  return trials
}

const getTrialValues = (
  db: SQLite3Driver,
  trialId: number,
  schemaVersion: string
): number[] => {
  const values: number[] = []
  if (isGreaterSchemaVersion(schemaVersion, "v3.0.0.c")) {
    db.exec({
      sql:
        "SELECT value, value_type" +
        ` FROM trial_values WHERE trial_id = ${trialId}` +
        " ORDER BY objective",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (vals: any[]) => {
        values.push(
          vals[1] === "INF_NEG"
            ? -Infinity
            : vals[1] === "INF_POS"
              ? Infinity
              : vals[0]
        )
      },
    })
  } else {
    db.exec({
      sql:
        "SELECT value" +
        ` FROM trial_values WHERE trial_id = ${trialId}` +
        " ORDER BY objective",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (vals: any[]) => {
        values.push(vals[0])
      },
    })
  }
  return values
}

const getTrialParams = (
  db: SQLite3Driver,
  trialId: number
): Optuna.TrialParam[] => {
  const params: Optuna.TrialParam[] = []
  db.exec({
    sql:
      "SELECT param_name, param_value, distribution_json" +
      ` FROM trial_params WHERE trial_id = ${trialId}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (vals: any[]) => {
      const distribution = parseDistributionJSON(vals[2])
      params.push({
        name: vals[0],
        param_internal_value: vals[1],
        param_external_type: distribution.type,
        param_external_value: paramInternalValueToExternalValue(
          distribution,
          vals[1]
        ),
        distribution: distribution,
      })
    },
  })
  return params
}

const paramInternalValueToExternalValue = (
  distribution: Optuna.Distribution,
  internalValue: number
): Optuna.CategoricalChoiceType => {
  if (distribution.type === "FloatDistribution") {
    return internalValue.toString()
  } else if (distribution.type === "IntDistribution") {
    return internalValue.toString()
  } else {
    return distribution.choices[internalValue]
  }
}

const parseDistributionJSON = (t: string): Optuna.Distribution => {
  const parsed = JSON.parse(t)
  if (parsed.name === "FloatDistribution") {
    return {
      type: "FloatDistribution",
      low: parsed.attributes.low as number,
      high: parsed.attributes.high as number,
      step: parsed.attributes.step as number,
      log: parsed.attributes.log as boolean,
    }
  } else if (parsed.name === "UniformDistribution") {
    return {
      type: "FloatDistribution",
      low: parsed.attributes.low as number,
      high: parsed.attributes.high as number,
      step: null,
      log: false,
    }
  } else if (parsed.name === "LogUniformDistribution") {
    return {
      type: "FloatDistribution",
      low: parsed.attributes.low as number,
      high: parsed.attributes.high as number,
      step: null,
      log: true,
    }
  } else if (parsed.name === "DiscreteUniformDistribution") {
    return {
      type: "FloatDistribution",
      low: parsed.attributes.low as number,
      high: parsed.attributes.high as number,
      step: parsed.attributes.q,
      log: false,
    }
  } else if (parsed.name === "IntDistribution") {
    return {
      type: "IntDistribution",
      low: parsed.attributes.low as number,
      high: parsed.attributes.high as number,
      step: parsed.attributes.step as number,
      log: parsed.attributes.log as boolean,
    }
  } else if (parsed.name === "IntUniformDistribution") {
    return {
      type: "IntDistribution",
      low: parsed.attributes.low as number,
      high: parsed.attributes.high as number,
      step: parsed.attributes.step as number,
      log: false,
    }
  } else if (parsed.name === "IntLogUniformDistribution") {
    return {
      type: "IntDistribution",
      low: parsed.attributes.low as number,
      high: parsed.attributes.high as number,
      step: parsed.attributes.step as number,
      log: true,
    }
  } else {
    return {
      type: "CategoricalDistribution",
      choices: parsed.attributes.choices,
    }
  }
}

const getTrialUserAttributes = (
  db: SQLite3Driver,
  trialId: number
): Optuna.Attribute[] => {
  const attrs: Optuna.Attribute[] = []
  db.exec({
    sql:
      "SELECT key, value_json" +
      ` FROM trial_user_attributes WHERE trial_id = ${trialId}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (vals: any[]) => {
      attrs.push({
        key: vals[0],
        value: vals[1],
      })
    },
  })
  return attrs
}

const getTrialIntermediateValues = (
  db: SQLite3Driver,
  trialId: number,
  schemaVersion: string
): Optuna.TrialIntermediateValue[] => {
  const values: Optuna.TrialIntermediateValue[] = []
  if (isGreaterSchemaVersion(schemaVersion, "v3.0.0.c")) {
    db.exec({
      sql:
        "SELECT step, intermediate_value, intermediate_value_type" +
        ` FROM trial_intermediate_values WHERE trial_id = ${trialId}` +
        " ORDER BY step",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (vals: any[]) => {
        values.push({
          step: vals[0],
          value:
            vals[2] === "INF_NEG"
              ? -Infinity
              : vals[2] === "INF_POS"
                ? Infinity
                : vals[2] === "NAN"
                  ? NaN
                  : vals[1],
        })
      },
    })
  } else {
    db.exec({
      sql:
        "SELECT step, intermediate_value" +
        ` FROM trial_intermediate_values WHERE trial_id = ${trialId}` +
        " ORDER BY step",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (vals: any[]) => {
        values.push({
          step: vals[0],
          value: vals[1],
        })
      },
    })
  }
  return values
}
