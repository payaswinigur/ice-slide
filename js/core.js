// Ice Slide: core game logic.
// Pure functions only (no DOM), so the same code runs in the browser and in the tests.

// ---------- Pure game logic (no DOM) ----------
const ICE = 0, ROCK = 1, SNOW = 2;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_NAMES = Object.keys(DIRS);
const DIFFS = {
  easy:   { w: 9,  h: 9,  lo: 4,  hi: 7,  rock: 0.13, snow: 0.035, key: "E" },
  medium: { w: 12, h: 12, lo: 8,  hi: 12, rock: 0.14, snow: 0.025, key: "M" },
  hard:   { w: 14, h: 14, lo: 13, hi: 22, rock: 0.15, snow: 0.02,  key: "H" },
};

// Maze mode: corridors carved by DFS, then a few dead ends knocked open (braiding)
// so sliding skips junctions and creates real choices.
const MAZE_DIFFS = {
  easy:   { w: 8,  h: 8,  lo: 5,  hi: 9,  braid: 0.25, snow: 0.04 },
  medium: { w: 11, h: 11, lo: 9,  hi: 15, braid: 0.2,  snow: 0.03 },
  hard:   { w: 14, h: 14, lo: 15, hi: 28, braid: 0.15, snow: 0.02 },
};
const WALL = { up: 1, down: 2, right: 4, left: 8 };
const OPP = { up: "down", down: "up", left: "right", right: "left" };

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Slide from (x,y) in direction until a rock or wall blocks the next cell.
// Snow and the exit stop you on the tile you enter.
function slide(map, x, y, dir) {
  const [dx, dy] = DIRS[dir];
  let cx = x, cy = y, dist = 0;
  while (true) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) break;
    if (map.walls ? (map.walls[cy * map.w + cx] & WALL[dir]) : map.grid[ny * map.w + nx] === ROCK) break;
    cx = nx; cy = ny; dist++;
    if (map.grid[cy * map.w + cx] === SNOW) break;
    if (cx === map.goal[0] && cy === map.goal[1]) break;
  }
  return { x: cx, y: cy, dist };
}

// BFS over stopping points. Returns the shortest list of directions, or null.
function solve(map, sx, sy) {
  const start = sy * map.w + sx, goal = map.goal[1] * map.w + map.goal[0];
  if (start === goal) return [];
  const prev = new Map([[start, null]]);
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const x = cur % map.w, y = (cur / map.w) | 0;
    for (const dir of DIR_NAMES) {
      const r = slide(map, x, y, dir);
      if (r.dist === 0) continue;
      const k = r.y * map.w + r.x;
      if (prev.has(k)) continue;
      prev.set(k, [cur, dir]);
      if (k === goal) {
        const path = []; let n = k;
        while (prev.get(n)) { const [p, d] = prev.get(n); path.push(d); n = p; }
        return path.reverse();
      }
      queue.push(k);
    }
  }
  return null;
}

// Generate-and-test: random rocks, keep the first map whose par lands in the target range.
function generate(diffName, seed) {
  const d = DIFFS[diffName], rng = mulberry32(seed);
  const { w, h } = d, n = w * h;
  let best = null, bestScore = Infinity;
  for (let attempt = 0; attempt < 4000; attempt++) {
    const grid = new Uint8Array(n);
    const density = d.rock * (0.8 + rng() * 0.4);
    for (let i = 0; i < n; i++) {
      const r = rng();
      grid[i] = r < density ? ROCK : r < density + d.snow ? SNOW : ICE;
    }
    const gi = Math.floor(rng() * n);
    let si = Math.floor(rng() * n);
    if (si === gi) continue;
    grid[gi] = ICE; grid[si] = ICE;
    const map = { w, h, grid, goal: [gi % w, (gi / w) | 0], start: [si % w, (si / w) | 0] };
    const sol = solve(map, map.start[0], map.start[1]);
    if (!sol || sol.length < 2) continue;
    const L = sol.length;
    if (L >= d.lo && L <= d.hi) {
      const c = placeCoins(map, rng);
      if (c) return { ...map, ...c, par: L, attempts: attempt + 1 };
      continue;
    }
    const score = L < d.lo ? (d.lo - L) * 3 : L - d.hi;
    if (score < bestScore) {
      const c = placeCoins(map, rng);
      if (c) { bestScore = score; best = { ...map, ...c, par: L, attempts: attempt + 1 }; }
    }
  }
  return best;
}

// Randomized DFS (recursive backtracker) with an explicit stack.
function carveMaze(w, h, rng) {
  const n = w * h, walls = new Uint8Array(n).fill(15), seen = new Uint8Array(n);
  const s = Math.floor(rng() * n), stack = [s]; seen[s] = 1;
  while (stack.length) {
    const cur = stack[stack.length - 1], x = cur % w, y = (cur / w) | 0, opts = [];
    for (const dir of DIR_NAMES) {
      const nx = x + DIRS[dir][0], ny = y + DIRS[dir][1];
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny * w + nx]) opts.push(dir);
    }
    if (!opts.length) { stack.pop(); continue; }
    const dir = opts[Math.floor(rng() * opts.length)];
    const nb = (y + DIRS[dir][1]) * w + x + DIRS[dir][0];
    walls[cur] &= ~WALL[dir]; walls[nb] &= ~WALL[OPP[dir]];
    seen[nb] = 1; stack.push(nb);
  }
  return walls;
}

// Braiding: open a random wall on some dead ends, adding loops.
function braid(walls, w, h, p, rng) {
  for (let i = 0; i < w * h; i++) {
    const closed = DIR_NAMES.filter((d) => walls[i] & WALL[d]);
    if (closed.length !== 3 || rng() >= p) continue;
    const x = i % w, y = (i / w) | 0;
    const inside = closed.filter((d) => { const nx = x + DIRS[d][0], ny = y + DIRS[d][1]; return nx >= 0 && ny >= 0 && nx < w && ny < h; });
    if (!inside.length) continue;
    const d = inside[Math.floor(rng() * inside.length)];
    walls[i] &= ~WALL[d]; walls[(y + DIRS[d][1]) * w + x + DIRS[d][0]] &= ~WALL[OPP[d]];
  }
}

function generateMaze(diffName, seed) {
  const d = MAZE_DIFFS[diffName], rng = mulberry32(seed ^ 0x9e3779b9);
  const { w, h } = d, n = w * h;
  let best = null, bestScore = Infinity;
  for (let attempt = 0; attempt < 1500; attempt++) {
    const walls = carveMaze(w, h, rng);
    braid(walls, w, h, d.braid, rng);
    const grid = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (rng() < d.snow) grid[i] = SNOW;
    const gi = Math.floor(rng() * n), si = Math.floor(rng() * n);
    if (si === gi) continue;
    grid[gi] = ICE; grid[si] = ICE;
    const map = { w, h, grid, walls, goal: [gi % w, (gi / w) | 0], start: [si % w, (si / w) | 0] };
    const sol = solve(map, map.start[0], map.start[1]);
    if (!sol || sol.length < 2) continue;
    const L = sol.length;
    if (L >= d.lo && L <= d.hi) {
      const c = placeCoins(map, rng);
      if (c) return { ...map, ...c, par: L, attempts: attempt + 1 };
      continue;
    }
    const score = L < d.lo ? (d.lo - L) * 3 : L - d.hi;
    if (score < bestScore) {
      const c = placeCoins(map, rng);
      if (c) { bestScore = score; best = { ...map, ...c, par: L, attempts: attempt + 1 }; }
    }
  }
  return best;
}

// ---------- Coins ----------
function slideCells(map, x, y, dir) {
  const r = slide(map, x, y, dir), [dx, dy] = DIRS[dir], cells = [];
  for (let i = 1; i <= r.dist; i++) cells.push((y + dy * i) * map.w + x + dx * i);
  return { ...r, cells };
}

function coinBits(map, cells) {
  let m = 0;
  for (const c of cells) { const j = map.coins.indexOf(c); if (j >= 0) m |= 1 << j; }
  return m;
}

// BFS over (stopping point, coins collected). Shortest route that grabs every coin, then exits.
// Reaching the exit ends the map, so an exit landing without all coins is a dead end here.
function solveFull(map, sx, sy, mask0) {
  const all = (1 << map.coins.length) - 1, goal = map.goal[1] * map.w + map.goal[0];
  const startKey = (sy * map.w + sx) * 8 + mask0;
  const prev = new Map([[startKey, null]]), q = [startKey];
  for (let qi = 0; qi < q.length; qi++) {
    const key = q[qi], cell = key >> 3, mask = key & 7, x = cell % map.w, y = (cell / map.w) | 0;
    for (const dir of DIR_NAMES) {
      const r = slideCells(map, x, y, dir);
      if (!r.dist) continue;
      const k2 = r.y * map.w + r.x, m2 = mask | coinBits(map, r.cells), nk = k2 * 8 + m2;
      if (prev.has(nk)) continue;
      prev.set(nk, [key, dir]);
      if (k2 === goal) {
        if (m2 !== all) continue;
        const path = []; let n = nk;
        while (prev.get(n)) { const [pk, d] = prev.get(n); path.push(d); n = pk; }
        return path.reverse();
      }
      q.push(nk);
    }
  }
  return null;
}

// Coins go on cells you can slide over, away from the shortest exit route,
// spread apart, and only in sets where collecting all three is still possible.
function placeCoins(map, rng, count = 3) {
  const startCell = map.start[1] * map.w + map.start[0], goal = map.goal[1] * map.w + map.goal[0];
  const passable = new Set(), seen = new Set([startCell]), q = [startCell];
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi], x = c % map.w, y = (c / map.w) | 0;
    for (const dir of DIR_NAMES) {
      const r = slideCells(map, x, y, dir);
      r.cells.forEach((k) => passable.add(k));
      const k = r.y * map.w + r.x;
      if (r.dist && k !== goal && !seen.has(k)) { seen.add(k); q.push(k); }
    }
  }
  const onRoute = new Set(), route = solve(map, map.start[0], map.start[1]);
  let [x, y] = map.start;
  for (const dir of route) { const r = slideCells(map, x, y, dir); r.cells.forEach((k) => onRoute.add(k)); x = r.x; y = r.y; }
  passable.delete(goal); passable.delete(startCell);
  let cands = [...passable].filter((k) => !onRoute.has(k));
  if (cands.length < count) cands = [...passable];
  if (cands.length < count) return null;
  const far = (a, b) => Math.abs((a % map.w) - (b % map.w)) + Math.abs(((a / map.w) | 0) - ((b / map.w) | 0)) >= 3;
  for (let t = 0; t < 60; t++) {
    const pool = cands.slice(), pick = [];
    while (pick.length < count && pool.length) {
      const k = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      if (pick.every((p) => far(p, k))) pick.push(k);
    }
    if (pick.length < count) continue;
    const full = solveFull({ ...map, coins: pick }, map.start[0], map.start[1], 0);
    // the coin route should cost a real detour, but not double the map
    if (full && full.length >= route.length + 2 && full.length <= route.length * 2 + 3) return { coins: pick, coinPar: full.length };
  }
  return null;
}

function build(mode, diffName, seed) {
  return mode === "maze" ? generateMaze(diffName, seed) : generate(diffName, seed);
}

// Lets Node (the tests) import this file. In the browser these are plain globals.
if (typeof module !== "undefined") {
  module.exports = {
    ICE, ROCK, SNOW, DIRS, DIR_NAMES, DIFFS, MAZE_DIFFS, WALL,
    mulberry32, slide, solve, generate, generateMaze, build,
    slideCells, coinBits, solveFull, placeCoins,
  };
}
