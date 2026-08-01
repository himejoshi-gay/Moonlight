import { getUserToken } from "@/lib/actions/getUserToken";
import { kyInstance } from "@/lib/services/fetcher";
import type { AuthenticatedRequestOptions } from "@/lib/services/firstPartyRequest";
import { prepareAuthenticatedRequest } from "@/lib/services/firstPartyRequest";

async function poster<T>(
  url: string,
  options?: AuthenticatedRequestOptions,
) {
  const request = prepareAuthenticatedRequest(url, options);
  const token = await getUserToken();

  const result = await kyInstance
    .post<T>(request.requestUrl, {
      ...request.options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    .then(async (res) => {
      const contentType = res?.headers?.get("content-type");

      if (!(contentType != null
        && contentType?.indexOf("application/json") !== -1)) {
        return res;
      }

      try {
        return await res.json();
      }
      catch {
        return null;
      }
    });

  if (!result) {
    throw new Error("Unknown error");
  }

  return result as T;
}

export default poster;
