import chargersFallback from '../data/chargers_fallback.json';
import nodeLocations from '../data/node_locations.json';

const NREL_API_KEY = 'DEMO_KEY';

const NYISO_DIRECT = (dateStr) =>
  `https://mis.nyiso.com/public/csv/realtime/${dateStr}realtime_gen.csv`;

export function parsePricing(pricingText, isDCFast) {
  if (!pricingText) return isDCFast ? 0.35 : 0.2;

  const kwhMatch = pricingText.match(/\$?([\d.]+)\s*\/\s*kWh/i);
  if (kwhMatch) return parseFloat(kwhMatch[1]);

  const centsMatch = pricingText.match(/([\d.]+)\s*¢?\s*\/\s*kWh/i);
  if (centsMatch) return parseFloat(centsMatch[1]) / 100;

  if (/free/i.test(pricingText)) return 0;

  return isDCFast ? 0.35 : 0.2;
}

export async function fetchChargers(lat, lon, radiusMiles = 5) {
  const params = new URLSearchParams({
    api_key: NREL_API_KEY,
    latitude: String(lat),
    longitude: String(lon),
    radius: String(radiusMiles),
    fuel_type: 'ELEC',
    ev_charging_level: 'dc_fast,2',
    status: 'E',
    access: 'public',
    limit: '50',
  });

  const url = `https://developer.nrel.gov/api/alt-fuel-stations/v1/nearest.json?${params}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`NREL ${response.status}`);
  const data = await response.json();

  if (!data.fuel_stations?.length) return [];

  return data.fuel_stations.map((station) => ({
    id: station.id,
    name: station.station_name,
    address: station.street_address,
    city: station.city,
    lat: station.latitude,
    lon: station.longitude,
    type: station.ev_dc_fast_count > 0 ? 'DC Fast' : 'Level 2',
    price_per_kwh: parsePricing(station.ev_pricing, station.ev_dc_fast_count > 0),
    network: station.ev_network || 'Unknown',
    ports_l2: station.ev_level2_evse_num || 0,
    ports_dcfast: station.ev_dc_fast_count || 0,
    connector_types: station.ev_connector_types || [],
    access_time: station.access_days_time || '24 hours daily',
    distance: station.distance,
  }));
}

function parseNYISOCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) throw new Error('Empty NYISO CSV');

  const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
  const nodes = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim().replace(/"/g, ''));
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx];
    });
    nodes.push(row);
  }

  const timeKey = headers.find((h) => /time\s*stamp/i.test(h)) || 'Time Stamp';
  const nameKey = headers.find((h) => /^name$/i.test(h)) || 'Name';
  const ptidKey = headers.find((h) => /^ptid$/i.test(h)) || 'PTID';
  const lbmpKey =
    headers.find((h) => /lbmp.*mwhr/i.test(h)) || 'LBMP ($/MWHr)';
  const congKey =
    headers.find((h) => /marginal cost congestion/i.test(h)) ||
    'Marginal Cost Congestion ($/MWHr)';
  const lossKey =
    headers.find((h) => /marginal cost losses/i.test(h)) ||
    'Marginal Cost Losses ($/MWHr)';

  const timestamps = [...new Set(nodes.map((n) => n[timeKey]).filter(Boolean))];
  const latestTimestamp = timestamps[timestamps.length - 1];
  if (!latestTimestamp) throw new Error('No NYISO timestamps in CSV');
  const latestNodes = nodes.filter((n) => n[timeKey] === latestTimestamp);

  return {
    timestamp: latestTimestamp,
    nodes: latestNodes.map((n) => ({
      id: n[nameKey],
      name: n[nameKey],
      ptid: n[ptidKey],
      lmp: parseFloat(n[lbmpKey]) || 0,
      congestion: parseFloat(n[congKey]) || 0,
      loss: parseFloat(n[lossKey]) || 0,
    })),
  };
}

async function fetchTextFromNYISO(url) {
  let response = await fetch(url);
  if (!response.ok) throw new Error(`NYISO ${response.status}`);
  return response.text();
}

function nyIsoDateString() {
  return new Date()
    .toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    .replace(/-/g, '');
}

export async function fetchNYISONodes() {
  const dateStr = nyIsoDateString();
  const directUrl = NYISO_DIRECT(dateStr);

  let csvText;
  try {
    csvText = await fetchTextFromNYISO(directUrl);
  } catch {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(directUrl)}`;
    csvText = await fetchTextFromNYISO(proxyUrl);
  }

  return parseNYISOCSV(csvText);
}

function lookupCoords(locationLookup, nodeName) {
  if (!nodeName) return null;
  const exact = locationLookup[nodeName];
  if (exact) return exact;

  const cleanName = String(nodeName).replace(/\s+/g, '_').toUpperCase();
  if (locationLookup[cleanName]) return locationLookup[cleanName];

  const upper = String(nodeName).toUpperCase();
  for (const key of Object.keys(locationLookup)) {
    if (key === upper || key.replace(/_/g, ' ') === upper.replace(/_/g, ' ')) {
      return locationLookup[key];
    }
  }

  return null;
}

export async function getNodesWithLocations() {
  const nyisoData = await fetchNYISONodes();
  const locationLookup = nodeLocations;

  const nodesWithCoords = nyisoData.nodes
    .map((node) => {
      const coords = lookupCoords(locationLookup, node.name);
      if (!coords) return null;
      return { ...node, lat: coords.lat, lon: coords.lon };
    })
    .filter(Boolean);

  if (!nodesWithCoords.length) {
    throw new Error('No NYISO nodes matched coordinates');
  }

  return {
    timestamp: nyisoData.timestamp,
    nodes: nodesWithCoords,
  };
}

export async function getChargers(lat, lon, radiusMiles = 8) {
  try {
    const stations = await fetchChargers(lat, lon, radiusMiles);
    if (!stations?.length) throw new Error('No chargers from NREL');
    return stations;
  } catch (error) {
    console.warn('NREL API failed, using fallback data', error);
    return JSON.parse(JSON.stringify(chargersFallback));
  }
}
