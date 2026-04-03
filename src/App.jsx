import { useCallback, useEffect, useMemo, useState } from 'react';
import ComparePanel from './components/ComparePanel.jsx';
import DriverPanel from './components/DriverPanel.jsx';
import GridStatus from './components/GridStatus.jsx';
import MapView from './components/Map.jsx';
import nodesFallback from './data/nodes_fallback.json';
import { getChargers, getNodesWithLocations } from './utils/api.js';
import { matchChargersToNodes } from './utils/matching.js';
import { scoreCharger } from './utils/scoring.js';

const CENTER = { lat: 40.758, lon: -73.9855 };

export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(
    'Loading NYC fleet charging stations...'
  );
  const [chargers, setChargers] = useState([]);
  const [gridData, setGridData] = useState(null);
  const [gridLive, setGridLive] = useState(false);

  const [carIndex, setCarIndex] = useState(0);
  const [batteryPct, setBatteryPct] = useState(25);
  const [targetPct, setTargetPct] = useState(80);
  const [showNodes, setShowNodes] = useState(false);

  const [driverPosition, setDriverPosition] = useState(null);
  const [searchActive, setSearchActive] = useState(false);
  const [scoredList, setScoredList] = useState([]);
  const [recommendedId, setRecommendedId] = useState(null);
  const [closestId, setClosestId] = useState(null);
  const [compareIds, setCompareIds] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setLoadingMessage('Loading NYC fleet charging stations...');

      const list = await getChargers(CENTER.lat, CENTER.lon, 8);

      if (cancelled) return;
      setLoadingMessage('Pulling live NYISO grid data...');

      let nodesPayload;
      let live = false;
      try {
        nodesPayload = await getNodesWithLocations();
        live = true;
      } catch (e) {
        console.warn('NYISO / merge failed, using snapshot', e);
        nodesPayload = nodesFallback;
        live = false;
      }

      if (cancelled) return;
      setLoadingMessage('Matching chargers to grid nodes...');

      const matched = matchChargersToNodes(list, nodesPayload.nodes);
      setChargers(matched);
      setGridData(nodesPayload);
      setGridLive(live);
      setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const scoredById = useMemo(() => {
    const m = new Map();
    for (const s of scoredList) m.set(s.id, s);
    return m;
  }, [scoredList]);

  const handleFindBest = useCallback(
    async (kwhNeeded) => {
      if (!driverPosition) return;
      if (kwhNeeded <= 0 || !chargers.length) return;

      const [lat, lon] = driverPosition;
      
      // Score all chargers asynchronously with OSRM and NYISO data
      const scored = await Promise.all(
        chargers.map((c) =>
          scoreCharger(c, lat, lon, kwhNeeded, chargers)
        )
      );

      // Star / pick: lowest net cost (charging + drive − grid bonuses)
      let cheapest = scored[0];
      let minNet = cheapest.netCost;
      for (const c of scored) {
        if (c.netCost < minNet) {
          cheapest = c;
          minNet = c.netCost;
        }
      }

      // Closest by route/estimate distance (miles)
      let close = scored[0];
      let minD = close.distance;
      for (const c of scored) {
        if (c.distance < minD) {
          close = c;
          minD = c.distance;
        }
      }

      setScoredList(scored);
      setRecommendedId(cheapest.id);
      setClosestId(close.id);
      setSearchActive(true);
      setCompareIds([]);
    },
    [chargers, driverPosition]
  );

  const onChargerClick = useCallback(
    (id) => {
      if (!searchActive) return;
      setCompareIds((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        if (prev.length < 2) return [...prev, id];
        return [prev[1], id];
      });
    },
    [searchActive]
  );

  const compareA =
    compareIds.length === 2 ? scoredById.get(compareIds[0]) : null;
  const compareB =
    compareIds.length === 2 ? scoredById.get(compareIds[1]) : null;

  return (
    <div className="flex h-screen min-w-[1024px] flex-col bg-gray-100">
      <GridStatus
        gridData={gridData}
        liveSource={gridLive ? 'live' : 'fallback'}
      />
      <div className="flex min-h-0 flex-1">
        <DriverPanel
          loading={loading}
          loadingMessage={loadingMessage}
          carIndex={carIndex}
          setCarIndex={setCarIndex}
          batteryPct={batteryPct}
          setBatteryPct={setBatteryPct}
          targetPct={targetPct}
          setTargetPct={setTargetPct}
          onFindBest={handleFindBest}
          showNodes={showNodes}
          setShowNodes={setShowNodes}
          hasDriverPin={Boolean(driverPosition)}
          searchActive={searchActive}
        />
        <div className="relative min-h-0 min-w-0 flex-1">
          <MapView
            chargers={chargers}
            gridNodes={gridData?.nodes ?? []}
            showNodes={showNodes}
            driverPosition={driverPosition}
            searchActive={searchActive}
            scoredById={searchActive ? scoredById : null}
            recommendedId={recommendedId}
            closestId={closestId}
            compareIds={compareIds}
            onChargerClick={onChargerClick}
            onMapClick={setDriverPosition}
          />
          {compareIds.length === 2 ? (
            <ComparePanel
              scoredA={compareA}
              scoredB={compareB}
              onClose={() => setCompareIds([])}
              onUse={() => setCompareIds([])}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
