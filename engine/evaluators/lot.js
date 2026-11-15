// R-LOT-01
export function evaluateLots(shipmentLots, lotById, shipment) {
  const bad = [];
  if (shipmentLots.length === 0) bad.push('shipment has no lots');
  for (const sl of shipmentLots) {
    const lot = lotById.get(sl.lot_id);
    if (!lot) bad.push(`lot ${sl.lot_id} not found`);
    else if (lot.product_id !== shipment.product_id) bad.push(`lot ${sl.lot_id} is product ${lot.product_id}, shipment is ${shipment.product_id}`);
  }
  return { rule_code: 'R-LOT-01', result: bad.length ? 'INDETERMINATE' : 'PASS',
    detail: bad.length ? bad.join('; ') : `${shipmentLots.length} lot(s), all of the shipment's product`,
    detail_json: { lots: shipmentLots.map((l) => l.lot_id), problems: bad }, reading_ids: [] };
}
