"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { BattleRoomDetails, ActiveRoundData } from "@/services/battle.service";
import { QuestionRenderer } from "@/components/assessment/question-renderer";
import { QuestionOptions } from "@/components/assessment/question-options";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Swords,
  Trophy,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  Users,
  Coins,
} from "lucide-react";

interface BattleArenaClientProps {
  initialRoom: BattleRoomDetails;
}

export function BattleArenaClient({ initialRoom }: BattleArenaClientProps) {
  const [room, setRoom] = useState<BattleRoomDetails>(initialRoom);
  const [roundData, setRoundData] = useState<ActiveRoundData | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [submittedAnswer, setSubmittedAnswer] = useState<{
    isCorrect: boolean;
    scorePoints: number;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(15);

  // Poll room status every 2 seconds if WAITING, COUNTDOWN, or ACTIVE
  const fetchRoomState = useCallback(async () => {
    try {
      const res = await fetch(`/api/battles/room-details?id=${room.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.room) {
          setRoom(data.room);
        }
      }
    } catch {
      // Ignore background poll errors
    }
  }, [room.id]);

  useEffect(() => {
    if (room.status === "COMPLETED" || room.status === "CANCELLED") return;

    const interval = setInterval(fetchRoomState, 2000);
    return () => clearInterval(interval);
  }, [fetchRoomState, room.status]);

  // Fetch active round question when room is in COUNTDOWN, ACTIVE, or ROUND_CLOSING
  const fetchActiveRound = useCallback(async () => {
    try {
      const res = await fetch(`/api/battles/active-round?id=${room.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setRoundData(data);

          // Reset selection on round transition
          if (data.current_round !== roundData?.current_round) {
            setSelectedOptionId(null);
            setSubmittedAnswer(null);
          }

          // Calculate time left from round_ends_at
          if (data.round_ends_at) {
            const endsAt = new Date(data.round_ends_at).getTime();
            const now = new Date().getTime();
            const diffSec = Math.max(0, Math.ceil((endsAt - now) / 1000));
            setTimeLeftSeconds(diffSec);
          }
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, [room.id, roundData?.current_round]);

  useEffect(() => {
    if (["COUNTDOWN", "ACTIVE", "ROUND_CLOSING"].includes(room.status)) {
      fetchActiveRound();
      const interval = setInterval(fetchActiveRound, 1500);
      return () => clearInterval(interval);
    }
  }, [fetchActiveRound, room.status]);

  // Countdown timer effect
  useEffect(() => {
    if (timeLeftSeconds <= 0) return;
    const timer = setInterval(() => {
      setTimeLeftSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeftSeconds]);

  const handleSelectOption = async (optionKey: string) => {
    if (submittedAnswer || isSubmitting || !roundData?.options) return;

    const targetOpt = roundData.options.find((o) => o.option_key === optionKey);
    if (!targetOpt) return;

    setSelectedOptionId(targetOpt.id);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/battles/submit-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: room.id,
          roundNumber: roundData.current_round || room.currentRound,
          selectedOptionId: targetOpt.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmittedAnswer({
          isCorrect: !!data.is_correct,
          scorePoints: data.score_points || 0,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room.roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // 1. WAITING ROOM VIEW
  if (room.status === "WAITING") {
    return (
      <div className="py-12 bg-slate-50/50 min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-6 border-slate-200 shadow-md">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
            <Users className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <Badge variant="indigo" className="text-[10px]">
              1v1 BATTLE ROOM
            </Badge>
            <h2 className="text-2xl font-black text-slate-900">Waiting for Opponent...</h2>
            <p className="text-xs text-slate-500">
              Share the room code below with a classmate to join this battle.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 space-y-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">ROOM CODE</span>
            <div className="flex items-center justify-center gap-3">
              <span className="text-3xl font-black text-slate-900 font-mono tracking-widest">
                {room.roomCode}
              </span>
              <Button size="sm" variant="outline" onClick={handleCopyCode} className="text-xs font-semibold">
                <Copy className="w-3.5 h-3.5 mr-1" />
                {copiedCode ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>

          <div className="pt-2 text-xs text-slate-400 animate-pulse font-medium">
            Searching for opponent or waiting for peer to join...
          </div>
        </Card>
      </div>
    );
  }

  // 2. COUNTDOWN VIEW
  if (room.status === "COUNTDOWN") {
    return (
      <div className="py-16 bg-slate-50/50 min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-6 border-slate-200 shadow-lg bg-gradient-to-b from-purple-900 to-indigo-950 text-white">
          <Swords className="w-12 h-12 text-amber-400 mx-auto animate-bounce" />
          <div className="space-y-2">
            <h2 className="text-3xl font-black">Opponent Matched!</h2>
            <p className="text-xs text-purple-200">Get ready for 1v1 Round 1...</p>
          </div>
          <div className="text-5xl font-black text-amber-400 font-mono animate-pulse">
            5
          </div>
        </Card>
      </div>
    );
  }

  // 3. COMPLETED SCORECARD VIEW
  if (room.status === "COMPLETED") {
    const isWinner = room.winnerUserId !== null && room.participants.some((p) => p.isWinner);
    const p1 = room.participants[0];
    const p2 = room.participants[1];

    return (
      <div className="py-12 bg-slate-50/50 min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-6 border-slate-200 shadow-lg">
          <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
            <Trophy className="w-10 h-10" />
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-900">
              {isWinner ? "Victory!" : room.winnerUserId === null ? "It's a Draw!" : "Battle Defeat"}
            </h2>
            <p className="text-xs text-slate-500">1v1 Quiz Battle Concluded</p>
          </div>

          {/* Scores comparison */}
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200">
              <span className="text-xs font-bold text-purple-900 block">P1 Score</span>
              <span className="text-2xl font-black text-purple-950 font-mono">{p1?.finalScore || 0}</span>
            </div>
            <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200">
              <span className="text-xs font-bold text-indigo-900 block">P2 Score</span>
              <span className="text-2xl font-black text-indigo-950 font-mono">{p2?.finalScore || 0}</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-amber-50/60 border border-amber-200 flex items-center justify-center gap-2 text-xs font-bold text-amber-900">
            <Coins className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span>Coin Rewards Added to Wallet</span>
          </div>

          <div className="space-y-2 pt-2">
            <Link href="/mistakes" className="block">
              <Button size="lg" variant="default" className="w-full bg-rose-600 hover:bg-rose-700 font-bold">
                Review Mistakes in Vault
              </Button>
            </Link>
            <Link href="/battles" className="block">
              <Button size="md" variant="outline" className="w-full font-semibold">
                Back to Battle Lobby
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // 4. ACTIVE BATTLE ROUND VIEW
  return (
    <div className="py-8 bg-slate-50/50 min-h-[calc(100vh-4rem)] px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Battle Arena Header Bar */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <Swords className="w-5 h-5 text-amber-400" />
            <div>
              <span className="text-xs font-bold text-slate-300 block">
                Round {roundData?.current_round || room.currentRound} of {roundData?.total_rounds || room.totalRounds}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">1v1 Speed Battle</span>
            </div>
          </div>

          {/* Live Timer */}
          <div className="flex items-center gap-2 font-mono font-bold text-base bg-slate-800 px-3.5 py-1.5 rounded-xl border border-slate-700">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className={timeLeftSeconds <= 3 ? "text-red-400 animate-pulse" : "text-white"}>
              {timeLeftSeconds}s
            </span>
          </div>
        </div>

        {/* Question Area */}
        {roundData?.question_text ? (
          <Card className="p-6 space-y-6">
            <QuestionRenderer
              questionNumber={roundData.current_round || room.currentRound}
              questionText={roundData.question_text}
              marks={100}
              negativeMark={0}
            />

            <QuestionOptions
              options={(roundData.options || []).map((o) => ({ key: o.option_key, text: o.option_text }))}
              selectedOption={(roundData.options || []).find((o) => o.id === selectedOptionId)?.option_key || null}
              onSelectOption={handleSelectOption}
            />
          </Card>
        ) : (
          <Card className="p-12 text-center text-slate-400">
            Fetching active round question...
          </Card>
        )}

        {/* Answer Feedback Banner */}
        {submittedAnswer && (
          <div
            className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between ${
              submittedAnswer.isCorrect
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-red-50 border-red-200 text-red-900"
            }`}
          >
            <div className="flex items-center gap-2">
              {submittedAnswer.isCorrect ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <XCircle className="w-4 h-4 text-red-600" />
              )}
              <span>
                {submittedAnswer.isCorrect
                  ? `Correct! +${submittedAnswer.scorePoints} Speed Points`
                  : "Incorrect choice submitted."}
              </span>
            </div>
            <span className="text-[10px] text-slate-500">Waiting for opponent or round transition...</span>
          </div>
        )}
      </div>
    </div>
  );
}
