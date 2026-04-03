function stressBar(stress) {
  const pct = Math.max(0, Math.min(100, stress));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#1E8449] via-[#D4AC0D] to-[#C0392B]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Column({ title, s }) {
  if (!s) return <div className="flex-1 rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-400">{title}</div>;

  return (
    <div className="flex-1 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#2E86C1]">
        {title}
      </p>
      <h3 className="mt-1 text-base font-bold text-gray-900">{s.name}</h3>
      <p className="text-sm text-gray-500">
        {s.address}
        {s.city ? `, ${s.city}` : ''}
      </p>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Network</dt>
          <dd className="text-right font-medium text-gray-900">{s.network}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Type</dt>
          <dd className="text-right font-medium text-gray-900">{s.type}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Ports</dt>
          <dd className="text-right font-medium tabular-nums text-gray-900">
            {s.ports_l2} L2 · {s.ports_dcfast} DC
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Distance</dt>
          <dd className="text-right font-medium tabular-nums text-gray-900">
            {s.distance.toFixed(2)} mi
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Drive time</dt>
          <dd className="text-right font-medium tabular-nums text-gray-900">
            ~{s.driveMinutes} min
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Price</dt>
          <dd className="text-right font-medium tabular-nums text-gray-900">
            ${s.price_per_kwh.toFixed(2)}/kWh
          </dd>
        </div>
        <div>
          <div className="mb-1 flex justify-between gap-2">
            <dt className="text-gray-500">Grid stress</dt>
            <dd className="font-medium tabular-nums text-gray-900">
              {s.gridStress}/100
            </dd>
          </div>
          {stressBar(s.gridStress)}
        </div>
        <div className="flex justify-between gap-2 border-t border-gray-100 pt-2">
          <dt className="text-gray-500">Nearest node</dt>
          <dd className="max-w-[55%] text-right text-xs font-medium leading-snug text-gray-900">
            {s.nearest_node} · $
            {Number(s.node_congestion).toFixed(2)}
            /MWh congestion
          </dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-gray-200 pt-3 text-sm">
        <div className="flex justify-between text-black">
          <span>Charging cost</span>
          <span className="tabular-nums font-medium">
            ${s.chargingCost.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-[#1E8449]">
          <span>Grid bonus</span>
          <span className="tabular-nums font-medium">
            -${s.gridBonus.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-[#1E8449]">
          <span>DR bonus</span>
          <span className="tabular-nums font-medium">
            +${s.drBonus.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-black">
          <span>Drive cost</span>
          <span className="tabular-nums font-medium">
            +${s.timePenalty.toFixed(2)}
          </span>
        </div>
        <div className="mt-2 flex justify-between border-t border-gray-100 pt-2 text-base font-bold text-[#1B4F72]">
          <span>NET COST</span>
          <span className="tabular-nums">${s.netCost.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

export default function ComparePanel({ scoredA, scoredB, onClose, onUse }) {
  const a = scoredA;
  const b = scoredB;
  if (!a || !b) return null;

  const winner = a.netCost <= b.netCost ? a : b;
  const loser = a.netCost <= b.netCost ? b : a;
  const sessionSave = Math.abs(loser.netCost - winner.netCost);
  const yearly = sessionSave * 240;

  return (
    <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-[500] border-t border-gray-200 bg-white/98 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-semibold text-[#1B4F72]">
            Compare chargers
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            Close
          </button>
        </div>

        <div className="flex gap-4">
          <Column title="Charger A" s={scoredA} />
          <Column title="Charger B" s={scoredB} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3 text-sm">
          <div className="text-gray-700">
            <p>
              By choosing <span className="font-semibold text-[#1B4F72]">{winner.name}</span>, you
              save <span className="font-semibold tabular-nums text-[#1E8449]">${sessionSave.toFixed(2)}</span> per session
              vs the other pick (lower net cost after bonuses and drive time).
            </p>
            <p className="mt-1 text-gray-600">
              That&apos;s roughly{' '}
              <span className="font-semibold tabular-nums text-gray-900">
                ${yearly.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>{' '}
              per year at ~240 similar sessions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onUse(winner)}
            className="shrink-0 rounded-md bg-[#1E8449] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#196f3d]"
          >
            Use this charger
          </button>
        </div>
      </div>
    </div>
  );
}
