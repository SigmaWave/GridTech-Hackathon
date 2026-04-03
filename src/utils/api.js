import chargersFallback from '../data/chargers_fallback.json';
import nodeLocations from '../data/node_locations.json';
import fleetCsv from '../../NYC_EV_Fleet_Station.csv?raw';
import { haversine } from './matching.js';

const NYISO_DIRECT = (dateStr) =>
  `https://mis.nyiso.com/public/csv/realtime/${dateStr}realtime_gen.csv`;

function parseDelimitedCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (c === '\r') {
      i += 1;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function chargerKindFromNycType(typeStr) {
  const t = String(typeStr || '').toLowerCase();
  if (/level\s*3|l3\b/.test(t) || (/fast/.test(t) && /charger/.test(t))) {
    return { type: 'DC Fast', ports_l2: 0 };
  }
  return { type: 'Level 2', ports_dcfast: 0 };
}

function rowToStation(headers, values, rowIndex) {
  const row = {};
  headers.forEach((h, idx) => {
    row[h] = values[idx] ?? '';
  });

  const lat = parseFloat(String(row.LATITUDE ?? '').replace(/"/g, '').trim());
  const lon = parseFloat(String(row.LONGITUDE ?? '').replace(/"/g, '').trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const plugs = parseInt(String(row['NO. OF PLUGS'] || '0'), 10) || 1;
  const kind = chargerKindFromNycType(row['TYPE OF CHARGER']);
  const isDC = kind.type === 'DC Fast';

  return {
    id: `nyc-fleet-${rowIndex}`,
    name: row['STATION NAME'] || `Station ${rowIndex}`,
    address: row.ADDRESS || '',
    city: row.CITY || '',
    lat,
    lon,
    type: kind.type,
    price_per_kwh: isDC ? 0.35 : 0.2,
    network: row.AGENCY || 'NYC Fleet',
    ports_l2: isDC ? 0 : plugs,
    ports_dcfast: isDC ? plugs : 0,
    connector_types: isDC ? ['CCS', 'CHADEMO'] : ['J1772'],
    access_time: row['PUBLIC CHARGER?'] || 'Fleet (see agency)',
  };
}

export function parseFleetStationCsv(text) {
  const table = parseDelimitedCsv(text.trim());
  if (table.length < 2) return [];

  const headers = table[0].map((h) => String(h).trim().replace(/^"|"$/g, ''));
  const stations = [];

  for (let r = 1; r < table.length; r += 1) {
    const values = table[r].map((c) => String(c).trim().replace(/^"|"$/g, ''));
    const station = rowToStation(headers, values, r);
    if (station) stations.push(station);
  }

  return stations;
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
    const all = parseFleetStationCsv(fleetCsv);
    const near = all
      .map((s) => ({
        ...s,
        distance: haversine(lat, lon, s.lat, s.lon),
      }))
      .filter((s) => s.distance <= radiusMiles)
      .sort((a, b) => a.distance - b.distance);

    if (near.length) return near;
    console.warn('No NYC fleet stations within radius, using fallback data');
    return JSON.parse(JSON.stringify(chargersFallback));
  } catch (error) {
    console.warn('NYC fleet CSV failed, using fallback data', error);
    return JSON.parse(JSON.stringify(chargersFallback));
  }
}
