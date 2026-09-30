# The Godot AI MCP server — what it is and what you can do with it

The `godot_ai` addon runs a **Python MCP server** that bridges an AI client to a **live Godot editor**. It is
how an agent inspects and edits this project: every scene, node, property, script, material and test goes
through it.

Nothing here is guesswork — the tool names and the domain list are read from the installed server package, and
the resources were read live from the running server.

---

## 1. How it is wired in this project

| Piece | Value |
|---|---|
| Plugin | `addons/godot_ai/` — the signed v4.2.3 archive, 313 files, signature verified |
| Server | Python package `godot_ai`, run through `uvx` |
| Attach command | `uvx godot-ai==4.2.3 attach --port 8000 --ws-port 9500` |
| Client registration | DeepSeek Harness, server name **`mcp-godot-ai`** (in `~/.dsh/cordis.patch.yml`) |
| Transport | **stdio** to the client; **WebSocket** to the editor |
| Server version seen live | `Godot AI attach 4.0.5` |

**The editor must be running.** The server *attaches* to a live editor session; close Godot and every tool
fails. That is the first thing to check when calls stop working.

`uv` is required — it installs the Python server. The plugin auto-starts it; there is no manual step.

## 2. Resources — read-only snapshots, 13 of them

These are the cheap way to *look* without acting. Verified live against the running server:

| URI | What it gives you |
|---|---|
| `godot://sessions` | every connected editor session and its metadata |
| `godot://editor/state` | version, project, current scene, readiness, play state |
| `godot://scene/current` | current scene path + root node |
| `godot://scene/hierarchy` | scene tree (capped at 100 nodes — use the tool for pagination) |
| `godot://selection/current` | nodes selected in the editor right now |
| `godot://logs/recent` | last 100 editor console lines |
| `godot://project/info` | project name, Godot version, paths, play state |
| `godot://project/settings` | display / physics / rendering subset |
| `godot://performance` | FPS, memory, draw calls, frame time |
| `godot://materials` | every Material under `res://` |
| `godot://input_map` | input actions and their bindings |
| `godot://test/results` | the **last** `test_run` result without re-running it |
| `godot://custom-tools` | third-party tools registered by other addons |

## 3. Domains — 29, in registration order

The server's own catalogue (`tools/domains.py`) lists these. A client can drop whole domains with
`--exclude-domains` when its tool limit is tight (Antigravity rejects more than 100).

```
session   editor    scene     node      project   script    resource  api
filesystem client   signal    autoload  input_map game      testing   batch
ui        theme    animation material  particle  camera    audio     tilemap
tileset   gridmap  navigation csg      custom
```

Each domain roll-up exposes sub-operations, so one tool like `node_manage` covers rename, reparent, duplicate,
move, delete and groups. The single-verb tools (`node_create`, `script_patch`, `test_run`, …) are the ones used
most.

## 4. What you can actually do — grouped by what the port needs

### Write code that validates itself

- `script_create` / `script_patch` / `script_read` / `script_attach` / `script_detach` / `script_find_symbols`
- **`.gd` is parse-validated on write** and returns diagnostics immediately. This is the single biggest reason
  this port is in GDScript: for **C# the server is text-only** (`diagnostics_status="not_checked"`), so you
  cannot verify your own work.
- `filesystem_manage(op="scan")` — **required after adding a `class_name`**, because global class names only
  register on a scan, and until then no other script can resolve the type.

### Build and edit the world

- `scene_manage` (create / save_as / open / get_roots), `scene_open`, `scene_save`, `scene_get_hierarchy`
- `node_create`, `node_find`, `node_get_properties`, `node_set_property`, `node_manage` (rename, reparent,
  duplicate, move, delete, groups)
- `resource_manage` (create, assign, load, search, inspect, physics shapes, curves, gradients, noise textures,
  environments), `material_manage`, `api_manage` (**ask ClassDB what a class actually has** — never guess a
  property name)
- `ui_manage` (build a `Control` tree from a nested spec, anchors, text, `_draw` recipes), `theme_manage`
- `animation_manage`, `particle_manage`, `camera_manage`, `audio_manage`, `tilemap_manage`, `tileset_manage`,
  `gridmap_manage`, `navigation_manage`, `csg_manage`

### Verify

- `test_run` — discovers `res://tests/test_*.gd` and runs every `test_*` method. `suite="<name>"` for one suite.
  This is the parity gate.
- `test_manage(op="results_get")` — the last result without re-running.
- `logs_read` — editor, plugin or **game** logs. Game logs split by `run_id`, so a previous run is still
  readable after a restart.
- `editor_screenshot` — the viewport, the 2D viewport, a cinematic render through the scene's `Camera3D`, or
  the running game. `viewport` needs 3D content in the scene, so a 2D project wants `viewport_2d`.
- `editor_manage(op="monitors_get")` — FPS, memory, draw calls.

### Drive the running game

- `project_run` / `project_manage(op="stop")`
- `game_manage`: `get_scene_tree`, `get_node_info`, `get_ui_elements`, `suspend`, `resume`, `next_frame`,
  `debug_status`
- `game_manage(op="input_sequence")` — a **frame-timed** action timeline in one call. Use it instead of
  separate input calls whenever timing matters; per-call latency makes hitting a target frame impossible
  otherwise.
- `editor_manage(op="game_eval")` — run GDScript inside the running game and get the value back. This is how a
  rule gets checked against live state rather than by reading code.

### Do several things atomically

- `batch_execute` — a list of sub-commands in order, **rolling back the successful ones if a later one fails**.
  Use it for multi-step edits (create node → set property → attach script) so a failure cannot leave the scene
  half-changed.
- `custom_manage` — list or invoke tools registered by other addons.

## 5. Gotchas that have already bitten

- **No running editor, no tools.** Check `godot://sessions` first when calls fail.
- **`class_name` does not exist until a scan.** `filesystem_manage(op="scan")` after adding one.
- **Do not guess property names.** `Camera3D` uses `fov` and `current`, not `field_of_view`; `Sprite2D` uses
  `texture`, not `image`. Ask `api_manage(op="get_class")`.
- **Some tools cannot run inside `batch_execute`** — `test_run`, `batch_execute` itself, and `input_sequence`.
- **A killed game can settle as `exit code 1`** on Windows without a signal marker. Check
  `editor_state.game_status` rather than the exit code.
- **Screenshots of a backgrounded game are stale** (`stale_frame: true`): focus the window and retry.

## 6. Where to read more

- The plugin's own README: [`addons/godot_ai/README.md`](addons/godot_ai/README.md)
- Upstream documentation and source: [github.com/hi-godot/godot-ai](https://github.com/hi-godot/godot-ai)
- Model Context Protocol: [modelcontextprotocol.io](https://modelcontextprotocol.io/introduction)
