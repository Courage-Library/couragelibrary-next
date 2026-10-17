import React from "react";

interface JsonLdProps {
  data: Record<string, unknown>;
}

/** JSON-LD script. "<" is escaped (<) so no value can close the script element; the parsed JSON is unchanged. */
export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
