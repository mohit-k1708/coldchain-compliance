// ID format patterns keyed by column name (FK columns use the pattern of the column they reference).
export const ID_PATTERNS = {
  party_id: /^PTY-\d{6}$/, product_id: /^PRD-\d{6}$/, lot_id: /^LOT-2026-\d{6}$/, packaging_id: /^PKG-\d{6}$/,
  logger_id: /^LGR-\d{6}$/, calibration_id: /^CAL-\d{6}$/, policy_id: /^POL-\d{6}$/,
  shipment_id: /^SHP-2026-\d{6}$/, history_id: /^HST-2026-\d{6}$/,
  logger_assignment_id: /^LOG-SHP-2026-\d{6}-\d{2}$/, reading_id: /^TEMP-LGR-\d{6}-\d{8}T\d{6}Z$/,
  custody_event_id: /^CUS-2026-\d{6}$/, route_stop_id: /^RST-2026-\d{6}$/, legacy_report_id: /^LEG-2026-\d{6}$/,
  excursion_id: /^EXCR-2026-\d{6}$/, compliance_run_id: /^RUN-2026-\d{6}$/,
};
