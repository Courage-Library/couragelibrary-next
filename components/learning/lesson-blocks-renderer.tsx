import React from "react";
import Link from "next/link";
import { parseRichText, type LessonBlock, type LessonLinkMap, type LessonMathProps, type RichNode } from "@/lib/lessons/blocks";
import { LessonQuickCheck } from "@/components/learning/lesson-quick-check";

/** The math renderer: students get server KaTeX (components/learning/katex-math.tsx); the admin preview a text stand-in. */
export type MathComponent = React.ComponentType<LessonMathProps>;

/** The admin preview's stand-in (client-safe; never shown to students): the reading, else the source. */
export function PlainMath({ latex, reading, display }: LessonMathProps) {
  return display ? <span className="block text-body text-fg-secondary">{reading || latex}</span> : <span className="font-mono">{latex}</span>;
}

/**
 * CA-3: renders a DB lesson (LessonBlocksSpec v2) — the ONLY lesson renderer (the MDX path is retired). Server component.
 * Rich text goes through the AST (parseRichText) into React elements: there is no HTML string anywhere, so nothing in a
 * block can inject markup. Node links / practice links come pre-resolved from the server (links map); an unknown or
 * inactive node renders as plain text. Math goes through the Math component (CA-3 ruling: server-rendered KaTeX for
 * students, with the plain-text reading as the accessible text; never raw LaTeX). Images are signed URLs created by the
 * server for the private lesson-images bucket.
 */

function Rich({ text, links, Math }: { text: string; links: LessonLinkMap; Math: MathComponent }) {
  const render = (nodes: RichNode[], key: string): React.ReactNode[] =>
    nodes.map((n, i) => {
      const k = `${key}-${i}`;
      switch (n.t) {
        case "text":
          return <React.Fragment key={k}>{n.v}</React.Fragment>;
        case "bold":
          return <strong key={k}>{render(n.c, k)}</strong>;
        case "italic":
          return <em key={k}>{render(n.c, k)}</em>;
        case "code":
          return (
            <code key={k} className="rounded bg-ink-50 px-1 font-mono text-[0.95em]">
              {n.v}
            </code>
          );
        case "math":
          return <Math key={k} latex={n.v} display={false} />;
        case "node_link": {
          const l = links.nodes[n.node_id];
          return l ? (
            <Link key={k} href={l.topicHref} className="font-semibold text-link underline underline-offset-2">
              {n.label}
            </Link>
          ) : (
            <React.Fragment key={k}>{n.label}</React.Fragment>
          );
        }
      }
    });
  return <>{render(parseRichText(text), "r")}</>;
}

const CALLOUT: Record<string, { label: string; cls: string }> = {
  TIP: { label: "Tip", cls: "border-success-200 bg-success-50" },
  WARNING: { label: "Watch out", cls: "border-warning-200 bg-warning-50" },
  INFO: { label: "Note", cls: "border-primary-200 bg-primary-50" },
  MEMORY_HOOK: { label: "Memory hook", cls: "border-accent-200 bg-accent-50" },
};

function Block({ b, links, Math }: { b: LessonBlock; links: LessonLinkMap; Math: MathComponent }) {
  switch (b.type) {
    case "heading":
      return b.level === 2 ? <h2 className="mt-8 text-h2 font-bold text-fg">{b.text}</h2> : <h3 className="mt-6 text-h3 font-semibold text-fg">{b.text}</h3>;
    case "paragraph":
      return (
        <p className="text-body-lg leading-relaxed text-fg">
          <Rich text={b.text} links={links} Math={Math} />
        </p>
      );
    case "list": {
      const items = b.items.map((it, i) => (
        <li key={i}>
          <Rich text={it} links={links} Math={Math} />
        </li>
      ));
      return b.ordered ? <ol className="list-decimal space-y-1 pl-6 text-body-lg text-fg">{items}</ol> : <ul className="list-disc space-y-1 pl-6 text-body-lg text-fg">{items}</ul>;
    }
    case "formula":
      return (
        <figure className="rounded-card border border-line bg-surface p-4">
          {b.name && <figcaption className="mb-2 text-body font-semibold text-fg">{b.name}</figcaption>}
          <Math latex={b.latex} reading={b.reading} display />
        </figure>
      );
    case "solved_example":
      return (
        <section className="rounded-card border border-line bg-surface p-4" aria-label="Solved example">
          <p className="text-caption font-semibold uppercase tracking-wide text-fg-secondary">Solved example · {b.difficulty.toLowerCase()}</p>
          <p className="mt-2 text-body-lg font-semibold text-fg">
            <Rich text={b.question} links={links} Math={Math} />
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-6 text-body text-fg">
            {b.steps.map((s, i) => (
              <li key={i}>
                <Rich text={s.text} links={links} Math={Math} />
                {s.math && (
                  <span className="mt-1 block text-fg-secondary">
                    <Math latex={s.math} display={false} />
                  </span>
                )}
              </li>
            ))}
          </ol>
          {b.answer && (
            <p className="mt-3 text-body text-fg">
              <strong>Answer: </strong>
              <Rich text={b.answer} links={links} Math={Math} />
            </p>
          )}
          {b.shortcut && (
            <p className="mt-2 text-body text-fg">
              <strong>Shortcut: </strong>
              <Rich text={b.shortcut} links={links} Math={Math} />
            </p>
          )}
          {b.mistake && (
            <p className="mt-2 text-body text-fg">
              <strong>Avoid: </strong>
              <Rich text={b.mistake} links={links} Math={Math} />
            </p>
          )}
        </section>
      );
    case "callout": {
      const c = CALLOUT[b.variant] ?? CALLOUT.INFO;
      return (
        <aside className={`rounded-card border p-4 ${c.cls}`}>
          <p className="text-body font-semibold text-fg">{b.title || c.label}</p>
          <p className="mt-1 text-body text-fg">
            <Rich text={b.text} links={links} Math={Math} />
          </p>
        </aside>
      );
    }
    case "trap":
      return (
        <aside className="rounded-card border border-danger-200 bg-danger-50 p-4">
          <p className="text-body font-semibold text-fg">Common trap</p>
          <p className="mt-1 text-body text-fg">
            <Rich text={b.text} links={links} Math={Math} />
          </p>
          <p className="mt-2 text-body text-fg">
            <strong>Instead: </strong>
            <Rich text={b.why} links={links} Math={Math} />
          </p>
        </aside>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            {b.caption && <caption className="mb-2 text-left font-semibold text-fg">{b.caption}</caption>}
            <thead>
              <tr>
                {b.headers.map((h, i) => (
                  <th key={i} scope="col" className="border border-line bg-ink-50 px-3 py-2 text-left font-semibold text-fg">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j} className="border border-line px-3 py-2 text-fg">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "image": {
      const src = links.images[b.asset_id];
      return (
        <figure>
          {src ? (
            // signed, short-lived URL of the private bucket; never user-supplied
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={b.alt} className="max-w-full rounded-card border border-line" loading="lazy" />
          ) : (
            <p className="rounded-card border border-line bg-ink-50 p-4 text-body text-fg-secondary">{b.alt}</p>
          )}
          {b.caption && <figcaption className="mt-1 text-body text-fg-secondary">{b.caption}</figcaption>}
        </figure>
      );
    }
    case "practice_link": {
      const l = links.nodes[b.node_id];
      const label = b.label || (b.mode === "PYQ" ? "Practice past-paper questions" : b.mode === "MOCK" ? "Take a mock test" : "Practice this topic");
      return l ? (
        <p>
          <Link href={b.mode === "PRACTICE" ? l.practiceHref : "/practice"} className="font-semibold text-link underline underline-offset-2">
            {label} →
          </Link>
        </p>
      ) : null;
    }
    case "quick_check":
      // rendered here (server side for students), so the client component receives nodes, never LaTeX
      return (
        <LessonQuickCheck
          id={b.id}
          prompt={<Rich text={b.prompt} links={links} Math={Math} />}
          options={b.options.map((o) => ({
            id: o.id,
            correct: o.correct,
            text: <Rich text={o.text} links={links} Math={Math} />,
            feedback: o.feedback ? <Rich text={o.feedback} links={links} Math={Math} /> : null,
          }))}
        />
      );
    case "revision_summary":
      return (
        <section className="rounded-card border border-line bg-surface p-4" aria-label="Revision summary">
          <ul className="list-disc space-y-1 pl-6 text-body text-fg">
            {b.bullets.map((x, i) => (
              <li key={i}>
                <Rich text={x} links={links} Math={Math} />
              </li>
            ))}
          </ul>
          {b.formulas && b.formulas.length > 0 && (
            <ul className="mt-3 space-y-1">
              {b.formulas.map((f, i) => (
                <li key={i}>
                  <Math latex={f} display={false} />
                </li>
              ))}
            </ul>
          )}
          {b.speed_rules && b.speed_rules.length > 0 && (
            <>
              <p className="mt-3 text-body font-semibold text-fg">Speed rules</p>
              <ul className="list-disc space-y-1 pl-6 text-body text-fg">
                {b.speed_rules.map((x, i) => (
                  <li key={i}>
                    <Rich text={x} links={links} Math={Math} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      );
    case "memory_lock_points":
      return (
        <section className="rounded-card border border-primary-200 bg-primary-50 p-4" aria-label="Memory Lock points">
          <p className="text-body font-semibold text-fg">Memory Lock points</p>
          <ul className="mt-1 list-disc space-y-1 pl-6 text-body text-fg">
            {b.points.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </section>
      );
  }
}

export function LessonBlocksRenderer({ blocks, links, Math }: { blocks: LessonBlock[]; links: LessonLinkMap; Math: MathComponent }) {
  return (
    <div className="space-y-4" data-lesson-blocks="">
      {blocks.map((b) => (
        <Block key={b.id} b={b} links={links} Math={Math} />
      ))}
    </div>
  );
}
