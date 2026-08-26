import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface UserBattleStats {
  userId: string;
  eloRating: number;
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  currentWinStreak: number;
  highestWinStreak: number;
}

export interface BattleRoomDetails {
  id: string;
  roomCode: string;
  battleType: string;
  topicId: string | null;
  topicName: string | null;
  createdByUserId: string;
  isPrivate: boolean;
  accessTier: string;
  maxParticipants: number;
  totalRounds: number;
  timePerQuestionSeconds: number;
  status: "WAITING" | "READY" | "COUNTDOWN" | "ACTIVE" | "ROUND_CLOSING" | "COMPLETED" | "CANCELLED" | "EXPIRED";
  currentRound: number;
  roundStartedAt: string | null;
  roundEndsAt: string | null;
  winnerUserId: string | null;
  participants: Array<{
    id: string;
    userId: string;
    finalScore: number;
    totalTimeMs: number;
    isWinner: boolean;
    coinsAwarded: number;
    eloDelta: number;
    userEmail?: string;
  }>;
}

export interface ActiveRoundData {
  success: boolean;
  status?: string;
  current_round?: number;
  total_rounds?: number;
  round_started_at?: string;
  round_ends_at?: string;
  question_id?: string;
  question_text?: string;
  options?: Array<{
    id: string;
    option_key: string;
    option_text: string;
    order_index: number;
  }>;
  error?: string;
}

export interface BattleAnswerResult {
  success: boolean;
  round_number?: number;
  is_correct?: boolean;
  score_points?: number;
  latency_ms?: number;
  error?: string;
}

export class BattleService {
  /**
   * Fetches the user's battle stats (ELO, wins, losses, win streak).
   */
  static async getUserBattleStats(): Promise<UserBattleStats | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    const { data } = await supabase
      .from("user_battle_stats")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data) {
      return {
        userId: user.id,
        eloRating: 1200,
        totalBattles: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        currentWinStreak: 0,
        highestWinStreak: 0,
      };
    }

    const d = data as any;
    return {
      userId: d.user_id,
      eloRating: d.elo_rating,
      totalBattles: d.total_battles,
      wins: d.wins,
      losses: d.losses,
      draws: d.draws,
      currentWinStreak: d.current_win_streak,
      highestWinStreak: d.highest_win_streak,
    };
  }

  /**
   * Finds an existing public waiting room or creates a new 1v1 battle room.
   */
  static async findOrCreateBattleRoom(
    topicId?: string,
    isPrivate: boolean = false,
    accessTier: string = "FREE"
  ): Promise<{
    success: boolean;
    room_id?: string;
    room_code?: string;
    action?: string;
    status?: string;
    countdown_seconds?: number;
    error?: string;
  }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_find_or_create_battle_room", {
      p_topic_id: topicId || null,
      p_is_private: isPrivate,
      p_access_tier: accessTier,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to find or create battle room" };
    }

    return data;
  }

  /**
   * Joins a battle room by room code.
   */
  static async joinBattleByCode(roomCode: string): Promise<{
    success: boolean;
    room_id?: string;
    status?: string;
    countdown_seconds?: number;
    error?: string;
  }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_join_battle_by_code", {
      p_room_code: roomCode,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to join battle room" };
    }

    return data;
  }

  /**
   * Fetches room metadata and participants (sanitized).
   */
  static async getBattleRoomDetails(roomId: string): Promise<BattleRoomDetails | null> {
    const supabase = await createServerSupabaseClient();

    const [roomRes, participantsRes] = await Promise.all([
      supabase
        .from("quiz_battle_rooms")
        .select("id, room_code, battle_type, topic_id, created_by_user_id, is_private, access_tier, max_participants, total_rounds, time_per_question_seconds, status, current_round, round_started_at, round_ends_at, winner_user_id, topics(name)")
        .eq("id", roomId)
        .maybeSingle(),
      supabase
        .from("quiz_battle_participants")
        .select("id, user_id, final_score, total_time_ms, is_winner, coins_awarded, elo_delta")
        .eq("room_id", roomId),
    ]);

    if (!roomRes.data) return null;
    const r = roomRes.data as any;

    return {
      id: r.id,
      roomCode: r.room_code,
      battleType: r.battle_type,
      topicId: r.topic_id,
      topicName: r.topics?.name || null,
      createdByUserId: r.created_by_user_id,
      isPrivate: r.is_private,
      accessTier: r.access_tier,
      maxParticipants: r.max_participants,
      totalRounds: r.total_rounds,
      timePerQuestionSeconds: r.time_per_question_seconds,
      status: r.status,
      currentRound: r.current_round,
      roundStartedAt: r.round_started_at,
      roundEndsAt: r.round_ends_at,
      winnerUserId: r.winner_user_id,
      participants: ((participantsRes.data as any[]) || []).map((p) => ({
        id: p.id,
        userId: p.user_id,
        finalScore: p.final_score,
        totalTimeMs: p.total_time_ms,
        isWinner: p.is_winner,
        coinsAwarded: p.coins_awarded,
        eloDelta: p.elo_delta,
      })),
    };
  }

  /**
   * Fetches active round sanitized question data via fn_get_active_battle_round.
   * Zero answer key or future questions leakage.
   */
  static async getActiveBattleRound(roomId: string): Promise<ActiveRoundData> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_get_active_battle_round", {
      p_room_id: roomId,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to fetch active round" };
    }

    return data as ActiveRoundData;
  }

  /**
   * Submits round answer via fn_submit_battle_round_answer.
   */
  static async submitBattleRoundAnswer(
    roomId: string,
    roundNumber: number,
    selectedOptionId: string
  ): Promise<BattleAnswerResult> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_submit_battle_round_answer", {
      p_room_id: roomId,
      p_round_number: roundNumber,
      p_selected_option_id: selectedOptionId,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to submit round answer" };
    }

    return data as BattleAnswerResult;
  }

  /**
   * Finalizes battle room via fn_finalize_battle_room.
   */
  static async finalizeBattleRoom(roomId: string): Promise<{ success: boolean; winner_user_id?: string; error?: string }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc as any;

    const { data, error } = await rpcCall("fn_finalize_battle_room", {
      p_room_id: roomId,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to finalize battle room" };
    }

    return data;
  }
}