import type { Options } from "ky";

const authenticatedOptionKeys = [
  "body",
  "credentials",
  "json",
  "searchParams",
  "signal",
  "timeout",
] as const satisfies ReadonlyArray<keyof Options>;
const authenticatedOptionKeySet = new Set<string>(authenticatedOptionKeys);

export const firstPartyApiUrl
  = new URL(`https://api.${process.env.NEXT_PUBLIC_SERVER_DOMAIN}/`);

type AuthenticatedOptionKey = (typeof authenticatedOptionKeys)[number];

export type AuthenticatedRequestOptions = Pick<Options, AuthenticatedOptionKey>;

export function prepareAuthenticatedRequest(
  url: string,
  options?: AuthenticatedRequestOptions,
) {
  for (const optionKey of Object.keys(options ?? {})) {
    if (!authenticatedOptionKeySet.has(optionKey)) {
      throw new Error(
        `Authenticated requests do not allow the "${optionKey}" option.`,
      );
    }
  }

  const requestUrl = new URL(url, firstPartyApiUrl);

  if (requestUrl.origin !== firstPartyApiUrl.origin) {
    throw new Error(
      "Authenticated requests only accept Hime API URLs. Use a dedicated external client instead.",
    );
  }

  return {
    options: {
      ...(options?.body === undefined ? {} : { body: options.body }),
      ...(options?.credentials === undefined
        ? {}
        : { credentials: options.credentials }),
      ...(options?.json === undefined ? {} : { json: options.json }),
      ...(options?.searchParams === undefined
        ? {}
        : { searchParams: options.searchParams }),
      ...(options?.signal === undefined ? {} : { signal: options.signal }),
      ...(options?.timeout === undefined ? {} : { timeout: options.timeout }),
    } satisfies AuthenticatedRequestOptions,
    requestUrl,
  };
}
