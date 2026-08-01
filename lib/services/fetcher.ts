import type { HTTPError } from "ky";
import ky from "ky";

import { getUserToken } from "@/lib/actions/getUserToken";
import type { AuthenticatedRequestOptions } from "@/lib/services/firstPartyRequest";
import {
  firstPartyApiUrl,
  prepareAuthenticatedRequest,
} from "@/lib/services/firstPartyRequest";
import type { ProblemDetailsResponseType } from "@/lib/types/api";

const gatariApiUrl = new URL("https://api.gatari.pw/");

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

function resolveGatariTarget(url: string) {
  const requestUrl = new URL(url, gatariApiUrl);

  if (requestUrl.origin !== gatariApiUrl.origin) {
    throw new Error(
      "The Gatari fetcher only accepts Gatari API URLs.",
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

async function fetcher<T>(
  url: string,
  options?: AuthenticatedRequestOptions,
) {
  const request = prepareAuthenticatedRequest(url, options);
  const token = await getUserToken();

  if (!token && url.includes("user/self")) {
    throw new Error("Unauthorized");
  }

  const response = await kyInstance.get(request.requestUrl, {
    ...request.options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  return await parseResponse<T>(response);
}

export async function gatariFetcher<T>(url: string) {
  const requestUrl = resolveGatariTarget(url);

  const response = await gatariKyInstance.get(requestUrl);
  return await parseResponse<T>(response);
}

export default fetcher;
