export type DiscordLinkCallbackError
  = | "cancelled"
    | "invalid"
    | "unverifiedEmail"
    | "unsupportedEmailProvider"
    | "ineligible"
    | "alreadyLinked"
    | "rateLimited"
    | "unavailable"
    | "failed";

export type DiscordLinkCallbackResult
  = | { status: "success" }
    | { status: "error"; error: DiscordLinkCallbackError };

const CALLBACK_ERROR_CODES: Record<string, DiscordLinkCallbackError> = {
  access_denied: "cancelled",
  authorization_denied: "cancelled",
  cancelled: "cancelled",
  invalid_request: "invalid",
  invalid_response: "invalid",
  invalid_state: "invalid",
  invalid_account: "invalid",
  unverified_email: "unverifiedEmail",
  discord_email_unverified: "unverifiedEmail",
  account_not_verified: "unverifiedEmail",
  unsupported_email_provider: "unsupportedEmailProvider",
  ineligible_account: "ineligible",
  account_ineligible: "ineligible",
  discord_account_too_new: "ineligible",
  invalid_discord_account: "ineligible",
  already_linked: "alreadyLinked",
  discord_account_already_used: "alreadyLinked",
  rate_limited: "rateLimited",
  discord_unavailable: "unavailable",
  temporarily_unavailable: "unavailable",
  missing_scope: "failed",
  oauth_failed: "failed",
};

export function consumeDiscordLinkCallback(): DiscordLinkCallbackResult | null {
  const params = new URLSearchParams(window.location.search);
  const callbackValue = params.get("discord_link");

  if (params.get("section") !== "account" || callbackValue === null)
    return null;

  params.delete("discord_link");
  const cleanSearch = params.toString();

  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ""}${window.location.hash}`,
  );

  if (callbackValue === "success")
    return { status: "success" };

  return {
    status: "error",
    error: CALLBACK_ERROR_CODES[callbackValue] ?? "failed",
  };
}
