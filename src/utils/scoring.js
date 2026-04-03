import { haversine } from './matching.js';

/** Fleet driving consumption (kWh per 100 miles). */
const KWH_PER_100_MILES = 25;
/** Marginal $/kWh for energy used while driving to the station. */
const DRIVE_ELECTRICITY_USD_PER_KWH = 0.2;

const KM_TO_MI = 0.621371;

/**
 * Driving route via OSRM (free, no API key). Returns miles and minutes.
 */
async function getOSRMDistance(lat1, lon1, lat2, lon2) {
  const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
  try {
    console.log(`OSRM Request: ${url}`);
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.code === 'Ok' && data.routes?.[0]) {
      const km = data.routes[0].distance / 1000;
      const minutes = data.routes[0].duration / 60;
      const miles = km * KM_TO_MI;
      
      console.log(`OSRM Success: ${miles.toFixed(2)} miles, ${minutes.toFixed(0)} minutes`);
      
      return {
        distanceMiles: miles,
        durationMinutes: minutes,
      };
    }
    console.warn('OSRM returned no route:', data);
    return null;
  } catch (e) {
    console.warn('OSRM fetch failed:', e);
    return null;
  }
}

async function getDrivingMetrics(lat1, lon1, lat2, lon2) {
  console.log(`Getting driving metrics from (${lat1},${lon1}) to (${lat2},${lon2})`);
  
  const osrm = await getOSRMDistance(lat1, lon1, lat2, lon2);
  if (osrm) {
    console.log('Using OSRM real driving data');
    return { ...osrm, source: 'osrm' };
  }
  
  // Fallback to haversine estimate
  const straightLineMiles = haversine(lat1, lon1, lat2, lon2);
  // NYC average speed: ~10 mph for short trips
  const estimatedMinutes = (straightLineMiles / 10) * 60;
  
  console.log(`Using estimate: ${straightLineMiles.toFixed(2)} straight-line miles, ${estimatedMinutes.toFixed(0)} estimated minutes`);
  
  return {
    distanceMiles: straightLineMiles,
    durationMinutes: estimatedMinutes,
    source: 'estimate',
  };
}

export async function scoreCharger(
  charger,
  driverLat,
  driverLon,
  kwhNeeded,
  allChargers,
  options = {}
) {
  const { driveMinutes: driveMinutesOverride, driveTimeSource = 'estimate' } = options;

  let distanceMiles;
  let driveMinutes;
  let resolvedDriveTimeSource;

  if (driveMinutesOverride != null && driveMinutesOverride !== undefined) {
    driveMinutes = driveMinutesOverride;
    resolvedDriveTimeSource = driveTimeSource;
    distanceMiles = (driveMinutes / 60) * 10;
  } else {
    const m = await getDrivingMetrics(
      driverLat,
      driverLon,
      charger.lat,
      charger.lon
    );
    distanceMiles = m.distanceMiles;
    driveMinutes = m.durationMinutes;
    resolvedDriveTimeSource = m.source;
  }

  const congestion = charger.node_congestion || 0;
  const allCong = allChargers.map((c) => c.node_congestion || 0);
  const minCong = Math.min(...allCong);
  const maxCong = Math.max(...allCong);
  const range = Math.max(maxCong - minCong, 0.01);
  const gridStress = Math.max(
    0,
    Math.min(100, ((congestion - minCong) / range) * 100)
  );

  const gridBonus = Math.max(0, ((100 - gridStress) / 100) * 4);

  const avgCong = allCong.reduce((a, b) => a + b, 0) / allCong.length;
  const drActive = avgCong > 10;
  const drBonus =
    drActive && gridStress < 40
      ? Math.min(25, (avgCong * kwhNeeded) / 1000 * 2.0)
      : 0;

  const driveEnergyKwh = (distanceMiles / 100) * KWH_PER_100_MILES;
  const timePenalty = driveEnergyKwh * DRIVE_ELECTRICITY_USD_PER_KWH;

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
    distance_miles: Math.round(distanceMiles * 100) / 100,  // Changed to match screenshot
    drive_minutes: Math.round(driveMinutes),  // Changed to match screenshot
    driveTimeSource: resolvedDriveTimeSource,
    driveEnergyKwh: Math.round(driveEnergyKwh * 1000) / 1000,
    timePenalty: Math.round(timePenalty * 100) / 100,
    chargingCost: Math.round(chargingCost * 100) / 100,
    totalEarnings: Math.round(totalEarnings * 100) / 100,
    netCost: Math.round(netCost * 100) / 100,
    score: Math.round(score * 100) / 100,
    // Keep old property names for compatibility
    distance: Math.round(distanceMiles * 100) / 100,
    driveMinutes: Math.round(driveMinutes),
  };
}
