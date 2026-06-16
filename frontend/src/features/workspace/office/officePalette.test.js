import test from "node:test";
import assert from "node:assert/strict";

async function loadOfficePalette() {
  try {
    return await import("./officePalette.js");
  } catch {
    assert.fail("office palette module is missing");
  }
}

test("office palette defines the cool-toned room shell colors", async () => {
  const { officePalette } = await loadOfficePalette();

  assert.deepEqual(officePalette.room, {
    canvas: "#f6f8fb",
    wall: "#f4f7fb",
    frame: "#7b8ea3",
    baseboard: "#93a4b7",
    floorTop: "#f8fafc",
    floorBottom: "#eef2f7",
    windowTrim: "#6f8093",
    coreFill: "#ffffff",
    coreFillOpacity: "0.12",
    coreStroke: "#d7e0e8",
    coreStrokeOpacity: "0.28",
  });
});

test("office palette keeps storage, chalkboard, token bar, and lounge colors consistent", async () => {
  const { officePalette } = await loadOfficePalette();

  assert.deepEqual(officePalette.knowledgeCabinet, {
    outer: "#7a8da1",
    inner: "#91a4b7",
    shelf: "#64748b",
    base: "#5b6b7b",
  });

  assert.deepEqual(officePalette.chalkboard, {
    line: "#64748b",
    pin: "#475569",
    frame: "#5f6d7b",
    board: "#294334",
    text: "#f8fafc",
  });

  assert.deepEqual(officePalette.tokenBar, {
    label: "#475569",
    body: "#5b6675",
    panel: "#748294",
    support: "#6a7b8d",
  });

  assert.deepEqual(officePalette.lounge, {
    rugOuter: "#f8fafc",
    rugBorder: "#dbe3ec",
    rugInner: "#eef2f7",
    teaOuter: "#7c6248",
    teaInner: "#9a7858",
    seat: "#cbd5e1",
    seatDark: "#94a3b8",
  });
});

test("office palette softens top wall displays into the same cool UI family", async () => {
  const { officePalette } = await loadOfficePalette();

  assert.deepEqual(officePalette.displays, {
    shell: "#223246",
    shellAlt: "#1b2a3b",
    bezel: "#f8fafc",
    grid: "#556579",
    label: "#a6b4c5",
    success: "#22c55e",
    info: "#38bdf8",
    warning: "#f59e0b",
  });
});

test("office palette defines stronger desk shadows for a more dimensional office grid", async () => {
  const { officePalette } = await loadOfficePalette();

  assert.deepEqual(officePalette.deskShadow, {
    floor: "#8ea0b5",
    floorOpacity: "0.18",
    floorBlur: "18",
    deskDepth: "#c7d2df",
    deskDepthOpacity: "0.65",
  });
});
