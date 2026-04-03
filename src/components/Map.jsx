import { useMemo } from 'react';
import {
  CircleMarker,
  LayerGroup,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';

const MANHATTAN = [40.758, -73.9855];

function stressColor(stress) {
  if (stress <= 33) return '#1E8449';
  if (stress <= 66) return '#D4AC0D';
  return '#C0392B';
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export default function MapView({
  chargers,
  gridNodes,
  showNodes,
  driverPosition,
  searchActive,
  scoredById,
  recommendedId,
  closestId,
  compareIds = [],
  onChargerClick,
  onMapClick,
}) {
  const driverIcon = useMemo(
    () =>
      L.divIcon({
        className: 'gridroute-driver-pin',
        html: `<div style="width:12px;height:12px;background:#111;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    []
  );

  const starIcon = useMemo(
    () =>
      L.divIcon({
        className: 'gridroute-star',
        html: `<div style="font-size:20px;line-height:1;color:#1B4F72;text-shadow:0 0 2px #fff,0 0 4px #fff">★</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      }),
    []
  );

  return (
    <MapContainer
      center={MANHATTAN}
      zoom={13}
      className="h-full w-full z-0"
      scrollWheelZoom
      attributionControl
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <MapClickHandler onMapClick={onMapClick} />

      {showNodes && gridNodes?.length ? (
        <LayerGroup>
          {gridNodes.map((n) => (
            <CircleMarker
              key={`node-${n.name}-${n.ptid}`}
              center={[n.lat, n.lon]}
              radius={4}
              pathOptions={{
                color: '#6B21A8',
                fillColor: '#9333EA',
                fillOpacity: 0.75,
                weight: 1,
              }}
            >
              <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
                {n.name} · congestion ${Number(n.congestion).toFixed(2)}/MWh
              </Tooltip>
            </CircleMarker>
          ))}
        </LayerGroup>
      ) : null}

      {chargers.map((c) => {
        const scored = scoredById?.get(c.id);
        const stress = scored?.gridStress ?? 0;
        const fill = searchActive && scored ? stressColor(stress) : '#9CA3AF';
        const isRec = searchActive && recommendedId === c.id;
        const isClose = searchActive && closestId === c.id;
        const isSel = compareIds.includes(c.id);
        const r = searchActive ? 9 : 5;

        return (
          <LayerGroup key={c.id}>
            <CircleMarker
              center={[c.lat, c.lon]}
              radius={r}
              pathOptions={{
                color: isSel ? '#1B4F72' : '#ffffff',
                weight: isSel ? 3 : 1,
                fillColor: fill,
                fillOpacity: searchActive ? 0.92 : 0.85,
              }}
              eventHandlers={{
                click: (e) => {
                  e.originalEvent?.stopPropagation?.();
                  onChargerClick(c.id);
                },
              }}
            >
              <Popup>
                <div className="min-w-[200px] text-sm">
                  <div className="font-semibold text-gray-900">{c.name}</div>
                  <div className="text-gray-600">{c.address}</div>
                  {searchActive && scored ? (
                    <div className="mt-2 space-y-1 text-xs text-gray-700">
                      <div>
                        Grid stress:{' '}
                        <span className="font-medium">{scored.gridStress}/100</span>
                      </div>
                      <div>
                        Net session:{' '}
                        <span className="font-medium">
                          ${scored.netCost.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  <p className="mt-2 text-[11px] text-gray-500">
                    Click to add to comparison (pick two).
                  </p>
                </div>
              </Popup>
              {searchActive && isClose ? (
                <Tooltip permanent direction="top" offset={[0, -8]} opacity={0.9}>
                  <span className="rounded bg-white/95 px-1 text-[10px] font-semibold text-gray-800 shadow">
                    Closest
                  </span>
                </Tooltip>
              ) : null}
            </CircleMarker>
            {isRec ? (
              <Marker
                position={[c.lat + 0.00018, c.lon]}
                icon={starIcon}
                interactive={false}
              />
            ) : null}
          </LayerGroup>
        );
      })}

      {driverPosition ? (
        <Marker position={driverPosition} icon={driverIcon} interactive={false}>
          <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
            Your location
          </Tooltip>
        </Marker>
      ) : null}
    </MapContainer>
  );
}
