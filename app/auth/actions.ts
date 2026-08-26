"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UserProfileService } from "@/services/user-profile.service";
import { getAppEnv } from "@/config/env";
import { redirect } from "next/navigation";

export interface AuthState {
  error?: string;
  success?: string;
}

export async function loginAction(prevState: AuthState | null, formData: FormData): Promise<AuthState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Please provide both email and password." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  if (data?.user) {
    await UserProfileService.ensureProfile(data.user);
  }

  redirect("/dashboard");
}

export async function signupAction(prevState: AuthState | null, formData: FormData): Promise<AuthState> {
  const fullName = formData.get("fullName") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Please provide email and password." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data?.user) {
    await UserProfileService.ensureProfile(data.user);
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}

export async function forgotPasswordAction(prevState: AuthState | null, formData: FormData): Promise<AuthState> {
  const email = formData.get("email") as string;

  if (!email || !email.includes("@")) {
    return { error: "Please enter a valid email address." };
  }

  const { siteUrl } = getAppEnv();
  const redirectUrl = `${siteUrl}/auth/callback?next=/auth/update-password`;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl,
  });

  if (error) {
    const rawMsg = (error.message || "").toLowerCase();

    // Map rate limit errors to friendly user-facing notice
    if (rawMsg.includes("rate limit") || rawMsg.includes("email rate limit exceeded") || rawMsg.includes("too many requests")) {
      return { error: "Too many password reset requests. Please wait a little while and try again." };
    }

    // Security: Map non-existent user or lookup errors to prevent email enumeration attacks
    if (rawMsg.includes("user not found") || rawMsg.includes("email not found") || rawMsg.includes("invalid email")) {
      return { success: "If an account exists with that email address, password reset instructions have been sent." };
    }

    // Fallback for generic unexpected provider errors
    return { error: "Something went wrong. Please try again in a few minutes." };
  }

  return { success: "Password reset instructions have been sent to your email." };
}

export async function updatePasswordAction(prevState: AuthState | null, formData: FormData): Promise<AuthState> {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    return { error: "Please enter and confirm your new password." };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters long." };
  }

  if (password !== confirmPassword) {
    return { error: "New password and confirmation password do not match." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/auth/login?message=Password+updated+successfully.+Please+sign+in+with+your+new+password.");
}