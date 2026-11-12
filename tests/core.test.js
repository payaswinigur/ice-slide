// Run with: npm test   (or: node --test tests/*.test.js)
const test = require("node:test");
const assert = require("node:assert");
const {
  DIFFS, MAZE_DIFFS, WALL, slide, solve, build, slideCells, coinBits, solveFull,
} = require("../js/core.js");

const MODES = ["maze", "ice"];
const SEEDS = Array.from({ length: 25 }, (_, i) => 1000 + i * 7919);

// Replays a list of moves from the start and reports where you end up and which fish you caught.
function replay(map, moves) {
  let [x, y] = map.start, got = 0;
  for (const dir of moves) {
    const r = slideCells(map, x, y, dir);
    got |= coinBits(map, r.cells);
    x = r.x; y = r.y;
  }
  return { x, y, got };
}

test("the same seed always builds the same map", () => {
  for (const mode of MODES) {
    const a = build(mode, "medium", 4242), b = build(mode, "medium", 4242);
    assert.deepStrictEqual(Array.from(a.walls || a.grid), Array.from(b.walls || b.grid));
    assert.deepStrictEqual(a.coins, b.coins);
    assert.deepStrictEqual(a.start, b.start);
  }
});

test("every generated map can be escaped, and par is the true shortest route", () => {
  for (const mode of MODES) for (const diff of Object.keys(DIFFS)) for (const seed of SEEDS) {
    const map = build(mode, diff, seed);
    const route = solve(map, map.start[0], map.start[1]);
    assert.ok(route, `${mode}/${diff}/${seed} has no route home`);
    assert.strictEqual(route.length, map.par);
    const end = replay(map, route);
    assert.deepStrictEqual([end.x, end.y], map.goal);
  }
});

test("all 3 fish can always be caught, and the perfect route really does it", () => {
  for (const mode of MODES) for (const diff of Object.keys(DIFFS)) for (const seed of SEEDS) {
    const map = build(mode, diff, seed);
    assert.strictEqual(map.coins.length, 3);
    const route = solveFull(map, map.start[0], map.start[1], 0);
    assert.ok(route, `${mode}/${diff}/${seed}: fish can't all be caught`);
    assert.strictEqual(route.length, map.coinPar);
    const end = replay(map, route);
    assert.strictEqual(end.got, 0b111, "perfect route missed a fish");
    assert.deepStrictEqual([end.x, end.y], map.goal);
  }
});

test("par lands inside each difficulty's target range", () => {
  for (const diff of Object.keys(DIFFS)) {
    let inRange = 0;
    for (const seed of SEEDS) {
      const m = build("maze", diff, seed);
      if (m.par >= MAZE_DIFFS[diff].lo && m.par <= MAZE_DIFFS[diff].hi) inRange++;
    }
    assert.ok(inRange >= SEEDS.length * 0.9, `only ${inRange}/${SEEDS.length} ${diff} mazes in range`);
  }
});

test("sliding stops at walls, snow, and the igloo", () => {
  // 5x1 corridor: start at x=0, snow at x=2
  const map = { w: 5, h: 1, grid: Uint8Array.from([0, 0, 2, 0, 0]), goal: [4, 0] };
  assert.strictEqual(slide(map, 0, 0, "right").x, 2, "snow should stop the slide");
  assert.strictEqual(slide(map, 2, 0, "right").x, 4, "board edge / igloo should stop the slide");
  // Maze version: a wall on the right side of cell 1 stops you there
  const walls = new Uint8Array(5); walls[1] = WALL.right; walls[2] = WALL.left;
  const maze = { w: 5, h: 1, grid: new Uint8Array(5), walls, goal: [4, 0] };
  assert.strictEqual(slide(maze, 0, 0, "right").x, 1, "wall should stop the slide");
});
