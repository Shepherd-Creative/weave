import type { NoteCardSpec } from "../schemas/organisms.js";
import { Icon } from "../atoms/Icon.js";
import { toneToColorVar, toneToMutedBgVar } from "../utils/theme.js";

/**
 * Lightweight markdown renderer for NoteCard bodies.
 *
 * Intentionally minimal — supports paragraphs, bold (**), italic (_), and
 * inline code (`). A full markdown pipeline (CommonMark + GFM) is a B5
 * upgrade. This keeps B3 dep-free and avoids `min-release-age` surprises.
 */
function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
  const parts = text.split(pattern);
  parts.forEach((p, i) => {
    if (!p) return;
    if (p.startsWith("**") && p.endsWith("**")) {
      out.push(<strong key={i}>{p.slice(2, -2)}</strong>);
    } else if (p.startsWith("_") && p.endsWith("_")) {
      out.push(<em key={i}>{p.slice(1, -1)}</em>);
    } else if (p.startsWith("`") && p.endsWith("`")) {
      out.push(
        <code
          key={i}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--weave-font-size-code, 0.8125rem)",
            // 0.0625rem (1px) inline-code hairline padding: intentionally not
            // tokenised — a sub-pixel micro-pad, not a brand spacing scale.
            padding: "0.0625rem var(--weave-space-2xs, 0.25rem)",
            borderRadius: "var(--weave-radius-code, 3px)",
            backgroundColor: "var(--muted)",
          }}
        >
          {p.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(p);
    }
  });
  return out;
}

export function NoteCard(props: Omit<NoteCardSpec, "type">): React.JSX.Element {
  const { title, body, tone = "default", icon } = props;
  const paragraphs = body.split(/\n\s*\n/);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--weave-space-sm, 0.5rem)",
        backgroundColor: tone === "default" ? "var(--card)" : toneToMutedBgVar(tone),
        border: `var(--weave-card-border-width, 1px) solid ${tone === "default" ? "var(--border)" : toneToColorVar(tone)}`,
        borderRadius: "var(--weave-radius-md, var(--radius))",
        padding: "var(--weave-card-padding, 1rem)",
        boxShadow: "var(--weave-card-shadow, none)",
      }}
    >
      {title || icon ? (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--weave-space-sm, 0.5rem)",
            color: toneToColorVar(tone === "default" ? "default" : tone),
            fontFamily: "var(--font-sans)",
            fontSize: "var(--weave-font-size-sm, 0.875rem)",
            fontWeight: "var(--weave-font-weight-semibold, 600)",
          }}
        >
          {icon ? <Icon name={icon} size="sm" tone={tone === "default" ? "default" : tone} /> : null}
          {title ? <span>{title}</span> : null}
        </header>
      ) : null}

      <div
        style={{
          color:
            tone === "default"
              ? "var(--card-foreground)"
              : toneToColorVar(tone === "muted" ? "muted" : tone),
          fontFamily: "var(--font-sans)",
          fontSize: "var(--weave-font-size-sm, 0.875rem)",
          lineHeight: "var(--weave-line-height-relaxed, 1.55)",
        }}
      >
        {paragraphs.map((para, i) => (
          <p key={i} style={{ margin: i === 0 ? 0 : "var(--weave-space-sm, 0.5rem) 0 0" }}>
            {renderInline(para)}
          </p>
        ))}
      </div>
    </div>
  );
}
