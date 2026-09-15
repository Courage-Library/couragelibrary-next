"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import { saveMistakeNoteAction } from "@/app/mistakes/actions";
import { Button } from "@/components/ui/button";
import { StickyNote, Check, Loader2, AlertCircle, Trash2, RefreshCw } from "lucide-react";

interface MistakeNoteEditorProps {
  vaultId: string;
  initialNote: string | null;
}

type SaveState = "idle" | "typing" | "saving" | "saved" | "error";

export function MistakeNoteEditor({ vaultId, initialNote }: MistakeNoteEditorProps) {
  const [note, setNote] = useState<string>(initialNote || "");
  const [lastSavedNote, setLastSavedNote] = useState<string>(initialNote || "");
  const [saveStatus, setSaveStatus] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [, startTransition] = useTransition();

  const requestSeqRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const performSave = async (textToSave: string) => {
    // If unchanged from last save, mark saved and exit
    if (textToSave === lastSavedNote) {
      setSaveStatus("saved");
      return;
    }

    requestSeqRef.current += 1;
    const currentSeq = requestSeqRef.current;

    setSaveStatus("saving");
    setErrorMessage("");

    try {
      const res = await saveMistakeNoteAction(vaultId, textToSave);

      // Race condition check: if a newer request has started, discard this result
      if (requestSeqRef.current !== currentSeq) {
        return;
      }

      if (res.success) {
        setLastSavedNote(textToSave);
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
        setErrorMessage(res.error || "Failed to save note");
      }
    } catch {
      if (requestSeqRef.current === currentSeq) {
        setSaveStatus("error");
        setErrorMessage("Network error while saving note");
      }
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    if (newVal.length > 2000) return; // Hard UI clamp

    setNote(newVal);
    setSaveStatus("typing");

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // 750ms debounced autosave
    debounceTimerRef.current = setTimeout(() => {
      startTransition(() => {
        performSave(newVal);
      });
    }, 750);
  };

  const handleManualSave = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    startTransition(() => {
      performSave(note);
    });
  };

  const handleClearNote = () => {
    if (!note.trim()) return;
    if (!showClearConfirm) {
      setShowClearConfirm(true);
      return;
    }

    setShowClearConfirm(false);
    setNote("");
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    startTransition(() => {
      performSave("");
    });
  };

  const isNearLimit = note.length >= 1900;
  const hasUnsavedChanges = note !== lastSavedNote;

  return (
    <div className="p-6 sm:p-7 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700">
            <StickyNote className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">My Revision Note</h3>
            <p className="text-[11px] text-slate-500">
              Personal takeaways, formulas, and mnemonic shortcuts for this question.
            </p>
          </div>
        </div>

        {/* Live Save Status */}
        <div className="flex items-center gap-2 text-xs" aria-live="polite">
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1.5 text-blue-600 font-medium animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
              <Check className="w-3.5 h-3.5" /> Saved ✓
            </span>
          )}
          {saveStatus === "typing" && (
            <span className="text-amber-600 font-medium text-[11px]">
              Unsaved changes
            </span>
          )}
          {saveStatus === "error" && (
            <span className="flex items-center gap-1.5 text-rose-600 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{errorMessage || "Save failed"}</span>
              <button
                type="button"
                onClick={handleManualSave}
                className="underline text-rose-700 font-bold ml-1 hover:text-rose-900"
              >
                Retry
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Editor Textarea */}
      <div className="space-y-1.5">
        <label htmlFor="revision-note-input" className="sr-only">
          Personal Revision Note
        </label>
        <textarea
          id="revision-note-input"
          value={note}
          onChange={handleTextChange}
          placeholder="What do you want to remember about this question? (e.g. formula shortcut, trap to avoid, conversion step...)"
          rows={4}
          maxLength={2000}
          className="w-full p-3.5 text-xs sm:text-sm rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-y leading-relaxed whitespace-pre-wrap"
        />
      </div>

      {/* Footer Controls & Counter */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
        <div className="flex items-center gap-2">
          {/* Character counter */}
          <span
            className={`font-mono text-[11px] ${
              isNearLimit ? "text-amber-600 font-bold" : "text-slate-400"
            }`}
          >
            {note.length} / 2000 chars
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Clear Note Button */}
          {note.trim().length > 0 && (
            <>
              {showClearConfirm ? (
                <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-xl px-2 py-1">
                  <span className="text-[11px] text-rose-700 font-medium">Clear note?</span>
                  <button
                    type="button"
                    onClick={handleClearNote}
                    className="text-[11px] font-bold text-rose-800 underline hover:text-rose-950 px-1"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(false)}
                    className="text-[11px] text-slate-500 hover:text-slate-700 px-1"
                  >
                    No
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearNote}
                  className="text-xs h-8 text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                  aria-label="Clear personal note"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
                </Button>
              )}
            </>
          )}

          {/* Manual Save Button */}
          <Button
            type="button"
            size="sm"
            onClick={handleManualSave}
            disabled={saveStatus === "saving" || !hasUnsavedChanges}
            className="text-xs h-8 font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs disabled:opacity-50"
          >
            {saveStatus === "saving" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
            )}
            Save Note
          </Button>
        </div>
      </div>
    </div>
  );
}
