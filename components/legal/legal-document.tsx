/**
 * LEGAL-PAGES-1: one public legal page, rendered VERBATIM from the owner-approved text (content/legal). Server-only, no
 * data reads: the caller passes the Coins flag. One h1 (the page title), "Last updated" from LEGAL_LAST_UPDATED, h2 per
 * numbered section with a stable id, an optional table of contents, and tables that scroll inside themselves (never the
 * page) at 360 px. Reading width (~70 characters per line).
 */
import { Fragment } from "react";
import { PublicPageHeader } from "@/components/public/public-page";
import { Container, Section } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/link";
import { LEGAL_LAST_UPDATED, LEGAL_LAST_UPDATED_TEXT, legalTextPage, visibleLegalSections, type LegalPageDef } from "@/content/legal";
import type { LegalBlock } from "@/content/legal/types";
import { legalInline, type LegalInline } from "@/lib/legal/inline";

function Inline({ segs }: { segs: LegalInline[] }) {
  return (
    <>
      {segs.map((s, i) =>
        s.kind === "text" ? (
          <Fragment key={i}>{s.text}</Fragment>
        ) : s.kind === "bold" ? (
          <strong key={i} className="font-semibold text-fg">
            <Inline segs={s.children} />
          </strong>
        ) : (
          <TextLink key={i} href={s.href} external={s.external}>
            {s.text}
          </TextLink>
        ),
      )}
    </>
  );
}

function Blocks({ blocks, route }: { blocks: LegalBlock[]; route: string }) {
  const line = (text: string) => <Inline segs={legalInline(text, route)} />;
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "p")
          return (
            <p key={i} className="text-body text-fg-secondary">
              {line(b.text)}
            </p>
          );
        if (b.type === "ul" || b.type === "ol") {
          const List = b.type === "ul" ? "ul" : "ol";
          return (
            <List key={i} className={`flex flex-col gap-2 pl-5 text-body text-fg-secondary ${b.type === "ul" ? "list-disc" : "list-decimal"}`}>
              {b.items.map((it, j) => (
                <li key={j}>{line(it)}</li>
              ))}
            </List>
          );
        }
        // tables scroll inside their own box, so the page never scrolls sideways (360 px)
        return (
          <div key={i} className="max-w-full overflow-x-auto rounded-control border border-line" role="region" aria-label="Table" tabIndex={0} data-legal-table="">
            <table className="w-full min-w-[32rem] border-collapse text-left text-body-sm">
              {b.head && (
                <thead className="bg-surface-sunken">
                  <tr>
                    {b.head.map((h, j) => (
                      <th key={j} scope="col" className="border-b border-line px-3 py-2 font-semibold text-fg">
                        {line(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j} className="border-b border-line last:border-b-0 align-top">
                    {r.map((c, k) =>
                      !b.head && k === 0 ? (
                        <th key={k} scope="row" className="px-3 py-2 font-semibold text-fg">
                          {line(c)}
                        </th>
                      ) : (
                        <td key={k} className="px-3 py-2 text-fg-secondary">
                          {line(c)}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

export function LegalDocument({ def, coins }: { def: LegalPageDef; coins: boolean }) {
  const page = legalTextPage(def);
  const sections = visibleLegalSections(page, { coins });
  return (
    <>
      <PublicPageHeader title={page.title} crumbs={[{ label: def.label }]} width="reading" />
      <Section spacing="compact">
        <Container size="reading" className="flex min-w-0 flex-col gap-8" data-legal-page={def.route}>
          <div className="flex flex-col gap-4">
            {page.lastUpdated && (
              <p className="text-body text-fg-secondary" data-legal-last-updated="">
                <strong className="font-semibold text-fg">Last updated:</strong> <time dateTime={LEGAL_LAST_UPDATED}>{LEGAL_LAST_UPDATED_TEXT}</time>
              </p>
            )}
            <Blocks blocks={page.intro} route={def.route} />
          </div>
          {def.toc && sections.length > 0 && (
            <nav aria-labelledby="legal-toc" className="rounded-control border border-line bg-surface-sunken p-4" data-legal-toc="">
              <h2 id="legal-toc" className="text-body-lg font-semibold text-fg">
                On this page
              </h2>
              <ol className="mt-2 flex flex-col">
                {sections.map((s) => (
                  <li key={s.id}>
                    <TextLink href={`#${s.id}`} variant="standalone" className="min-h-12 text-body-sm">
                      {s.number} {s.title}
                    </TextLink>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {sections.map((s) => (
            <section key={s.id} aria-labelledby={s.id} className="flex flex-col gap-3" data-legal-section={s.number}>
              <h2 id={s.id} className="scroll-mt-24 text-h3 font-semibold text-fg">
                {s.number} {s.title}
              </h2>
              <Blocks blocks={s.blocks} route={def.route} />
            </section>
          ))}
        </Container>
      </Section>
    </>
  );
}
