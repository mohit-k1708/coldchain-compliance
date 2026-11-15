# Data Dictionary

Conventions: timestamps are ISO-8601 UTC (`TIMESTAMPTZ`); temperatures are °C `NUMERIC(5,2)`; durations are whole minutes unless stated.
"Req" = required (NOT NULL). "Uniq" = unique. Enums are defined in `BUSINESS-RULES.md` section 2 and enforced by `CHECK` constraints in `database/schema.sql`.
Cross-row rules that SQL cannot express (overlaps, joins, date coverage) are enforced by `generator/validateData.js` and the compliance engine.

## Required entities (10)

### 1. Product (`product`)
| Field | Type | Req | Allowed / Units | Uniq | Validation |
|---|---|---|---|---|---|
| product_id | TEXT | Y | `PRD-NNNNNN` | PK | matches pattern |
| product_name | TEXT | Y | | Y | non-empty |
| category | TEXT | Y | VACCINE, BIOLOGIC, INSULIN, OTHER | | in list |
| supplier_party_id | TEXT | Y | FK party (SUPPLIER) | | party exists, type SUPPLIER |
| required_min_temp_c | NUMERIC(5,2) | Y | °C | | numeric |
| required_max_temp_c | NUMERIC(5,2) | Y | °C | | >= required_min_temp_c |
| max_excursion_minutes | INTEGER | Y | minutes | | >= 0 |
| created_at | TIMESTAMPTZ | Y | | | valid timestamp |

### 2. Lot (`lot`)
| Field | Type | Req | Allowed / Units | Uniq | Validation |
|---|---|---|---|---|---|
| lot_id | TEXT | Y | `LOT-2026-NNNNNN` | PK | pattern |
| product_id | TEXT | Y | FK product | | exists |
| manufacturing_date | DATE | Y | | | <= expiry_date |
| expiry_date | DATE | Y | | | > manufacturing_date |
| lot_status | TEXT | Y | CREATED, RELEASED, QUARANTINED, EXPIRED | | in list |
| created_at | TIMESTAMPTZ | Y | | | valid |

### 3. Shipment (`shipment`)
| Field | Type | Req | Allowed / Units | Uniq | Validation |
|---|---|---|---|---|---|
| shipment_id | TEXT | Y | `SHP-2026-NNNNNN` | PK | pattern |
| product_id | TEXT | Y | FK product | | exists; equals product of every linked lot |
| policy_id | TEXT | Y | FK threshold_policy (policy *applied*) | | exists; see R-POL-01 |
| origin_location | TEXT | Y | location code | | non-empty |
| destination_location | TEXT | Y | location code | | non-empty, <> origin |
| origin_party_id | TEXT | Y | FK party | | exists |
| destination_party_id | TEXT | Y | FK party | | exists |
| planned_departure | TIMESTAMPTZ | Y | | | |
| planned_arrival | TIMESTAMPTZ | Y | | | > planned_departure |
| departure_time | TIMESTAMPTZ | N | actual | | required once IN_TRANSIT/DELIVERED |
| arrival_time | TIMESTAMPTZ | N | actual | | >= departure_time; required when DELIVERED |
| shipment_status | TEXT | Y | PLANNED, PACKED, IN_TRANSIT, DELIVERED, CANCELLED | | valid transition (see history) |
| created_at | TIMESTAMPTZ | Y | | | valid |

Cardinality: Shipment N:M Lot via `shipment_lot`; Shipment N:M Packaging via `shipment_packaging`; Shipment N:M Logger via `logger_assignment`.

### 4. Packaging (`packaging`)
| Field | Type | Req | Allowed / Units | Uniq | Validation |
|---|---|---|---|---|---|
| packaging_id | TEXT | Y | `PKG-NNNNNN` | PK | pattern |
| packaging_type | TEXT | Y | e.g. EPS_BOX_48H, VIP_BOX_96H, ACTIVE_CONTAINER | | non-empty |
| min_supported_temp_c | NUMERIC(5,2) | Y | °C | | |
| max_supported_temp_c | NUMERIC(5,2) | Y | °C | | >= min |
| qualified_duration_hours | INTEGER | Y | hours | | > 0 |
| packaging_status | TEXT | Y | ACTIVE, RETIRED | | in list |

### 5. Logger (`logger`) - physical device
| Field | Type | Req | Allowed / Units | Uniq | Validation |
|---|---|---|---|---|---|
| logger_id | TEXT | Y | `LGR-NNNNNN` | PK | pattern |
| device_serial_number | TEXT | Y | | Y | non-empty |
| calibration_status | TEXT | Y | VALID, EXPIRED, UNCALIBRATED | | snapshot of latest calibration |
| calibration_date | DATE | N | | | snapshot |
| calibration_expiry | DATE | N | | | >= calibration_date |
| calibration_uncertainty_c | NUMERIC(4,2) | N | +/- °C | | >= 0 |
| device_status | TEXT | Y | AVAILABLE, IN_USE, MAINTENANCE, RETIRED | | in list |

Calibration **history** lives in `logger_calibration`; the engine uses history, not these snapshot fields.

### 6. TemperatureReading (`temperature_reading`)
| Field | Type | Req | Allowed / Units | Uniq | Validation |
|---|---|---|---|---|---|
| reading_id | TEXT | Y | `TEMP-<logger_id>-<YYYYMMDDThhmmZ>` | PK | pattern; timestamp equals recorded_at |
| logger_id | TEXT | Y | FK logger | | exists |
| logger_assignment_id | TEXT | N | FK logger_assignment | | untrusted ingestion link (R-LOG-05) |
| recorded_at | TIMESTAMPTZ | Y | device clock | | on a 10-minute grid |
| received_at | TIMESTAMPTZ | Y | ingestion time | | >= recorded_at |
| temperature_c | NUMERIC(5,2) | Y | °C | | -80 to 60 |
| calibration_uncertainty_c | NUMERIC(4,2) | Y | +/- °C | | >= 0 |
| reading_quality | TEXT | Y | GOOD, SUSPECT, INVALID | | in list |

Unique (`logger_id`, `recorded_at`).

### 7. CustodyEvent (`custody_event`)
| Field | Type | Req | Allowed / Units | Uniq | Validation |
|---|---|---|---|---|---|
| custody_event_id | TEXT | Y | `CUS-2026-NNNNNN` | PK | pattern |
| shipment_id | TEXT | Y | FK shipment | | exists |
| event_sequence | INTEGER | Y | 1..n | (shipment, seq) | >= 1 |
| from_party_id | TEXT | N | FK party | | NULL only for PICKUP at origin |
| to_party_id | TEXT | N | FK party | | NULL only if receiving party missing (flagged) |
| event_type | TEXT | Y | PICKUP, HANDOVER, DELIVERY | | in list |
| event_timestamp | TIMESTAMPTZ | Y | | | |
| recorded_at | TIMESTAMPTZ | Y | | | >= event_timestamp |
| location | TEXT | N | location code | | |

### 8. RouteStop (`route_stop`)
| Field | Type | Req | Allowed / Units | Uniq | Validation |
|---|---|---|---|---|---|
| route_stop_id | TEXT | Y | `RST-2026-NNNNNN` | PK | pattern |
| shipment_id | TEXT | Y | FK shipment | | exists |
| location | TEXT | Y | location code | | non-empty |
| stop_type | TEXT | Y | ORIGIN, TRANSIT, DESTINATION | | in list |
| stop_sequence | INTEGER | N | planned order | | NULL = unexpected (unplanned) stop |
| actual_sequence | INTEGER | N | actual order | | NULL = missing stop |
| planned_arrival | TIMESTAMPTZ | N | | | |
| planned_departure | TIMESTAMPTZ | N | | | >= planned_arrival |
| actual_arrival | TIMESTAMPTZ | N | | | |
| actual_departure | TIMESTAMPTZ | N | | | >= actual_arrival |

At least one of planned_arrival / actual_arrival is present. Dwell = actual_departure - actual_arrival (minutes).

### 9. ThresholdPolicy (`threshold_policy`)
| Field | Type | Req | Allowed / Units | Uniq | Validation |
|---|---|---|---|---|---|
| policy_id | TEXT | Y | `POL-NNNNNN` | PK | pattern |
| product_id | TEXT | Y | FK product | | exists |
| policy_version | INTEGER | Y | >= 1 | (product, version) | |
| min_temp_c | NUMERIC(5,2) | Y | °C | | within product requirement |
| max_temp_c | NUMERIC(5,2) | Y | °C | | >= min_temp_c |
| max_excursion_minutes | INTEGER | Y | minutes | | >= 0 |
| max_data_gap_minutes | INTEGER | Y | minutes (default 30) | | > 0 |
| sampling_interval_minutes | INTEGER | Y | minutes (default 10) | | > 0 |
| max_dwell_minutes | INTEGER | Y | minutes | | >= 0 |
| effective_from | TIMESTAMPTZ | Y | | | |
| effective_to | TIMESTAMPTZ | N | NULL = open | | > effective_from |
| policy_status | TEXT | Y | DRAFT, ACTIVE, SUPERSEDED, RETIRED | | in list |

No two policies of one product overlap in effective time (validator).

### 10. ExcursionReport (`excursion_report`)
| Field | Type | Req | Allowed / Units | Uniq | Validation |
|---|---|---|---|---|---|
| excursion_id | TEXT | Y | `EXCR-2026-NNNNNN` | PK | pattern |
| shipment_id | TEXT | Y | FK shipment | | exists |
| logger_id | TEXT | N | FK logger | | NULL for non-logger issues |
| logger_assignment_id | TEXT | N | FK logger_assignment | | |
| policy_id | TEXT | N | FK threshold_policy | | |
| compliance_run_id | TEXT | N | FK compliance_run | | NULL for LEGACY_IMPORT |
| source | TEXT | Y | LEGACY_IMPORT, ENGINE | | in list |
| issue_type | TEXT | Y | see BUSINESS-RULES section 2 | | in list |
| start_time | TIMESTAMPTZ | N | | | |
| end_time | TIMESTAMPTZ | N | | | >= start_time |
| duration_minutes | INTEGER | N | minutes | | >= 0; equals end - start (reconciled) |
| peak_temperature_c | NUMERIC(5,2) | N | °C (max for HIGH, min for LOW) | | equals max/min of evidence readings |
| severity | TEXT | Y | LOW, MEDIUM, HIGH, CRITICAL | | in list |
| status | TEXT | Y | OPEN, ASSIGNED, INVESTIGATING, RESOLVED, ESCALATED | | valid transition |
| detected_at | TIMESTAMPTZ | Y | | | |
| assigned_analyst | TEXT | N | | | required once ASSIGNED+ |
| resolution | TEXT | N | | | required when RESOLVED |
| resolved_at | TIMESTAMPTZ | N | | | >= detected_at |
| evidence_reference | TEXT | N | summary pointer; rows in `excursion_evidence` | | |

---

## Supporting tables (engineering additions, not mandated entities)

### party
`party_id` PK `PTY-NNNNNN`; `party_name` TEXT NOT NULL UNIQUE; `party_type` SUPPLIER/CARRIER/WAREHOUSE NOT NULL.

### logger_calibration (history)
`calibration_id` PK; `logger_id` FK NOT NULL; `calibrated_on` DATE NOT NULL; `expires_on` DATE NOT NULL (> calibrated_on); `uncertainty_c` NUMERIC(4,2) NOT NULL >= 0; Unique (logger_id, calibrated_on).

### shipment_lot (N:M bridge)
PK (`shipment_id`, `lot_id`) both FK; `quantity_units` INTEGER NOT NULL > 0.

### shipment_packaging (N:M bridge, effective-dated)
PK (`shipment_id`, `packaging_id`, `assigned_from`); `assigned_to` NULL = current (>= assigned_from).

### logger_assignment
`logger_assignment_id` PK `LOG-<shipment_id>-NN`; `logger_id` FK; `shipment_id` FK; `assigned_from`, `assigned_to` TIMESTAMPTZ (to >= from); `assignment_status` ASSIGNED/COMPLETED/CANCELLED. Unique (shipment_id, logger_id, assigned_from). Overlap of one logger is checked by the validator, not blocked, so the overlap anomaly can be represented.

### shipment_status_history
`history_id` PK; `shipment_id` FK; `from_status` N; `to_status` NOT NULL; `changed_at` NOT NULL; `changed_by` TEXT. Allowed transitions: PLANNED->PACKED->IN_TRANSIT->DELIVERED; PLANNED|PACKED|IN_TRANSIT->CANCELLED.

### compliance_run (history of decisions, append-only)
`compliance_run_id` PK `RUN-2026-NNNNNN`; `shipment_id` FK; `policy_id` FK; policy snapshot (`policy_min_temp_c`, `policy_max_temp_c`, `policy_max_excursion_minutes`, `policy_max_data_gap_minutes`, `policy_version`); `compliance_status` NOT NULL; `reason_summary` TEXT NOT NULL; `engine_version`; `input_fingerprint` TEXT NOT NULL; `run_at`; `is_current` BOOLEAN. Unique (shipment_id, input_fingerprint).

### compliance_finding
`finding_id` PK; `compliance_run_id` FK; `rule_code` NOT NULL; `result` PASS/FAIL/INDETERMINATE/WARNING; `detail` TEXT (human-readable reason and numbers); `detail_json` TEXT.

### compliance_evidence / excursion_evidence
PK (`finding_id`|`excursion_id`, `reading_id`) FKs to finding/excursion and temperature_reading. Links every conclusion to the readings behind it.

### exception_event (investigation history)
`exception_event_id` PK; `excursion_id` FK; `from_status` N; `to_status` NOT NULL; `analyst` N; `note` N; `occurred_at` NOT NULL.

### legacy_report (makes "silently passed" observable)
`legacy_report_id` PK; `shipment_id` FK; `reported_status` PASS/FAIL; `reported_by` TEXT; `reported_at` TIMESTAMPTZ.

---

## Not in the application database
`ground_truth.csv` (shipment_id, issue_type, expected_decision, expected_evidence_category, expected_rule) lives outside the DB, is written by the generator, and is read only by the evaluation script.
