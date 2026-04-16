import { type Spec, SpecSchema } from "../schemas/spec.js";
import { Icon } from "../atoms/Icon.js";
import { Label } from "../atoms/Label.js";
import { Number } from "../atoms/Number.js";
import { Chart } from "../molecules/Chart.js";
import { DataRow } from "../molecules/DataRow.js";
import { KPI } from "../molecules/KPI.js";
import { Stat } from "../molecules/Stat.js";
import { ChartCard } from "../organisms/ChartCard.js";
import { MetricBand } from "../organisms/MetricBand.js";
import { NoteCard } from "../organisms/NoteCard.js";
import { TableCard } from "../organisms/TableCard.js";
import { Grid } from "../layouts/Grid.js";
import { Stack } from "../layouts/Stack.js";

/**
 * Render a Weave spec tree.
 *
 * - Validates the spec at the root with `SpecSchema.parse()`.
 * - Dispatches recursively on `spec.type` — Grid/Stack receive a
 *   `renderChild` callback pointing back at this dispatcher.
 * - Unknown types fall back to a visible error block (dev-friendly).
 *
 * @throws ZodError if the spec is invalid. Wrap in an ErrorBoundary if
 *   the host app wants a graceful fallback.
 */
export function Weave({ spec }: { spec: unknown }): React.JSX.Element {
  const parsed = SpecSchema.parse(spec);
  return renderSpec(parsed, 0);
}

function renderSpec(spec: Spec, key: number): React.JSX.Element {
  switch (spec.type) {
    case "Number": {
      const { type: _t, ...rest } = spec;
      return <Number key={key} {...rest} />;
    }
    case "Label": {
      const { type: _t, ...rest } = spec;
      return <Label key={key} {...rest} />;
    }
    case "Icon": {
      const { type: _t, ...rest } = spec;
      return <Icon key={key} {...rest} />;
    }
    case "KPI": {
      const { type: _t, ...rest } = spec;
      return <KPI key={key} {...rest} />;
    }
    case "Stat": {
      const { type: _t, ...rest } = spec;
      return <Stat key={key} {...rest} />;
    }
    case "DataRow": {
      const { type: _t, ...rest } = spec;
      return <DataRow key={key} {...rest} />;
    }
    case "Chart": {
      const { type: _t, ...rest } = spec;
      return <Chart key={key} {...rest} />;
    }
    case "MetricBand": {
      const { type: _t, ...rest } = spec;
      return <MetricBand key={key} {...rest} />;
    }
    case "ChartCard": {
      const { type: _t, ...rest } = spec;
      return <ChartCard key={key} {...rest} />;
    }
    case "TableCard": {
      const { type: _t, ...rest } = spec;
      return <TableCard key={key} {...rest} />;
    }
    case "NoteCard": {
      const { type: _t, ...rest } = spec;
      return <NoteCard key={key} {...rest} />;
    }
    case "Grid": {
      const { type: _t, children, ...rest } = spec;
      return (
        <Grid
          key={key}
          {...rest}
          children={children}
          renderChild={(child, i) => renderSpec(child, i)}
        />
      );
    }
    case "Stack": {
      const { type: _t, children, ...rest } = spec;
      return (
        <Stack
          key={key}
          {...rest}
          children={children}
          renderChild={(child, i) => renderSpec(child, i)}
        />
      );
    }
  }
}
