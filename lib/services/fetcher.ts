import type { HTTPError, Options } from "ky";
import ky from "ky";

import { getUserToken } from "@/lib/actions/getUserToken";
import type { ProblemDetailsResponseType } from "@/lib/types/api";

const firstPartyApiUrl
  = new URL(`https://api.${process.env.NEXT_PUBLIC_SERVER_DOMAIN}/`);
const gatariApiUrl = new URL("https://api.gatari.pw/");

type FirstPartyOptions = Omit<Options, "prefixUrl">;

async function errorInterceptor(error: HTTPError) {
  const { response } = error;
  const contentType = response?.headers?.get("content-type");

  if (
    contentType != null
    && contentType?.indexOf("application/problem+json") !== -1
  ) {
    const data = (await response.json()) as ProblemDetailsResponseType;
    error.message = data.detail ?? data.title ?? "Unknown error";
  }
  else {
    error.message = await response.text();
  }
  return error;
}

export const kyInstance = ky.create({
  prefixUrl: firstPartyApiUrl,
  hooks: {
    beforeError: [errorInterceptor],
  },
});

const gatariKyInstance = ky.create({
  prefixUrl: gatariApiUrl,
  credentials: "omit",
  hooks: {
    beforeError: [errorInterceptor],
  },
});

function assertRequestTarget(
  url: string,
  expectedBaseUrl: URL,
  options?: FirstPartyOptions,
) {
  if (options && "prefixUrl" in options) {
    throw new Error(
      "The first-party fetcher cannot override its API origin. Use a dedicated external client instead.",
    );
  }

  const requestUrl = new URL(url, expectedBaseUrl);

  if (requestUrl.origin !== expectedBaseUrl.origin) {
    throw new Error(
      "The first-party fetcher only accepts Hime API URLs. Use a dedicated external client instead.",
    );
  }

  return requestUrl;
}

async function parseResponse<T>(response: Response) {
  const contentType = response.headers.get("content-type");
  let result: Response | unknown = response;

  if (contentType != null && contentType.includes("application/json")) {
    try {
      result = await response.json();
    }
    catch {
      result = null;
    }
  }

  if (!result) {
    throw new Error("Unknown error");
  }

  return result as T;
}

async function fetcher<T>(url: string, options?: FirstPartyOptions) {
  const requestUrl = assertRequestTarget(url, firstPartyApiUrl, options);
  const token = await getUserToken();

  if (!token && url.includes("user/self")) {
    throw new Error("Unauthorized");
  }

  const response = await kyInstance.get(requestUrl, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  return await parseResponse<T>(response);
}

export async function gatariFetcher<T>(url: string) {
  const requestUrl = assertRequestTarget(url, gatariApiUrl);

  const response = await gatariKyInstance.get(requestUrl);
  return await parseResponse<T>(response);
}

export default fetcher;
