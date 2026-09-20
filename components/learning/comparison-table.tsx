"use client";

import React from "react";
import { ComparisonTableProps } from "@/types/learning-compiler";

export const ComparisonTable: React.FC<ComparisonTableProps> = ({
  caption,
  headers = [],
  rows = [],
}) => {
  return (
    <div className="my-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs dark:border-gray-800 dark:bg-gray-900">
      {caption && (
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 font-semibold text-gray-700 text-xs uppercase tracking-wider dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300">
          {caption}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-700 text-xs uppercase dark:bg-gray-800 dark:text-gray-300">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-4 py-3 text-gray-800 dark:text-gray-200">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
