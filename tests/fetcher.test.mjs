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
const { default: poster } = await jiti.import("../lib/services/poster.ts");

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

test("the first-party poster preserves safe JSON and credential options", async () => {
  await captureRequests(async (requests) => {
    await withDocumentCookie("session_token=hime-test-token", async () => {
      await poster("user/edit/metadata", {
        credentials: "include",
        json: { country: "RO" },
      });
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.hime.test/user/edit/metadata");
    assert.equal(requests[0].method, "POST");
    assert.equal(
      requests[0].headers.get("authorization"),
      "Bearer hime-test-token",
    );
    assert.equal(requests[0].credentials, "include");
    assert.deepEqual(await requests[0].json(), { country: "RO" });
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
        /do not allow the "prefixUrl" option/,
      );

      await assert.rejects(
        fetcher("https://api.gatari.pw/beatmaps/get?bb=1"),
        /only accept Hime API URLs/,
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

test("the first-party poster rejects cross-origin overrides before reading a token", async () => {
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
        poster("auth/token", {
          json: { username: "test" },
          prefixUrl: "https://api.gatari.pw/",
        }),
        /do not allow the "prefixUrl" option/,
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

test("authenticated requests reject request hooks and custom fetch before token access", async () => {
  await captureRequests(async (requests) => {
    let cookieReads = 0;
    let customFetchCalls = 0;
    const originalDocument = globalThis.document;
    globalThis.document = {
      get cookie() {
        cookieReads += 1;
        return "session_token=hime-test-token";
      },
    };

    try {
      await assert.rejects(
        fetcher("health", {
          hooks: {
            beforeRequest: [
              () => new Request("https://api.gatari.pw/beatmaps/get?bb=1"),
            ],
          },
        }),
        /do not allow the "hooks" option/,
      );

      await assert.rejects(
        fetcher("health", {
          fetch: async () => {
            customFetchCalls += 1;
            return Response.json({ ok: true });
          },
        }),
        /do not allow the "fetch" option/,
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
    assert.equal(customFetchCalls, 0);
    assert.equal(requests.length, 0);
  });
});

test("the Gatari client omits Hime authentication and browser credentials", async () => {
  await captureRequests(async (requests) => {
    await withDocumentCookie("session_token=hime-test-token", async () => {
      await gatariFetcher("beatmaps/get?bb=1");
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.gatari.pw/beatmaps/get?bb=1");
    assert.equal(requests[0].headers.get("authorization"), null);
    assert.equal(requests[0].credentials, "omit");
  });
});
