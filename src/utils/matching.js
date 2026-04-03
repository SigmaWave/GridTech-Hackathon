export function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function matchChargersToNodes(chargers, nodes) {
  return chargers.map((charger) => {
    let nearestNode = null;
    let minDist = Infinity;

    for (const node of nodes) {
      const dist = haversine(charger.lat, charger.lon, node.lat, node.lon);
      if (dist < minDist) {
        minDist = dist;
        nearestNode = node;
      }
    }

    return {
      ...charger,
      nearest_node: nearestNode?.name || 'Unknown',
      node_congestion: nearestNode?.congestion ?? 0,
      node_lmp: nearestNode?.lmp ?? 0,
      node_distance: minDist,
    };
  });
}
