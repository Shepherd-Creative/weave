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
            fontSize: "0.8125rem",
            padding: "0.0625rem 0.25rem",
            borderRadius: "3px",
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
        gap: "0.5rem",
        backgroundColor: tone === "default" ? "var(--card)" : toneToMutedBgVar(tone),
        border: `1px solid ${tone === "default" ? "var(--border)" : toneToColorVar(tone)}`,
        borderRadius: "var(--radius)",
        padding: "1rem",
      }}
    >
      {title || icon ? (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            color: toneToColorVar(tone === "default" ? "default" : tone),
            fontFamily: "var(--font-sans)",
            fontSize: "0.875rem",
            fontWeight: 600,
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
          fontSize: "0.875rem",
          lineHeight: 1.55,
        }}
      >
        {paragraphs.map((para, i) => (
          <p key={i} style={{ margin: i === 0 ? 0 : "0.5rem 0 0" }}>
            {renderInline(para)}
          </p>
        ))}
      </div>
    </div>
  );
}
