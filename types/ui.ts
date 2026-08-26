import type { ReactNode } from "react";

export type ComponentVariant = "default" | "primary" | "secondary" | "outline" | "ghost" | "destructive";
export type ComponentSize = "sm" | "md" | "lg" | "icon";

export interface BaseComponentProps {
  className?: string;
  children?: ReactNode;
}
