/**
 * PAY-1 B5 (owner D8): the ZeptoMail send-mail API client — pure (fetch is injected), no imports, so the offline gate
 * drives this exact code. India data centre: POST https://api.zeptomail.in/v1.1/email.
 *   - the token comes from the server env only (Vercel ZEPTOMAIL_TOKEN) and is never logged or returned
 *   - plain text + HTML in every message; no open / click tracking
 *   - the outcome decides what the caller may do next (owner rule: each e-mail at most once):
 *       SENT    — the API accepted it (2xx with a request id)
 *       FAILED  — the API answered and did not take it (4xx, 503): safe to try again later
 *       UNKNOWN — no clear answer (timeout, network error, another 5xx): it MAY have been sent → never retried
 *   - nothing here logs; the caller logs ids only
 */

export const ZEPTOMAIL_URL = "https://api.zeptomail.in/v1.1/email";
export const SEND_TIMEOUT_MS = 10_000;

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailIdentity {
  from: string;
  fromName: string;
  replyTo: string;
}

export type SendOutcome = { kind: "SENT"; ref: string } | { kind: "FAILED"; code: string } | { kind: "UNKNOWN"; code: string };

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  status: number;
  json(): Promise<unknown>;
}>;

const ADDRESS = /^[^\s@<>()"',;:]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
export const isMailAddress = (a: unknown): a is string => typeof a === "string" && a.length <= 254 && ADDRESS.test(a);

/** The console shows the token as "Zoho-enczapikey <key>"; a bare key gets the prefix. */
export function authHeader(token: string): string {
  const t = token.trim();
  return /^Zoho-enczapikey\s+\S+$/.test(t) ? t : `Zoho-enczapikey ${t}`;
}

export function createZeptoMail(cfg: { token: string; identity: MailIdentity; fetch: FetchLike; timeoutMs?: number }) {
  return {
    async send(m: MailMessage): Promise<SendOutcome> {
      if (!cfg.token || cfg.token.trim().length < 20) return { kind: "FAILED", code: "NO_TOKEN" };
      if (!isMailAddress(m.to) || !isMailAddress(cfg.identity.from) || !isMailAddress(cfg.identity.replyTo)) return { kind: "FAILED", code: "BAD_ADDRESS" };
      if (!m.subject || !m.html || !m.text) return { kind: "FAILED", code: "EMPTY_MESSAGE" };
      const body = JSON.stringify({
        from: { address: cfg.identity.from, name: cfg.identity.fromName },
        to: [{ email_address: { address: m.to } }],
        reply_to: [{ address: cfg.identity.replyTo }],
        subject: m.subject,
        htmlbody: m.html,
        textbody: m.text,
        track_clicks: false,
        track_opens: false,
      });
      let res: { status: number; json(): Promise<unknown> };
      try {
        res = await cfg.fetch(ZEPTOMAIL_URL, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: authHeader(cfg.token) },
          body,
          signal: AbortSignal.timeout(cfg.timeoutMs ?? SEND_TIMEOUT_MS),
        });
      } catch (e) {
        // no answer: the message may or may not have left — never retry it
        const name = e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "";
        return { kind: "UNKNOWN", code: name === "TimeoutError" || name === "AbortError" ? "TIMEOUT" : "NETWORK" };
      }
      if (res.status >= 200 && res.status < 300) {
        const j = (await res.json().catch(() => null)) as { request_id?: unknown } | null;
        const ref = j && typeof j.request_id === "string" ? j.request_id.slice(0, 120) : "";
        return { kind: "SENT", ref: ref || `http_${res.status}` };
      }
      if ((res.status >= 400 && res.status < 500) || res.status === 503) return { kind: "FAILED", code: `HTTP_${res.status}` };
      return { kind: "UNKNOWN", code: `HTTP_${res.status}` };
    },
  };
}

export type MailTransport = ReturnType<typeof createZeptoMail>;
