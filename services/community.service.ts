import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rpcJsonObject, sqlNullArg } from "@/lib/supabase/rpc";

export interface DiscussionThreadItem {
  id: string;
  contextType: "QUESTION" | "LESSON" | "ARTICLE" | "TOPIC";
  title: string;
  status: "OPEN" | "RESOLVED" | "LOCKED" | "ARCHIVED";
  isPinned: boolean;
  acceptedAnswerId: string | null;
  hasFacultyAnswer: boolean;
  messageCount: number;
  upvoteCount: number;
  viewCount: number;
  lastActivityAt: string;
  createdAt: string;
  authorId: string;
  authorEmail?: string;
  topicName?: string | null;
  topicId?: string | null;
}

export interface DiscussionMessageItem {
  id: string;
  threadId: string;
  authorId: string;
  parentMessageId: string | null;
  contentMarkdown: string;
  isFacultyVerified: boolean;
  upvoteCount: number;
  isDeleted: boolean;
  createdAt: string;
  userHasVoted?: boolean;
}

export interface ThreadDetail {
  thread: DiscussionThreadItem;
  messages: DiscussionMessageItem[];
  topicId: string | null;
  isAuthor: boolean;
}

export class CommunityService {
  /**
   * Fetches list of open/resolved community discussion threads.
   */
  static async getDiscussionThreads(filters?: {
    contextType?: string;
    topicId?: string;
    status?: string;
  }): Promise<DiscussionThreadItem[]> {
    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from("discussion_threads")
      .select("id, context_type, title, status, is_pinned, accepted_answer_id, has_faculty_answer, message_count, upvote_count, view_count, last_activity_at, created_at, author_id, topic_id, topics:canonical_taxonomy_nodes!discussion_threads_topic_id_node_fkey(name)")
      .order("is_pinned", { ascending: false })
      .order("last_activity_at", { ascending: false });

    if (filters?.contextType && filters.contextType !== "ALL") {
      query = query.eq("context_type", filters.contextType);
    }
    if (filters?.topicId && filters.topicId !== "ALL") {
      query = query.eq("topic_id", filters.topicId);
    }
    if (filters?.status && filters.status !== "ALL") {
      query = query.eq("status", filters.status);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((t) => ({
      id: t.id,
      contextType: t.context_type as DiscussionThreadItem["contextType"],
      title: t.title,
      status: t.status as DiscussionThreadItem["status"],
      isPinned: t.is_pinned,
      acceptedAnswerId: t.accepted_answer_id,
      hasFacultyAnswer: t.has_faculty_answer,
      messageCount: t.message_count,
      upvoteCount: t.upvote_count,
      viewCount: t.view_count,
      lastActivityAt: t.last_activity_at,
      createdAt: t.created_at,
      authorId: t.author_id,
      topicName: t.topics?.name || null,
      topicId: t.topic_id || null,
    }));
  }

  /**
   * Fetches detailed thread view and all associated messages/replies.
   */
  static async getThreadDetail(threadId: string): Promise<ThreadDetail | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: tData } = await supabase
      .from("discussion_threads")
      // TYPES-1 B2 (Class B): two relationships link threads and messages (messages.thread_id and threads.accepted_answer_id);
      // the unhinted embed failed with PGRST201, so every thread detail rendered not-found. Embed via the thread FK.
      .select("*, topics:canonical_taxonomy_nodes!discussion_threads_topic_id_node_fkey(name), discussion_messages!discussion_messages_thread_id_fkey(*)")
      .eq("id", threadId)
      .maybeSingle();

    if (!tData) return null;
    const t = tData as any;

    let userVotedMessageIds = new Set<string>();
    if (user) {
      const { data: votes } = await supabase
        .from("discussion_votes")
        .select("message_id")
        .eq("user_id", user.id);

      if (votes) {
        votes.forEach((v: any) => userVotedMessageIds.add(v.message_id));
      }
    }

    const rawMessages: any[] = t.discussion_messages || [];
    const messages: DiscussionMessageItem[] = rawMessages
      .filter((m) => !m.is_deleted)
      .sort((m1, m2) => new Date(m1.created_at).getTime() - new Date(m2.created_at).getTime())
      .map((m) => ({
        id: m.id,
        threadId: m.thread_id,
        authorId: m.author_id,
        parentMessageId: m.parent_message_id,
        contentMarkdown: m.content_markdown,
        isFacultyVerified: m.is_faculty_verified,
        upvoteCount: m.upvote_count,
        isDeleted: m.is_deleted,
        createdAt: m.created_at,
        userHasVoted: userVotedMessageIds.has(m.id),
      }));

    return {
      thread: {
        id: t.id,
        contextType: t.context_type,
        title: t.title,
        status: t.status,
        isPinned: t.is_pinned,
        acceptedAnswerId: t.accepted_answer_id,
        hasFacultyAnswer: t.has_faculty_answer,
        messageCount: t.message_count,
        upvoteCount: t.upvote_count,
        viewCount: t.view_count,
        lastActivityAt: t.last_activity_at,
        createdAt: t.created_at,
        authorId: t.author_id,
        topicName: t.topics?.name || null,
        topicId: t.topic_id || null,
      },
      messages,
      topicId: t.topic_id || null,
      isAuthor: user ? t.author_id === user.id : false,
    };
  }

  /**
   * Creates a new discussion thread via fn_create_discussion_thread.
   */
  static async createThread(payload: {
    contextType: string;
    contextId?: string;
    title: string;
    initialContent: string;
  }): Promise<{
    success: boolean;
    thread_id?: string;
    error?: string;
  }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc.bind(supabase);

    const { data, error } = await rpcCall("fn_create_discussion_thread", {
      p_context_type: payload.contextType,
      p_context_id: sqlNullArg(payload.contextId || null), // no SQL default; NULL = thread without a context row
      p_title: payload.title,
      p_initial_content: payload.initialContent,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to create discussion thread" };
    }

    return rpcJsonObject<{ success: boolean }>(data) ?? { success: false, error: "Failed to create discussion thread" };
  }

  /**
   * Posts a reply message via fn_post_discussion_message.
   */
  static async postReply(payload: {
    threadId: string;
    contentMarkdown: string;
    parentMessageId?: string;
  }): Promise<{
    success: boolean;
    message_id?: string;
    error?: string;
  }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc.bind(supabase);

    const { data, error } = await rpcCall("fn_post_discussion_message", {
      p_thread_id: payload.threadId,
      p_content_markdown: payload.contentMarkdown,
      p_parent_message_id: payload.parentMessageId || undefined, // SQL DEFAULT NULL
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to post message" };
    }

    return rpcJsonObject<{ success: boolean }>(data) ?? { success: false, error: "Failed to post message" };
  }

  /**
   * Upvotes/unvotes a discussion message via fn_vote_discussion_message.
   */
  static async voteMessage(
    messageId: string,
    action: "ADD" | "REMOVE"
  ): Promise<{ success: boolean; upvote_count?: number; error?: string }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc.bind(supabase);

    const { data, error } = await rpcCall("fn_vote_discussion_message", {
      p_message_id: messageId,
      p_vote_action: action,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to process vote" };
    }

    return rpcJsonObject<{ success: boolean }>(data) ?? { success: false, error: "Failed to process vote" };
  }

  /**
   * Marks a reply as accepted answer via fn_mark_accepted_answer.
   */
  static async markAcceptedAnswer(
    threadId: string,
    messageId: string
  ): Promise<{ success: boolean; status?: string; error?: string }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc.bind(supabase);

    const { data, error } = await rpcCall("fn_mark_accepted_answer", {
      p_thread_id: threadId,
      p_message_id: messageId,
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to mark accepted answer" };
    }

    return rpcJsonObject<{ success: boolean }>(data) ?? { success: false, error: "Failed to mark accepted answer" };
  }

  /**
   * Flags discussion thread or message via fn_flag_discussion_content.
   */
  static async flagContent(payload: {
    targetType: "THREAD" | "MESSAGE";
    targetId: string;
    reason: string;
    details?: string;
  }): Promise<{ success: boolean; flag_id?: string; error?: string }> {
    const supabase = await createServerSupabaseClient();
    const rpcCall = supabase.rpc.bind(supabase);

    const { data, error } = await rpcCall("fn_flag_discussion_content", {
      p_target_type: payload.targetType,
      p_target_id: payload.targetId,
      p_reason: payload.reason,
      p_details: payload.details || undefined, // SQL DEFAULT NULL
    });

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to flag content" };
    }

    return rpcJsonObject<{ success: boolean }>(data) ?? { success: false, error: "Failed to flag content" };
  }
}
