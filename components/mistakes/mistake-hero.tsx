import React from "react";

interface MistakeHeroProps {
  activeMistakesCount: number;
  totalMistakesCount: number;
}

/** Page header. The one primary action ("Start a drill") lives in the "Revise today" card below it. */
export function MistakeHero({ activeMistakesCount, totalMistakesCount }: MistakeHeroProps) {
  const summary =
    totalMistakesCount === 0
      ? null
      : activeMistakesCount === 0
        ? "All your mistakes are mastered."
        : `${activeMistakesCount} ${activeMistakesCount === 1 ? "mistake needs" : "mistakes need"} revision.`;

  return (
    <header className="flex max-w-2xl flex-col gap-2">
      <h1 className="text-h1 font-bold text-fg">Mistakes</h1>
      <p className="text-body text-fg-secondary">
        Every question you get wrong in a mock test is saved here. Answer it correctly twice in a row in a drill to master it.
      </p>
      {summary && <p className="text-body font-medium text-fg">{summary}</p>}
    </header>
  );
}
