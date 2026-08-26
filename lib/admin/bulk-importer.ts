import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AdminService } from "@/services/admin.service";

export interface BulkImportRecord {
  [key: string]: unknown;
}

export interface BulkImportPayload {
  entity: string;
  data: BulkImportRecord[];
  mode?: "preview" | "commit";
}

export interface BulkImportResult {
  success: boolean;
  entity: string;
  totalRecords: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  warnings: string[];
  previewData?: BulkImportRecord[];
}

export class BulkImportEngine {
  /**
   * Main entry point for server-side bulk content importation.
   */
  static async processImport(payload: BulkImportPayload): Promise<BulkImportResult> {
    const authCheck = await AdminService.checkIsAdminOrStaff();
    if (!authCheck.isAdmin) {
      return {
        success: false,
        entity: payload.entity || "unknown",
        totalRecords: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: ["Unauthorized: Administrative or staff privileges required."],
        warnings: [],
      };
    }

    const { entity, data = [], mode = "preview" } = payload;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(data) || data.length === 0) {
      return {
        success: false,
        entity,
        totalRecords: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: ["Invalid or empty import dataset provided."],
        warnings: [],
      };
    }

    const supabaseRaw = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = supabaseRaw as any;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const previewData: BulkImportRecord[] = [];

    switch (entity) {
      case "taxonomy":
        for (const item of data) {
          const name = String(item.name || "");
          const slug = String(item.slug || "");
          const description = String(item.description || "");

          if (!name || !slug) {
            errors.push(`Taxonomy item missing required name or slug: ${JSON.stringify(item)}`);
            continue;
          }
          if (mode === "commit") {
            const { data: existing } = await supabase.from("exam_categories").select("id").eq("slug", slug).maybeSingle();
            if (existing) {
              await supabase.from("exam_categories").update({ name, description }).eq("id", existing.id);
              updated++;
            } else {
              await supabase.from("exam_categories").insert({ name, slug, description });
              created++;
            }
          } else {
            previewData.push({ type: "exam_category", slug, name });
          }
        }
        break;

      case "questions":
        for (const item of data) {
          const questionText = String(item.question_text || "");
          const topicSlug = String(item.topic_slug || "");
          const difficulty = String(item.difficulty || "MEDIUM");
          const marks = Number(item.marks || 1);
          const negativeMarks = Number(item.negative_marks || 0.25);
          const explanation = String(item.explanation || "");
          const isPublished = item.is_published !== false;
          const options = Array.isArray(item.options) ? item.options : [];

          if (!questionText || !topicSlug) {
            errors.push(`Question item missing question_text or topic_slug.`);
            continue;
          }
          if (mode === "commit") {
            const { data: topic } = await supabase.from("topics").select("id").eq("code", topicSlug).maybeSingle();
            const topicId = topic?.id || null;

            const { data: qData, error: qErr } = await supabase
              .from("questions")
              .insert({
                topic_id: topicId,
                question_text: questionText,
                question_type: "SINGLE_CHOICE",
                difficulty,
                marks,
                negative_marks: negativeMarks,
                explanation,
                is_published: isPublished,
              })
              .select("id")
              .single();

            if (qErr) {
              errors.push(`Failed inserting question "${questionText.slice(0, 30)}...": ${qErr.message}`);
            } else if (qData && options.length > 0) {
              created++;
              for (let i = 0; i < options.length; i++) {
                const opt = options[i] as Record<string, unknown>;
                await supabase.from("question_options").insert({
                  question_id: qData.id,
                  option_text: String(opt.option_text || ""),
                  option_index: i + 1,
                  is_correct: !!opt.is_correct,
                  explanation: String(opt.explanation || ""),
                });
              }
            }
          } else {
            previewData.push({ text: questionText, difficulty, optionsCount: options.length });
          }
        }
        break;

      case "mock_tests":
        for (const item of data) {
          const title = String(item.title || "");
          const slug = String(item.slug || "");
          const description = String(item.description || "");
          const durationMinutes = Number(item.duration_minutes || 60);
          const totalMarks = Number(item.total_marks || 100);
          const isPublished = item.is_published !== false;
          const isFree = item.is_free !== false;

          if (!title || !slug) {
            errors.push(`Mock Test missing title or slug.`);
            continue;
          }
          if (mode === "commit") {
            const { data: existing } = await supabase.from("mock_tests").select("id").eq("slug", slug).maybeSingle();
            if (existing) {
              skipped++;
            } else {
              const { error: mErr } = await supabase
                .from("mock_tests")
                .insert({
                  title,
                  slug,
                  description,
                  duration_minutes: durationMinutes,
                  total_marks: totalMarks,
                  is_published: isPublished,
                  is_free: isFree,
                });

              if (mErr) {
                errors.push(`Failed inserting mock test "${title}": ${mErr.message}`);
              } else {
                created++;
              }
            }
          } else {
            previewData.push({ title, duration: durationMinutes, totalMarks });
          }
        }
        break;

      case "flashcards":
        for (const item of data) {
          const deckTitle = String(item.deck_title || "");
          const deckDescription = String(item.deck_description || "");
          const frontPrompt = String(item.front_prompt || "");
          const backAnswer = String(item.back_answer || "");
          const explanation = String(item.explanation || "");
          const mnemonic = String(item.mnemonic || "");

          if (!deckTitle || !frontPrompt || !backAnswer) {
            errors.push(`Flashcard missing deck_title, front_prompt, or back_answer.`);
            continue;
          }
          if (mode === "commit") {
            let { data: deck } = await supabase.from("flashcard_decks").select("id").eq("title", deckTitle).maybeSingle();
            if (!deck) {
              const { data: newDeck } = await supabase.from("flashcard_decks").insert({ title: deckTitle, description: deckDescription }).select("id").single();
              deck = newDeck;
            }

            if (deck) {
              await supabase.from("flashcards").insert({
                deck_id: deck.id,
                front_prompt: frontPrompt,
                back_answer: backAnswer,
                explanation,
                mnemonic,
              });
              created++;
            }
          } else {
            previewData.push({ deck: deckTitle, front: frontPrompt });
          }
        }
        break;

      case "articles":
        for (const item of data) {
          const title = String(item.title || "");
          const slug = String(item.slug || "");
          const summary = String(item.summary || "");
          const readingTimeMinutes = Number(item.reading_time_minutes || 5);
          const contentMarkdown = String(item.content_markdown || "");

          if (!title || !slug || !contentMarkdown) {
            errors.push(`Article missing title, slug, or content_markdown.`);
            continue;
          }
          if (mode === "commit") {
            const { data: existing } = await supabase.from("articles").select("id").eq("slug", slug).maybeSingle();
            if (existing) {
              skipped++;
            } else {
              const { data: art, error: aErr } = await supabase
                .from("articles")
                .insert({
                  title,
                  slug,
                  summary,
                  difficulty: "INTERMEDIATE",
                  reading_time_minutes: readingTimeMinutes,
                  access_level: "FREE",
                  status: "PUBLISHED",
                  current_version: 1,
                })
                .select("id")
                .single();

              if (aErr) {
                errors.push(`Failed inserting article "${title}": ${aErr.message}`);
              } else if (art) {
                await supabase.from("article_versions").insert({
                  article_id: art.id,
                  version_number: 1,
                  content_markdown: contentMarkdown,
                  changelog: "Initial creation via bulk import",
                });
                created++;
              }
            }
          } else {
            previewData.push({ title, slug, readingTime: readingTimeMinutes });
          }
        }
        break;

      case "courses":
        for (const item of data) {
          const title = String(item.title || "");
          const slug = String(item.slug || "");
          const description = String(item.description || "");
          const priceInr = Number(item.price_inr || 0);

          if (!title || !slug) {
            errors.push(`Course missing title or slug.`);
            continue;
          }
          if (mode === "commit") {
            const { data: existing } = await supabase.from("courses").select("id").eq("slug", slug).maybeSingle();
            if (existing) {
              skipped++;
            } else {
              const { error: cErr } = await supabase.from("courses").insert({
                title,
                slug,
                description,
                access_tier: "FREE",
                price_inr: priceInr,
                is_published: true,
              });
              if (cErr) {
                errors.push(`Failed inserting course "${title}": ${cErr.message}`);
              } else {
                created++;
              }
            }
          } else {
            previewData.push({ title, slug, priceInr });
          }
        }
        break;

      case "descriptive":
        for (const item of data) {
          const title = String(item.title || "");
          const questionText = String(item.question_text || "");
          const totalMarks = Number(item.total_marks || 15);
          const maxWords = Number(item.max_words || 250);

          if (!title || !questionText) {
            errors.push(`Descriptive question missing title or question_text.`);
            continue;
          }
          if (mode === "commit") {
            const { error: dErr } = await supabase.from("descriptive_questions").insert({
              title,
              question_text: questionText,
              min_words: 100,
              max_words: maxWords,
              total_marks: totalMarks,
              is_active: true,
            });
            if (dErr) {
              errors.push(`Failed inserting descriptive question "${title}": ${dErr.message}`);
            } else {
              created++;
            }
          } else {
            previewData.push({ title, totalMarks, maxWords });
          }
        }
        break;

      case "institutes":
        for (const item of data) {
          const name = String(item.name || "");
          const slug = String(item.slug || "");
          const description = String(item.description || "");

          if (!name || !slug) {
            errors.push(`Institute missing name or slug.`);
            continue;
          }
          if (mode === "commit") {
            const { data: existing } = await supabase.from("institutes").select("id").eq("slug", slug).maybeSingle();
            if (existing) {
              skipped++;
            } else {
              const { error: iErr } = await supabase.from("institutes").insert({
                name,
                slug,
                description,
                verification_status: "VERIFIED",
              });
              if (iErr) {
                errors.push(`Failed inserting institute "${name}": ${iErr.message}`);
              } else {
                created++;
              }
            }
          } else {
            previewData.push({ name, slug });
          }
        }
        break;

      case "subscription_plans":
        for (const item of data) {
          const name = String(item.name || "");
          const priceInr = Number(item.price_inr || 499);
          const durationDays = Number(item.duration_days || 30);
          const isActive = item.is_active !== false;
          const features = Array.isArray(item.features) ? item.features : [];

          if (!name || !priceInr) {
            errors.push(`Subscription plan missing name or price_inr.`);
            continue;
          }
          if (mode === "commit") {
            const { data: existing } = await supabase.from("subscription_plans").select("id").eq("name", name).maybeSingle();
            if (existing) {
              await supabase.from("subscription_plans").update({ base_price_inr: priceInr, is_active: isActive }).eq("id", existing.id);
              updated++;
            } else {
              await supabase.from("subscription_plans").insert({
                name,
                duration_days: durationDays,
                base_price_inr: priceInr,
                is_active: isActive,
                features_json: features,
              });
              created++;
            }
          } else {
            previewData.push({ plan: name, price: priceInr, durationDays });
          }
        }
        break;

      default:
        errors.push(`Unsupported entity type: ${entity}`);
    }

    return {
      success: errors.length === 0,
      entity,
      totalRecords: data.length,
      created: mode === "commit" ? created : 0,
      updated: mode === "commit" ? updated : 0,
      skipped: mode === "commit" ? skipped : 0,
      errors,
      warnings,
      previewData: mode === "preview" ? previewData : undefined,
    };
  }
}
