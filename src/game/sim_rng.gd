@tool
class_name SimRng
extends RefCounted

## Port of `src/game/simRng.ts` — the seeded owner-stream registry.
##
## One seed reproduces one world: every simulation decision draws from a stream
## named after the rule that owns it (`get_sim_rng("moonHowler")`), so streams
## never share a sequence and adding an owner does not shift any other owner's
## draws. Stream positions travel with the world through `snapshot_sim_rng` /
## `restore_sim_rng`.
##
## Deliberate port note: the TypeScript module also installs a seeded override
## over the host's global `Math.random` (`enableSeededGlobalRandom`) so legacy
## callers can be migrated one at a time. Godot has no process-global RNG to
## hijack and no legacy callers to migrate, so that mechanism is intentionally
## absent. `snapshot_sim_rng()["global"]` therefore always reports `null`; the
## save-format key is kept so the snapshot shape still round-trips.
##
## Presentation streams (screen shake, weather particles, sfx) live in a
## separate registry that snapshots never read or write — a restored simulation
## snapshot must not rewind a main-thread visual stream.

const Core := preload("res://src/game/sim_rng_core.gd")


## A single live Mulberry32 stream. The state is held (not closed over) so a
## snapshot can read it and a restore can reset it in place; re-deriving from
## the seed would replay every draw instead of resuming it.
class Stream:
	extends RefCounted

	var state: int = 0

	func _init(initial_state: int) -> void:
		state = initial_state & Core.MASK32

	## Advance one step and return the draw, matching the TypeScript stream body
	## (`s = mulberry32Advance(s); return mulberry32Draw(s)`).
	func next_u32() -> int:
		state = Core.mulberry32_advance(state)
		return Core.mulberry32_draw_u32(state)

	## Advance one step and return the draw as a float in `[0, 1)`.
	func next_float() -> float:
		return float(next_u32()) / Core.TWO_POW_32

	## The draw the CURRENT state would produce, without advancing.
	func peek_u32() -> int:
		return Core.mulberry32_draw_u32(state)


static var _current_seed: int = 1
static var _streams: Dictionary = {}
static var _presentation_streams: Dictionary = {}


## Set the base simulation seed and drop every cached stream, so a new world
## starts each owner fresh.
static func set_sim_seed(seed: int) -> void:
	var masked: int = seed & Core.MASK32
	_current_seed = masked if masked != 0 else 1
	_streams.clear()
	_presentation_streams.clear()


static func get_sim_seed() -> int:
	return _current_seed


## Build an independent stream from an explicit seed and owner salt.
static func create_seeded_stream(seed: int, owner: String) -> Stream:
	return Stream.new(Core.derive_initial_state(seed, owner))


## The simulation stream for `owner`, created lazily on the current seed.
static func get_sim_rng(owner: String) -> Stream:
	if not _streams.has(owner):
		_streams[owner] = create_seeded_stream(_current_seed, owner)
	return _streams[owner]


## A main-thread presentation stream. Never captured or restored by a snapshot.
static func get_presentation_rng(owner: String) -> Stream:
	if not _presentation_streams.has(owner):
		_presentation_streams[owner] = create_seeded_stream(_current_seed, owner)
	return _presentation_streams[owner]


## Stateless context roll: the same `(seed, salt)` always yields the same uint32.
static func seeded_random_u32(seed: int, salt: String) -> int:
	return create_seeded_stream(seed, salt).next_u32()


## Stateless context roll as a float in `[0, 1)`.
static func seeded_random(seed: int, salt: String) -> float:
	return float(seeded_random_u32(seed, salt)) / Core.TWO_POW_32


## Stateless context roll on the active colony seed.
static func seeded_random_for_run(salt: String) -> float:
	return seeded_random(_current_seed, salt)


# ----- sampling helpers (mirrors the TS utility block) -----

static func random_float(rng: Stream, minimum: float, maximum: float) -> float:
	return minimum + rng.next_float() * (maximum - minimum)


## Inclusive integer range, matching `randomInt`'s ceil/floor handling.
static func random_int(rng: Stream, minimum: float, maximum: float) -> int:
	var lo: int = int(ceil(minimum))
	var hi: int = int(floor(maximum))
	if hi < lo:
		return lo
	return int(floor(float(lo) + rng.next_float() * float(hi - lo + 1)))


static func random_choice(rng: Stream, items: Array) -> Variant:
	if items.is_empty():
		return null
	return items[int(floor(rng.next_float() * float(items.size())))]


static func random_bool(rng: Stream, chance: float = 0.5) -> bool:
	return rng.next_float() < chance


# ----- snapshot / restore -----

## Capture every live simulation stream position so a resumed world continues
## its draws. Presentation streams are excluded by design.
##
## `owners` is an Array of `[owner, state]` pairs in stream-creation order, which
## GDScript Dictionary preserves — the same ordering guarantee the TS Map gives,
## so a save file round-trips byte-stably.
static func snapshot_sim_rng() -> Dictionary:
	var owners: Array = []
	for owner: String in _streams:
		owners.append([owner, (_streams[owner] as Stream).state])
	return {"seed": _current_seed, "global": null, "owners": owners}


## Validate an untrusted snapshot (save files) into the shape `restore` accepts.
## Returns an empty Dictionary when the input is malformed.
static func parse_sim_rng_snapshot(value: Variant) -> Dictionary:
	if not value is Dictionary:
		return {}
	var record: Dictionary = value
	if not record.has("seed") or not (record["seed"] is int or record["seed"] is float):
		return {}
	var owners: Array = []
	if record.get("owners") is Array:
		for entry: Variant in record["owners"]:
			if not entry is Array or (entry as Array).size() != 2:
				continue
			var owner: Variant = (entry as Array)[0]
			var state: Variant = (entry as Array)[1]
			if not owner is String:
				continue
			if not (state is int or state is float):
				continue
			owners.append([str(owner), int(state) & Core.MASK32])
	var seed_value: int = int(record["seed"]) & Core.MASK32
	return {"seed": seed_value if seed_value != 0 else 1, "owners": owners}


## Resume streams from a snapshot. Existing streams are reset IN PLACE, owners
## absent from the snapshot are dropped, and owners the snapshot knows but this
## process does not are created and positioned.
static func restore_sim_rng(snapshot: Variant) -> bool:
	var parsed: Dictionary = parse_sim_rng_snapshot(snapshot)
	if parsed.is_empty():
		return false

	_current_seed = int(parsed["seed"])
	var pending: Dictionary = {}
	for pair: Array in parsed["owners"]:
		pending[str(pair[0])] = int(pair[1])

	for owner: String in _streams.keys():
		if not pending.has(owner):
			_streams.erase(owner)
			continue
		(_streams[owner] as Stream).state = int(pending[owner])
		pending.erase(owner)

	for owner: String in pending:
		var stream: Stream = get_sim_rng(owner)
		stream.state = int(pending[owner])

	return true


## Full teardown for tests: reset the seed and clear both registries.
static func reset_sim_rng() -> void:
	_current_seed = 1
	_streams.clear()
	_presentation_streams.clear()
