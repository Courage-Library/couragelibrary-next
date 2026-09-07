import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { mockQuestionId, questionId, questionVersionId, issueType, description, suggestedFix } = body;

    if (!description || description.trim().length < 5) {
      return NextResponse.json(
        { success: false, error: "Please provide a brief description (at least 5 characters)." },
        { status: 400 }
      );
    }

    const adminSb = createAdminServerSupabaseClient();

    let resolvedQuestionId = questionId;
    let resolvedQuestionVersionId = questionVersionId;

    // If only mockQuestionId is provided, resolve the canonical question_id and question_version_id
    if (!resolvedQuestionId || !resolvedQuestionVersionId) {
      if (!mockQuestionId) {
        return NextResponse.json(
          { success: false, error: "Missing question reference." },
          { status: 400 }
        );
      }

      const { data: mqData } = await adminSb
        .from("mock_questions")
        .select("question_version_id, question_versions(question_id)")
        .eq("id", mockQuestionId)
        .maybeSingle();

      if (!mqData) {
        return NextResponse.json(
          { success: false, error: "Question could not be found." },
          { status: 404 }
        );
      }

      resolvedQuestionVersionId = mqData.question_version_id;
      const qvData = mqData.question_versions as unknown as { question_id: string } | null;
      resolvedQuestionId = qvData?.question_id;
    }

    if (!resolvedQuestionId || !resolvedQuestionVersionId) {
      return NextResponse.json(
        { success: false, error: "Invalid question data." },
        { status: 400 }
      );
    }

    // Map UI category keys to database enum
    const issueTypeMap: Record<string, string> = {
      typo: "TYPO",
      TYPO: "TYPO",
      wrong_options: "AMBIGUOUS",
      AMBIGUOUS: "AMBIGUOUS",
      image_issue: "FORMATTING",
      FORMATTING: "FORMATTING",
      wrong_answer_key: "INCORRECT_ANSWER",
      INCORRECT_ANSWER: "INCORRECT_ANSWER",
      question_text_error: "QUESTION_TEXT_ERROR",
      QUESTION_TEXT_ERROR: "QUESTION_TEXT_ERROR",
      outdated: "OUTDATED_INFORMATION",
      OUTDATED_INFORMATION: "OUTDATED_INFORMATION",
      duplicate: "DUPLICATE",
      DUPLICATE: "DUPLICATE",
      explanation_error: "INCORRECT_EXPLANATION",
      INCORRECT_EXPLANATION: "INCORRECT_EXPLANATION",
      other: "OTHER",
      OTHER: "OTHER",
    };

    const canonicalIssueType = issueTypeMap[issueType] || "OTHER";
    const cleanDescription = (description || "").trim().slice(0, 3000);
    const cleanSuggestedFix = suggestedFix ? suggestedFix.trim().slice(0, 3000) : null;

    // Check if an active open report for this user, question, and issueType already exists
    const { data: existingReport } = await adminSb
      .from("question_errata_reports")
      .select("id, status")
      .eq("reporter_user_id", user.id)
      .eq("question_id", resolvedQuestionId)
      .eq("issue_type", canonicalIssueType)
      .in("status", ["OPEN", "UNDER_REVIEW"])
      .maybeSingle();

    if (existingReport) {
      const rep = existingReport as { id: string; status: string };
      return NextResponse.json({
        success: true,
        message: "Your report for this question is already recorded and under review by our subject experts.",
        reportId: rep.id,
      });
    }

    // Insert new errata report
    const { data: newReport, error: insertErr } = await adminSb
      .from("question_errata_reports")
      .insert({
        reporter_user_id: user.id,
        question_id: resolvedQuestionId,
        question_version_id: resolvedQuestionVersionId,
        issue_type: canonicalIssueType,
        description: cleanDescription.length >= 10 ? cleanDescription : cleanDescription.padEnd(10, "."),
        suggested_fix: cleanSuggestedFix,
        status: "OPEN",
      })
      .select("id")
      .single();

    if (insertErr || !newReport) {
      console.error("[report-question] Insertion error:", insertErr);
      return NextResponse.json(
        { success: false, error: "Failed to submit question report. Please try again." },
        { status: 500 }
      );
    }

    const createdReport = newReport as { id: string };
    return NextResponse.json({
      success: true,
      reportId: createdReport.id,
      message: "Question issue reported successfully.",
    });
  } catch (error) {
    console.error("[report-question] Handler error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
