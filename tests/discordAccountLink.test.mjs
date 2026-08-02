import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createJiti } from "jiti";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": projectRoot,
  },
});

const { consumeDiscordLinkCallback } = await jiti.import(
  "../app/(website)/settings/discordLinkCallback.ts",
);
const { parseDiscordAuthorizationUrl } = await jiti.import(
  "../lib/utils/discordOAuth.ts",
);

async function withWindow(windowValue, callback) {
  const originalWindow = globalThis.window;
  globalThis.window = windowValue;

  try {
    await callback();
  }
  finally {
    if (originalWindow === undefined)
      delete globalThis.window;
    else
      globalThis.window = originalWindow;
  }
}

function createFakeWindow(path) {
  const currentUrl = new URL(path, "https://himejoshi.gay");
  const replacements = [];
  const location = {
    pathname: currentUrl.pathname,
    search: currentUrl.search,
    hash: currentUrl.hash,
  };
  const history = {
    state: null,
    replaceState: (...args) => {
      replacements.push(args);
      const nextUrl = new URL(args[2], currentUrl.origin);
      location.pathname = nextUrl.pathname;
      location.search = nextUrl.search;
      location.hash = nextUrl.hash;
    },
  };

  return { history, location, replacements };
}

test("consumes a successful account-link callback once and cleans its result", async () => {
  const fakeWindow = createFakeWindow(
    "/settings?section=account&discord_link=success&source=oauth#preserved",
  );

  await withWindow(fakeWindow, () => {
    assert.deepEqual(consumeDiscordLinkCallback(), { status: "success" });
    assert.equal(consumeDiscordLinkCallback(), null);
  });

  assert.deepEqual(fakeWindow.replacements, [[
    null,
    "",
    "/settings?section=account&source=oauth#preserved",
  ]]);
});

test("maps a Discord uniqueness conflict without exposing callback details", async () => {
  const fakeWindow = createFakeWindow(
    "/settings?section=account&discord_link=discord_account_already_used",
  );

  await withWindow(fakeWindow, () => {
    assert.deepEqual(consumeDiscordLinkCallback(), {
      status: "error",
      error: "alreadyLinked",
    });
  });

  assert.equal(fakeWindow.location.search, "?section=account");
});

test("maps unknown callback errors to a generic failure", async () => {
  const fakeWindow = createFakeWindow(
    "/settings?section=account&discord_link=unexpected_backend_detail",
  );

  await withWindow(fakeWindow, () => {
    assert.deepEqual(consumeDiscordLinkCallback(), {
      status: "error",
      error: "failed",
    });
  });
});

test("maps a stale Hime account callback to an invalid authorization", async () => {
  const fakeWindow = createFakeWindow(
    "/settings?section=account&discord_link=invalid_account",
  );

  await withWindow(fakeWindow, () => {
    assert.deepEqual(consumeDiscordLinkCallback(), {
      status: "error",
      error: "invalid",
    });
  });
});

test("does not consume a Discord result outside the account callback route", async () => {
  const fakeWindow = createFakeWindow(
    "/settings?section=profile&discord_link=success#about",
  );

  await withWindow(fakeWindow, () => {
    assert.equal(consumeDiscordLinkCallback(), null);
  });

  assert.deepEqual(fakeWindow.replacements, []);
});

test("accepts only HTTPS Discord authorization URLs", () => {
  assert.equal(
    parseDiscordAuthorizationUrl("https://discord.com/oauth2/authorize?client_id=123").hostname,
    "discord.com",
  );

  for (const url of [
    "not-a-url",
    "http://discord.com/oauth2/authorize",
    "https://discord.com:444/oauth2/authorize",
    "https://user@discord.com/oauth2/authorize",
    "https://discord.com.evil.example/oauth2/authorize",
    "https://example.com/oauth2/authorize",
  ]) {
    assert.throws(
      () => parseDiscordAuthorizationUrl(url),
      /Unexpected Discord authorization URL/,
    );
  }
});
