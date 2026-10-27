/** CA-4: prompt template view types shared by the server service and the client editor (pure, no data access). */
import type { TemplateType } from "@/lib/prompts/template";

export interface PromptTemplateRow {
  id: string;
  type: TemplateType;
  version: number;
  body: string;
  bodySha256: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
}
