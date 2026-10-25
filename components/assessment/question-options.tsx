"use client";

import React, { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, ZoomIn } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

export interface OptionItem {
  key: string;
  text: string;
  imageUrl?: string | null;
}

interface QuestionOptionsProps {
  options: OptionItem[];
  optionsType?: string;
  selectedOption: string | null;
  onSelectOption: (optionKey: string) => void;
  disabled?: boolean;
  /** accessible name of the group (e.g. "Answer options for question 12") */
  label?: string;
}

/**
 * F3 (R10): the answer options are a real radio group — role="radiogroup" with one role="radio" button per option,
 * aria-checked, a roving tab stop (Tab enters at the chosen option, ↑ / ↓ move between options), a visible focus ring
 * and ≥ 48 px targets. The chosen option is shown by a filled key badge AND a check icon (never colour alone).
 * ← / → are left to the player for question navigation. Shared by the mock player, live tests, battles and admin review.
 */
export function QuestionOptions({ options, optionsType = "text", selectedOption, onSelectOption, disabled = false, label = "Answer options" }: QuestionOptionsProps) {
  const [zoomedImg, setZoomedImg] = useState<{ url: string; key: string } | null>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const isPureImage = optionsType === "image";
  const focusIndex = Math.max(0, options.findIndex((o) => o.key === selectedOption));

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    e.stopPropagation();
    const next = (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    refs.current[next]?.focus();
    if (!disabled) onSelectOption(options[next].key);
  };

  return (
    <div className="space-y-2.5 pt-2">
      <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} className={cn("grid gap-2.5", isPureImage ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
        {options.map((option, i) => {
          const isSelected = selectedOption === option.key;
          const hasImage = Boolean(option.imageUrl);
          return (
            <div key={option.key} className="relative">
              <button
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={disabled}
                tabIndex={i === focusIndex ? 0 : -1}
                onClick={() => {
                  if (!disabled) onSelectOption(option.key);
                }}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={cn(
                  "focus-ring flex min-h-12 w-full items-start gap-3.5 rounded-xl border p-3.5 text-left transition-colors sm:p-4 select-none",
                  disabled ? "cursor-not-allowed opacity-75" : "cursor-pointer",
                  isSelected ? "border-2 border-primary-600 bg-primary-50 text-fg" : "border-line bg-surface text-fg hover:border-ink-300 hover:bg-ink-50",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold", isSelected ? "bg-primary-600 text-fg-inverse" : "bg-ink-100 text-fg")}
                >
                  {option.key}
                </span>
                <span className="min-w-0 flex-1 space-y-2">
                  <span className="sr-only">Option {option.key}: </span>
                  {hasImage && option.imageUrl && (
                    <span className="inline-block rounded-lg border border-line bg-surface p-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={option.imageUrl} alt={`Option ${option.key}`} className="max-h-24 max-w-full rounded-md object-contain" loading="lazy" />
                    </span>
                  )}
                  {(!isPureImage || !hasImage) && option.text && <span className="block pt-0.5 text-body font-medium leading-relaxed">{option.text}</span>}
                </span>
                {isSelected && <CheckCircle2 aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary-700" />}
              </button>
              {hasImage && option.imageUrl && (
                // sibling of the radio (a button cannot contain a button)
                <button
                  type="button"
                  onClick={() => setZoomedImg({ url: option.imageUrl!, key: option.key })}
                  aria-label={`Enlarge the figure of option ${option.key}`}
                  className="focus-ring absolute bottom-2 right-2 flex size-12 items-center justify-center rounded-lg bg-surface/90 text-fg shadow-xs hover:bg-ink-50"
                >
                  <ZoomIn aria-hidden="true" className="size-5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={zoomedImg !== null} onOpenChange={(o) => !o && setZoomedImg(null)} title={zoomedImg ? `Option ${zoomedImg.key} figure` : ""}>
        {zoomedImg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={zoomedImg.url} alt={`Option ${zoomedImg.key} figure, enlarged`} className="mx-auto max-h-[70vh] max-w-full rounded-xl object-contain" />
        )}
      </Dialog>
    </div>
  );
}
