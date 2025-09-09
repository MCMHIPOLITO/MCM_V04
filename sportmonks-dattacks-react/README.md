# SportMonks Live Dangerous Attacks (React + Vite + Tailwind)

A minimal, production-ready UI that polls SportMonks every **3 seconds**, extracts **Dangerous Attacks (Trend=44)** split by **1st half** and **2nd half**, and shows **Delta = 2HT - 1HT**. Also displays **Match**, **Time**, and **Corners (Trend=34)**.

## Quick start

```bash
npm install
npm run dev
```

## Build for production

```bash
npm run build
npm run preview
```

## Notes
- Polls API with `cache: no-store` and uses `AbortController` to avoid overlapping requests.
- Sticky table header for readability on long lists.
- TailwindCSS included via PostCSS pipeline.
