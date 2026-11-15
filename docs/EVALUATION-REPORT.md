# Evaluation report

## Method

1. The generator produces shipments and records, for every shipment, the label of the injector that mutated it (`ground_truth.csv`). Labels come from what the injector actually did, never from engine code.
2. The compliance engine (`engine/`) evaluates the dataset without reading ground truth.
3. `evaluation/metrics.js` joins the two and computes the confusion matrix, per-class precision/recall/F1, per-label detection, rule-level precision, named rates and duration accuracy (zero denominators are reported as N/A).
4. A naive baseline (`evaluation/naiveBaseline.js`) implements the five mandatory failure modes; an ablation disables one rule group at a time (`disabledRules` evaluation hook in the engine); an independent oracle property test checks excursion arithmetic; a holdout dataset with a different seed and mix checks generalisation of the rules.

## Results: seed 20261022, 5000 shipments

seed 20261022, 5000 shipments, 1000 loggers, mix `default`, generator 1.0.0.

### Confusion matrix (rows = expected, columns = actual), n = 5000

| expected \ actual | COMPLIANT | NON_COMPLIANT | INDETERMINATE |
| --- | ---: | ---: | ---: |
| COMPLIANT | 3800 | 0 | 0 |
| NON_COMPLIANT | 0 | 500 | 0 |
| INDETERMINATE | 0 | 0 | 700 |

Overall accuracy: **100.00%**  |  macro-F1: **1.0000**

| class | support | precision | recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| COMPLIANT | 3800 | 1.0000 | 1.0000 | 1.0000 |
| NON_COMPLIANT | 500 | 1.0000 | 1.0000 | 1.0000 |
| INDETERMINATE | 700 | 1.0000 | 1.0000 | 1.0000 |

### Per issue type

Detection = engine status equals expected AND the expected rule code is among the findings.

| label | count | detection rate | status accuracy | -> COMPLIANT | -> NON_COMPLIANT | -> INDETERMINATE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| BOUNDARY_AT_LIMIT | 100 | 100.00% | 100.00% | 100 | 0 | 0 |
| CALIBRATION_EXPIRED | 50 | 100.00% | 100.00% | 0 | 0 | 50 |
| CALIBRATION_MARGINAL | 100 | 100.00% | 100.00% | 0 | 0 | 100 |
| CROSS_SHIPMENT_EXCURSION | 50 | 100.00% | 100.00% | 50 | 0 | 0 |
| CUSTODY_GAP | 100 | 100.00% | 100.00% | 0 | 0 | 100 |
| EXCURSION_WITHIN_ALLOWANCE | 250 | 100.00% | 100.00% | 250 | 0 | 0 |
| LOGGER_NOT_ASSIGNED | 100 | 100.00% | 100.00% | 0 | 0 | 100 |
| MISSING_DATA | 150 | 100.00% | 100.00% | 0 | 0 | 150 |
| MISSING_DATA_SILENTLY_PASSED | 100 | 100.00% | 100.00% | 0 | 0 | 100 |
| NONE | 3400 | 100.00% | 100.00% | 3400 | 0 | 0 |
| POLICY_MISMATCH | 100 | 100.00% | 100.00% | 0 | 0 | 100 |
| ROUTE_DEVIATION | 100 | 100.00% | 100.00% | 0 | 100 | 0 |
| TEMPERATURE_EXCURSION | 400 | 100.00% | 100.00% | 0 | 400 | 0 |

### Rule-level precision / recall

A rule "fires" when it produces a FAIL or INDETERMINATE finding; "expected" = the shipment label names that rule.

| rule | fired | expected | true positives | precision | recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| R-TEMP-03 | 400 | 400 | 400 | 1.0000 | 1.0000 | 1.0000 |
| R-TEMP-04 | 100 | 100 | 100 | 1.0000 | 1.0000 | 1.0000 |
| R-GAP-01 | 250 | 250 | 250 | 1.0000 | 1.0000 | 1.0000 |
| R-LOG-02 | 100 | 100 | 100 | 1.0000 | 1.0000 | 1.0000 |
| R-LOG-03 | 50 | 50 | 50 | 1.0000 | 1.0000 | 1.0000 |
| R-POL-01 | 100 | 100 | 100 | 1.0000 | 1.0000 | 1.0000 |
| R-CUS-01 | 100 | 100 | 100 | 1.0000 | 1.0000 | 1.0000 |
| R-ROUTE-01 | 21 | 21 | 21 | 1.0000 | 1.0000 | 1.0000 |
| R-ROUTE-02 | 30 | 30 | 30 | 1.0000 | 1.0000 | 1.0000 |
| R-ROUTE-03 | 9 | 9 | 9 | 1.0000 | 1.0000 | 1.0000 |
| R-ROUTE-04 | 40 | 40 | 40 | 1.0000 | 1.0000 | 1.0000 |
| R-ROUTE | 100 | 100 | 100 | 1.0000 | 1.0000 | 1.0000 |

### Named rates

| rate | numerator | denominator | value |
| --- | ---: | ---: | ---: |
| False positive rate | 0 | 3800 | 0.00% |
| Missed excursion rate | 0 | 400 | 0.00% |
| Missing-data detection rate | 250 | 250 | 100.00% |
| Silent-pass detection rate | 100 | 100 | 100.00% |
| Custody-gap detection rate | 100 | 100 | 100.00% |
| Logger mismatch detection rate | 150 | 150 | 100.00% |
| Policy mismatch detection rate | 100 | 100 | 100.00% |
| Cross-shipment isolation rate | 25 | 25 | 100.00% |
| Route deviation detection rate | 100 | 100 | 100.00% |

### Duration accuracy

| quantity | n | exact match | exact-match rate | mean absolute error (min) |
| --- | ---: | ---: | ---: | ---: |
| excursion minutes | 650 | 650 | 100.00% | 0.00 |
| gap minutes | 250 | 250 | 100.00% | 0.00 |

## Naive baseline comparison

### Naive baseline confusion matrix

| expected \ actual | COMPLIANT | NON_COMPLIANT | INDETERMINATE |
| --- | ---: | ---: | ---: |
| COMPLIANT | 3750 | 50 | 0 |
| NON_COMPLIANT | 100 | 400 | 0 |
| INDETERMINATE | 678 | 22 | 0 |

Naive accuracy: **83.00%** vs engine **100.00%**; naive macro-F1 0.8618 vs engine 1.0000.

### Per issue type: engine detection vs naive correct-status rate

| label | count | engine detection | naive correct status | naive fails? |
| --- | ---: | ---: | ---: | ---: |
| BOUNDARY_AT_LIMIT | 100 | 100.00% | 100.00% | no |
| CALIBRATION_EXPIRED | 50 | 100.00% | 0.00% | YES |
| CALIBRATION_MARGINAL | 100 | 100.00% | 0.00% | YES |
| CROSS_SHIPMENT_EXCURSION | 50 | 100.00% | 0.00% | YES |
| CUSTODY_GAP | 100 | 100.00% | 0.00% | YES |
| EXCURSION_WITHIN_ALLOWANCE | 250 | 100.00% | 100.00% | no |
| LOGGER_NOT_ASSIGNED | 100 | 100.00% | 0.00% | YES |
| MISSING_DATA | 150 | 100.00% | 0.00% | YES |
| MISSING_DATA_SILENTLY_PASSED | 100 | 100.00% | 0.00% | YES |
| NONE | 3400 | 100.00% | 100.00% | no |
| POLICY_MISMATCH | 100 | 100.00% | 0.00% | YES |
| ROUTE_DEVIATION | 100 | 100.00% | 0.00% | YES |
| TEMPERATURE_EXCURSION | 400 | 100.00% | 100.00% | no |

## Ablation: disable one rule group and re-evaluate

Each row removes that rule group's findings before precedence (`evaluateAll(..., { disabledRules })`). "Collapsed labels" are labels whose detection rate dropped.

| rule group disabled | accuracy | accuracy change | collapsed labels (detection before -> after) | hits intended label | changes nothing |
| --- | ---: | ---: | ---: | ---: | ---: |
| R-TEMP-03 | 92.00% | -8.00 pp | TEMPERATURE_EXCURSION 100.00% -> 0.00% | yes | no |
| R-TEMP-04 | 98.00% | -2.00 pp | CALIBRATION_MARGINAL 100.00% -> 0.00% | yes | no |
| R-GAP-01 | 95.00% | -5.00 pp | MISSING_DATA 100.00% -> 0.00%; MISSING_DATA_SILENTLY_PASSED 100.00% -> 0.00% | yes | no |
| R-LOG-02 | 100.00% | +0.00 pp | LOGGER_NOT_ASSIGNED 100.00% -> 0.00% | yes | no |
| R-LOG-03 | 100.00% | +0.00 pp | CALIBRATION_EXPIRED 100.00% -> 0.00% | yes | no |
| R-POL-01 | 98.00% | -2.00 pp | POLICY_MISMATCH 100.00% -> 0.00% | yes | no |
| R-CUS-01 | 98.00% | -2.00 pp | CUSTODY_GAP 100.00% -> 0.00% | yes | no |
| R-ROUTE | 98.00% | -2.00 pp | ROUTE_DEVIATION 100.00% -> 0.00% | yes | no |
| R-SILENT-01 | 100.00% | +0.00 pp | MISSING_DATA_SILENTLY_PASSED 100.00% -> 0.00% | yes | no |
| R-ISO-01 | 100.00% | +0.00 pp | CROSS_SHIPMENT_EXCURSION 100.00% -> 0.00% | yes | no |

Every rule group hits its intended label and none is redundant.

## Independent oracle property test

`tests/property/excursion.property.test.js`: 2,000 seeded random cases (2-60 readings, random omissions and long gaps, random limits, uncertainty 0-0.6) compared against an oracle that marks 1-minute cells instead of segmenting runs, plus a minute-by-minute brute-force gap scan. Result: PASS (1 tests passed, 0 failed).

## Holdout: seed 777 holdout (different seed and label mix)

seed 777, 2000 shipments, 400 loggers, mix `holdout`, generator 1.0.0.

### Confusion matrix (rows = expected, columns = actual), n = 2000

| expected \ actual | COMPLIANT | NON_COMPLIANT | INDETERMINATE |
| --- | ---: | ---: | ---: |
| COMPLIANT | 1220 | 0 | 0 |
| NON_COMPLIANT | 0 | 320 | 0 |
| INDETERMINATE | 0 | 0 | 460 |

Overall accuracy: **100.00%**  |  macro-F1: **1.0000**

| class | support | precision | recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| COMPLIANT | 1220 | 1.0000 | 1.0000 | 1.0000 |
| NON_COMPLIANT | 320 | 1.0000 | 1.0000 | 1.0000 |
| INDETERMINATE | 460 | 1.0000 | 1.0000 | 1.0000 |

### Per issue type

Detection = engine status equals expected AND the expected rule code is among the findings.

| label | count | detection rate | status accuracy | -> COMPLIANT | -> NON_COMPLIANT | -> INDETERMINATE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| BOUNDARY_AT_LIMIT | 60 | 100.00% | 100.00% | 60 | 0 | 0 |
| CALIBRATION_EXPIRED | 40 | 100.00% | 100.00% | 0 | 0 | 40 |
| CALIBRATION_MARGINAL | 80 | 100.00% | 100.00% | 0 | 0 | 80 |
| CROSS_SHIPMENT_EXCURSION | 40 | 100.00% | 100.00% | 40 | 0 | 0 |
| CUSTODY_GAP | 60 | 100.00% | 100.00% | 0 | 0 | 60 |
| EXCURSION_WITHIN_ALLOWANCE | 160 | 100.00% | 100.00% | 160 | 0 | 0 |
| LOGGER_NOT_ASSIGNED | 80 | 100.00% | 100.00% | 0 | 0 | 80 |
| MISSING_DATA | 80 | 100.00% | 100.00% | 0 | 0 | 80 |
| MISSING_DATA_SILENTLY_PASSED | 60 | 100.00% | 100.00% | 0 | 0 | 60 |
| NONE | 960 | 100.00% | 100.00% | 960 | 0 | 0 |
| POLICY_MISMATCH | 60 | 100.00% | 100.00% | 0 | 0 | 60 |
| ROUTE_DEVIATION | 80 | 100.00% | 100.00% | 0 | 80 | 0 |
| TEMPERATURE_EXCURSION | 240 | 100.00% | 100.00% | 0 | 240 | 0 |

### Rule-level precision / recall

A rule "fires" when it produces a FAIL or INDETERMINATE finding; "expected" = the shipment label names that rule.

| rule | fired | expected | true positives | precision | recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| R-TEMP-03 | 240 | 240 | 240 | 1.0000 | 1.0000 | 1.0000 |
| R-TEMP-04 | 80 | 80 | 80 | 1.0000 | 1.0000 | 1.0000 |
| R-GAP-01 | 140 | 140 | 140 | 1.0000 | 1.0000 | 1.0000 |
| R-LOG-02 | 80 | 80 | 80 | 1.0000 | 1.0000 | 1.0000 |
| R-LOG-03 | 40 | 40 | 40 | 1.0000 | 1.0000 | 1.0000 |
| R-POL-01 | 60 | 60 | 60 | 1.0000 | 1.0000 | 1.0000 |
| R-CUS-01 | 60 | 60 | 60 | 1.0000 | 1.0000 | 1.0000 |
| R-ROUTE-01 | 18 | 18 | 18 | 1.0000 | 1.0000 | 1.0000 |
| R-ROUTE-02 | 25 | 25 | 25 | 1.0000 | 1.0000 | 1.0000 |
| R-ROUTE-03 | 8 | 8 | 8 | 1.0000 | 1.0000 | 1.0000 |
| R-ROUTE-04 | 29 | 29 | 29 | 1.0000 | 1.0000 | 1.0000 |
| R-ROUTE | 80 | 80 | 80 | 1.0000 | 1.0000 | 1.0000 |

### Named rates

| rate | numerator | denominator | value |
| --- | ---: | ---: | ---: |
| False positive rate | 0 | 1220 | 0.00% |
| Missed excursion rate | 0 | 240 | 0.00% |
| Missing-data detection rate | 140 | 140 | 100.00% |
| Silent-pass detection rate | 60 | 60 | 100.00% |
| Custody-gap detection rate | 60 | 60 | 100.00% |
| Logger mismatch detection rate | 120 | 120 | 100.00% |
| Policy mismatch detection rate | 60 | 60 | 100.00% |
| Cross-shipment isolation rate | 20 | 20 | 100.00% |
| Route deviation detection rate | 80 | 80 | 100.00% |

### Duration accuracy

| quantity | n | exact match | exact-match rate | mean absolute error (min) |
| --- | ---: | ---: | ---: | ---: |
| excursion minutes | 400 | 400 | 100.00% | 0.00 |
| gap minutes | 140 | 140 | 100.00% | 0.00 |

### Holdout naive baseline

### Naive baseline confusion matrix

| expected \ actual | COMPLIANT | NON_COMPLIANT | INDETERMINATE |
| --- | ---: | ---: | ---: |
| COMPLIANT | 1180 | 40 | 0 |
| NON_COMPLIANT | 80 | 240 | 0 |
| INDETERMINATE | 446 | 14 | 0 |

Naive accuracy: **71.00%** vs engine **100.00%**; naive macro-F1 0.7942 vs engine 1.0000.

### Per issue type: engine detection vs naive correct-status rate

| label | count | engine detection | naive correct status | naive fails? |
| --- | ---: | ---: | ---: | ---: |
| BOUNDARY_AT_LIMIT | 60 | 100.00% | 100.00% | no |
| CALIBRATION_EXPIRED | 40 | 100.00% | 0.00% | YES |
| CALIBRATION_MARGINAL | 80 | 100.00% | 0.00% | YES |
| CROSS_SHIPMENT_EXCURSION | 40 | 100.00% | 0.00% | YES |
| CUSTODY_GAP | 60 | 100.00% | 0.00% | YES |
| EXCURSION_WITHIN_ALLOWANCE | 160 | 100.00% | 100.00% | no |
| LOGGER_NOT_ASSIGNED | 80 | 100.00% | 0.00% | YES |
| MISSING_DATA | 80 | 100.00% | 0.00% | YES |
| MISSING_DATA_SILENTLY_PASSED | 60 | 100.00% | 0.00% | YES |
| NONE | 960 | 100.00% | 100.00% | no |
| POLICY_MISMATCH | 60 | 100.00% | 0.00% | YES |
| ROUTE_DEVIATION | 80 | 100.00% | 0.00% | YES |
| TEMPERATURE_EXCURSION | 240 | 100.00% | 100.00% | no |

### Disagreements

None: the engine status equals the expected decision for every shipment.

## Limitations

- The ground-truth labels are produced by injectors written from the same documented rules (`docs/BUSINESS-RULES.md`) that the engine implements. High scores therefore demonstrate **rule faithfulness** (the engine does what the documented rules say), not accuracy on real cold-chain data.
- The injectors create one anomaly per shipment, so interactions between anomalies (for example a temperature excursion on a shipment that also has a custody gap) are not exercised.
- Assumptions A-01..A-10 in the business rules are our own interpretations of an ambiguous statement; they are **not** Yotta's official definitions and a different reading would change both the labels and the expected decisions.
- Logger streams, delays, dwell times and temperature noise are synthetic (AR(1) around the range midpoint); real sensors have drift, spikes and clock errors that are not modelled.
- The naive baseline is a straw man built to show the mandatory failure modes; it is not a model of any real vendor system.
