// Ice Slide: UI, drawing, input, progress and the daily map.
// Depends on js/core.js, which is loaded first.

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d"), board = $("board");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const bits = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);

let diff = "medium", mode = "maze";
try {
  const s = localStorage.getItem("iceslide-diff"); if (s && DIFFS[s]) diff = s;
  const m = localStorage.getItem("iceslide-mode"); if (m === "ice" || m === "maze") mode = m;
} catch (e) {}

// ---------- Progress and achievements (saved in this browser) ----------
const ACHIEVEMENTS = [
  { id: "first",     name: "First Steps",     desc: "Get home on your first map.",                      test: (p) => p.escapes >= 1 },
  { id: "coins25",   name: "Snack Time",      desc: "Catch 25 fish.",                           test: (p) => p.coins >= 25 },
  { id: "coins100",  name: "Big Catch",       desc: "Catch 100 fish.",                          test: (p) => p.coins >= 100 },
  { id: "perfect1",  name: "Flawless",        desc: "Earn all 3 stars on a map.",                  test: (p) => p.perfects >= 1 },
  { id: "perfect10", name: "Perfectionist",   desc: "Earn all 3 stars on 10 maps.",                test: (p) => p.perfects >= 10 },
  { id: "streak3",   name: "Hot Streak",      desc: "3 perfect runs in a row.",                    test: (p) => p.bestStreak >= 3 },
  { id: "clean",     name: "Clean Run",       desc: "3 stars with no undo and no hints.",          test: (p) => p.clean >= 1 },
  { id: "hardclean", name: "No Peeking",      desc: "3 stars on Hard with no undo and no hints.",  test: (p) => p.hardClean >= 1 },
  { id: "maze10",    name: "Maze Runner",     desc: "Clear 10 mazes.",                            test: (p) => p.maze >= 10 },
  { id: "ice10",     name: "Ice Skater",      desc: "Clear 10 ice fields.",                       test: (p) => p.ice >= 10 },
  { id: "hard5",     name: "Cold Blooded",    desc: "Clear 5 Hard maps.",                         test: (p) => p.hard >= 5 },
  { id: "daily3",    name: "Regular",         desc: "Clear 3 daily maps.",                         test: (p) => p.dailyClears >= 3 },
  { id: "daily7",    name: "Creature of Habit", desc: "Clear the daily map 7 days in a row.",      test: (p) => p.dailyBestStreak >= 7 },
  { id: "stars30",   name: "Constellation",   desc: "Earn 30 stars across all maps.",              test: (p) => totalStars(p) >= 30 },
];
const freshProgress = () => ({ escapes: 0, coins: 0, perfects: 0, streak: 0, bestStreak: 0, clean: 0, hardClean: 0, maze: 0, ice: 0, hard: 0, best: {}, unlocked: [], dailyClears: 0, dailyStreak: 0, dailyBestStreak: 0, dailyLast: "" });
let progress = freshProgress();
try { const raw = localStorage.getItem("iceslide-progress"); if (raw) progress = { ...freshProgress(), ...JSON.parse(raw) }; } catch (e) {}
function saveProgress() { try { localStorage.setItem("iceslide-progress", JSON.stringify(progress)); } catch (e) {} }
function totalStars(p) { return Object.values(p.best).reduce((a, b) => a + b, 0); }

let state = null;

function codeFor(md, d, seed) { return (md === "maze" ? "Z-" : "I-") + DIFFS[d].key + "-" + seed; }

function freshRun() {
  return { pos: [...state.map.start], got: 0, history: [], moves: 0, won: false, hintDir: null, anim: null, facing: "down", hints: 0, undos: 0, stuck: false };
}

function start(md, d, seed, code, daily) {
  state = { map: build(md, d, seed), code, daily, mode: md, diff: d };
  Object.assign(state, freshRun());
  $("win").hidden = true;
  setStatus("");
  syncUI(); resize();
}

function load(md, d, seed) {
  mode = md; diff = d;
  try { localStorage.setItem("iceslide-diff", d); localStorage.setItem("iceslide-mode", md); } catch (e) {}
  start(md, d, seed, codeFor(md, d, seed), null);
}

function newMap() { load(mode, diff, 10000 + Math.floor(Math.random() * 90000)); }

// ---------- Daily map ----------
// Everyone gets the same puzzle on the same calendar day: the date picks the seed,
// and the mode alternates day to day (maze, then ice field). Always Medium.
const DAILY_DIFF = "medium";
function dateKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function todayKey() { return dateKey(new Date()); }
function yesterdayKey() { const d = new Date(); d.setDate(d.getDate() - 1); return dateKey(d); }
function dailySeed(key) {
  let h = 2166136261;                       // FNV-1a hash of the date string
  for (const ch of "iceslide-daily-" + key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 900000000 + 1000;
}
// Daily #1 was Nov 10, 2026. Counting days in UTC avoids daylight-saving off-by-ones.
const DAILY_EPOCH = "2026-11-10";
function dayIndex(key) { const [y, m, d] = key.split("-").map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 864e5); }
function dailyNumber(key) { return dayIndex(key) - dayIndex(DAILY_EPOCH) + 1; }
function shiftDay(key, days) { const [y, m, d] = key.split("-").map(Number); return dateKey(new Date(y, m - 1, d + days)); }
function dailyMode(key) { return dayIndex(key) % 2 === 0 ? "maze" : "ice"; }

function loadDaily(key = todayKey()) {
  start(dailyMode(key), DAILY_DIFF, dailySeed(key), "daily-" + key, key);
}
function dailyStreakNow() {
  const p = progress;
  return p.dailyLast === todayKey() || p.dailyLast === yesterdayKey() ? p.dailyStreak : 0;
}
function untilMidnight() {
  const now = new Date(), mid = new Date(now); mid.setHours(24, 0, 0, 0);
  const mins = Math.max(1, Math.ceil((mid - now) / 60000));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
const MODE_NAMES = { maze: "Maze", ice: "Ice field" };
const DIFF_NAMES = { easy: "Easy", medium: "Medium", hard: "Hard" };

// Title area ("< Prev · Daily #2 · Nov 11 · Next >") and the daily card in the menu.
function renderDaily() {
  if (!state) return;
  const today = todayKey(), doneToday = progress.dailyLast === today, streak = dailyStreakNow();
  const kind = `${MODE_NAMES[state.mode]} · ${DIFF_NAMES[state.diff]}`;
  if (state.daily) {
    const [y, m, d] = state.daily.split("-").map(Number);
    const date = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    $("mapLabel").textContent = `Daily #${dailyNumber(state.daily)} · ${date}`;
    $("prevDay").classList.remove("invisible");
    $("prevDay").disabled = dailyNumber(state.daily) <= 1;
    $("nextDay").textContent = "Next >";
    $("nextDay").disabled = state.daily >= today;
    $("mapSub").textContent = state.daily === today
      ? `${kind} · ${streak ? `${streak}-day streak` : "clear it to start a streak"}`
      : `${kind} · past daily, doesn't count toward your streak`;
  } else {
    $("mapLabel").textContent = "Random map";
    $("prevDay").classList.add("invisible");
    $("nextDay").textContent = "Daily >";
    $("nextDay").disabled = false;
    $("mapSub").textContent = kind;
  }
  $("dailyDot").hidden = doneToday;
  $("menuDaily").textContent = doneToday
    ? `Cleared today. ${streak}-day streak. A new map arrives in ${untilMidnight()}.`
    : `Not played yet today.${streak ? ` Keep your ${streak}-day streak going!` : ""}`;
}
setInterval(() => state && renderDaily(), 30000);

// Mode and difficulty buttons in the menu show what "New map" will make.
function renderPicks() {
  for (const k of Object.keys(DIFFS)) $("d-" + k).setAttribute("aria-pressed", String(k === diff));
  for (const k of ["ice", "maze"]) $("m-" + k).setAttribute("aria-pressed", String(k === mode));
}

function syncUI() {
  $("moves").textContent = state.moves;
  $("coins").textContent = bits(state.got) + "/3";
  renderPicks();
  renderGoals(); renderDaily();
}

// Live checklist: done, still possible, or out of reach for this run.
function renderGoals() {
  const m = state.map, all = 7, haveAll = state.got === all;
  let coinsOpen = true, perfectOpen = true;
  if (!state.won && !state.anim) {
    const fp = solveFull(m, state.pos[0], state.pos[1], state.got);
    coinsOpen = !!fp;
    perfectOpen = !!fp && state.moves + fp.length <= m.coinPar;
  } else if (state.won) {
    coinsOpen = haveAll; perfectOpen = haveAll && state.moves <= m.coinPar;
  }
  const rows = [
    { done: state.won, open: true, label: "Home", meta: `par ${m.par}`, tip: "Get home to the igloo" },
    { done: state.won && haveAll, open: coinsOpen, label: "3 fish", meta: `${bits(state.got)}/3`, tip: "Catch all 3 fish, then get home" },
    { done: state.won && haveAll && state.moves <= m.coinPar, open: perfectOpen, label: "Perfect", meta: `${state.moves}/${m.coinPar} moves`, tip: `Catch all 3 fish and get home in ${m.coinPar} moves or fewer` },
  ];
  const best = progress.best[state.code] || 0;
  $("bestStars").textContent = best ? "Best " + "★".repeat(best) + "☆".repeat(3 - best) : "";
  $("goalList").innerHTML = rows.map((r) =>
    `<li class="goal${r.done ? " done" : ""}${!r.done && !r.open ? " lost" : ""}" title="${r.tip}"><span class="mark" aria-hidden="true">★</span><span class="gl">${r.label}</span><span class="meta">${r.meta}</span></li>`
  ).join("");
}

function setStatus(t) { $("status").textContent = t; }

// Once you're stuck you stay stuck: if no route home exists from here, none exists from anywhere
// you can slide to next. So we detect it once and keep the message up until undo, restart, or a new map.
const STUCK_MSG = "You're stuck: there's no way home from here. Undo or restart.";

function move(dir) {
  if (!state || state.won || state.anim) return;
  state.facing = dir;
  const [x, y] = state.pos;
  const r = slideCells(state.map, x, y, dir);
  if (r.dist === 0) { draw(); return; }
  state.history.push({ pos: [x, y], got: state.got });
  state.moves++;
  state.hintDir = null;
  if (!state.stuck) setStatus("");
  animate([x, y], [r.x, r.y], r.dist, (cellsPassed) => {
    // pick up coins as the slide passes over them
    state.got |= coinBits(state.map, r.cells.slice(0, cellsPassed));
  }, () => {
    state.pos = [r.x, r.y];
    state.got |= coinBits(state.map, r.cells);
    syncUI();
    if (r.x === state.map.goal[0] && r.y === state.map.goal[1]) win();
    else if (!state.stuck && !solve(state.map, r.x, r.y)) { state.stuck = true; setStatus(STUCK_MSG); }
  });
}

function animate(from, to, dist, onProgress, done) {
  const dur = reduceMotion ? 1 : 60 + dist * 55;
  const t0 = performance.now();
  state.anim = { from, to, t: 0 };
  function step(now) {
    const t = Math.min(1, (now - t0) / dur);
    state.anim.t = 1 - Math.pow(1 - t, 2); // ease-out, like losing speed on ice
    onProgress(Math.floor(state.anim.t * dist + 0.35));
    $("coins").textContent = bits(state.got) + "/3";
    draw();
    if (t < 1) requestAnimationFrame(step);
    else { state.anim = null; done(); draw(); }
  }
  requestAnimationFrame(step);
}

function undo() {
  if (!state || state.anim || !state.history.length) return;
  const h = state.history.pop();
  state.pos = h.pos; state.got = h.got;
  state.moves = Math.max(0, state.moves - 1);
  state.won = false; state.hintDir = null; state.undos++;
  state.stuck = !solve(state.map, state.pos[0], state.pos[1]);   // undo may take you back to safety
  $("win").hidden = true; setStatus(state.stuck ? STUCK_MSG : ""); syncUI(); draw();
}

function restart() {
  if (!state || state.anim) return;
  Object.assign(state, freshRun());
  $("win").hidden = true; setStatus(""); syncUI(); draw();
}

function hint() {
  if (!state || state.won || state.anim) return;
  state.hints++;
  const [x, y] = state.pos;
  const full = solveFull(state.map, x, y, state.got);
  if (full) {
    state.hintDir = full[0];
    setStatus(state.got === 7
      ? `Best next move: ${full[0]}. The igloo is ${full.length} move${full.length > 1 ? "s" : ""} away.`
      : `Best next move: ${full[0]}. A full clear from here takes ${full.length} more moves.`);
  } else {
    const path = solve(state.map, x, y);
    if (!path) { setStatus("No way out from here. Undo or restart."); return; }
    state.hintDir = path[0];
    setStatus(`The remaining fish are out of reach from here. Best move toward the igloo: ${path[0]}.`);
  }
  draw();
}

function win() {
  state.won = true;
  const m = state.map, haveAll = state.got === 7;
  const stars = 1 + (haveAll ? 1 : 0) + (haveAll && state.moves <= m.coinPar ? 1 : 0);
  const clean = stars === 3 && state.hints === 0 && state.undos === 0;

  const p = progress, prevBest = p.best[state.code] || 0;
  p.escapes++; p[state.mode]++; if (state.diff === "hard") p.hard++;
  let dailyFirst = false;
  if (state.daily === todayKey() && p.dailyLast !== state.daily) {   // first clear of today's map
    dailyFirst = true;
    p.dailyStreak = p.dailyLast === yesterdayKey() ? p.dailyStreak + 1 : 1;
    p.dailyBestStreak = Math.max(p.dailyBestStreak, p.dailyStreak);
    p.dailyLast = state.daily; p.dailyClears++;
  }
  p.coins += bits(state.got);
  if (stars === 3) { p.perfects++; p.streak++; } else p.streak = 0;
  p.bestStreak = Math.max(p.bestStreak, p.streak);
  if (clean) { p.clean++; if (state.diff === "hard") p.hardClean++; }
  p.best[state.code] = Math.max(prevBest, stars);
  const fresh = ACHIEVEMENTS.filter((a) => !p.unlocked.includes(a.id) && a.test(p));
  fresh.forEach((a) => p.unlocked.push(a.id));
  saveProgress();

  $("winTitle").textContent = ["", "Home!", "Full belly!", "Perfect!"][stars];
  $("stars").innerHTML = "★".repeat(stars) + `<span class="off">${"★".repeat(3 - stars)}</span>`;
  $("winText").textContent =
    stars === 3 ? `All fish in ${state.moves} moves${clean ? ", no undo or hints" : ""}.`
    : stars === 2 ? `All fish in ${state.moves} moves. Perfect is ${m.coinPar}.`
    : `${bits(state.got)} of 3 fish. Replay to catch them all.`;
  if (state.daily === todayKey()) $("winText").textContent += dailyFirst
    ? ` Daily cleared: ${p.dailyStreak}-day streak.`
    : " Come back tomorrow for a new daily map.";
  $("next").textContent = state.daily ? "Random map" : "Next map";
  $("winAch").textContent = fresh.length ? "Unlocked: " + fresh.map((a) => a.name).join(", ") : "";
  $("winAch").hidden = !fresh.length;
  $("win").hidden = false;
  renderGoals(); renderAchievements(); renderDaily(); renderBadge();
  fresh.forEach((a, i) => setTimeout(() => toast(`Achievement unlocked: ${a.name}`), 400 + i * 2600));
  $("next").focus({ preventScroll: true });
}

function renderAchievements() {
  const u = progress.unlocked;
  $("achCount").textContent = `${u.length}/${ACHIEVEMENTS.length}`;
  $("starTotal").textContent = totalStars(progress);
  $("achGrid").innerHTML = ACHIEVEMENTS.map((a) =>
    `<li class="ach-item${u.includes(a.id) ? " got" : ""}"><span class="ach-name">${a.name}</span><span class="ach-desc">${a.desc}</span></li>`
  ).join("");
  const p = progress;
  $("stats").innerHTML = [
    ["Maps cleared", p.escapes], ["Fish caught", p.coins], ["Perfect runs", p.perfects],
    ["Daily maps cleared", p.dailyClears], ["Best daily streak", p.dailyBestStreak],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

// Red number on the menu button: achievements unlocked since you last opened the menu.
function seenCount() { try { return Number(localStorage.getItem("iceslide-ach-seen")) || 0; } catch (e) { return 0; } }
function renderBadge() {
  const n = Math.max(0, progress.unlocked.length - seenCount());
  $("menuBadge").hidden = n === 0;
  $("menuBadge").textContent = n;
}
function markAchievementsSeen() {
  try { localStorage.setItem("iceslide-ach-seen", String(progress.unlocked.length)); } catch (e) {}
  renderBadge();
}

// ---------- Menu (sidebar) and How to play (popup) ----------
const menu = $("menu"), help = $("help");
function menuOpen() { return menu.classList.contains("open"); }
function openMenu() {
  menu.classList.add("open");
  menu.inert = false;                      // inert = can't be clicked or tabbed into while closed
  $("scrim").hidden = false;
  $("menuBtn").setAttribute("aria-expanded", "true");
  markAchievementsSeen();
  $("menuClose").focus();
}
function closeMenu() {
  if (!menuOpen()) return;
  menu.classList.remove("open");
  menu.inert = true;
  $("scrim").hidden = true;
  $("menuBtn").setAttribute("aria-expanded", "false");
  $("menuBtn").focus();
}
function openHelp() { closeMenu(); if (!help.open) help.showModal(); }

let toastTimer = null;
function toast(text) {
  const t = $("toast");
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}

// ---------- Drawing ----------
function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function resize() {
  if (!state) return;
  const { w, h } = state.map;
  const cssW = board.clientWidth - 6 || 300;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssW * (h / w) * dpr);
  draw();
}

function hash(x, y) { let t = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; }

// ---------- Sprites ----------
// 16x16 pixel-art PNGs in assets/. A "sheet" holds several frames side by side,
// so frame 0 is pixels 0-15, frame 1 is pixels 16-31, and so on.
const SPRITE_SIZE = 16;
const SPRITES = {};
for (const name of ["penguin", "fish", "igloo", "ice", "snow", "rock"]) {
  const img = new Image();
  img.onload = () => draw();          // redraw once each image arrives
  img.src = `assets/${name}.png`;
  SPRITES[name] = img;
}
// Which frame of penguin.png to use for each direction (left reuses the side frame, flipped).
const PENGUIN_FRAME = { down: 0, up: 1, right: 2, left: 2 };

// Draws one frame of a sprite as a size x size square at (x, y). flip mirrors it left-right.
function drawSprite(name, frame, x, y, size, flip = false) {
  const img = SPRITES[name];
  if (!img.complete || !img.naturalWidth) return;   // not loaded yet; onload will redraw
  ctx.save();
  if (flip) { ctx.translate(x + size, y); ctx.scale(-1, 1); x = 0; y = 0; }
  ctx.drawImage(img, frame * SPRITE_SIZE, 0, SPRITE_SIZE, SPRITE_SIZE, x, y, size, size);
  ctx.restore();
}

function draw() {
  if (!state) return;
  const { map } = state, C = cv.width / map.w;
  const col = { ice: css("--ice"), rock: css("--rock"), goal: css("--goal"), player: css("--player") };
  // Grid square (x, y) starts at pixel round(x * C). Rounding keeps tiles from leaving thin seams.
  const at = (n) => Math.round(n * C);
  const cell = (n) => at(n + 1) - at(n);
  ctx.imageSmoothingEnabled = false;  // keep pixel art crisp instead of blurry when scaled up

  ctx.fillStyle = col.ice; ctx.fillRect(0, 0, cv.width, cv.height);

  // floor: snow, or one of 3 ice variations picked by position so the pattern doesn't repeat
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const t = map.grid[y * map.w + x];
    if (t === SNOW) drawSprite("snow", 0, at(x), at(y), cell(x));
    else drawSprite("ice", Math.floor(hash(x, y) * 3), at(x), at(y), cell(x));
  }

  // exit: the penguin's igloo
  drawSprite("igloo", 0, at(map.goal[0]), at(map.goal[1]), cell(map.goal[0]));

  // start marker
  const [sx, sy] = map.start;
  ctx.strokeStyle = col.player; ctx.globalAlpha = 0.35; ctx.lineWidth = Math.max(1.5, C * 0.06);
  ctx.setLineDash([C * 0.12, C * 0.1]);
  ctx.strokeRect(sx * C + C * 0.15, sy * C + C * 0.15, C * 0.7, C * 0.7);
  ctx.setLineDash([]); ctx.globalAlpha = 1;

  // rocks
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (map.grid[y * map.w + x] === ROCK) drawSprite("rock", 0, at(x), at(y), cell(x));
  }

  // maze walls (still drawn with lines, since they sit on the edges between squares)
  if (map.walls) {
    ctx.strokeStyle = col.rock; ctx.lineCap = "round";
    ctx.lineWidth = Math.max(3, C * 0.16);
    ctx.beginPath();
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const wv = map.walls[y * map.w + x], px = x * C, py = y * C;
      if (wv & WALL.up)    { ctx.moveTo(px, py); ctx.lineTo(px + C, py); }
      if (wv & WALL.left)  { ctx.moveTo(px, py); ctx.lineTo(px, py + C); }
      if (y === map.h - 1 && (wv & WALL.down))  { ctx.moveTo(px, py + C); ctx.lineTo(px + C, py + C); }
      if (x === map.w - 1 && (wv & WALL.right)) { ctx.moveTo(px + C, py); ctx.lineTo(px + C, py + C); }
    }
    ctx.stroke();
  }

  // fish to collect (each one faces left or right, picked by position)
  map.coins.forEach((c, j) => {
    if (state.got & (1 << j)) return;
    const x = c % map.w, y = (c / map.w) | 0;
    drawSprite("fish", 0, at(x), at(y), cell(x), hash(x + 3, y + 11) > 0.5);
  });

  // player position (interpolated while sliding)
  let fx = state.pos[0], fy = state.pos[1];
  if (state.anim) {
    const { from, to, t } = state.anim;
    fx = from[0] + (to[0] - from[0]) * t; fy = from[1] + (to[1] - from[1]) * t;
  }
  const pcx = fx * C + C / 2, pcy = fy * C + C / 2, pr = C * 0.32;

  // hint arrow
  if (state.hintDir && !state.anim) {
    const [dx, dy] = DIRS[state.hintDir];
    const end = slide(map, state.pos[0], state.pos[1], state.hintDir);
    ctx.strokeStyle = col.goal; ctx.lineWidth = Math.max(2, C * 0.12); ctx.lineCap = "round";
    ctx.setLineDash([C * 0.15, C * 0.18]);
    ctx.beginPath(); ctx.moveTo(pcx + dx * pr * 1.3, pcy + dy * pr * 1.3); ctx.lineTo(end.x * C + C / 2, end.y * C + C / 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // penguin: pick the frame for the direction it's facing; flip the side frame for left
  drawSprite("penguin", PENGUIN_FRAME[state.facing], at(fx), at(fy), cell(0), state.facing === "left");
}

// ---------- Input ----------
const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.metaKey || e.ctrlKey || e.altKey) return;
  if (help.open) return;                                   // the popup handles its own keys (Esc closes it)
  if (menuOpen()) { if (e.key === "Escape") closeMenu(); return; }
  if (e.key === "?") { openHelp(); return; }
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (KEYS[k]) { e.preventDefault(); move(KEYS[k]); }
  else if (k === "z" || k === "u") undo();
  else if (k === "r") restart();
  else if (k === "n") newMap();
  else if (k === "h") hint();
  else if (k === "y") loadDaily();
});

let touch = null;
board.addEventListener("pointerdown", (e) => { touch = [e.clientX, e.clientY]; });
board.addEventListener("pointerup", (e) => {
  if (!touch) return;
  const dx = e.clientX - touch[0], dy = e.clientY - touch[1]; touch = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
});

document.querySelectorAll(".pad button").forEach((b) => b.addEventListener("click", () => move(b.dataset.dir)));
// Mode / difficulty buttons only pick; "Start new map" (or New map) builds it.
document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
  if (b.dataset.diff) diff = b.dataset.diff;
  if (b.dataset.mode) mode = b.dataset.mode;
  renderPicks();
}));
$("newMap").onclick = newMap;
$("next").onclick = newMap;
$("menuNewMap").onclick = () => { closeMenu(); newMap(); };
$("dailyBtn").onclick = () => { closeMenu(); loadDaily(); };
$("prevDay").onclick = () => { if (state.daily) loadDaily(shiftDay(state.daily, -1)); };
$("nextDay").onclick = () => { state.daily ? loadDaily(shiftDay(state.daily, 1)) : loadDaily(); };
$("menuBtn").onclick = () => (menuOpen() ? closeMenu() : openMenu());
$("menuClose").onclick = closeMenu;
$("scrim").onclick = closeMenu;
$("helpBtn").onclick = openHelp;
$("helpClose").onclick = () => help.close();
$("helpGo").onclick = () => help.close();
help.addEventListener("click", (e) => { if (e.target === help) help.close(); });  // click the dimmed backdrop to close
$("replay").onclick = restart;
$("undo").onclick = undo;
$("restart").onclick = restart;
$("hint").onclick = hint;
$("resetProgress").addEventListener("click", () => {
  const b = $("resetProgress");
  if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Click again to erase all progress"; return; }
  progress = freshProgress(); saveProgress();
  b.dataset.armed = ""; b.textContent = "Reset progress";
  try { localStorage.setItem("iceslide-ach-seen", "0"); } catch (e) {}
  renderAchievements(); renderGoals(); renderDaily(); renderBadge(); toast("Progress reset");
});

window.addEventListener("resize", resize);
if (document.fonts) document.fonts.ready.then(resize);

renderAchievements(); renderBadge();
if (progress.dailyLast !== todayKey()) loadDaily(); else newMap();
// Show the rules automatically the first time someone opens the game.
try { if (!localStorage.getItem("iceslide-seen-help")) { openHelp(); localStorage.setItem("iceslide-seen-help", "1"); } } catch (e) {}
