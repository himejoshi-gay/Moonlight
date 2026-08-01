import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createJiti } from "jiti";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
process.env.NEXT_PUBLIC_SERVER_DOMAIN = "hime.test";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": projectRoot,
  },
});

const {
  default: fetcher,
  gatariFetcher,
} = await jiti.import("../lib/services/fetcher.ts");

async function captureRequests(callback) {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);

    return Response.json({ data: [{ ranked: 2 }] }, {
      headers: {
        "content-type": "application/json",
      },
      status: 200,
    });
  };

  try {
    await callback(requests);
  }
  finally {
    globalThis.fetch = originalFetch;
  }
}

async function withDocumentCookie(cookie, callback) {
  const originalDocument = globalThis.document;
  globalThis.document = { cookie };

  try {
    await callback();
  }
  finally {
    if (originalDocument === undefined) {
      delete globalThis.document;
    }
    else {
      globalThis.document = originalDocument;
    }
  }
}

test("the first-party fetcher keeps bearer authentication for Hime", async () => {
  await captureRequests(async (requests) => {
    await withDocumentCookie("session_token=hime-test-token", async () => {
      await fetcher("health");
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.hime.test/health");
    assert.equal(
      requests[0].headers.get("authorization"),
      "Bearer hime-test-token",
    );
  });
});

test("the first-party fetcher rejects cross-origin overrides before reading a token", async () => {
  await captureRequests(async (requests) => {
    let cookieReads = 0;
    const originalDocument = globalThis.document;
    globalThis.document = {
      get cookie() {
        cookieReads += 1;
        return "session_token=hime-test-token";
      },
    };

    try {
      await assert.rejects(
        fetcher("beatmaps/get?bb=1", {
          prefixUrl: "https://api.gatari.pw/",
        }),
        /cannot override its API origin/,
      );

      await assert.rejects(
        fetcher("https://api.gatari.pw/beatmaps/get?bb=1"),
        /only accepts Hime API URLs/,
      );
    }
    finally {
      if (originalDocument === undefined) {
        delete globalThis.document;
      }
      else {
        globalThis.document = originalDocument;
      }
    }

    assert.equal(cookieReads, 0);
    assert.equal(requests.length, 0);
  });
});

test("the Gatari client omits Hime authentication and browser credentials", async () => {
  await captureRequests(async (requests) => {
    await gatariFetcher("beatmaps/get?bb=1");

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.gatari.pw/beatmaps/get?bb=1");
    assert.equal(requests[0].headers.get("authorization"), null);
    assert.equal(requests[0].credentials, "omit");
  });
});
