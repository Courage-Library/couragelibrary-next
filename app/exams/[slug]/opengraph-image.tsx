import { ogCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/og-card";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import { CATEGORY_SLUG_RE } from "@/lib/exams/categories";

/**
 * HOME-1 expert UX pass: the branded share image for a category page (/exams/ssc) or an exam page (/exams/ssc-cgl):
 * its own title (public rows only, cookie-free public client); an unknown slug → the generic card.
 */
export const dynamic = "force-dynamic";
export const alt = "Courage Library exam page";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let title = "Government exam preparation";
  let subtitle = "Free mock tests, practice and revision. Free during early access.";
  if (CATEGORY_SLUG_RE.test(slug) && slug.length <= 60) {
    try {
      const sb = createPublicServerSupabaseClient();
      const [cat, exam] = await Promise.all([
        sb.from("exam_categories").select("name, short_desc").eq("slug", slug).maybeSingle(),
        sb.from("exams").select("title").eq("slug", slug).eq("is_active", true).maybeSingle(),
      ]);
      if (cat.data) {
        title = `${cat.data.name} exams`;
        if (cat.data.short_desc) subtitle = cat.data.short_desc;
      } else if (exam.data) {
        title = exam.data.title;
        subtitle = "Free mock tests, answer analysis and a Mistake Vault.";
      }
    } catch {
      /* the generic card */
    }
  }
  return ogCard({ eyebrow: "Courage Library exams", title, subtitle });
}
