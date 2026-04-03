import { haversine } from './matching.js';

export function scoreCharger(
  charger,
  driverLat,
  driverLon,
  kwhNeeded,
  allChargers,
  options = {}
) {
  const { driveMinutes: driveMinutesOverride, driveTimeSource = 'estimate' } =
    options;
  const congestion = charger.node_congestion;

  const allCong = allChargers.map((c) => c.node_congestion);
  const minCong = Math.min(...allCong);
  const maxCong = Math.max(...allCong);
  const range = Math.max(maxCong - minCong, 0.01);
  const gridStress = Math.max(
    0,
    Math.min(100, ((congestion - minCong) / range) * 100)
  );

  const gridBonus = Math.max(0, ((100 - gridStress) / 100) * 5);

  const avgCong = allCong.reduce((a, b) => a + b, 0) / allCong.length;
  const drActive = avgCong > 10;
  const drBonus =
    drActive && gridStress < 40
      ? Math.min(25, (avgCong * kwhNeeded) / 1000 * 2.0)
      : 0;

  const distance = haversine(driverLat, driverLon, charger.lat, charger.lon);
  const driveMinutes =
    driveMinutesOverride !== undefined && driveMinutesOverride !== null
      ? driveMinutesOverride
      : (distance / 10) * 60;
  const resolvedDriveTimeSource =
    driveMinutesOverride !== undefined && driveMinutesOverride !== null
      ? driveTimeSource
      : 'estimate';
  const timePenalty = driveMinutes * 0.5;

  const chargingCost = kwhNeeded * charger.price_per_kwh;

  const totalEarnings = gridBonus + drBonus;
  const netCost = chargingCost + timePenalty - totalEarnings;
  const score = totalEarnings - timePenalty;

  return {
    ...charger,
    gridStress: Math.round(gridStress * 10) / 10,
    gridBonus: Math.round(gridBonus * 100) / 100,
    drActive,
    drBonus: Math.round(drBonus * 100) / 100,
    distance: Math.round(distance * 100) / 100,
    driveMinutes: Math.round(driveMinutes),
    driveTimeSource: resolvedDriveTimeSource,
    timePenalty: Math.round(timePenalty * 100) / 100,
    chargingCost: Math.round(chargingCost * 100) / 100,
    totalEarnings: Math.round(totalEarnings * 100) / 100,
    netCost: Math.round(netCost * 100) / 100,
    score: Math.round(score * 100) / 100,
  };
}