const CAR_MODELS = [
  { label: 'Tesla Model Y (75 kWh)', kwh: 75 },
  { label: 'Tesla Model 3 (60 kWh)', kwh: 60 },
  { label: 'Chevy Bolt (66 kWh)', kwh: 66 },
  { label: 'Nissan Leaf (40 kWh)', kwh: 40 },
  { label: 'Hyundai Ioniq 5 (77 kWh)', kwh: 77 },
];

export default function DriverPanel({
  loading,
  loadingMessage,
  carIndex,
  setCarIndex,
  batteryPct,
  setBatteryPct,
  targetPct,
  setTargetPct,
  onFindBest,
  showNodes,
  setShowNodes,
  hasDriverPin,
  searchActive,
}) {
  const cap = CAR_MODELS[carIndex]?.kwh ?? 60;
  const kwhNeeded = Math.max(
    0,
    ((Math.min(targetPct, 100) - Math.min(batteryPct, 100)) / 100) * cap
  );

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-4">
        <h2 className="text-lg font-semibold text-[#1B4F72]">I need to charge</h2>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {loading ? (
          <p className="text-sm text-[#2E86C1]">{loadingMessage}</p>
        ) : null}

        <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
          Car model
        </label>
        <select
          value={carIndex}
          onChange={(e) => setCarIndex(Number(e.target.value))}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#2E86C1] focus:outline-none focus:ring-1 focus:ring-[#2E86C1]"
        >
          {CAR_MODELS.map((m, i) => (
            <option key={m.label} value={i}>
              {m.label}
            </option>
          ))}
        </select>

        <div>
          <div className="mb-1 flex justify-between text-xs font-medium text-gray-600">
            <span>Current battery</span>
            <span className="tabular-nums">{batteryPct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={batteryPct}
            onChange={(e) => setBatteryPct(Number(e.target.value))}
            className="w-full accent-[#2E86C1]"
          />
        </div>

        <div>
          <div className="mb-1 flex justify-between text-xs font-medium text-gray-600">
            <span>Target battery</span>
            <span className="tabular-nums">{targetPct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={targetPct}
            onChange={(e) => setTargetPct(Number(e.target.value))}
            className="w-full accent-[#2E86C1]"
          />
        </div>

        <div className="rounded-lg bg-gray-50 px-3 py-3 text-sm">
          <span className="text-gray-600">You need </span>
          <span className="font-semibold tabular-nums text-[#1B4F72]">
            {kwhNeeded.toFixed(1)} kWh
          </span>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showNodes}
            onChange={(e) => setShowNodes(e.target.checked)}
            className="rounded border-gray-300 text-[#2E86C1] focus:ring-[#2E86C1]"
          />
          Show NYISO nodes (purple)
        </label>

        <button
          type="button"
          onClick={() => onFindBest(kwhNeeded)}
          disabled={loading || !hasDriverPin || kwhNeeded <= 0}
          className="w-full rounded-md bg-[#2E86C1] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#256f9e] disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          Find Best Charger
        </button>

        <p className="text-xs leading-relaxed text-gray-500">
          {searchActive
            ? 'Click two chargers on the map to compare savings side by side.'
            : 'Click the map to set your location.'}
        </p>
      </div>
    </aside>
  );
}

export { CAR_MODELS };
