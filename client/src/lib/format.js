// Display formatters. All times are UTC (the data is UTC ISO-8601).
export function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function formatTick(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '';
  return new Date(ms).toISOString().slice(5, 16).replace('T', ' ');
}

export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || minutes === '' || Number.isNaN(Number(minutes))) return '-';
  const m = Math.round(Number(minutes));
  if (m < 0) return '-';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return r ? `${h} h ${r} min` : `${h} h`;
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? `${d} d ${hh} h` : `${d} d`;
}

export function formatNumber(x, digits = 0) {
  if (x === null || x === undefined || x === '' || Number.isNaN(Number(x))) return '-';
  return Number(x).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPercent(x, digits = 1) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return 'N/A';
  return `${(Number(x) * 100).toFixed(digits)}%`;
}

export function formatTemp(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return '-';
  return `${Number(x).toFixed(digits)} °C`;
}

export const ruleOf = (reason) => (String(reason ?? '').match(/\[([^\]]+)\]/) ?? [])[1] ?? null;

export const RULE_NAMES = {
  'R-TEMP-00': 'Temperature evidence available',
  'R-TEMP-03': 'Allowed excursion duration',
  'R-TEMP-04': 'Calibration uncertainty (marginal readings)',
  'R-GAP-01': 'Data gaps in the temperature record',
  'R-LOG-02': 'Logger assigned for the whole transit',
  'R-LOG-03': 'Logger calibration valid',
  'R-LOG-04': 'Logger assignments do not overlap',
  'R-POL-01': 'Applied policy matches product and date',
  'R-LOT-01': 'Lots belong to the shipment product',
  'R-PKG-01': 'Packaging supports the policy range and duration',
  'R-ROUTE-01': 'Planned stop visited',
  'R-ROUTE-02': 'No unexpected stops',
  'R-ROUTE-03': 'Stops in planned order',
  'R-ROUTE-04': 'Dwell time within limit',
  'R-ROUTE-05': 'Route evidence present',
  'R-CUS-01': 'Custody chain complete and continuous',
  'R-CUS-02': 'Custody timestamps consistent',
  'R-ISO-01': 'Readings isolated per shipment',
  'R-SILENT-01': 'Legacy PASS contradicted by the engine',
};
export const ruleName = (code) => RULE_NAMES[code] ?? code ?? '-';
