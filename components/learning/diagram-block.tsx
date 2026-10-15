"use client";

import React from "react";
import { DiagramBlockProps } from "@/types/learning-compiler";
import { ImageIcon } from "lucide-react";

export const DiagramBlock: React.FC<DiagramBlockProps> = ({
  assetId,
  caption,
  altText = "Educational concept diagram",
  resolvedAsset,
}) => {
  const uri = resolvedAsset?.storageUri || `/api/learning/assets/${assetId}`;

  return (
    <figure className="my-6 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
      <div className="flex items-center justify-center">
        {/* Safe Render: Image reference through authorized internal handler */}
        <div className="relative max-h-96 w-full overflow-hidden rounded-lg bg-white p-2">
          <img
            src={uri}
            alt={altText}
            loading="lazy"
            className="mx-auto max-h-80 object-contain"
          />
        </div>
      </div>
      {caption && (
        <figcaption className="mt-2 text-xs text-gray-500 italic">
          <ImageIcon className="mr-1 inline-block h-3.5 w-3.5" />
          {caption}
        </figcaption>
      )}
    </figure>
  );
};
