import { ms } from '../time.js';

export const effectiveAt = (p, t) => ms(p.effective_from) <= t && (p.effective_to === null || p.effective_to === undefined || t < ms(p.effective_to));

// The single policy of the product effective at departure (highest version if data is ambiguous).
export function selectPolicy(policies, depMs) {
  const eff = (policies ?? []).filter((p) => effectiveAt(p, depMs)).sort((a, b) => b.policy_version - a.policy_version);
  return eff[0] ?? null;
}

// R-POL-01. tempOutcome: what the correct-policy temperature evaluation gave (text).
export function validatePolicy({ shipment, product, applied, correct, depMs, tempOutcome }) {
  const problems = [];
  if (!applied) problems.push(`applied policy ${shipment.policy_id} does not exist`);
  else {
    if (applied.product_id !== shipment.product_id) problems.push(`belongs to product ${applied.product_id}, not ${shipment.product_id}`);
    if (!effectiveAt(applied, depMs)) problems.push(`not effective at departure ${shipment.departure_time}`);
    if (product && (applied.min_temp_c < product.required_min_temp_c || applied.max_temp_c > product.required_max_temp_c)) {
      problems.push(`limits ${applied.min_temp_c}..${applied.max_temp_c} C outside the product range ${product.required_min_temp_c}..${product.required_max_temp_c} C`);
    }
  }
  if (!correct) problems.push('no policy of this product is effective at departure');
  const mismatch = problems.length > 0 || (applied && correct && applied.policy_id !== correct.policy_id);
  if (!mismatch) {
    return { rule_code: 'R-POL-01', result: 'PASS', detail: `applied policy ${applied.policy_id} v${applied.policy_version} is the one effective at departure`,
      detail_json: { applied_policy_id: applied.policy_id, correct_policy_id: correct.policy_id }, reading_ids: [] };
  }
  const why = problems.length ? problems.join('; ') : 'a different version is effective at departure';
  return {
    rule_code: 'R-POL-01', result: 'INDETERMINATE',
    detail: `applied policy ${shipment.policy_id} is wrong (${why}); correct policy is ${correct ? `${correct.policy_id} v${correct.policy_version}` : 'unknown'}${tempOutcome ? `; evaluating against it: ${tempOutcome}` : ''}`,
    detail_json: { applied_policy_id: shipment.policy_id, correct_policy_id: correct?.policy_id ?? null, problems, correct_policy_temperature_result: tempOutcome ?? null },
    reading_ids: [], issue_type: 'POLICY_MISMATCH',
  };
}
