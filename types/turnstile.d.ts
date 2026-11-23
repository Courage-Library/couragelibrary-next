/**
 * AUTH-1 2b-2 (#44 no new dependencies): the minimal subset of the Cloudflare Turnstile client API
 * (https://challenges.cloudflare.com/turnstile/v0/api.js, explicit render) used by components/auth/turnstile-widget.tsx.
 */
interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => boolean | void;
  "timeout-callback"?: () => void;
  "response-field"?: boolean;
  theme?: "auto" | "light" | "dark";
  size?: "normal" | "flexible" | "compact";
  appearance?: "always" | "execute" | "interaction-only";
  /** AUTH-UX-1: interaction-only — the widget is about to show / has finished the visitor interaction */
  "before-interactive-callback"?: () => void;
  "after-interactive-callback"?: () => void;
}

interface TurnstileApi {
  render: (container: HTMLElement | string, options: TurnstileRenderOptions) => string | undefined;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

interface Window {
  turnstile?: TurnstileApi;
}
