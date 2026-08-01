import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createJiti } from "jiti";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const registerPagePath = fileURLToPath(
  new URL("../app/(website)/register/page.tsx", import.meta.url),
);
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": projectRoot,
  },
});
const { consumeOAuthCallback } = await jiti.import(
  "../app/(website)/register/registrationVerification.ts",
);

const fakeVerificationToken = "fake_discord_verification_grant_123456";

async function withWindow(windowValue, callback) {
  const originalWindow = globalThis.window;
  globalThis.window = windowValue;

  try {
    await callback();
  }
  finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    }
    else {
      globalThis.window = originalWindow;
    }
  }
}

test("consumes a valid Discord grant when browser history state is null", async () => {
  const replacements = [];

  await withWindow({
    history: {
      state: null,
      replaceState: (...args) => replacements.push(args),
    },
    location: {
      hash: `#discord_verification=${fakeVerificationToken}`,
      pathname: "/register",
      search: "?source=discord",
    },
  }, () => {
    assert.deepEqual(
      consumeOAuthCallback(),
      { token: fakeVerificationToken },
    );
  });

  assert.deepEqual(replacements, [
    [null, "", "/register?source=discord"],
  ]);
});

test("consumes a Discord cancellation without treating it as a grant", async () => {
  const replacements = [];

  await withWindow({
    history: {
      state: { __NA: true },
      replaceState: (...args) => replacements.push(args),
    },
    location: {
      hash: "#discord_error=access_denied",
      pathname: "/register",
      search: "",
    },
  }, () => {
    assert.deepEqual(consumeOAuthCallback(), { error: "cancelled" });
  });

  assert.equal(replacements.length, 1);
  assert.deepEqual(replacements[0][0], { __NA: true });
  assert.equal(replacements[0][2], "/register");
});

test("verified Discord fields avoid FormLabel while form fields keep required contexts", async () => {
  const source = await readFile(registerPagePath, "utf8");
  const sourceFile = ts.createSourceFile(
    registerPagePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const formLabelViolations = [];
  const plainLabelTargets = new Set();
  const inputIds = new Set();
  let formLabelCount = 0;

  function readStringAttribute(node, attributeName) {
    const attribute = node.attributes.properties.find(property =>
      ts.isJsxAttribute(property)
      && property.name.getText(sourceFile) === attributeName,
    );

    if (
      !attribute
      || !ts.isJsxAttribute(attribute)
      || !attribute.initializer
      || !ts.isStringLiteral(attribute.initializer)
    ) {
      return;
    }

    return attribute.initializer.text;
  }

  function getJsxTagName(node) {
    if (ts.isJsxElement(node))
      return node.openingElement.tagName.getText(sourceFile);
    if (ts.isJsxSelfClosingElement(node))
      return node.tagName.getText(sourceFile);
  }

  function hasJsxAncestor(node, tagName) {
    for (let { parent } = node; parent; parent = parent.parent) {
      if (getJsxTagName(parent) === tagName)
        return true;
    }
    return false;
  }

  function visit(node) {
    const tagName = getJsxTagName(node);

    if (tagName === "FormLabel") {
      formLabelCount += 1;
      const missingContexts = ["Form", "FormField", "FormItem"]
        .filter(context => !hasJsxAncestor(node, context));

      if (missingContexts.length > 0) {
        formLabelViolations.push({
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
          missingContexts,
        });
      }
    }

    if (tagName === "Label" && ts.isJsxElement(node)) {
      const htmlFor = readStringAttribute(node.openingElement, "htmlFor");
      if (htmlFor)
        plainLabelTargets.add(htmlFor);
    }

    if (tagName === "Input" && ts.isJsxSelfClosingElement(node)) {
      const id = readStringAttribute(node, "id");
      if (id)
        inputIds.add(id);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  assert.ok(formLabelCount > 0);
  assert.deepEqual(formLabelViolations, []);

  for (const id of ["verified-discord-username", "verified-discord-email"]) {
    assert.equal(plainLabelTargets.has(id), true);
    assert.equal(inputIds.has(id), true);
  }
});
