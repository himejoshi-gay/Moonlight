const VERIFICATION_STORAGE_KEY = "hime.registration.discord-verification.v1";
const VERIFICATION_TOKEN_PATTERN = /^[\w-]{32,128}$/;

export type VerificationPhase
  = | "initializing"
    | "unverified"
    | "validating"
    | "verified"
    | "error";

export type VerificationError
  = | "cancelled"
    | "invalid"
    | "unverifiedEmail"
    | "unsupportedEmailProvider"
    | "ineligible"
    | "alreadyLinked"
    | "rateLimited"
    | "unavailable"
    | "unsupportedBrowser"
    | "expired"
    | "failed";

interface StoredVerification {
  token: string;
  expiresAt?: number;
}

interface OAuthCallbackResult {
  token?: string;
  error?: VerificationError;
}

const OAUTH_ERROR_CODES: Record<string, VerificationError> = {
  access_denied: "cancelled",
  authorization_denied: "cancelled",
  cancelled: "cancelled",
  invalid_request: "invalid",
  invalid_response: "invalid",
  invalid_state: "invalid",
  invalid_token_type: "invalid",
  unverified_email: "unverifiedEmail",
  discord_email_unverified: "unverifiedEmail",
  account_not_verified: "unverifiedEmail",
  unsupported_email_provider: "unsupportedEmailProvider",
  ineligible_account: "ineligible",
  account_ineligible: "ineligible",
  discord_account_too_new: "ineligible",
  invalid_discord_account: "ineligible",
  invalid_discord_email: "ineligible",
  already_linked: "alreadyLinked",
  discord_account_already_used: "alreadyLinked",
  rate_limited: "rateLimited",
  discord_unavailable: "unavailable",
  temporarily_unavailable: "unavailable",
  missing_scope: "failed",
  oauth_failed: "failed",
};

export function clearStoredVerification() {
  try {
    window.sessionStorage.removeItem(VERIFICATION_STORAGE_KEY);
  }
  catch {
    // The in-memory proof is still cleared when storage is unavailable.
  }
}

export function storeVerification(verification: StoredVerification) {
  try {
    window.sessionStorage.setItem(
      VERIFICATION_STORAGE_KEY,
      JSON.stringify(verification),
    );
  }
  catch {
    // Session storage is a convenience for reloads, not a security boundary.
  }
}

export function readStoredVerification(): StoredVerification | null {
  try {
    const stored = window.sessionStorage.getItem(VERIFICATION_STORAGE_KEY);
    if (!stored)
      return null;

    const parsed = JSON.parse(stored) as Partial<StoredVerification>;
    if (
      typeof parsed.token !== "string"
      || !VERIFICATION_TOKEN_PATTERN.test(parsed.token)
      || (typeof parsed.expiresAt === "number" && parsed.expiresAt <= Date.now())
    ) {
      clearStoredVerification();
      return null;
    }

    return {
      token: parsed.token,
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : undefined,
    };
  }
  catch {
    clearStoredVerification();
    return null;
  }
}

export function consumeOAuthCallback(): OAuthCallbackResult {
  const { hash } = window.location;
  if (!hash)
    return {};

  const params = new URLSearchParams(hash.slice(1));
  const token = params.get("discord_verification");
  const errorCode = params.get("discord_error");

  if (!token && !errorCode)
    return {};

  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );

  if (errorCode) {
    return {
      error: OAUTH_ERROR_CODES[errorCode] ?? "failed",
    };
  }

  if (!token || !VERIFICATION_TOKEN_PATTERN.test(token)) {
    return { error: "invalid" };
  }

  return { token };
}

export function getHttpStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("response" in error))
    return;

  const { response } = error as { response?: { status?: number } };
  return response?.status;
}

export function getRegistrationErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error))
    return fallback;

  const message = error.message.trim();
  return message && message !== "Unknown error" ? message : fallback;
}

export function getVerificationErrorForStatus(
  status: number | undefined,
): VerificationError {
  if (status === 401 || status === 410)
    return "expired";
  if (status === 409)
    return "alreadyLinked";
  if (status === 429)
    return "rateLimited";

  return "failed";
}
