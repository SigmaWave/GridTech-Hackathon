// Replace the haversine import with OSRM function
// import { haversine } from './matching.js';

/**
 * Calculate real driving distance using OSRM (free, no API key)
 * @param {number} lat1 - Start latitude
 * @param {number} lon1 - Start longitude
 * @param {number} lat2 - End latitude
 * @param {number} lon2 - End longitude
 * @returns {Promise<{distance: number, duration: number} | null>}
 */
async function getOSRMDistance(lat1, lon1, lat2, lon2) {
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === "Ok") {
            return {
                distance: data.routes[0].distance / 1000, // Convert to km
                duration: data.routes[0].duration / 60    // Convert to minutes
            };
        }
        return null;
    } catch (error) {
        console.error('OSRM API failed:', error);
        return null;
    }
}

/**
 * Estimate driving time and distance with OSRM fallback
 * @param {number} lat1 - Start latitude
 * @param {number} lon1 - Start longitude
 * @param {number} lat2 - End latitude
 * @param {number} lon2 - End longitude
 * @returns {Promise<{distance: number, duration: number, source: string}>}
 */
async function getDrivingMetrics(lat1, lon1, lat2, lon2) {
    const osrmResult = await getOSRMDistance(lat1, lon1, lat2, lon2);
    
    if (osrmResult) {
        return {
            distance: osrmResult.distance,
            duration: osrmResult.duration,
            source: 'osrm'
        };
    }
    
    // Fallback to haversine estimate if OSRM fails
    const { haversine } = await import('./matching.js');
    const distance = haversine(lat1, lon1, lat2, lon2);
    return {
        distance: distance,
        duration: (distance / 40) * 60, // Assume 40 km/h average speed
        source: 'estimate'
    };
}

/**
 * Calculate real-time pricing from NYISO grid data
 * @param {Object} charger - Charger object with node_congestion
 * @param {number} kwhNeeded - kWh needed for charging
 * @returns {Promise<number>} Real-time energy cost
 */
async function getRealTimeEnergyCost(charger, kwhNeeded) {
    try {
        // Import NYISO functions dynamically
        const { fetchNYISONodes } = await import('./nyiso.js');
        const nyisoData = await fetchNYISONodes();
        
        // Find matching node for this charger
        const matchingNode = nyisoData.nodes.find(node => 
            node.name === charger.node_name || 
            (charger.zone && node.name.includes(charger.zone))
        );
        
        if (matchingNode && matchingNode.lmp > 0) {
            // LMP is in $/MWh, convert to $/kWh
            const realTimePricePerKwh = matchingNode.lmp / 1000;
            // Add 20% markup for charging station profit
            return realTimePricePerKwh * 1.2 * kwhNeeded;
        }
    } catch (error) {
        console.warn('NYISO pricing unavailable, using station price:', error);
    }
    
    // Fallback to station's listed price
    return kwhNeeded * charger.price_per_kwh;
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
  
  // Get real driving distance using OSRM
  let driveMinutes, distance, actualDriveSource;
  
  if (driveMinutesOverride !== undefined && driveMinutesOverride !== null) {
    driveMinutes = driveMinutesOverride;
    actualDriveSource = driveTimeSource;
    // Estimate distance from drive minutes (assuming 40 km/h avg)
    distance = (driveMinutes / 60) * 40;
  } else {
    const drivingMetrics = await getDrivingMetrics(
      driverLat, driverLon, 
      charger.lat, charger.lon
    );
    distance = drivingMetrics.distance;
    driveMinutes = drivingMetrics.duration;
    actualDriveSource = drivingMetrics.source;
  }

  // Calculate grid stress from congestion data
  const congestion = charger.node_congestion || 0;
  const allCong = allChargers.map((c) => c.node_congestion || 0);
  const minCong = Math.min(...allCong);
  const maxCong = Math.max(...allCong);
  const range = Math.max(maxCong - minCong, 0.01);
  const gridStress = Math.max(
    0,
    Math.min(100, ((congestion - minCong) / range) * 100)
  );

  // Grid bonus - greener grids get bonus
  const gridBonus = Math.max(0, ((100 - gridStress) / 100) * 15);

  // Demand response bonus
  const avgCong = allCong.reduce((a, b) => a + b, 0) / allCong.length;
  const drActive = avgCong > 10;
  const drBonus = drActive && gridStress < 40
    ? Math.min(25, (avgCong * kwhNeeded) / 1000 * 2.0)
    : 0;

  // Time penalty ($0.50 per minute - value of driver's time)
  const timePenalty = driveMinutes * 0.5;

  // Calculate real-time energy cost using NYISO data
  const realTimeCost = await getRealTimeEnergyCost(charger, kwhNeeded);
  const stationCost = kwhNeeded * charger.price_per_kwh;
  
  // Use the lower of real-time or station price (benefit to driver)
  const chargingCost = Math.min(realTimeCost, stationCost);

  const totalEarnings = gridBonus + drBonus;
  const netCost = chargingCost + timePenalty - totalEarnings;
  const score = totalEarnings - timePenalty;

  return {
    ...charger,
    distance_km: Math.round(distance * 100) / 100,
    drive_minutes: Math.round(driveMinutes),
    drive_source: actualDriveSource,
    gridStress: Math.round(gridStress * 10) / 10,
    gridBonus: Math.round(gridBonus * 100) / 100,
    drActive,
    drBonus: Math.round(drBonus * 100) / 100,
    time_penalty: Math.round(timePenalty * 100) / 100,
    station_cost: Math.round(stationCost * 100) / 100,
    realtime_cost: Math.round(realTimeCost * 100) / 100,
    charging_cost: Math.round(chargingCost * 100) / 100,
    total_earnings: Math.round(totalEarnings * 100) / 100,
    net_cost: Math.round(netCost * 100) / 100,
    score: Math.round(score * 100) / 100,
    // Add comparison field to show savings
    savings_vs_station: Math.round((stationCost - chargingCost) * 100) / 100
  };
}
