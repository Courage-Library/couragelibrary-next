"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { logoutAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Coins, Bell, Flame, User, LogOut, LayoutDashboard, Shield, CreditCard, ChevronDown } from "lucide-react";

interface UserNavProps {
  user: {
    email?: string;
    fullName?: string;
    isAdmin?: boolean;
  } | null;
  coins?: number;
  streak?: number;
}

export function UserNav({ user, coins = 0, streak = 0 }: UserNavProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/auth/login">
          <Button variant="ghost" size="sm" className="font-semibold text-slate-700">Sign In</Button>
        </Link>
        <Link href="/auth/signup">
          <Button variant="default" size="sm" className="font-bold shadow-xs">Get Started</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* Streak Badge */}
      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shadow-xs" title="Daily Practice Streak">
        <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
        <span>{streak}</span>
      </div>

      {/* Coin Balance Badge */}
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold shadow-xs" title="Courage Coins">
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

      {/* User Profile Dropdown */}
      <div ref={dropdownRef} className="relative pl-2 border-l border-slate-200">
        <button
          type="button"
          onClick={() => setIsProfileOpen(!isProfileOpen)}
          className="flex items-center gap-1.5 p-1 rounded-full hover:bg-slate-100 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
            {user.fullName?.charAt(0).toUpperCase() || <User className="w-4 h-4" />}
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {isProfileOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-white p-2 shadow-2xl border border-slate-200/80 z-50 animate-in fade-in slide-in-from-top-1">
            <div className="px-3 py-2 border-b border-slate-100">
              <div className="text-xs font-extrabold text-slate-900 truncate">{user.fullName || "Student User"}</div>
              <div className="text-[10px] text-slate-400 font-mono truncate">{user.email}</div>
            </div>

            <div className="py-1">
              <Link
                href="/dashboard"
                onClick={() => setIsProfileOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <LayoutDashboard className="w-4 h-4 text-blue-600" /> Dashboard
              </Link>
              <Link
                href="/billing"
                onClick={() => setIsProfileOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <CreditCard className="w-4 h-4 text-amber-500" /> Billing & Invoices
              </Link>

              {user.isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors"
                >
                  <Shield className="w-4 h-4 text-indigo-600" /> Admin Studio
                </Link>
              )}
            </div>

            <div className="pt-1 border-t border-slate-100">
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}