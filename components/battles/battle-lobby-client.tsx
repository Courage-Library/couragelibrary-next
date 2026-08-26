"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Swords, Key, Zap, ShieldAlert } from "lucide-react";

export function BattleLobbyClient() {
  const router = useRouter();
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleQuickMatch = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/battles/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrivate: false, accessTier: "FREE" }),
      });
      const data = await res.json();
      if (data.success && data.room_id) {
        router.push(`/battles/${data.room_id}`);
      } else {
        setErrorMsg(data.error || "Failed to start match");
      }
    } catch {
      setErrorMsg("Network error starting match");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePrivateMatch = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/battles/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrivate: true, accessTier: "FREE" }),
      });
      const data = await res.json();
      if (data.success && data.room_id) {
        router.push(`/battles/${data.room_id}`);
      } else {
        setErrorMsg(data.error || "Failed to create private room");
      }
    } catch {
      setErrorMsg("Network error creating room");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCodeInput.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/battles/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: roomCodeInput.trim() }),
      });
      const data = await res.json();
      if (data.success && data.room_id) {
        router.push(`/battles/${data.room_id}`);
      } else {
        setErrorMsg(data.error || "Failed to join room code");
      }
    } catch {
      setErrorMsg("Network error joining room");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Quick Public Matchmaking Card */}
        <Card className="p-6 sm:p-8 space-y-5 border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200/60">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <Badge variant="indigo" className="text-[10px] mb-1">
                PUBLIC MATCHMAKING
              </Badge>
              <h2 className="text-xl font-bold text-slate-900">Find 1v1 Opponent</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Automatically match with another aspirant in an open 1v1 battle arena. Speed bonus points apply to fast answers!
              </p>
            </div>
          </div>

          <Button
            size="lg"
            variant="default"
            className="w-full bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-bold shadow-sm"
            onClick={handleQuickMatch}
            isLoading={isLoading}
          >
            <Swords className="w-4 h-4 mr-2" /> Start 1v1 Quick Match
          </Button>
        </Card>

        {/* Private Room / Invite Code Card */}
        <Card className="p-6 sm:p-8 space-y-5 border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200/60">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <Badge variant="warning" className="text-[10px] mb-1">
                FRIEND CHALLENGE
              </Badge>
              <h2 className="text-xl font-bold text-slate-900">Private Room / Invite Code</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Create a custom private battle room or enter a 6-character room code from a friend to start a duel.
              </p>
            </div>

            <form onSubmit={handleJoinByCode} className="flex gap-2 pt-2">
              <Input
                placeholder="Enter 6-digit Code (e.g. A1B2C3)"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                className="text-xs uppercase font-mono tracking-wider"
                maxLength={6}
              />
              <Button type="submit" variant="default" size="sm" className="bg-slate-900 font-bold shrink-0" disabled={isLoading}>
                Join Room
              </Button>
            </form>
          </div>

          <Button
            size="md"
            variant="outline"
            className="w-full font-bold text-xs"
            onClick={handleCreatePrivateMatch}
            disabled={isLoading}
          >
            Create Private 1v1 Room
          </Button>
        </Card>
      </div>
    </div>
  );
}
