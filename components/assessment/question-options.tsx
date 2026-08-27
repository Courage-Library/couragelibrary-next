"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { ZoomIn, X } from "lucide-react";

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
}

export function QuestionOptions({
  options,
  optionsType = "text",
  selectedOption,
  onSelectOption,
  disabled = false,
}: QuestionOptionsProps) {
  const [zoomedImg, setZoomedImg] = useState<{ url: string; key: string } | null>(null);

  const isPureImage = optionsType === "image";

  return (
    <div className="space-y-2.5 pt-2">
      <div
        className={cn(
          "grid gap-2.5",
          isPureImage ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
        )}
      >
        {options.map((option) => {
          const isSelected = selectedOption === option.key;
          const hasImage = Boolean(option.imageUrl);

          return (
            <div
              key={option.key}
              onClick={() => {
                if (!disabled) onSelectOption(option.key);
              }}
              className={cn(
                "relative text-left p-3.5 sm:p-4 rounded-xl border transition-all flex items-start gap-3.5 group select-none",
                disabled ? "cursor-not-allowed opacity-75" : "cursor-pointer",
                isSelected
                  ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 text-slate-900 shadow-xs"
                  : "bg-white border-slate-200/90 text-slate-800 hover:border-slate-300 hover:bg-slate-50/60"
              )}
            >
              {/* Option Key Badge */}
              <div
                className={cn(
                  "w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 transition-colors mt-0.5",
                  isSelected
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
                )}
              >
                {option.key}
              </div>

              {/* Option Content Body */}
              <div className="flex-1 min-w-0 space-y-2">
                {/* Option Image (if present) */}
                {hasImage && option.imageUrl && (
                  <div className="relative group/optimg inline-block rounded-lg bg-white border border-slate-200 p-1.5 shadow-2xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={option.imageUrl}
                      alt={`Option ${option.key}`}
                      className="max-h-24 max-w-full object-contain rounded-md"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setZoomedImg({ url: option.imageUrl!, key: option.key });
                      }}
                      className="absolute top-1 right-1 p-1 rounded-md bg-slate-900/70 hover:bg-slate-900 text-white opacity-0 group-hover/optimg:opacity-100 transition-opacity"
                      title="Enlarge option image"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Option Text (rendered if text exists and not a placeholder like 'Option A' on pure image) */}
                {(!isPureImage || !hasImage) && option.text && (
                  <div className="text-sm font-medium leading-relaxed pt-0.5">
                    {option.text}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Option Image Zoom Modal */}
      {zoomedImg && (
        <div
          onClick={() => setZoomedImg(null)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl max-h-[85vh] bg-white p-3 rounded-2xl shadow-2xl border border-slate-200 flex flex-col items-center"
          >
            <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-slate-100 px-2">
              <span className="text-xs font-bold text-slate-700">
                Option {zoomedImg.key} Figure
              </span>
              <button
                type="button"
                onClick={() => setZoomedImg(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomedImg.url}
              alt={`Option ${zoomedImg.key} figure enlarged`}
              className="max-h-[70vh] max-w-full object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}