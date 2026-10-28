import { describe, expect, it } from 'vitest';
import {
  SPOTLIGHT_CAPTIONS, SPOTLIGHT_POSE_MS, SPOTLIGHT_STEPS, SPOTLIGHT_TOTAL_MS,
  SPOTLIGHT_FIRST_CHORUS_START, SPOTLIGHT_FIRST_CHORUS_END, SPOTLIGHT_BRIDGE_START,
  SPOTLIGHT_FAREWELL_START, SPOTLIGHT_APPLAUSE_START, spotlightFrameAt,
  spotlightPoseOffset, spotlightSpeakerId,
} from '../src/components/spotlightChoreography';
import {
  spotlightFarewellPosition, spotlightFarewellDestination, spotlightSafePoseRadius,
} from '../src/components/spotlightFarewell';
import { testWorldMap } from '../src/test/worldMapFixtures';

describe('spotlight choreography — canonical JSON 1.3 captions and stable cues', () => {
  it('binds the actual heroine and each one of 6–10 adult singers without a hidden 7th–10th speaker', () => {
    expect(SPOTLIGHT_CAPTIONS.length).toBeGreaterThanOrEqual(44);
    const girl = SPOTLIGHT_CAPTIONS.find((caption) => caption.cue === 'juvenile-reply')!;
    const last = SPOTLIGHT_CAPTIONS.at(-1)!;
    expect(girl.speaker).toBe('heroine');
    expect(last.speaker).toBe('heroine');
    expect(last.cue).toBe('final-heroine');
    expect(SPOTLIGHT_CAPTIONS.some((caption) => caption.cue === 'first-look-pose')).toBe(true);
    for (let size = 6; size <= 10; size++) {
      const adults = Array.from({ length: size }, (_, i) => i + 12);
      expect(spotlightSpeakerId('heroine', 6, adults)).toBe(6);
      const heard = new Set(SPOTLIGHT_CAPTIONS.filter((caption) => caption.speaker !== 'heroine')
        .map((caption) => spotlightSpeakerId(caption.speaker, 6, adults)));
      expect(heard).toEqual(new Set(adults));
    }
    expect(() => spotlightSpeakerId('speaker_1', 6, [12, 13])).toThrow();
    expect(() => spotlightSpeakerId('speaker_11', 6, Array.from({ length: 6 }, (_, i) => 12 + i))).toThrow();
  });

  it('holds two complete 7000ms solos and resumes the next caption only after the hold ends', () => {
    const poses = SPOTLIGHT_STEPS.filter((step) => step.kind === 'pose');
    expect(poses).toHaveLength(2);
    for (const pose of poses) {
      expect(pose.durationMs).toBe(SPOTLIGHT_POSE_MS);
      const before = spotlightFrameAt(pose.startMs - 1);
      const started = spotlightFrameAt(pose.startMs);
      const halfway = spotlightFrameAt(pose.startMs + 3500);
      const ending = spotlightFrameAt(pose.startMs + 6999);
      const next = spotlightFrameAt(pose.startMs + 7000);
      expect(before.kind).toBe('caption');
      expect(started.kind).toBe('pose');
      expect(halfway.kind).toBe('pose');
      expect(ending.lineIndex).toBe(pose.lineIndex);
      expect(ending.poseProgress).toBeGreaterThan(0.99);
      expect(next.kind).toBe('caption');
      expect(next.lineIndex).toBe((pose.lineIndex ?? 0) + 1);
    }
  });

  it('starts/stops comic hearts at the specified bridges and keeps them through final heroine line', () => {
    expect(spotlightFrameAt(SPOTLIGHT_FIRST_CHORUS_START - 1).hearts).toBe(false);
    expect(spotlightFrameAt(SPOTLIGHT_FIRST_CHORUS_START).hearts).toBe(true);
    expect(spotlightFrameAt(SPOTLIGHT_FIRST_CHORUS_END - 1).hearts).toBe(true);
    expect(spotlightFrameAt(SPOTLIGHT_FIRST_CHORUS_END).hearts).toBe(false);
    expect(spotlightFrameAt(SPOTLIGHT_BRIDGE_START - 1).hearts).toBe(false);
    expect(spotlightFrameAt(SPOTLIGHT_BRIDGE_START).hearts).toBe(true);
    expect(spotlightFrameAt(SPOTLIGHT_APPLAUSE_START - 1).hearts).toBe(true);
    expect(spotlightFrameAt(SPOTLIGHT_APPLAUSE_START).hearts).toBe(false);
    expect(spotlightFrameAt(SPOTLIGHT_TOTAL_MS).finished).toBe(true);
  });

  it('never advances simulated time or position; projected circles end at the starting point', () => {
    const start = spotlightPoseOffset(0);
    const mid = spotlightPoseOffset(0.5);
    const end = spotlightPoseOffset(1);
    expect(start).toEqual({ x: 0, y: 0 });
    expect(mid.x).toBeLessThan(0);
    expect(end.x).toBeCloseTo(0, 8);
    expect(end.y).toBeCloseTo(0, 8);
    expect(spotlightFrameAt(SPOTLIGHT_FAREWELL_START - 1).farewellProgress).toBe(0);
    expect(spotlightFrameAt(SPOTLIGHT_APPLAUSE_START).farewellProgress).toBe(1);
    const origin = { x: 480, y: 350 };
    const dest = { x: 512, y: 350 };
    expect(spotlightFarewellPosition(origin, dest, 0)).toEqual(origin);
    expect(spotlightFarewellPosition(origin, dest, 1)).toEqual(dest);
    expect(spotlightFarewellPosition(origin, dest, 0.5).x).toBeCloseTo(496);
  });

  it('checks real terrain for a short visible departure, or holds in place safely', () => {
    const map = testWorldMap({ tilesX: 96, tilesY: 72, seed: 8033 });
    const world = { worldMap: map, buildings: [], width: 960, height: 720 };
    const scene = { gatherX: 480, gatherY: 350,
      slots: Array.from({ length: 6 }, (_, i) => ({ humanId: i + 1, x: 480 + i, y: 384 })) };
    const dest = spotlightFarewellDestination(world, scene);
    expect(Number.isFinite(dest.x) && Number.isFinite(dest.y)).toBe(true);
    expect(Math.hypot(dest.x - scene.gatherX, dest.y - scene.gatherY)).toBeLessThanOrEqual(32.01);
    const radius = spotlightSafePoseRadius(world, { x: scene.gatherX, y: scene.gatherY });
    expect([0, 5, 8, 11]).toContain(radius);
    expect(spotlightSafePoseRadius({ ...world, worldMap: null }, { x: 480, y: 350 })).toBe(0);
  });
});
