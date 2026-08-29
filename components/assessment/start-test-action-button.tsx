"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Play, RotateCcw, Loader2 } from "lucide-react";

interface StartTestActionButtonProps {
  testId: string;
  isResume?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

export function StartTestActionButton({
  testId,
  isResume = false,
  size = "md",
  className = "",
  label,
}: StartTestActionButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    router.push(`/mock-tests/${testId}/take`);
  };

  const defaultLabel = label || (isResume ? "Continue Test" : "Start Mock");

  return (
    <Button
      type="button"
      size={size}
      disabled={isLoading}
      onClick={handleStart}
      className={`font-bold transition-all ${
        isResume
          ? "bg-amber-500 hover:bg-amber-600 text-slate-950"
          : "bg-blue-600 hover:bg-blue-700 text-white"
      } ${isLoading ? "opacity-90 cursor-not-allowed" : "cursor-pointer"} ${className}`}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5 shrink-0" />
          <span>{isResume ? "Resuming Test..." : "Preparing Test..."}</span>
        </>
      ) : (
        <>
          {isResume ? (
            <RotateCcw className="w-3.5 h-3.5 mr-1.5 shrink-0" />
          ) : (
            <Play className="w-3.5 h-3.5 mr-1.5 shrink-0" />
          )}
          <span>{defaultLabel}</span>
        </>
      )}
    </Button>
  );
}
