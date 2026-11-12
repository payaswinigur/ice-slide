# Ice Slide

A puzzle game where a penguin slides across the ice until something stops it. Catch the fish and get home to the igloo. Every map is generated fresh, and every map is guaranteed to be solvable.

## How to play

- **Move:** arrow keys or WASD (swipe on a phone). The penguin keeps sliding until a wall, rock, snow patch, or the igloo stops it.
- **Goals (3 stars per map):** get home, catch all 3 fish, and do both in the fewest possible moves.
- **Modes:** *Maze* (corridors where you slide right past side openings) and *Ice field* (open ice with rocks).
- **Daily map:** one puzzle per day, the same for everyone, with a streak counter. Use Prev and Next to play past days.
- **Keys:** Z undo, R restart, H hint, N new map, Y daily map, ? how to play.
- **Menu (☰):** mode, difficulty, achievements and stats.

## Run it

Open `index.html` in a browser. Or, to serve it locally:

```
npm start
```

## Run the tests

Needs Node 18 or newer.

```
npm test
```

## How it works

| Piece | What it does | Where |
|---|---|---|
| Slide rule | Move in one direction until blocked | `slide()` in `js/core.js` |
| Maze generation | Randomized depth-first search (recursive backtracker), then *braiding* opens some dead ends to add loops | `carveMaze()`, `braid()` |
| Ice field generation | Scatter rocks and snow at random | `generate()` |
| Solver | Breadth-first search over the squares where the penguin can stop | `solve()` |
| Generate and test | Build maps until the solver says the shortest route fits the difficulty's move range | `generate()`, `generateMaze()` |
| Fish placement | Put fish off the shortest route, spread apart, only where catching all 3 is possible | `placeCoins()` |
| Perfect-run target | BFS over *(position, which fish are caught)*, 8× the states of the plain solver | `solveFull()` |
| Daily map | The date is hashed into a seed, so everyone builds the same map | `dailySeed()` in `js/game.js` |

**Why sliding makes mazes interesting:** a normal "perfect" maze always has exactly one route between any two squares. With sliding, you can't stop at junctions, so parts of the maze become unreachable and a maze may have no solution at all. Every map is checked by the solver before you see it.

## Project layout

```
index.html        page structure
css/style.css     styles and color themes
js/core.js        game rules, generators, solvers (no DOM, so it can be tested)
js/game.js        drawing, input, menu and help popup, progress, achievements, daily map
assets/           16×16 pixel sprites and the background pattern
tests/            Node tests for the core logic
```

## Ideas / to do

- [ ] My own penguin and tile art
- [ ] Sound effects
- [ ] Victory animation at the igloo
- [ ] Difficulty analysis across 1,000 maps per mode
