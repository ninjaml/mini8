import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readLocalFile(relativePath) {
  return fs.readFile(path.join(__dirname, relativePath), "utf8");
}

test("token bar and tea seat keep the shared office hover-anchor structure", async () => {
  const [tokenSource, restSource, stylesSource] = await Promise.all([
    readLocalFile("./components/TokenBarArea.jsx"),
    readLocalFile("./components/RestArea.jsx"),
    readLocalFile("../../../styles.css"),
  ]);

  assert.match(tokenSource, /office-hover-anchor/);
  assert.match(restSource, /office-hover-anchor/);
  assert.match(stylesSource, /\.office-interactive:hover/);
  assert.match(stylesSource, /\.office-hover-anchor:hover/);
});
