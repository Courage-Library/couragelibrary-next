import "server-only";
import { loadLiveCategoryNames } from "@/lib/exams/category-data";
import { loadHindiAvailability, type HindiAvailability } from "@/lib/landing/hindi-content";

/**
 * HOME-1: the only facts "/" waits for before the hero (UX2A L-3): the live category names (honest H1) and the Hindi
 * availability (honest chip + FAQ). Both cached, each bounded at 800 ms and never rejecting, read in parallel.
 */
export interface HomeFacts {
  liveCategories: string[];
  hindi: HindiAvailability | null;
}

export async function loadHomeFacts(): Promise<HomeFacts> {
  const [liveCategories, hindi] = await Promise.all([loadLiveCategoryNames(), loadHindiAvailability()]);
  return { liveCategories, hindi };
}
