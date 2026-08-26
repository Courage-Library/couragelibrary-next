import React from "react";
import { BattleService } from "@/services/battle.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BattleLobbyClient } from "@/components/battles/battle-lobby-client";
import { Swords, Trophy, Flame, Shield, Award } from "lucide-react";

export const revalidate = 0;

export default async function BattlesLobbyPage() {
  const stats = await BattleService.getUserBattleStats();

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8">
        {/* Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 bg-gradient-to-r from-violet-900 via-purple-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-lg">
          <div className="space-y-2">
            <Badge variant="indigo" className="bg-white/20 text-white border-white/20">
              Phase 3N 1v1 Battle Arena
            </Badge>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight flex items-center gap-3">
              <Swords className="w-8 h-8 text-amber-400" />
              1v1 Live Quiz Arena
            </h1>
            <p className="text-purple-100 text-sm max-w-xl">
              Challenge peers in real-time speed & accuracy duels. Gain ELO rank, climb global leaderboards, and earn coin rewards.
            </p>
          </div>

          {/* User ELO & Win Stats Badge */}
          {stats && (
            <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/15 shrink-0">
              <div className="text-center px-3">
                <span className="text-[10px] text-purple-200 uppercase tracking-wider font-bold block">ELO Rating</span>
                <span className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">{stats.eloRating}</span>
              </div>
              <div className="h-8 w-px bg-white/20" />
              <div className="text-center px-3">
                <span className="text-[10px] text-purple-200 uppercase tracking-wider font-bold block">Win Streak</span>
                <span className="text-xl font-bold text-emerald-400 flex items-center justify-center gap-1 font-mono">
                  <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
                  {stats.currentWinStreak}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <Card className="p-4 bg-white border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-semibold">Total Battles</span>
                <Swords className="w-4 h-4 text-slate-400" />
              </div>
              <span className="text-2xl font-black text-slate-900 mt-1 block font-mono">{stats.totalBattles}</span>
            </Card>
            <Card className="p-4 bg-white border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-semibold">Victories</span>
                <Trophy className="w-4 h-4 text-amber-500" />
              </div>
              <span className="text-2xl font-black text-emerald-600 mt-1 block font-mono">{stats.wins}</span>
            </Card>
            <Card className="p-4 bg-white border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-semibold">Defeats</span>
                <Shield className="w-4 h-4 text-rose-500" />
              </div>
              <span className="text-2xl font-black text-rose-600 mt-1 block font-mono">{stats.losses}</span>
            </Card>
            <Card className="p-4 bg-white border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-semibold">Draws</span>
                <Award className="w-4 h-4 text-blue-500" />
              </div>
              <span className="text-2xl font-black text-blue-600 mt-1 block font-mono">{stats.draws}</span>
            </Card>
          </div>
        )}

        {/* Interactive Matchmaking Lobby Controls */}
        <BattleLobbyClient />
      </Container>
    </div>
  );
}
