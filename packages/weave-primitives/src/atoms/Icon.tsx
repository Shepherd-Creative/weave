import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  Filter,
  Flag,
  Grid3x3,
  Info,
  LineChart,
  List,
  Minus,
  PieChart,
  Search,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  User,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { IconName, IconSpec } from "../schemas/index.js";
import { iconPixelSize } from "../utils/style.js";
import { toneToColorVar } from "../utils/theme.js";

// Curated name → lucide icon. The accepted names are the single source of
// truth in IconNameSchema (packages/weave-primitives/src/schemas/tokens.ts);
// every key here must appear there and vice versa.
const ICON_MAP: Record<IconName, LucideIcon> = {
  "trend-up": TrendingUp,
  "trend-down": TrendingDown,
  "trend-flat": Minus,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  "arrow-right": ArrowRight,
  check: Check,
  x: X,
  info: Info,
  alert: AlertCircle,
  warning: AlertTriangle,
  spark: Sparkles,
  lightning: Zap,
  clock: Clock,
  calendar: Calendar,
  user: User,
  users: Users,
  target: Target,
  flag: Flag,
  "chart-line": LineChart,
  "chart-bar": BarChart3,
  "chart-pie": PieChart,
  grid: Grid3x3,
  list: List,
  "external-link": ExternalLink,
  filter: Filter,
  search: Search,
};

export function Icon(props: Omit<IconSpec, "type">): React.JSX.Element {
  const { name, size, tone } = props;
  const LucideIconComponent = ICON_MAP[name];
  const px = iconPixelSize(size);

  return (
    <LucideIconComponent
      size={px}
      strokeWidth={1.75}
      color={toneToColorVar(tone)}
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "middle" }}
    />
  );
}
