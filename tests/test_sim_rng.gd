@tool
extends McpTestSuite

## PARITY GATE for the TypeScript -> GDScript port.
##
## Proves the GDScript 32-bit RNG core reproduces `src/game/simRng.ts`
## bit-for-bit, using golden values generated from the real TypeScript
## implementation by `tmp/dump-sim-rng.mts`.
##
## Why this suite gates everything: the TypeScript simulation is deterministic
## and seeded, so a faithful port must reproduce it exactly. If a single RNG
## draw diverges here, every downstream golden-master diff becomes noise and
## hundreds of "logic bugs" appear that are really this one divergence.
##
## Godot's JSON parser returns every number as a float, so all golden values are
## cast through int() to compare as exact uint32 integers.

const GOLDEN_PATH := "res://tests/fixtures/sim_rng_golden.json"

var _golden: Dictionary = {}


func suite_name() -> String:
	return "sim_rng"


func suite_setup(_ctx: Dictionary) -> void:
	var text := FileAccess.get_file_as_string(GOLDEN_PATH)
	if text.is_empty():
		fail_setup("Cannot read golden fixture at %s" % GOLDEN_PATH)
		return
	var parsed: Variant = JSON.parse_string(text)
	if not parsed is Dictionary:
		fail_setup("Golden fixture is not a JSON object: %s" % GOLDEN_PATH)
		return
	_golden = parsed


func setup() -> void:
	SimRng.reset_sim_rng()


func teardown() -> void:
	SimRng.reset_sim_rng()


## Compare a generated uint32 series against the golden one. Reports the first
## diverging index rather than a useless "arrays differ".
func _assert_u32_series(actual: Array, expected: Array, label: String) -> void:
	assert_eq(actual.size(), expected.size(), "%s: series length" % label)
	for i: int in mini(actual.size(), expected.size()):
		var got: int = int(actual[i])
		var want: int = int(expected[i])
		assert_eq(got, want, "%s: first divergence at index %d" % [label, i])
		if got != want:
			return


func test_hash_salt_matches() -> void:
	var table: Dictionary = _golden.get("hashSalt", {})
	assert_gt(table.size(), 0, "golden hashSalt table is empty")
	for owner: Variant in table:
		assert_eq(
			SimRngCore.hash_salt(str(owner)),
			int(table[owner]),
			"hash_salt(%s)" % str(owner)
		)


func test_mulberry32_advance_matches() -> void:
	var cases: Array = _golden.get("mulberry32Advance", [])
	assert_gt(cases.size(), 0, "golden advance table is empty")
	for raw: Variant in cases:
		var entry: Dictionary = raw
		var start: int = int(entry["start"])
		var expected: Array = entry["states"]
		var actual: Array = []
		var s: int = start
		for _i: int in expected.size():
			s = SimRngCore.mulberry32_advance(s)
			actual.append(s)
		_assert_u32_series(actual, expected, "advance(start=%d)" % start)


func test_owner_streams_match() -> void:
	var table: Dictionary = _golden.get("streams", {})
	assert_gt(table.size(), 0, "golden stream table is empty")
	for key: Variant in table:
		var parts: PackedStringArray = str(key).split("|")
		var seed: int = int(parts[0])
		var owner: String = parts[1]
		var expected: Array = table[key]
		var stream := SimRng.create_seeded_stream(seed, owner)
		var actual: Array = []
		for _i: int in expected.size():
			actual.append(stream.next_u32())
		_assert_u32_series(actual, expected, "stream(%d, %s)" % [seed, owner])


func test_stateless_rolls_match() -> void:
	var table: Dictionary = _golden.get("seededRandom", {})
	assert_gt(table.size(), 0, "golden seededRandom table is empty")
	for key: Variant in table:
		var parts: PackedStringArray = str(key).split("|")
		assert_eq(
			SimRng.seeded_random_u32(int(parts[0]), parts[1]),
			int(table[key]),
			"seeded_random(%s)" % str(key)
		)


func test_stream_is_reproducible() -> void:
	var first := SimRng.create_seeded_stream(12345, "worldGen")
	var a: int = first.next_u32()
	SimRng.reset_sim_rng()
	var second := SimRng.create_seeded_stream(12345, "worldGen")
	assert_eq(second.next_u32(), a, "same seed+owner must reproduce the same first draw")


func test_owner_streams_are_independent() -> void:
	var a := SimRng.create_seeded_stream(12345, "worldGen")
	var b := SimRng.create_seeded_stream(12345, "moonHowler")
	assert_ne(a.next_u32(), b.next_u32(), "different owners must not share a sequence")


func test_registry_returns_one_live_stream() -> void:
	SimRng.set_sim_seed(4242)
	var first := SimRng.get_sim_rng("worldGen")
	first.next_u32()
	var again := SimRng.get_sim_rng("worldGen")
	assert_true(again == first, "get_sim_rng must return the same live stream instance")


func test_presentation_registry_is_separate() -> void:
	SimRng.set_sim_seed(99)
	var sim := SimRng.get_sim_rng("worldGen")
	var presentation := SimRng.get_presentation_rng("worldGen")
	## Both helpers call createSeededRng(currentSeed, owner), so the SAME
	## (seed, owner) deliberately derives the SAME sequence in both registries —
	## TypeScript behaves identically. What must differ is the container:
	## distinct instances, and a snapshot that carries only the simulation one.
	assert_false(sim == presentation, "registries must hold distinct stream instances")
	assert_eq(
		sim.next_u32(),
		presentation.next_u32(),
		"same seed+owner derives the same sequence (matches TS)"
	)
	var snapshot := SimRng.snapshot_sim_rng()
	assert_eq((snapshot["owners"] as Array).size(), 1, "only the simulation stream is snapshotted")
	var snapshot_owners: Array = []
	for pair: Variant in snapshot["owners"]:
		snapshot_owners.append(str((pair as Array)[0]))
	assert_eq(snapshot_owners, ["worldGen"], "snapshot owner list is exactly the simulation owner")


func test_snapshot_then_resume_continues() -> void:
	SimRng.set_sim_seed(777)
	var stream := SimRng.get_sim_rng("worldGen")
	stream.next_u32()
	stream.next_u32()
	var snapshot := SimRng.snapshot_sim_rng()
	var expected: int = stream.next_u32()

	SimRng.reset_sim_rng()
	assert_true(SimRng.restore_sim_rng(snapshot), "restore must accept its own snapshot")
	var restored := SimRng.get_sim_rng("worldGen")
	assert_eq(restored.next_u32(), expected, "resumed stream must continue, not replay")


func test_restore_rejects_malformed_snapshot() -> void:
	assert_false(SimRng.restore_sim_rng(null), "null snapshot must be rejected")
	assert_false(SimRng.restore_sim_rng("not a snapshot"), "string snapshot must be rejected")
	assert_false(SimRng.restore_sim_rng({}), "seedless snapshot must be rejected")
