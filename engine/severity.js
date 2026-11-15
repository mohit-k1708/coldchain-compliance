// Severity per docs/BUSINESS-RULES.md section 5.
export function severityFor({ deviation = 0, minutes = 0, allowed = 0, issue_type }) {
  if (issue_type === 'TEMP_HIGH' || issue_type === 'TEMP_LOW') {
    if (deviation >= 5 || (allowed > 0 && minutes >= 4 * allowed)) return 'CRITICAL';
    if (minutes > allowed) return 'HIGH';
    if (minutes > 0.5 * allowed) return 'MEDIUM';
    return 'LOW';
  }
  if (issue_type === 'CUSTODY_GAP' || issue_type === 'ROUTE_DEVIATION') return 'HIGH';
  if (issue_type === 'CALIBRATION_MARGINAL' || issue_type === 'MISSING_DATA') return 'MEDIUM';
  return 'LOW';
}
