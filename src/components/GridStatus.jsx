function statusFromAvgCongestion(avg) {
  if (avg < 4) return { label: 'Normal', color: '#1E8449', dotClass: 'bg-[#1E8449]' };
  if (avg < 10)
    return { label: 'Elevated', color: '#CA8F04', dotClass: 'bg-amber-500' };
  return { label: 'Stressed', color: '#C0392B', dotClass: 'bg-[#C0392B]' };
}

export default function GridStatus({ gridData, liveSource }) {
  const nodes = gridData?.nodes ?? [];
  const avg =
    nodes.length > 0
      ? nodes.reduce((s, n) => s + (n.congestion || 0), 0) / nodes.length
      : 0;

  const status = statusFromAvgCongestion(avg);
  const { label, color, dotClass } = status;

  return (
    <header className="shrink-0 z-[1000] flex h-14 items-center justify-between border-b border-gray-200 bg-white px-5 shadow-sm">
      <h1 className="text-xl font-bold tracking-tight text-[#1B4F72]">
        GridRoute
      </h1>

      <div className="flex flex-1 flex-col items-center justify-center gap-0.5 px-6 text-sm text-gray-700">
        <div className="flex items-center gap-2 font-medium">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`}
            aria-hidden
          />
          <span>
            NYC Grid: <span style={{ color }}>{label}</span>
          </span>
          <span className="text-gray-400">|</span>
          <span>
            Avg congestion:{' '}
            <span className="tabular-nums text-gray-900">
              ${avg.toFixed(2)}/MWh
            </span>
          </span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-600">
            Data:{' '}
            <span className="tabular-nums text-gray-900">
              {gridData?.timestamp ?? '—'}
            </span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-[#1B4F72]">
        <span
          className={`relative flex h-2 w-2 ${liveSource === 'live' ? '' : 'opacity-60'}`}
        >
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${liveSource === 'live' ? 'animate-ping bg-green-400' : 'bg-gray-400'}`}
          />
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${liveSource === 'live' ? 'bg-green-500' : 'bg-gray-500'}`}
          />
        </span>
        {liveSource === 'live' ? 'Live NYISO data' : 'Cached grid snapshot'}
      </div>
    </header>
  );
}
