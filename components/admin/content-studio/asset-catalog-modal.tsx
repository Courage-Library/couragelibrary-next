"use client";

import React, { useState, useEffect } from "react";
import { Search, X, Image as ImageIcon, Upload, Check } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectAsset: (assetId: string) => void;
  onSearch: (query?: string, type?: string) => Promise<any[]>;
}

export const AssetCatalogModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSelectAsset,
  onSearch,
}) => {
  const [assets, setAssets] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      onSearch().then(setAssets);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-sm dark:text-slate-100">
            <ImageIcon className="h-5 w-5 text-indigo-600" />
            <span>Phase 3B Media Assets Catalog</span>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          <input
            type="text"
            placeholder="Search assets by title, alt text, slug..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onSearch(e.target.value).then(setAssets);
            }}
            className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 text-xs">
          {assets.map((a) => {
            const isSelected = selectedAssetId === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedAssetId(a.id)}
                className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50/50 dark:border-indigo-600 dark:bg-indigo-950/40"
                    : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                }`}
              >
                <div className="font-bold text-slate-900 dark:text-slate-100">{a.title}</div>
                <div className="mt-1 text-[11px] text-slate-500">{a.alt_text}</div>
                <div className="mt-2 flex items-center gap-1 font-mono text-[10px] text-slate-400">
                  <span>{a.mime_type}</span>
                  {a.aspect_ratio && <span>• ratio: {a.aspect_ratio}</span>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-slate-200 p-4 flex justify-end gap-2 dark:border-slate-800">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs">
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedAssetId}
            onClick={() => {
              if (selectedAssetId) onSelectAsset(selectedAssetId);
              onClose();
            }}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 font-bold text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Attach Asset
          </button>
        </div>
      </div>
    </div>
  );
};
