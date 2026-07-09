// Pure helpers for the affinity bubble view: circle packing, colour mapping
// and small label utilities. No DOM / chrome APIs here so it stays testable.

export const AFFINITY_GROUPS: { key: string; label: string }[] = [
  { key: "categories_0", label: "Categorías" },
  { key: "categories_1", label: "Subcategorías" },
  { key: "categories_2", label: "Detalle" },
  { key: "color", label: "Color" },
  { key: "keywords", label: "Keywords" },
];

// ---------------------------------------------------------------------------
// Circle packing (greedy tangent placement)
// ---------------------------------------------------------------------------

type Placed = { r: number; x: number; y: number; i: number };

/** Centres of a circle of radius `r` tangent externally to both `a` and `b`. */
function tangentCenters(a: Placed, b: Placed, r: number): { x: number; y: number }[] {
  const r1 = a.r + r;
  const r2 = b.r + r;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d === 0 || d > r1 + r2 || d < Math.abs(r1 - r2)) return [];

  const aa = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - aa * aa;
  if (h2 < 0) return [];

  const h = Math.sqrt(h2);
  const xm = a.x + (aa * dx) / d;
  const ym = a.y + (aa * dy) / d;
  const ox = (h * dy) / d;
  const oy = (h * dx) / d;
  return [
    { x: xm + ox, y: ym - oy },
    { x: xm - ox, y: ym + oy },
  ];
}

/**
 * Pack circles greedily: place the largest at the origin, then each subsequent
 * circle tangent to two already-placed circles at the spot closest to the
 * origin that doesn't overlap anything. Produces a compact, non-overlapping
 * cluster in an arbitrary coordinate space. `radii` is kept in caller order.
 */
function packRadii(radii: number[]): Placed[] {
  const order = radii.map((r, i) => ({ r, i })).sort((p, q) => q.r - p.r);
  const placed: Placed[] = [];

  for (const { r, i } of order) {
    if (placed.length === 0) {
      placed.push({ r, x: 0, y: 0, i });
      continue;
    }
    if (placed.length === 1) {
      placed.push({ r, x: placed[0].r + r, y: 0, i });
      continue;
    }

    let best: { x: number; y: number; score: number } | null = null;
    for (let a = 0; a < placed.length; a++) {
      for (let b = a + 1; b < placed.length; b++) {
        for (const c of tangentCenters(placed[a], placed[b], r)) {
          let ok = true;
          for (const p of placed) {
            if (Math.hypot(c.x - p.x, c.y - p.y) < p.r + r - 1e-3) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
          const score = Math.hypot(c.x, c.y); // compactness toward the origin
          if (!best || score < best.score) best = { x: c.x, y: c.y, score };
        }
      }
    }

    if (best) {
      placed.push({ r, x: best.x, y: best.y, i });
    } else {
      // Degenerate fallback: drop it to the right of everything.
      const maxX = Math.max(...placed.map((p) => p.x + p.r));
      placed.push({ r, x: maxX + r, y: 0, i });
    }
  }

  return placed;
}

export type PackedBubble = {
  key: string;
  value: number;
  color: string;
  cx: number;
  cy: number;
  r: number;
  fontSize: number;
};

/**
 * Build packed bubbles for a group of { label: score } entries, fitted into a
 * width×height box and sorted by score (desc). Radius ∝ sqrt(score) so the
 * bubble *area* encodes the affinity.
 */
export function buildBubbles(
  entries: Record<string, number>,
  width: number,
  height: number,
  colorFor: (key: string, index: number) => string,
  padding = 4
): PackedBubble[] {
  const items = Object.entries(entries)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (items.length === 0) return [];

  const maxV = Math.max(...items.map(([, v]) => v));
  // Area ∝ value -> radius ∝ sqrt(value); small floor keeps the tiniest visible.
  const radii = items.map(([, v]) => Math.sqrt(v / maxV) + 0.14);
  const placed = packRadii(radii);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of placed) {
    minX = Math.min(minX, p.x - p.r);
    minY = Math.min(minY, p.y - p.r);
    maxX = Math.max(maxX, p.x + p.r);
    maxY = Math.max(maxY, p.y + p.r);
  }

  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const scale = Math.min((width - padding * 2) / bw, (height - padding * 2) / bh);
  const offsetX = (width - bw * scale) / 2 - minX * scale;
  const offsetY = (height - bh * scale) / 2 - minY * scale;

  // `placed` is ordered largest-first; map each back to its entry via `i`.
  return placed.map((p) => {
    const [key, value] = items[p.i];
    const r = p.r * scale;
    return {
      key,
      value,
      color: colorFor(key, p.i),
      cx: p.x * scale + offsetX,
      cy: p.y * scale + offsetY,
      r,
      fontSize: Math.max(8, Math.min(15, r / 2.6)),
    };
  });
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const CATEGORICAL = [
  "#EC4899", "#8B5CF6", "#F43F5E", "#F59E0B", "#22C55E",
  "#38BDF8", "#A855F7", "#FB7185", "#FACC15", "#34D399",
];

export function categoricalColor(_key: string, index: number): string {
  return CATEGORICAL[index % CATEGORICAL.length];
}

// Real colours for the DY `color` affinity group (Spanish labels).
const COLOR_NAMES: Record<string, string> = {
  amarillo: "#F4C430",
  azul: "#2E6BE6",
  blanco: "#F3F4F6",
  gris: "#9AA0A6",
  marron: "#8B5A2B",
  naranja: "#F97316",
  negro: "#2A2A2A",
  rojo: "#E23B3B",
  rosa: "#EC4899",
  verde: "#33A852",
  violeta: "#7C3AED",
};

function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // strip accents: "marrón" -> "marron"
}

export function colorNameColor(key: string, index: number): string {
  return COLOR_NAMES[normalizeName(key)] ?? categoricalColor(key, index);
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

/** Pick black/white text for readable contrast over `hex`. */
export function contrastText(hex: string): string {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1a1a1a" : "#ffffff";
}

/** Trim a label to roughly what fits inside a bubble of radius `r`. */
export function truncate(label: string, r: number): string {
  const max = Math.max(4, Math.floor(r / 4));
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}
