export function parseDiscordAuthorizationUrl(value: string) {
  let authorizationUrl: URL;
  try {
    authorizationUrl = new URL(value);
  }
  catch {
    throw new Error("Unexpected Discord authorization URL");
  }

  if (
    authorizationUrl.origin !== "https://discord.com"
    || authorizationUrl.username !== ""
    || authorizationUrl.password !== ""
  ) {
    throw new Error("Unexpected Discord authorization URL");
  }

  return authorizationUrl;
}
