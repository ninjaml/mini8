import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readLocalFile(relativePath) {
  return fs.readFile(path.join(__dirname, relativePath), "utf8");
}

test("office room defines a visible work island around the central desks", async () => {
  const source = await readLocalFile("./OfficeRoom.jsx");
  assert.match(source, /office-work-island/);
});

test("PM desk has a distinct presentation from regular agents", async () => {
  const source = await readLocalFile("./components/OfficeGridArea.jsx");
  assert.match(source, /office-pm-desk/);
});

test("knowledge area reads more like a cabinet than a flat card", async () => {
  const source = await readLocalFile("./components/KnowledgeArea.jsx");
  assert.match(source, /knowledge-cabinet/);
  assert.match(source, /cabinet|drawer|handle|plaque/);
});
