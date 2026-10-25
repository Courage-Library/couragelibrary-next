"use client";

/**
 * F2 "Report this question" — one control for practice, mock review, drills and the mock player. Four reasons + an
 * optional note (≤ 500 chars); the server action returns a fixed code only (one report per user per question, 20 per
 * day, admin-only read — fn_report_question). A quiet ghost button: never the screen's primary action (R4).
 */
import { useId, useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { PRACTICE_COPY } from "@/content/practice";
import { REPORT_NOTE_MAX, REPORT_REASONS, type ReportReason } from "@/lib/practice/engine";
import { reportQuestionAction } from "@/app/practice/actions";

const C = PRACTICE_COPY.report;
const DONE = new Set(["REPORTED", "ALREADY_REPORTED"]);

export function ReportQuestionButton({ questionId, questionVersionId, className }: { questionId: string; questionVersionId: string | null; className?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = code !== null && DONE.has(code);

  const submit = () =>
    start(async () => {
      if (!reason) {
        setCode("INVALID_INPUT");
        return;
      }
      const r = await reportQuestionAction({ questionId, questionVersionId, reason, note }).catch(() => "FAILED");
      setCode(r);
    });

  return (
    <>
      <Button variant="ghost" size="md" className={className ?? "min-h-12"} onClick={() => setOpen(true)} data-report-question="">
        <Flag aria-hidden="true" className="size-4" />
        {C.open}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={C.title}
        footer={
          done ? (
            <Button variant="secondary" className="min-h-12" onClick={() => setOpen(false)}>
              {C.cancel}
            </Button>
          ) : (
            <>
              <Button variant="secondary" className="min-h-12" onClick={() => setOpen(false)} disabled={pending}>
                {C.cancel}
              </Button>
              <Button className="min-h-12" onClick={submit} loading={pending}>
                {pending ? C.sending : C.submit}
              </Button>
            </>
          )
        }
      >
        {done ? (
          <Alert tone="success" live>
            {C.results[code!]}
          </Alert>
        ) : (
          <div className="flex flex-col gap-4">
            <FieldGroup id={`${id}-reasons`} legend={C.reasonLabel}>
              <div className="flex flex-col gap-2">
                {REPORT_REASONS.map((r) => (
                  <Radio key={r} tile name={`${id}-reason`} value={r} checked={reason === r} onChange={() => setReason(r)} label={C.reasons[r]} />
                ))}
              </div>
            </FieldGroup>
            <Field id={`${id}-note`} label={C.noteLabel} help={`${C.noteHint(REPORT_NOTE_MAX)} ${note.length}/${REPORT_NOTE_MAX}`}>
              <Textarea id={`${id}-note`} value={note} maxLength={REPORT_NOTE_MAX} rows={3} onChange={(e) => setNote(e.target.value.slice(0, REPORT_NOTE_MAX))} />
            </Field>
            {code && (
              <Alert tone="danger" live>
                {C.results[code] ?? C.results.FAILED}
              </Alert>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
