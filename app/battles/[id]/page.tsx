import React from "react";
import { notFound } from "next/navigation";
import { BattleService } from "@/services/battle.service";
import { BattleArenaClient } from "./arena-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function BattleArenaPage({ params }: Props) {
  const { id } = await params;
  const room = await BattleService.getBattleRoomDetails(id);

  if (!room) {
    notFound();
  }

  return <BattleArenaClient initialRoom={room} />;
}
