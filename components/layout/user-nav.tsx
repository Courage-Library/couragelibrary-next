import React from "react";
import Link from "next/link";
import { logoutAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Coins, Bell, Flame, User, LogOut } from "lucide-react";

interface UserNavProps {
  user: {
    email?: string;
    fullName?: string;
  } | null;
  coins?: number;
  streak?: number;
}

export function UserNav({ user, coins = 0, streak = 0 }: UserNavProps) {
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/auth/login">
          <Button variant="ghost" size="sm">Sign In</Button>
        </Link>
        <Link href="/auth/signup">
          <Button variant="default" size="sm">Get Started</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* Streak Badge */}
      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shadow-xs">
        <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
        <span>{streak}</span>
      </div>

      {/* Coin Balance Badge */}
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold shadow-xs">
        <Coins className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
        <span>{coins}</span>
      </div>

      {/* Notifications Link */}
      <Link
        href="/notifications"
        className="relative p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
      </Link>

      {/* User Avatar & Logout */}
      <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
          {user.fullName?.charAt(0).toUpperCase() || <User className="w-4 h-4" />}
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}