import "server-only";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { examLogo, type ExamLogo } from "@/lib/logos/exam-logo";

/**
 * EXAM-LOGO-1: an ACTIVE exam's branding for its public pages — the logo it shows (its override, else its conducting
 * body's) and the body's name (for "Conducted by …" and the not-affiliated line). Read with the visitor's client: anon
 * may read active exams and active bodies (RLS). null → not an active exam (the page shows its own 404).
 */
export interface ExamBranding {
  logo: ExamLogo | null;
  bodyName: string;
}

export const getExamBranding = cache(async (slug: string): Promise<ExamBranding | null> => {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const sb = await createServerSupabaseClient();
  const { data } = await sb
    .from("exams")
    .select("slug, is_active, logo_override_path, logo_override_alt, conducting_org:conducting_orgs(name, logo_path, logo_alt)")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  const org = Array.isArray(data.conducting_org) ? data.conducting_org[0] : data.conducting_org;
  if (!org?.name) return null;
  return {
    logo: examLogo({ override: { path: data.logo_override_path, alt: data.logo_override_alt }, org: { path: org.logo_path, alt: org.logo_alt } }),
    bodyName: org.name,
  };
});
