import type { ReactNode } from "react";
import { ArrowRight, Bell, BookOpen, Plus, Search, Trash2 } from "lucide-react";
import { Accordion } from "@/components/ui/accordion";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardFooter, CardHeader, CardLink, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Divider } from "@/components/ui/divider";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Container, Stack } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/link";
import { Pagination } from "@/components/ui/pagination";
import { ProgressBar, ProgressRing, ProgressSteps } from "@/components/ui/progress";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { ExamCard } from "@/components/ui/domain/exam-card";
import { PricingCard } from "@/components/ui/domain/pricing-card";
import { ProLockPanel } from "@/components/ui/domain/pro-lock-panel";
import { QuestionRenderer } from "@/components/ui/domain/question-renderer";
import { ResultSummary } from "@/components/ui/domain/result-summary";
import { TestCard } from "@/components/ui/domain/test-card";
import { SubjectNode, TopicNode } from "@/components/ui/domain/topic-node";
import { ContrastTable, DialogDemos, LoadingButtonDemo, TagDemo, ToastDemo, TokenValue, StudyComfortDemo } from "./demos";

// Every class below is written out in full so Tailwind generates it.
const SCALES: Array<{ name: string; swatches: Array<[string, string]> }> = [
  {
    name: "Primary (v3 blue: brand = 700, hover = 800, tint = 50, navy ink = 900, focus surround = 950)",
    swatches: [
      ["primary-50", "bg-primary-50"], ["primary-100", "bg-primary-100"], ["primary-200", "bg-primary-200"], ["primary-300", "bg-primary-300"],
      ["primary-400", "bg-primary-400"], ["primary-500", "bg-primary-500"], ["primary-600", "bg-primary-600"], ["primary-700", "bg-primary-700"],
      ["primary-800", "bg-primary-800"], ["primary-900", "bg-primary-900"], ["primary-950", "bg-primary-950"],
    ],
  },
  {
    name: "Accent (v3 cyan: fill / decoration = 400, never text on white; cyan text = 700; tint = 50)",
    swatches: [
      ["accent-50", "bg-accent-50"], ["accent-100", "bg-accent-100"], ["accent-200", "bg-accent-200"], ["accent-300", "bg-accent-300"],
      ["accent-400", "bg-accent-400"], ["accent-500", "bg-accent-500"], ["accent-600", "bg-accent-600"], ["accent-700", "bg-accent-700"],
      ["accent-800", "bg-accent-800"], ["accent-900", "bg-accent-900"],
    ],
  },
  {
    name: "Brand gradient stops (brand moments only) · warning orange (never yellow)",
    swatches: [
      ["gradient-start", "bg-gradient-start"], ["gradient-mid", "bg-gradient-mid"], ["gradient-end", "bg-gradient-end"], ["focus-surround", "bg-focus-surround"],
      ["warning-400", "bg-warning-400"], ["warning-500", "bg-warning-500"], ["warning-600", "bg-warning-600"], ["warning-700", "bg-warning-700"],
    ],
  },
  {
    name: "Ink (neutral)",
    swatches: [
      ["ink-50", "bg-ink-50"], ["ink-100", "bg-ink-100"], ["ink-200", "bg-ink-200"], ["ink-300", "bg-ink-300"], ["ink-400", "bg-ink-400"],
      ["ink-500", "bg-ink-500"], ["ink-600", "bg-ink-600"], ["ink-700", "bg-ink-700"], ["ink-800", "bg-ink-800"], ["ink-900", "bg-ink-900"],
      ["ink-950", "bg-ink-950"],
    ],
  },
  {
    name: "Status: success · warning · danger · info (50 · 200 · 600 · 700 · 800)",
    swatches: [
      ["success-50", "bg-success-50"], ["success-200", "bg-success-200"], ["success-600", "bg-success-600"], ["success-700", "bg-success-700"], ["success-800", "bg-success-800"],
      ["warning-50", "bg-warning-50"], ["warning-200", "bg-warning-200"], ["warning-600", "bg-warning-600"], ["warning-700", "bg-warning-700"], ["warning-800", "bg-warning-800"],
      ["danger-50", "bg-danger-50"], ["danger-200", "bg-danger-200"], ["danger-600", "bg-danger-600"], ["danger-700", "bg-danger-700"], ["danger-800", "bg-danger-800"],
      ["info-50", "bg-info-50"], ["info-200", "bg-info-200"], ["info-600", "bg-info-600"], ["info-700", "bg-info-700"], ["info-800", "bg-info-800"],
    ],
  },
  {
    name: "Semantic aliases (what components use)",
    swatches: [
      ["canvas", "bg-canvas"], ["surface", "bg-surface"], ["surface-sunken", "bg-surface-sunken"], ["fg", "bg-fg"], ["fg-secondary", "bg-fg-secondary"],
      ["fg-muted", "bg-fg-muted"], ["fg-disabled", "bg-fg-disabled"], ["line", "bg-line"], ["line-control", "bg-line-control"], ["brand", "bg-brand"], ["interactive", "bg-interactive"], ["link", "bg-link"], ["focus", "bg-focus"], ["on-accent", "bg-on-accent"], ["accent-text", "bg-accent-text"],
      ["answer-correct-border", "bg-answer-correct-border"], ["answer-correct-bg", "bg-answer-correct-bg"], ["answer-wrong-border", "bg-answer-wrong-border"],
      ["answer-wrong-bg", "bg-answer-wrong-bg"], ["answer-selected-border", "bg-answer-selected-border"], ["answer-selected-bg", "bg-answer-selected-bg"],
    ],
  },
];

const TYPE_SCALE: Array<[string, string, string]> = [
  ["display", "text-display font-bold", "36 → 48 px · 700 · landing hero"],
  ["h1", "text-h1 font-bold", "28 → 36 px · 700 · page title"],
  ["h2", "text-h2 font-semibold", "22 → 28 px · 600 · section"],
  ["h3", "text-h3 font-semibold", "18 → 20 px · 600 · card title"],
  ["body-lg", "text-body-lg", "18 / 28 · article body, question stem"],
  ["body", "text-body", "16 / 24 · default"],
  ["body-sm", "text-body-sm", "14 / 20 · secondary text, tables"],
  ["caption", "text-caption font-medium", "12 / 16 · badges, meta (minimum size)"],
];

const SECTIONS = [
  ["colour", "Colour"], ["comfort", "Study comfort"], ["contrast", "Contrast"], ["type", "Typography"], ["shape", "Shape, elevation, motion"],
  ["buttons", "Buttons and links"], ["forms", "Forms"], ["cards", "Cards, badges, tags"], ["disclosure", "Tabs and accordion"],
  ["overlays", "Dialogs, toasts, tooltips"], ["feedback", "Progress, stats, states"], ["navigation", "Navigation"], ["misc", "Alerts, avatars, layout"],
  ["domain", "Domain components"],
] as const;

function DSSection({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 flex flex-col gap-4 border-t border-line pt-8">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-h2 font-semibold text-fg">
          {title}
        </h2>
        {intro && <p className="max-w-prose text-body text-fg-secondary">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

function Demo({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-body-sm font-semibold text-fg-secondary">{label}</h3>
      <div className={className ?? "flex flex-wrap items-center gap-3"}>{children}</div>
    </div>
  );
}

const SAMPLE_OPTIONS = [
  { key: "A", text: "₹1,200" },
  { key: "B", text: "₹1,250" },
  { key: "C", text: "₹1,300" },
  { key: "D", text: "₹1,350" },
];
const SAMPLE_STEM = "A shopkeeper marks an article 25% above cost price and gives a 4% discount. If the cost price is ₹1,000, what is the selling price?";

const SAMPLE_RESULT = {
  result: {
    id: "sample", attemptId: "sample", totalQuestions: 100, attemptedCount: 88, correctCount: 71, incorrectCount: 17,
    unansweredCount: 12, totalScore: 137.75, maxScore: 200, accuracyPercentage: 80.68, timeSpentSeconds: 3420, rank: null, percentile: null,
  },
  test: { id: "sample", title: "SSC CGL Tier 1 · Mock 4", durationMinutes: 60, totalQuestions: 100, totalMarks: 200 },
  sections: [
    { sectionName: "General Intelligence and Reasoning", totalQuestions: 25, attemptedCount: 24, correctCount: 20, incorrectCount: 4, unansweredCount: 1, sectionScore: 39, maxScore: 50, accuracyPercentage: 83.3 },
    { sectionName: "General Awareness", totalQuestions: 25, attemptedCount: 19, correctCount: 13, incorrectCount: 6, unansweredCount: 6, sectionScore: 23, maxScore: 50, accuracyPercentage: 68.4 },
    { sectionName: "Quantitative Aptitude", totalQuestions: 25, attemptedCount: 22, correctCount: 19, incorrectCount: 3, unansweredCount: 3, sectionScore: 36.5, maxScore: 50, accuracyPercentage: 86.4 },
    { sectionName: "English Comprehension", totalQuestions: 25, attemptedCount: 23, correctCount: 19, incorrectCount: 4, unansweredCount: 2, sectionScore: 39.25, maxScore: 50, accuracyPercentage: 82.6 },
  ],
};

/** UX-1a design-system preview: every token and component state. Sample data only; no data fetching. */
export function DesignSystemPreview() {
  return (
    <div data-ds-preview="" className="flex flex-col gap-8 pb-16 font-sans text-fg">
      <header className="flex flex-col gap-3">
        <Badge tone="info" className="w-fit">
          UX-1a preview · sample data only
        </Badge>
        <h1 className="text-h1 font-bold text-fg">Design system</h1>
        <p className="max-w-prose text-body text-fg-secondary">
          Tokens and components for every student page: clean, premium, light, trustworthy. Light only, English only, WCAG 2.2 AA,
          mobile first. Check this page at 390, 768 and 1440 px.
        </p>
        <nav aria-label="Design system sections">
          <ul className="flex flex-wrap gap-2">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <TextLink href={`#${id}`} variant="nav" className="text-body-sm">
                  {label}
                </TextLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <DSSection id="colour" title="Colour" intro="Brand Colour System v3 (decision #84): ≈ 70% neutrals · 20% navy ink · 10% blue / cyan. No yellow or amber. Semantic colours only for status and right / wrong, never colour alone.">
        {SCALES.map((scale) => (
          <Demo key={scale.name} label={scale.name} className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11">
            {scale.swatches.map(([name, cls]) => (
              <div key={name} className="flex flex-col gap-1">
                <span aria-hidden="true" className={`h-12 rounded-control border border-line ${cls}`} />
                <span className="text-caption font-medium text-fg">{name}</span>
                <TokenValue name={`--color-${name}`} />
              </div>
            ))}
          </Demo>
        ))}
      </DSSection>

      <DSSection id="comfort" title="Study comfort (R13)" intro="The real exam timer (blue → orange in the last 5 minutes, never red or flashing), the soft wrong-answer tint with a prominent &quot;Here&apos;s why&quot;, the v3 status chips and the brand gradient. Sample data only.">
        <StudyComfortDemo />
      </DSSection>

      <DSSection id="contrast" title="Contrast" intro="Every text / background and non-text pair the components use, computed live from the tokens with the WCAG relative-luminance formula.">
        <ContrastTable />
      </DSSection>

      <DSSection id="type" title="Typography" intro="Inter (one variable Latin family, self-hosted by next/font). Weights 400–700. Minimum student text is 12 px.">
        <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
          {TYPE_SCALE.map(([name, cls, note]) => (
            <div key={name} className="flex flex-col gap-1 p-4 md:flex-row md:items-baseline md:gap-6">
              <span className="w-24 shrink-0 font-mono text-caption text-fg-secondary">{name}</span>
              <span className={`${cls} text-fg`}>Practise 10 questions</span>
              <span className="text-body-sm text-fg-muted md:ml-auto">{note}</span>
            </div>
          ))}
          <div className="flex flex-col gap-1 p-4 md:flex-row md:items-baseline md:gap-6">
            <span className="w-24 shrink-0 font-mono text-caption text-fg-secondary">tabular</span>
            <span className="text-h3 font-semibold tabular-nums">01:59:08 · 142.5 / 200 · 1,00,000</span>
            <span className="text-body-sm text-fg-muted md:ml-auto">tabular-nums for timers and scores</span>
          </div>
        </div>
      </DSSection>

      <DSSection id="shape" title="Shape, elevation, motion" intro="Four radii, three elevations, three durations. Motion uses opacity and transform only and switches off with prefers-reduced-motion.">
        <Demo label="Radius: badge 6 · control 8 · card 12 · sheet 16">
          {[["rounded-badge", "badge"], ["rounded-control", "control"], ["rounded-card", "card"], ["rounded-sheet", "sheet"]].map(([cls, n]) => (
            <span key={n} className={`flex size-20 items-center justify-center border-2 border-primary-600 bg-primary-50 text-caption font-medium text-primary-800 ${cls}`}>
              {n}
            </span>
          ))}
        </Demo>
        <Demo label="Elevation: e1 hover / sticky · e2 popover · e3 modal">
          {[["shadow-e1", "e1"], ["shadow-e2", "e2"], ["shadow-e3", "e3"]].map(([cls, n]) => (
            <span key={n} className={`flex h-20 w-28 items-center justify-center rounded-card bg-surface text-body-sm font-medium ${cls}`}>
              {n}
            </span>
          ))}
        </Demo>
        <Demo label="Spacing (4 px base): 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64" className="flex flex-wrap items-end gap-3">
          {[["w-1", "4"], ["w-2", "8"], ["w-3", "12"], ["w-4", "16"], ["w-6", "24"], ["w-8", "32"], ["w-12", "48"], ["w-16", "64"]].map(([cls, n]) => (
            <span key={n} className="flex flex-col items-center gap-1">
              <span aria-hidden="true" className={`h-8 rounded-badge bg-accent-300 ${cls}`} />
              <span className="text-caption text-fg-secondary">{n}</span>
            </span>
          ))}
        </Demo>
        <Demo label="Focus ring: 2 px primary-500, 2 px offset (Tab to see it)">
          <Button variant="secondary">Focus me</Button>
          <span className="text-body-sm text-fg-secondary">Motion: 120 ms micro · 200 ms enter / exit · 300 ms sheets · cubic-bezier(.2, 0, 0, 1)</span>
        </Demo>
      </DSSection>

      <DSSection id="buttons" title="Buttons and links">
        <Demo label="Variants">
          <Button>Start mock</Button>
          <Button variant="secondary">View syllabus</Button>
          <Button variant="ghost">Skip for now</Button>
          <Button variant="danger" leadingIcon={<Trash2 aria-hidden="true" className="size-4" />}>
            Delete note
          </Button>
        </Demo>
        <Demo label="Sizes: sm 36 · md 44 · lg 52">
          <Button size="sm">Small</Button>
          <Button>Medium</Button>
          <Button size="lg">Large</Button>
        </Demo>
        <Demo label="States: disabled · loading (click) · icon only · with icons · link styled as a button">
          <Button disabled>Disabled</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
          <LoadingButtonDemo />
          <Button iconOnly aria-label="Add to revision list" variant="secondary">
            <Plus aria-hidden="true" className="size-5" />
          </Button>
          <Button trailingIcon={<ArrowRight aria-hidden="true" className="size-4" />}>Continue</Button>
          <ButtonLink href="#buttons" variant="secondary">
            Button link
          </ButtonLink>
        </Demo>
        <Demo label="Links: inline · standalone · nav (current) · external" className="flex flex-col items-start gap-3">
          <p className="text-body text-fg">
            Read the <TextLink href="#buttons">exam pattern</TextLink> before your first mock.
          </p>
          <TextLink href="#buttons" variant="standalone">
            See all mocks
          </TextLink>
          <span className="flex gap-1">
            <TextLink href="#buttons" variant="nav" current>
              Overview
            </TextLink>
            <TextLink href="#buttons" variant="nav">
              Syllabus
            </TextLink>
            <TextLink href="#buttons" variant="nav">
              Mocks
            </TextLink>
          </span>
          <TextLink href="https://ssc.gov.in" external>
            Official notice
          </TextLink>
        </Demo>
      </DSSection>

      <DSSection id="forms" title="Forms" intro="Visible labels always; errors in text with an icon, linked by aria-describedby; 44 px controls; ink-500 borders (4.76:1).">
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="ds-name" label="Full name" help="As on your admit card.">
            <Input autoComplete="name" defaultValue="Asha Verma" />
          </Field>
          <Field id="ds-email" label="Email" error="Enter an email like name@example.com." required>
            <Input type="email" defaultValue="asha@" />
          </Field>
          <Field id="ds-search" label="Search topics">
            <Input type="search" prefix={<Search aria-hidden="true" className="size-4" />} placeholder="e.g. Percentage" />
          </Field>
          <Field id="ds-amount" label="Amount" help="Valid state after validation.">
            <Input inputMode="numeric" prefix="₹" defaultValue="1,499" valid />
          </Field>
          <Field id="ds-readonly" label="Registration number (read only)">
            <Input readOnly defaultValue="CL-2026-00042" />
          </Field>
          <Field id="ds-disabled" label="Exam (disabled)">
            <Input disabled defaultValue="SSC CGL" />
          </Field>
          <Field id="ds-exam" label="Target exam">
            <Select
              placeholder="Choose an exam"
              defaultValue=""
              options={[
                { value: "ssc-cgl", label: "SSC CGL" },
                { value: "ssc-chsl", label: "SSC CHSL" },
                { value: "ssc-gd", label: "SSC GD" },
              ]}
            />
          </Field>
          <Field id="ds-note" label="Revision note" help="Up to 500 characters.">
            <Textarea defaultValue="Discount is on marked price, not cost price." />
          </Field>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <FieldGroup id="ds-reminders" legend="Reminders">
            <Checkbox label="Daily practice reminder" defaultChecked />
            <Checkbox label="Mock test results" description="Email when your result is ready." />
            <Checkbox label="All notifications" indeterminate />
            <Checkbox label="SMS (coming soon)" disabled />
          </FieldGroup>
          <FieldGroup id="ds-level" legend="How prepared are you?" error="Choose one option.">
            <Radio name="ds-level" value="new" label="Just starting" />
            <Radio name="ds-level" value="mid" label="Halfway through the syllabus" />
            <Radio name="ds-level" value="rev" label="Revising" />
          </FieldGroup>
          <FieldGroup id="ds-goal" legend="Daily goal (option tiles)">
            <div className="grid gap-2 sm:grid-cols-3">
              <Radio tile name="ds-goal" value="10" label="10 questions" description="About 15 min" />
              <Radio tile name="ds-goal" value="25" label="25 questions" description="About 35 min" defaultChecked />
              <Radio tile name="ds-goal" value="50" label="50 questions" description="About 70 min" />
            </div>
          </FieldGroup>
          <FieldGroup id="ds-settings" legend="Settings">
            <Switch label="Show timer" description="Hide it if it makes you anxious." defaultChecked />
            <Switch label="Instant feedback in practice" />
            <Switch label="Offline mode (coming soon)" disabled />
          </FieldGroup>
        </div>
      </DSSection>

      <DSSection id="cards" title="Cards, badges, tags">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Plain card</CardTitle>
              <CardDescription>Border only, no elevation.</CardDescription>
            </CardHeader>
            <CardBody>Use for grouped content.</CardBody>
          </Card>
          <Card variant="interactive">
            <CardHeader>
              <CardTitle>
                <CardLink href="#cards">Interactive card</CardLink>
              </CardTitle>
              <CardDescription>The whole card is one link (the title). Hover lifts it.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Badge tone="primary">12 topics</Badge>
            </CardFooter>
          </Card>
          <Card variant="selected">
            <CardHeader>
              <CardTitle>Selected card</CardTitle>
              <CardDescription>2 px primary border on a primary-50 tint.</CardDescription>
            </CardHeader>
          </Card>
          <Card aria-busy="true">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton shape="text" lines={3} />
          </Card>
        </div>
        <Demo label="Badges">
          <Badge>Neutral</Badge>
          <Badge tone="primary">Primary</Badge>
          <Badge tone="success">Mastered</Badge>
          <Badge tone="warning">Expiring</Badge>
          <Badge tone="danger">Incorrect</Badge>
          <Badge tone="info">New</Badge>
          <Badge tone="pro" />
          <Badge tone="free" />
        </Demo>
        <Demo label="Removable tags">
          <TagDemo />
        </Demo>
      </DSSection>

      <DSSection id="disclosure" title="Tabs and accordion" intro="Tabs: arrow keys, Home and End; only the selected tab is in the tab order. Accordion: buttons inside headings with aria-expanded.">
        <Tabs
          label="Exam sections"
          items={[
            { value: "overview", label: "Overview", content: <p className="text-body text-fg-secondary">Overview content.</p> },
            { value: "syllabus", label: "Syllabus", content: <p className="text-body text-fg-secondary">Syllabus content.</p> },
            { value: "pattern", label: "Exam pattern", content: <p className="text-body text-fg-secondary">Exam pattern content.</p> },
            { value: "cutoffs", label: "Cut-offs", content: <p className="text-body text-fg-secondary">Cut-offs content.</p>, disabled: true },
          ]}
        />
        <Tabs
          label="Filter mocks"
          variant="segmented"
          items={[
            { value: "all", label: "All", content: <p className="text-body text-fg-secondary">All mocks.</p> },
            { value: "free", label: "Free", content: <p className="text-body text-fg-secondary">Free mocks.</p> },
            { value: "attempted", label: "Attempted", content: <p className="text-body text-fg-secondary">Attempted mocks.</p> },
          ]}
        />
        <Accordion
          defaultOpen={["q1"]}
          items={[
            { id: "q1", title: "Is the correct answer free to see?", content: "Yes. Every question shows the correct answer after you submit." },
            { id: "q2", title: "Can I change my exam later?", content: "Yes, from Settings. Your progress stays with each exam." },
            { id: "q3", title: "When does Pro open?", content: "Soon. Turn on notifications to hear first." },
          ]}
        />
      </DSSection>

      <DSSection id="overlays" title="Dialogs, toasts, tooltips" intro="Native <dialog>: focus stays inside, Esc closes (not the submit confirmation), focus returns to the trigger. Toasts announce through live regions.">
        <Demo label="Dialog · bottom sheet · non-dismissible confirmation">
          <DialogDemos />
        </Demo>
        <Demo label="Toasts: success and info auto-dismiss after 5 s (pause on hover or focus); errors stay">
          <ToastDemo />
        </Demo>
        <Demo label="Tooltip (hover or focus; Esc hides)">
          <Tooltip content="Questions you marked to revisit">
            <Button variant="secondary" iconOnly aria-label="Marked for review">
              <BookOpen aria-hidden="true" className="size-5" />
            </Button>
          </Tooltip>
          <Tooltip content="Negative marking: 0.5 per wrong answer" side="bottom">
            <Button variant="ghost">Marking scheme</Button>
          </Tooltip>
        </Demo>
      </DSSection>

      <DSSection id="feedback" title="Progress, stats, states">
        <div className="grid gap-6 md:grid-cols-2">
          <Stack gap={4}>
            <ProgressBar label="Syllabus covered" value={7} max={12} valueText="7 of 12 topics" />
            <ProgressBar label="Practice goal" value={25} max={25} valueText="25 of 25 questions" tone="success" />
            <ProgressBar label="Loading results" indeterminate />
          </Stack>
          <Stack direction="horizontal" gap={6} align="center" wrap>
            <ProgressRing label="Quantitative Aptitude mastery" value={64} />
            <ProgressRing label="English mastery" value={18} size={48} />
            <ProgressSteps label="Onboarding" steps={["Exam", "Level", "Daily goal", "Done"]} current={2} />
          </Stack>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatTile label="Accuracy" value="78.4%" delta={{ direction: "up", text: "+6 vs last week" }} />
          <StatTile label="Time per question" value="41 s" delta={{ direction: "down", text: "−5 s vs last week", invert: true }} />
          <StatTile label="Wrong answers" value={17} delta={{ direction: "up", text: "+3 vs last mock" }} />
          <StatTile label="Streak" value={null} hint="Practise today to start one." />
          <StatTile label="Rank" loading />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            icon={<BookOpen />}
            title="No mistakes yet"
            description="Take a mock and the questions you miss land here for revision."
            action={<ButtonLink href="#feedback">Start a mock</ButtonLink>}
          />
          <EmptyState
            icon={<Bell />}
            title="Live tests are coming soon"
            description="We will tell you when the first live test opens."
            action={<Button variant="secondary">Notify me</Button>}
          />
        </div>
      </DSSection>

      <DSSection id="navigation" title="Navigation">
        <Breadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "Exams", href: "/exams" },
            { label: "SSC CGL", href: "/exams/ssc-cgl" },
            { label: "Syllabus" },
          ]}
        />
        <Pagination page={6} totalPages={20} hrefFor={(p) => `#navigation-page-${p}`} />
      </DSSection>

      <DSSection id="misc" title="Alerts, avatars, layout">
        <div className="grid gap-3 md:grid-cols-2">
          <Alert tone="info" title="Exam date announced">
            SSC CGL Tier 1 runs from 12 Nov 2026.
          </Alert>
          <Alert tone="success" title="Profile saved" />
          <Alert tone="warning" title="Your streak ends tonight" action={<TextLink href="#misc">Practise 10 questions</TextLink>}>
            Practise before midnight to keep it.
          </Alert>
          <Alert tone="danger" title="Payment failed">
            No money was taken. Try again or use another method.
          </Alert>
        </div>
        <Demo label="Avatars: photo-less initials, sizes sm · md · lg">
          <Avatar name="Asha Verma" size="sm" />
          <Avatar name="Rohit Kumar" />
          <Avatar name="Meera" size="lg" />
        </Demo>
        <Demo label="Dividers" className="flex flex-col gap-4">
          <Divider />
          <Divider label="or" />
          <div className="flex h-8 items-center gap-3 text-body-sm">
            <span>Left</span>
            <Divider orientation="vertical" />
            <span>Right</span>
          </div>
        </Demo>
        <Demo label="Layout: Container (1200 / 720 reading), Section (48 / 64 rhythm), Stack (spacing scale)" className="block">
          <div className="rounded-card border border-dashed border-ink-300 p-2">
            <Container size="reading" className="rounded-control bg-accent-50 py-4 text-body-sm text-fg">
              Reading container: max 720 px with page gutters 16 / 24 / 32 px.
            </Container>
          </div>
        </Demo>
      </DSSection>

      <DSSection id="domain" title="Domain components" intro="Built on the primitives above with the existing data shapes. Sample data only.">
        <Demo label="Exam card: directory · your exam · compact" className="grid gap-4 md:grid-cols-3">
          <ExamCard href="#domain" name="SSC CGL" initials="CGL" conductingBody="Staff Selection Commission" nextDate="2026-11-12" counts={{ mocks: 24, topics: 112 }} />
          <ExamCard href="#domain" name="SSC CHSL" initials="CHSL" conductingBody="Staff Selection Commission" activeCycleLabel="2026 cycle" isYourExam counts={{ mocks: 18 }} />
          <ExamCard href="#domain" name="SSC GD Constable" initials="GD" variant="compact" />
        </Demo>
        <Demo label="Test card: available · in progress · attempted · scheduled · Pro-locked · closed" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TestCard title="Full mock 4" testType="full_length" questions={100} durationMinutes={60} totalMarks={200} access="free" state={{ kind: "available", startHref: "#domain" }} />
          <TestCard title="Quant sectional 2" testType="sectional" questions={25} durationMinutes={20} access="free" state={{ kind: "in_progress", resumeHref: "#domain" }} />
          <TestCard title="Full mock 3" testType="full_length" questions={100} durationMinutes={60} access="free" state={{ kind: "attempted", score: 137.75, maxScore: 200, resultHref: "#domain" }} />
          <TestCard title="Daily quiz" seriesLabel="Day 14" testType="daily" questions={10} durationMinutes={8} access="free" state={{ kind: "scheduled", opensAt: "2026-10-20" }} />
          <TestCard title="Full mock 9" testType="full_length" questions={100} durationMinutes={60} access="pro" state={{ kind: "locked", upgradeHref: "#domain" }} />
          <TestCard title="Diwali live mock" testType="full_length" questions={100} durationMinutes={60} access="free" state={{ kind: "expired" }} />
        </Demo>
        <Demo label="Course tree: subject with topics (not started · in progress · mastered · Pro-locked · current)" className="flex flex-col gap-3">
          <SubjectNode name="Quantitative Aptitude" mastered={3} total={6} defaultOpen>
            <TopicNode name="Percentage" href="#domain" status="mastered" weightageTier="high" />
            <TopicNode name="Profit and loss" href="#domain" status="in_progress" weightageTier="high" current />
            <TopicNode name="Simple interest" href="#domain" status="not_started" weightageTier="medium" />
            <TopicNode name="Mensuration 3D" status="locked" weightageTier="low" />
          </SubjectNode>
          <SubjectNode name="English Comprehension" mastered={0} total={8}>
            <TopicNode name="Reading comprehension" href="#domain" status="not_started" />
          </SubjectNode>
        </Demo>
        <Demo label="Question: test (selected, marked) · review correct · review wrong · review skipped" className="grid gap-4 xl:grid-cols-2">
          <QuestionRenderer questionNumber={12} totalQuestions={100} sectionName="Quantitative Aptitude" questionText={SAMPLE_STEM} options={SAMPLE_OPTIONS} selectedOption="A" markedForReview />
          <QuestionRenderer mode="review" questionNumber={12} questionText={SAMPLE_STEM} options={SAMPLE_OPTIONS} selectedOption="A" correctOption="A" />
          <QuestionRenderer mode="review" questionNumber={13} questionText={SAMPLE_STEM} options={SAMPLE_OPTIONS} selectedOption="C" correctOption="A" />
          <QuestionRenderer mode="review" questionNumber={14} questionText={SAMPLE_STEM} options={SAMPLE_OPTIONS} selectedOption={null} correctOption="A" />
        </Demo>
        <Demo label="Result summary (percentile and rank hidden when the service has none)" className="block">
          <ResultSummary data={SAMPLE_RESULT} previousBest={129.5} headingLevel={3} />
        </Demo>
        <Demo label="Pro lock: inline · card · interest recorded" className="grid gap-4 md:grid-cols-3">
          <ProLockPanel feature="Detailed solutions for every question" action={<Button size="sm">Notify me</Button>} />
          <ProLockPanel
            variant="card"
            feature="All 40 full-length mocks"
            benefits={["Section-wise analysis", "All-India rank", "Unlimited reattempts"]}
            action={<ButtonLink href="#domain" size="sm">See Pro plans</ButtonLink>}
          />
          <ProLockPanel feature="Topic-wise video lessons" interestRecorded />
        </Demo>
        <Demo label="Pricing: Free (current) · Pro (recommended, opening soon) · Pro annual" className="grid gap-4 md:grid-cols-3">
          <PricingCard
            name="Free"
            priceInr={0}
            currentPlan
            features={[
              { label: "Daily quizzes", included: true },
              { label: "4 full mocks per exam", included: true },
              { label: "Correct answers for every question", included: true },
              { label: "Detailed solutions", included: false },
            ]}
          />
          <PricingCard
            name="Pro"
            priceInr={199}
            period="month"
            highlighted
            availability="opening_soon"
            features={[
              { label: "Everything in Free", included: true },
              { label: "All full mocks", included: true },
              { label: "Detailed solutions", included: true },
              { label: "Mistake drills", included: true },
            ]}
          />
          <PricingCard
            name="Pro annual"
            priceInr={1499}
            period="year"
            billingNote="Works out to ₹125 a month."
            availability="opening_soon"
            features={[
              { label: "Everything in Pro", included: true },
              { label: "Two months free", included: true },
            ]}
          />
        </Demo>
      </DSSection>
    </div>
  );
}
