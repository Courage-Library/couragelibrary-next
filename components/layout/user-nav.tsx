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
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
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
      <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shadow-xs" title="Daily Practice Streak">
        <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
        <span>{streak}</span>
      </div>

      {/* Coin Balance Badge */}
      <Link
        href="/wallet"
        className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold shadow-xs hover:bg-blue-100/80 transition-colors cursor-pointer"
        title="View CL Wallet & Rewards"
      >
        <Coins className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
        <span>{coins} CL</span>
      </Link>

      {/* Notifications Link */}
      <Link
        href="/notifications"
        aria-label="View notifications"
        className="relative p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        title="Notifications"
      >
        <Bell className="w-4.5 h-4.5" />
      </Link>

      {/* User Profile Dropdown */}
      <div ref={dropdownRef} className="relative pl-2 border-l border-slate-200">
        <button
          type="button"
          aria-expanded={isProfileOpen}
          aria-haspopup="true"
          aria-label="User Profile Menu"
          onClick={() => setIsProfileOpen(!isProfileOpen)}
          className="flex items-center gap-1.5 p-1 rounded-full hover:bg-slate-100 transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
            {user.fullName?.charAt(0).toUpperCase() || <User className="w-4 h-4" />}
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isProfileOpen ? "rotate-180 text-blue-600" : ""}`} />
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
                <LayoutDashboard className="w-4 h-4 text-blue-600 shrink-0" /> Dashboard
              </Link>
              <Link
                href="/wallet"
                onClick={() => setIsProfileOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <Coins className="w-4 h-4 text-amber-500 shrink-0" /> CL Wallet ({coins} CL)
              </Link>
              <Link
                href="/billing"
                onClick={() => setIsProfileOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <CreditCard className="w-4 h-4 text-amber-500 shrink-0" /> Billing & Invoices
              </Link>

              {user.isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors"
                >
                  <Shield className="w-4 h-4 text-indigo-600 shrink-0" /> Admin Studio
                </Link>
              )}
            </div>

            <div className="pt-1 border-t border-slate-100">
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="w-4 h-4 shrink-0" /> Sign Out
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}