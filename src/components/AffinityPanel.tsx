import { useMemo, useState } from "react";
import type { AffinityProfile } from "../hooks/useAffinity";
import {
  AFFINITY_GROUPS,
  buildBubbles,
  categoricalColor,
  colorNameColor,
  contrastText,
  truncate,
} from "../affinity";

// SVG coordinate space; the <svg> scales to the container width.
const W = 320;
const H = 250;

interface AffinityPanelProps {
  profile: AffinityProfile;
}

const AffinityPanel: React.FC<AffinityPanelProps> = ({ profile }) => {
  // Only groups that the profile actually carries with data.
  const groups = useMemo(
    () =>
      AFFINITY_GROUPS.filter((g) => {
        const grp = profile[g.key];
        return grp && Object.keys(grp).length > 0;
      }),
    [profile]
  );

  const [active, setActive] = useState<string>(groups[0]?.key ?? "");
  const current = groups.find((g) => g.key === active) ?? groups[0];
  const activeKey = current?.key ?? "";

  const bubbles = useMemo(() => {
    const entries = profile[activeKey] ?? {};
    const colorFor = activeKey === "color" ? colorNameColor : categoricalColor;
    return buildBubbles(entries, W, H, colorFor);
  }, [profile, activeKey]);

  if (!current) return null;

  return (
    <div className="affinity">
      <div className="affinity-tabs">
        {groups.map((g) => (
          <button
            key={g.key}
            className={`affinity-tab ${g.key === current.key ? "active" : ""}`}
            onClick={() => setActive(g.key)}
          >
            {g.label}
          </button>
        ))}
      </div>

      <svg
        className="affinity-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Afinidad por ${current.label.toLowerCase()}`}
      >
        {bubbles.map((b) => {
          const pct = b.pct;
          const showLabel = b.r >= 20;
          const text = contrastText(b.color);
          return (
            <g key={b.key}>
              <title>{`${b.key} · ${pct}%`}</title>
              <circle
                cx={b.cx}
                cy={b.cy}
                r={b.r}
                fill={b.color}
                stroke="rgba(255,255,255,0.28)"
                strokeWidth={1}
              />
              {showLabel && (
                <text
                  x={b.cx}
                  y={b.cy}
                  textAnchor="middle"
                  fontSize={b.fontSize}
                  fill={text}
                  style={{ pointerEvents: "none" }}
                >
                  <tspan x={b.cx} dy="-0.15em" fontWeight={600}>
                    {truncate(b.key, b.r)}
                  </tspan>
                  <tspan x={b.cx} dy="1.2em" opacity={0.85}>
                    {pct}%
                  </tspan>
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Ranked legend: full names + score, always readable even when a bubble
          is too small to hold its label. */}
      <ul className="affinity-legend">
        {bubbles.map((b) => (
          <li key={b.key} title={b.key}>
            <span className="swatch" style={{ backgroundColor: b.color }} />
            <span className="name">{b.key}</span>
            <span className="val">{b.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AffinityPanel;
