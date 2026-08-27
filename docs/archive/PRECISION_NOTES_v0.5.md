# v0.5.0 precision notes (critique response)

Answers three accuracy questions about Scale / ecology / saves. Status as of **0.5.0**.

---

## 1. SoA in JavaScript Web Workers

**What we actually ship**

| Path | Layout | Structures |
|------|--------|------------|
| **Simulation world** | **AoS** | `Entity` / `Building` plain objects in `state.entities` |
| **Render transfer (worker → main)** | **SoA** | Packed `ArrayBuffer` / typed views, stride 16 (`simBuffers/schema.ts` `RENDER_STRIDE_V1`) |

**Why both**

- Sim stays **AoS**: idiomatic JS, simpler AI/housing/raids, GC cost acceptable with alive-only lists + indexes.  
- Worker **render SoA** is only the **cross-thread snapshot** for draw (x/y/type/anim/flags) — TypedArrays for cache locality and zero-copy-ish transfer, not for full WorldState mutation.

Marketing “scale” should not imply the entire sim is SoA.

---

## 2. “UI-less” Strained stage — not accurate

**Strained already has UI and soft mechanics:**

| Cue | Behavior |
|-----|----------|
| **Nature tab** | Stage badge (amber “⚠️ Strained”), summary + driver help |
| **Toast** | On rise into Strained: `addNotification` warning |
| **Chronicle** | Stage transition log line |
| **Hunt yield** | `getValleyHuntYieldMultiplier` → **0.9** at Strained (gentle) |
| **Farm** | No farm cut until **Damaged+** |

**0.5.0+ addition:** hunter chat when Strained+ and hunting/empty trails (“Game's getting scarce…”, “Thin trails today…”) so mild yield drops are attributed to ecology, not pure RNG.

Damaged/Collapse escalate with Big News + stronger yield cuts.

---

## 3. Save compatibility vs SoA / grids

| Data | Saved? | Notes |
|------|--------|--------|
| **Entities / buildings (AoS)** | **Yes** | Core colony |
| **`valleyStage` + streak fields** | **Yes** | In `WORLD_STATE_SAVE_KEYS` |
| **`villageForge`, research, raids, leadership…** | **Yes** | Allow-list schema |
| **Spatial grids** (`grassGrid`, `mobileGrid`, roads…) | **No** | Rebuilt after load |
| **Render SoA buffers** | **No** | Transient worker transfer only |
| **Adjacency / scent runtime** | **No** | Rebuilt |

**Schema:** `saveSchema.ts` allow-list + `ENTITY_PERSISTED_FIELDS` + migration ids (`0.4` → `0.5.0`). That is both **Scale** (don’t serialize heavy runtime indexes) and **Trust** (stable player-visible state survives).

Marketing line “0.4 colonies continue” is correct; strategic write-ups should say: **persist domain AoS + valley stage; rebuild indexes; never persist SoA transfer buffers.**

---

*Companion to [ROADMAP_0.5.0.md](./ROADMAP_0.5.0.md) archive.*
