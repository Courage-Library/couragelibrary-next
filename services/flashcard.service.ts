import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface FlashcardDeckItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  accessTier: "FREE" | "PRO";
  cardCount: number;
  isCurated: boolean;
  topicName: string | null;
  subjectName: string | null;
  examTitle: string | null;
  masteryPercentage: number;
  masteredCount: number;
  learningCount: number;
  dueCount: number;
}

export interface FlashcardDeckDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  accessTier: "FREE" | "PRO";
  cardCount: number;
  isCurated: boolean;
  topicName: string | null;
  topicSlug: string | null;
  subjectName: string | null;
  examTitle: string | null;
  masteryPercentage: number;
  masteredCount: number;
  learningCount: number;
  newCount: number;
  dueCount: number;
  hasProAccess: boolean;
}

export interface ReviewFlashcard {
  id: string;
  cardOrder: number;
  frontText: string;
  backText: string;
  mnemonic: string | null;
  hint: string | null;
  explanation: string | null;
  latexFormulas: string[] | null;
  repetitionLevel: number;
  intervalDays: number;
  easeFactor: number;
}

export interface ReviewSessionPayload {
  deck: {
    id: string;
    title: string;
    slug: string;
    accessTier: "FREE" | "PRO";
    cardCount: number;
  };
  cards: ReviewFlashcard[];
}

export interface CardReviewResponse {
  success: boolean;
  card_id?: string;
  deck_id?: string;
  rating?: number;
  repetition_level?: number;
  interval_days?: number;
  ease_factor?: number;
  next_review_due_at?: string;
  mastery_percentage?: number;
  error?: string;
}

export class FlashcardService {
  /**
   * Fetches published flashcard decks along with the user's mastery progress.
   */
  static async getFlashcardDecks(): Promise<FlashcardDeckItem[]> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const [decksRes, progressRes, dueReviewsRes] = await Promise.all([
      supabase.from("flashcard_decks").select("id, slug, title_en, description, access_tier, card_count, is_curated, topics(name), subjects(name), exams(title)").eq("is_published", true).order("created_at", { ascending: false }),
      user ? supabase.from("user_deck_progress").select("deck_id, total_cards_mastered, total_cards_learning, mastery_percentage").eq("user_id", user.id) : Promise.resolve({ data: [] }),
      user ? supabase.from("user_flashcard_reviews").select("deck_id").eq("user_id", user.id).lte("next_review_due_at", new Date().toISOString()) : Promise.resolve({ data: [] }),
    ]);

    const rawDecks = (decksRes.data as any[]) || [];
    const progressMap = new Map<string, any>();
    ((progressRes.data as any[]) || []).forEach((p) => {
      progressMap.set(p.deck_id, p);
    });

    const dueMap = new Map<string, number>();
    ((dueReviewsRes.data as any[]) || []).forEach((d) => {
      dueMap.set(d.deck_id, (dueMap.get(d.deck_id) || 0) + 1);
    });

    return rawDecks.map((d) => {
      const prog = progressMap.get(d.id);
      return {
        id: d.id,
        slug: d.slug,
        title: d.title_en,
        description: d.description,
        accessTier: d.access_tier,
        cardCount: d.card_count,
        isCurated: d.is_curated,
        topicName: d.topics?.name || null,
        subjectName: d.subjects?.name || null,
        examTitle: d.exams?.title || null,
        masteryPercentage: Number(prog?.mastery_percentage || 0),
        masteredCount: prog?.total_cards_mastered || 0,
        learningCount: prog?.total_cards_learning || 0,
        dueCount: dueMap.get(d.id) || 0,
      };
    });
  }

  /**
   * Fetches detailed deck information including entitlement check.
   */
  static async getDeckDetail(idOrSlug: string): Promise<FlashcardDeckDetail | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    let query = supabase.from("flashcard_decks").select("id, slug, title_en, description, access_tier, card_count, is_curated, topics(name, slug), subjects(name), exams(title)").eq("is_published", true);

    if (isUuid) {
      query = query.eq("id", idOrSlug);
    } else {
      query = query.eq("slug", idOrSlug);
    }

    const { data: deckData } = await query.maybeSingle();
    if (!deckData) return null;
    const d = deckData as any;

    let hasProAccess = false;
    let progData: any = null;
    let dueCount = 0;

    if (user) {
      const [entitlementRes, progRes, dueRes] = await Promise.all([
        supabase.from("user_entitlements").select("id").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
        supabase.from("user_deck_progress").select("*").eq("deck_id", d.id).eq("user_id", user.id).maybeSingle(),
        supabase.from("user_flashcard_reviews").select("id", { count: "exact", head: true }).eq("deck_id", d.id).eq("user_id", user.id).lte("next_review_due_at", new Date().toISOString()),
      ]);

      hasProAccess = !!entitlementRes.data;
      progData = progRes.data;
      dueCount = dueRes.count || 0;
    }

    return {
      id: d.id,
      slug: d.slug,
      title: d.title_en,
      description: d.description,
      accessTier: d.access_tier,
      cardCount: d.card_count,
      isCurated: d.is_curated,
      topicName: d.topics?.name || null,
      topicSlug: d.topics?.slug || null,
      subjectName: d.subjects?.name || null,
      examTitle: d.exams?.title || null,
      masteryPercentage: Number(progData?.mastery_percentage || 0),
      masteredCount: progData?.total_cards_mastered || 0,
      learningCount: progData?.total_cards_learning || 0,
      newCount: progData?.total_cards_new || d.card_count,
      dueCount,
      hasProAccess,
    };
  }

  /**
   * Fetches cards for active recall review session respecting PRO entitlement.
   */
  static async getDeckCardsForReview(deckId: string): Promise<ReviewSessionPayload | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: deckData } = await supabase
      .from("flashcard_decks")
      .select("id, title_en, slug, access_tier, card_count, is_curated")
      .eq("id", deckId)
      .single();

    if (!deckData) return null;
    const d = deckData as any;

    let hasPro = false;
    if (user) {
      const { data: ent } = await supabase
        .from("user_entitlements")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      hasPro = !!ent;
    }

    let cardsQuery = supabase
      .from("flashcards")
      .select("id, card_order, front_markdown_en, back_markdown_en, mnemonic_en, hint, explanation, latex_formulas")
      .eq("deck_id", deckId)
      .eq("is_active", true)
      .order("card_order");

    // Free users on PRO curated decks receive only preview cards (first 3)
    if (d.is_curated && d.access_tier === "PRO" && !hasPro) {
      cardsQuery = cardsQuery.lte("card_order", 3);
    }

    const [cardsRes, reviewsRes] = await Promise.all([
      cardsQuery,
      user ? supabase.from("user_flashcard_reviews").select("card_id, repetition_level, interval_days, ease_factor").eq("deck_id", deckId).eq("user_id", user.id) : Promise.resolve({ data: [] }),
    ]);

    const rawCards = (cardsRes.data as any[]) || [];
    const reviewsMap = new Map<string, any>();
    ((reviewsRes.data as any[]) || []).forEach((r) => {
      reviewsMap.set(r.card_id, r);
    });

    const cards: ReviewFlashcard[] = rawCards.map((c) => {
      const rev = reviewsMap.get(c.id);
      return {
        id: c.id,
        cardOrder: c.card_order,
        frontText: c.front_markdown_en,
        backText: c.back_markdown_en,
        mnemonic: c.mnemonic_en,
        hint: c.hint,
        explanation: c.explanation,
        latexFormulas: c.latex_formulas,
        repetitionLevel: rev?.repetition_level || 0,
        intervalDays: rev?.interval_days || 1,
        easeFactor: Number(rev?.ease_factor || 2.50),
      };
    });

    return {
      deck: {
        id: d.id,
        title: d.title_en,
        slug: d.slug,
        accessTier: d.access_tier,
        cardCount: d.card_count,
      },
      cards,
    };
  }

  /**
   * Submits SM-2 review rating to Phase 3M fn_submit_flashcard_review.
   */
  static async submitCardReview(cardId: string, rating: number): Promise<CardReviewResponse> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_submit_flashcard_review", {
      p_card_id: cardId,
      p_rating: rating,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to submit card review" };
    }

    return data as CardReviewResponse;
  }

  /**
   * Completes deck session and awards daily completion bonus coins via fn_complete_deck_review_session.
   */
  static async completeDeckSession(deckId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_complete_deck_review_session", {
      p_deck_id: deckId,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to complete deck session" };
    }

    return data as { success: boolean; error?: string };
  }
}