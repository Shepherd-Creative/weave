import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "../schemas/molecules.js";
import type { Tone } from "../schemas/tokens.js";
import { chartHeight } from "../utils/style.js";
import { resolveCSSVar, resolveChartColor, resolveFirstVar } from "../utils/theme.js";

const CATEGORY_KEY_CANDIDATES = [
  "name",
  "label",
  "category",
  "month",
  "quarter",
  "period",
  "date",
  "week",
  "day",
];

function detectCategoryKey(data: Array<Record<string, unknown>>): string | undefined {
  if (data.length === 0) return undefined;
  const first = data[0];
  if (!first) return undefined;
  const keys = Object.keys(first);
  for (const candidate of CATEGORY_KEY_CANDIDATES) {
    if (keys.includes(candidate)) return candidate;
  }
  // Fall back to first string-valued key.
  return keys.find((k) => typeof first[k] === "string");
}

function detectValueKeys(
  data: Array<Record<string, unknown>>,
  categoryKey: string | undefined,
): string[] {
  if (data.length === 0) return [];
  const first = data[0];
  if (!first) return [];
  return Object.keys(first).filter(
    (k) => k !== categoryKey && typeof first[k] === "number",
  );
}

function toneToColor(tone: Tone, index: number, fallback: string): string {
  switch (tone) {
    case "positive":
      return resolveCSSVar("--tone-positive", fallback);
    case "negative":
      return resolveCSSVar("--tone-negative", fallback);
    case "warning":
      return resolveCSSVar("--tone-warning", fallback);
    case "info":
      return resolveCSSVar("--tone-info", fallback);
    case "muted":
      return resolveCSSVar("--muted-foreground", fallback);
    case "default":
    default:
      return resolveChartColor(index, fallback);
  }
}

export function Chart(props: Omit<ChartSpec, "type">): React.JSX.Element {
  const {
    variant,
    data,
    categoryKey: userCategoryKey,
    valueKeys: userValueKeys,
    seriesTones,
    showLegend,
    showGrid = true,
    showTooltip = true,
    height,
  } = props;

  const { categoryKey, valueKeys, colors } = useMemo(() => {
    const catKey = userCategoryKey ?? detectCategoryKey(data);
    const valKeys = userValueKeys ?? detectValueKeys(data, catKey);
    const cs = valKeys.map((_, i) => {
      const tone = seriesTones?.[i];
      return tone
        ? toneToColor(tone, i, `#10b981`)
        : resolveChartColor(i);
    });
    return { categoryKey: catKey, valueKeys: valKeys, colors: cs };
  }, [userCategoryKey, userValueKeys, data, seriesTones]);

  // Chart-treatment tokens (v2), each falling back to the base structural
  // token then the hard-coded default, so default rendering is unchanged.
  const gridColor = resolveFirstVar(["--weave-chart-grid", "--border"], "#27272a");
  const axisColor = resolveFirstVar(["--weave-chart-axis", "--muted-foreground"], "#a1a1aa");
  const labelColor = resolveFirstVar(["--weave-chart-label", "--muted-foreground"], "#a1a1aa");
  const tooltipBg = resolveFirstVar(["--weave-chart-tooltip-bg", "--card"], "#18181b");
  const tooltipFg = resolveFirstVar(["--weave-chart-tooltip-fg", "--card-foreground"], "#fafafa");
  const gridDasharray = resolveFirstVar(["--weave-chart-grid-dasharray"], "3 3");
  const seriesStrokeWidth = Number(resolveFirstVar(["--weave-chart-stroke-width"], "2")) || 2;

  const containerStyle = {
    width: "100%",
    height: chartHeight(height),
  } as const;

  const wantLegend = showLegend ?? valueKeys.length > 1;

  const commonAxisProps = {
    tick: { fill: labelColor, fontSize: 12 },
    tickLine: { stroke: axisColor },
    axisLine: { stroke: axisColor },
  } as const;

  const tooltipProps = {
    contentStyle: {
      backgroundColor: tooltipBg,
      border: `var(--weave-card-border-width, 1px) solid ${gridColor}`,
      borderRadius: "var(--weave-chart-tooltip-radius, 6px)",
      color: tooltipFg,
      fontSize: 12,
    },
    cursor: { fill: resolveCSSVar("--muted", "#27272a"), opacity: 0.3 },
  } as const;

  if (variant === "pie" || variant === "donut") {
    const valueKey = valueKeys[0] ?? "value";
    return (
      <div style={containerStyle}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey={valueKey}
              nameKey={categoryKey}
              innerRadius={variant === "donut" ? "55%" : 0}
              outerRadius="85%"
              stroke={resolveCSSVar("--background", "#09090b")}
              strokeWidth={2}
            >
              {data.map((_row, i) => (
                <Cell
                  key={`cell-${i}`}
                  fill={seriesTones?.[i] ? toneToColor(seriesTones[i] as Tone, i, "#10b981") : resolveChartColor(i)}
                />
              ))}
            </Pie>
            {showTooltip ? <Tooltip {...tooltipProps} /> : null}
            {wantLegend ? <Legend /> : null}
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (variant === "horizontal-bar") {
    return (
      <div style={containerStyle}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical">
            {showGrid ? <CartesianGrid stroke={gridColor} strokeDasharray={gridDasharray} /> : null}
            <XAxis type="number" {...commonAxisProps} />
            <YAxis type="category" dataKey={categoryKey} width={96} {...commonAxisProps} />
            {showTooltip ? <Tooltip {...tooltipProps} /> : null}
            {wantLegend ? <Legend /> : null}
            {valueKeys.map((k, i) => (
              <Bar key={k} dataKey={k} fill={colors[i]} radius={[0, 4, 4, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (variant === "bar") {
    return (
      <div style={containerStyle}>
        <ResponsiveContainer>
          <BarChart data={data}>
            {showGrid ? <CartesianGrid stroke={gridColor} strokeDasharray={gridDasharray} /> : null}
            <XAxis dataKey={categoryKey} {...commonAxisProps} />
            <YAxis {...commonAxisProps} />
            {showTooltip ? <Tooltip {...tooltipProps} /> : null}
            {wantLegend ? <Legend /> : null}
            {valueKeys.map((k, i) => (
              <Bar key={k} dataKey={k} fill={colors[i]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (variant === "area") {
    return (
      <div style={containerStyle}>
        <ResponsiveContainer>
          <AreaChart data={data}>
            {showGrid ? <CartesianGrid stroke={gridColor} strokeDasharray={gridDasharray} /> : null}
            <XAxis dataKey={categoryKey} {...commonAxisProps} />
            <YAxis {...commonAxisProps} />
            {showTooltip ? <Tooltip {...tooltipProps} /> : null}
            {wantLegend ? <Legend /> : null}
            {valueKeys.map((k, i) => (
              <Area
                key={k}
                type="monotone"
                dataKey={k}
                stroke={colors[i]}
                fill={colors[i]}
                fillOpacity={0.22}
                strokeWidth={seriesStrokeWidth}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Default: line
  return (
    <div style={containerStyle}>
      <ResponsiveContainer>
        <LineChart data={data}>
          {showGrid ? <CartesianGrid stroke={gridColor} strokeDasharray={gridDasharray} /> : null}
          <XAxis dataKey={categoryKey} {...commonAxisProps} />
          <YAxis {...commonAxisProps} />
          {showTooltip ? <Tooltip {...tooltipProps} /> : null}
          {wantLegend ? <Legend /> : null}
          {valueKeys.map((k, i) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              stroke={colors[i]}
              strokeWidth={seriesStrokeWidth}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
