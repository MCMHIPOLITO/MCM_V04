import React, { useEffect, useMemo, useRef, useState } from "react";

const API_URL = "https://api.sportmonks.com/v3/football/livescores/inplay?api_token=0m3wQMYU2HJdR6FmEFIkeCPtQhCS42wogMnxfcTeFc9iktmiSiFlDj2gavhm&include=periods;scores;trends;participants;statistics&filters=fixtureStatisticTypes:34,42,43,44,45,52,58,83,98,99;trendTypes:34,42,43,44,45,52,58,83,98,99&timezone=Europe/London&populate=400";

function classNames(...s) { return s.filter(Boolean).join(" "); }

/**
 * Utilities to defensively parse SportMonks v3 response.
 * We avoid assumptions and try to gracefully fallback.
 */
const isNum = (v) => typeof v === "number" && !isNaN(v);
const safeNum = (v, d = 0) => (isNum(Number(v)) ? Number(v) : d);

function getMinute(fixture) {
  // Prefer periods array if present
  const periods = fixture?.periods?.data || fixture?.periods || [];
  // Find the active period and compute minute
  const active = periods.find((p) => p?.is_current === true) || periods.find((p) => p?.state === "live");
  if (active && isNum(active?.minute)) return active.minute;
  // Try fixture time or scores meta
  const metaMin = fixture?.time?.minute ?? fixture?.scores?.minute;
  if (isNum(metaMin)) return metaMin;
  // Fallback: try to infer from status
  return fixture?.state?.short_name || fixture?.time?.status || "-";
}

function teamNames(fixture) {
  // participants typically includes home/away with meta
  const parts = fixture?.participants?.data || fixture?.participants || [];
  const home = parts.find((p) => (p?.meta?.location || p?.location) === "home");
  const away = parts.find((p) => (p?.meta?.location || p?.location) === "away");
  const homeName = home?.name || home?.short_code || "Home";
  const awayName = away?.name || away?.short_code || "Away";
  return { homeName, awayName };
}

function sumTrendByType(trends, typeId, filterFn = () => true) {
  if (!Array.isArray(trends)) return 0;
  return trends
    .filter((t) => t?.type_id === typeId && filterFn(t))
    .reduce((acc, t) => acc + safeNum(t?.value, 0), 0);
}

function extractTrends(fixture) {
  // trends might live in fixture.trends.data or fixture.trends
  let trends = fixture?.trends?.data || fixture?.trends || [];
  // Normalize items to have type_id, value, period_number if possible
  trends = trends.map((t) => ({
    type_id: t?.type_id ?? t?.type?.id ?? t?.trend_type_id,
    value: safeNum(t?.value ?? t?.data ?? t?.count ?? 0, 0),
    // Period metadata could be nested
    period_number:
      t?.period?.number ??
      t?.period_number ??
      (typeof t?.period?.name === "string" && t.period.name.includes("1") ? 1 :
       typeof t?.period?.name === "string" && t.period.name.includes("2") ? 2 : undefined),
  }));
  return trends;
}

function cornersTotal(fixture) {
  const trends = extractTrends(fixture);
  // Trend 34 = corners. If multiple entries per half, sum all.
  return sumTrendByType(trends, 34);
}

function dangerousAttacksByHalf(fixture) {
  const trends = extractTrends(fixture);
  // Trend 44 = Dangerous Attacks
  // Filter by period_number when available, else best-effort split by first/second half using periods
  const first = sumTrendByType(trends, 44, (t) => t.period_number === 1 || t.period_number === 0);
  const second = sumTrendByType(trends, 44, (t) => t.period_number === 2);

  if (first || second) {
    return { first, second };
  }

  // Fallback: if no period tagging, try statistics with period info
  const stats = fixture?.statistics?.data || fixture?.statistics || [];
  // Try to find stats entries per half with type 44
  const sFirst = stats
    .filter((s) => (s?.type_id === 44 || s?.type?.id === 44) && (s?.period?.number === 1))
    .reduce((a, s) => a + safeNum(s?.value), 0);
  const sSecond = stats
    .filter((s) => (s?.type_id === 44 || s?.type?.id === 44) && (s?.period?.number === 2))
    .reduce((a, s) => a + safeNum(s?.value), 0);

  return { first: sFirst || 0, second: sSecond || 0 };
}

function useLiveData(pollMs = 3000) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fixtures, setFixtures] = useState([]);
  const timer = useRef(null);

  useEffect(() => {
    let abort = new AbortController();

    async function fetchOnce() {
      try {
        setError(null);
        const res = await fetch(API_URL, {
          cache: "no-store",
          signal: abort.signal,
          headers: {
            "accept": "application/json",
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        // common SportMonks structure: { data: [fixtures] }
        const items = Array.isArray(json?.data) ? json.data : [];
        setFixtures(items);
        setLoading(false);
      } catch (e) {
        if (e.name !== "AbortError") {
          setError(e.message || "Fetch error");
          setLoading(false);
        }
      }
    }

    fetchOnce();
    timer.current = setInterval(fetchOnce, pollMs);
    return () => {
      abort.abort();
      if (timer.current) clearInterval(timer.current);
    };
  }, [pollMs]);

  return { loading, error, fixtures };
}

function Row({ fixture }) {
  const { homeName, awayName } = teamNames(fixture);
  const minute = getMinute(fixture);
  const corners = cornersTotal(fixture);
  const { first, second } = dangerousAttacksByHalf(fixture);

  const delta = safeNum(second) - safeNum(first);

  return (
    <tr className="odd:bg-white even:bg-gray-50">
      <td className="px-3 py-2 font-medium whitespace-nowrap">{homeName} <span className="text-gray-400">vs</span> {awayName}</td>
      <td className="px-3 py-2 text-center">{isNum(minute) ? `${minute}'` : minute}</td>
      <td className="px-3 py-2 text-center">{corners}</td>
      <td className="px-3 py-2 text-center">{first}</td>
      <td className="px-3 py-2 text-center">{second}</td>
      <td className={classNames("px-3 py-2 text-center font-semibold",
        delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-gray-800"
      )}>{delta}</td>
    </tr>
  );
}

export default function App() {
  const { loading, error, fixtures } = useLiveData(3000);

  const rows = useMemo(() => fixtures.map((f) => ({
    id: f?.id || `${f?.league_id || "x"}-${f?.season_id || "y"}-${f?.id || Math.random()}`,
    f,
  })), [fixtures]);

  return (
    <div className="max-w-7xl mx-auto p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Live Dangerous Attacks (Trend=44)</h1>
        <p className="text-sm text-gray-600">Auto-refresh every 3 seconds · Timezone: Europe/London</p>
      </header>

      <div className="overflow-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-200">
              <th className="sticky-th px-3 py-2 text-left">Match</th>
              <th className="sticky-th px-3 py-2 text-center">Time</th>
              <th className="sticky-th px-3 py-2 text-center">Corners</th>
              <th className="sticky-th px-3 py-2 text-center">D.Attack 1HT</th>
              <th className="sticky-th px-3 py-2 text-center">D.Attack 2HT</th>
              <th className="sticky-th px-3 py-2 text-center">Delta D.Attack</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-6 text-gray-500 text-center" colSpan={6}>Loading live data…</td>
              </tr>
            )}
            {error && !loading && (
              <tr>
                <td className="px-3 py-6 text-rose-600 text-center" colSpan={6}>Error: {error}</td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-gray-500 text-center" colSpan={6}>No live fixtures found.</td>
              </tr>
            )}
            {!loading && !error && rows.map(({ id, f }) => (
              <Row key={id} fixture={f} />
            ))}
          </tbody>
        </table>
      </div>

      <footer className="mt-4 text-xs text-gray-500">
        Data: SportMonks v3 · This demo sums half-tagged trends (type 44) when available and falls back to per-half statistics.
      </footer>
    </div>
  );
}
