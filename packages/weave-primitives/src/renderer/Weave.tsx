import { Icon } from "../atoms/Icon.js";
import { Label } from "../atoms/Label.js";
import { Number } from "../atoms/Number.js";
import { Grid } from "../layouts/Grid.js";
import { Stack } from "../layouts/Stack.js";
import { Chart } from "../molecules/Chart.js";
import { KPI } from "../molecules/KPI.js";
import { Stat } from "../molecules/Stat.js";
import { ChartCard } from "../organisms/ChartCard.js";
import { MetricBand } from "../organisms/MetricBand.js";
import { NoteCard } from "../organisms/NoteCard.js";
import { TableCard } from "../organisms/TableCard.js";
import {
  legacySpecToDocumentV1,
  validateWeaveDocument,
  WeaveDocumentError,
} from "../schemas/document.js";
import type { Spec } from "../schemas/spec.js";

export type WeaveProps =
  /** A canonical `WeaveDocumentV1`. */
  | { document: unknown; spec?: undefined }
  /**
   * A pre-Wave-1 bare spec.
   *
   * @deprecated Pass `document` instead. This routes through
   * `legacySpecToDocumentV1`, which wraps the spec and validates it
   * canonically — it does not repair anything the old permissive union used to
   * let through, so a bare atom or `DataRow` throws here. Removed after the
   * migration period; see `docs/specs/weave-document-v1.md`.
   */
  | { spec: unknown; document?: undefined };

/**
 * Render a Weave document.
 *
 * - Validates through `validateWeaveDocument()` — the same gate the HTTP,
 *   MCP JSON-RPC and MCP App surfaces use. **A renderer must not assume a
 *   transport protected it**, and this is the only path that has no transport
 *   in front of it at all: an in-memory spec can carry values JSON cannot even
 *   express, `Infinity` being the obvious one.
 * - Dispatches recursively on `root.type` — Grid/Stack receive a `renderChild`
 *   callback pointing back at this dispatcher.
 *
 * @throws {z.ZodError} the document is malformed, out of bounds, or breaks a
 *   cross-field rule.
 * @throws {WeaveDocumentError} the document breaches payload, depth, node or
 *   nesting policy, or neither prop was supplied.
 *
 * Wrap in an ErrorBoundary if the host app wants a graceful fallback.
 */
export function Weave(props: WeaveProps): React.JSX.Element {
  const { root } = parseInput(props);
  return renderSpec(root as Spec, 0);
}

function parseInput(props: WeaveProps) {
  if (props.document !== undefined) return validateWeaveDocument(props.document);
  if (props.spec !== undefined) return legacySpecToDocumentV1(props.spec);
  throw new WeaveDocumentError(
    "missing-input",
    "<Weave> needs a `document` (a WeaveDocumentV1) or, during the migration period, a legacy `spec`.",
  );
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
