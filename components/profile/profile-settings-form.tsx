"use client";

/**
 * F8 profile settings: choose a username (instant format feedback; the server decides) and make the profile public —
 * opt-in, off by default, and only after the student confirms they are 18 or older (no minor gets a public profile).
 * Plain English, 48 px controls, results announced politely.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { checkUsername, nextChangeAllowedAt, normalizeUsername, USERNAME_COPY } from "@/lib/profile/username";
import { setLeaderboardOptInAction, setProfileVisibilityAction, setUsernameAction } from "@/app/settings/profile/actions";
import { formatDateShort } from "@/lib/format";

const VIS_COPY: Record<string, string> = {
  PUBLIC: "Your profile is public.",
  PRIVATE: "Your profile is private.",
  NEED_USERNAME: "Choose a username first.",
  NEED_ADULT_CONFIRMATION: "Public profiles are only for students who are 18 or older. Tick the box to confirm.",
  NOT_SIGNED_IN: "Sign in to change this.",
  FAILED: "Could not save. Please try again.",
};

const LB_COPY: Record<string, string> = {
  OPTED_IN: "You are shown on mock leaderboards (masked name).",
  OPTED_OUT: "You are not shown on mock leaderboards.",
  NEED_ADULT_CONFIRMATION: "Leaderboards are only for students who are 18 or older. Tick the box to confirm.",
  NOT_SIGNED_IN: "Sign in to change this.",
  FAILED: "Could not save. Please try again.",
};

export function ProfileSettingsForm(props: { username: string | null; usernameChangedAt: string | null; profilePublic: boolean; adultConfirmed: boolean; leaderboardOptIn: boolean }) {
  const [name, setName] = useState(props.username ?? "");
  const [nameMsg, setNameMsg] = useState("");
  const [isPublic, setIsPublic] = useState(props.profilePublic);
  const [adult, setAdult] = useState(props.adultConfirmed);
  const [visMsg, setVisMsg] = useState("");
  const [lbOn, setLbOn] = useState(props.leaderboardOptIn);
  const [lbMsg, setLbMsg] = useState("");
  const [pending, start] = useTransition();
  const local = name ? checkUsername(name) : "OK";
  const lockedUntil = nextChangeAllowedAt(props.usernameChangedAt);
  const canChange = !props.username || !lockedUntil;

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setNameMsg(USERNAME_COPY.results[await setUsernameAction({ username: name }).catch(() => "FAILED" as const)] ?? USERNAME_COPY.results.FAILED));
        }}
      >
        <h2 className="text-h3 font-semibold text-fg">Username</h2>
        <label htmlFor="username" className="text-body-sm font-medium text-fg">
          Username
        </label>
        <input
          id="username"
          className="focus-ring min-h-12 rounded-control border border-line-control bg-surface px-3 text-body text-fg"
          value={name}
          onChange={(e) => setName(normalizeUsername(e.target.value))}
          maxLength={20}
          autoComplete="off"
          aria-describedby="username-help"
          aria-invalid={local !== "OK" || undefined}
          disabled={!canChange || pending}
        />
        <p id="username-help" className="text-body-sm text-fg-secondary">
          {local === "OK" ? USERNAME_COPY.rules : USERNAME_COPY.results[local]}
          {props.username && lockedUntil && ` You can change it again on ${formatDateShort(lockedUntil)}.`}
        </p>
        <div>
          <Button type="submit" size="lg" className="min-h-12" disabled={!canChange || pending || !name || local !== "OK" || name === props.username}>
            Save username
          </Button>
        </div>
        <p role="status" className="text-body-sm text-fg-secondary">
          {nameMsg}
        </p>
      </form>

      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-6">
        <h2 className="text-h3 font-semibold text-fg">Public profile</h2>
        <p className="text-body text-fg-secondary">Off by default. When on, anyone can see your username and the month you joined — nothing else.</p>
        {!props.adultConfirmed && (
          <label className="flex min-h-12 items-center gap-3 text-body text-fg">
            <input type="checkbox" className="size-5" checked={adult} onChange={(e) => setAdult(e.target.checked)} />I confirm I am 18 or older
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={isPublic ? "secondary" : "primary"}
            size="lg"
            className="min-h-12"
            disabled={pending || (!isPublic && (!props.username || !adult))}
            onClick={() =>
              start(async () => {
                const code = await setProfileVisibilityAction({ public: !isPublic, confirmAdult: adult }).catch(() => "FAILED" as const);
                if (code === "PUBLIC") setIsPublic(true);
                if (code === "PRIVATE") setIsPublic(false);
                setVisMsg(VIS_COPY[code] ?? VIS_COPY.FAILED);
              })
            }
          >
            {isPublic ? "Make my profile private" : "Make my profile public"}
          </Button>
          {isPublic && props.username && (
            <Link href={`/u/${props.username}`} className="focus-ring inline-flex min-h-12 items-center text-body-sm font-medium text-link underline underline-offset-2">
              See my public profile
            </Link>
          )}
        </div>
        <p role="status" className="text-body-sm text-fg-secondary">
          {visMsg}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-6" data-leaderboard-optin="">
        <h2 className="text-h3 font-semibold text-fg">Mock leaderboards</h2>
        <p className="text-body text-fg-secondary">Off by default. When on, your masked name, score, accuracy and time appear on mock leaderboards with at least 30 students. Only for students who are 18 or older.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="lg"
            className="min-h-12"
            disabled={pending || (!lbOn && !props.adultConfirmed && !adult)}
            onClick={() =>
              start(async () => {
                const code = await setLeaderboardOptInAction({ optIn: !lbOn, confirmAdult: !props.adultConfirmed && adult, keepPublic: isPublic }).catch(() => "FAILED" as const);
                if (code === "OPTED_IN") setLbOn(true);
                if (code === "OPTED_OUT") setLbOn(false);
                setLbMsg(LB_COPY[code] ?? LB_COPY.FAILED);
              })
            }
          >
            {lbOn ? "Hide me from leaderboards" : "Show me on leaderboards"}
          </Button>
        </div>
        <p role="status" className="text-body-sm text-fg-secondary">
          {lbMsg}
        </p>
      </div>
    </div>
  );
}
