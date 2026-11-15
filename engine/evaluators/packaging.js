import { ms, HOUR } from '../time.js';

// R-PKG-01: WARNING only, never changes the compliance status.
export function evaluatePackaging(shipmentPackaging, policy, shipment) {
  const hours = (ms(shipment.planned_arrival) - ms(shipment.planned_departure)) / HOUR;
  const bad = [];
  if (!shipmentPackaging.length) bad.push('no packaging recorded');
  for (const sp of shipmentPackaging) {
    const p = sp.profile;
    if (!p) { bad.push(`packaging ${sp.packaging_id} not found`); continue; }
    if (p.min_supported_temp_c > policy.min_temp_c || p.max_supported_temp_c < policy.max_temp_c) bad.push(`${p.packaging_id} supports ${p.min_supported_temp_c}..${p.max_supported_temp_c} C, policy needs ${policy.min_temp_c}..${policy.max_temp_c} C`);
    if (p.qualified_duration_hours < hours) bad.push(`${p.packaging_id} qualified for ${p.qualified_duration_hours} h, planned duration ${hours} h`);
  }
  return { rule_code: 'R-PKG-01', result: bad.length ? 'WARNING' : 'PASS',
    detail: bad.length ? `packaging: ${bad.join('; ')}` : 'packaging range and qualified duration cover the policy and planned duration',
    detail_json: { planned_hours: hours, problems: bad }, reading_ids: [] };
}
