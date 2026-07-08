import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorldState } from '../game/gameEngine';
import { EntityType } from '../game/gameEngine';
import { isNightHour, getHourOfDay } from '../game/dayCycle';
import { detectInteractionSounds } from '../audio/interactionDetect';
import {
  getMuteState,
  getVolumePreset,
  toggleMute,
  unlockAudio,
  primeAudioUnlock,
  playBirthSound,
  playMarriageSound,
  playBuildSound,
  playUpgradeSound,
  playDisasterSound,
  playResearchCompleteSound,
  playClickSound,
  setGameMood,
  setVolumePreset,
  type VolumePreset,
} from '../audio';

/**
 * React hook: mute control, day/night music mood, and SFX on sim interactions.
 */
export function useGameAudio(world: WorldState, enabled: boolean) {
  const [muted, setMuted] = useState(() => getMuteState());
  const [volumePreset, setVolumePresetState] = useState<VolumePreset>(() => getVolumePreset());
  const prevEntitiesRef = useRef(world.entities);
  const prevBuildingsRef = useRef(world.buildings);
  const prevDisasterCountRef = useRef(0);
  const prevMarriedCountRef = useRef(0);
  const prevResearchedCountRef = useRef(0);
  const seededRef = useRef(false);

  const handleToggleMute = useCallback(() => {
    primeAudioUnlock();
    void unlockAudio().then(() => {
      const nowMuted = toggleMute();
      setMuted(nowMuted);
      if (!nowMuted) playClickSound();
    });
  }, []);

  const handleVolumePreset = useCallback((preset: VolumePreset) => {
    primeAudioUnlock();
    void unlockAudio().then(() => {
      setVolumePreset(preset);
      setVolumePresetState(preset);
      if (!getMuteState()) playClickSound();
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setGameMood(isNightHour(getHourOfDay(world.tick)));
  }, [world.tick, enabled]);

  useEffect(() => {
    if (!enabled) {
      seededRef.current = false;
      return;
    }

    if (!seededRef.current) {
      prevEntitiesRef.current = world.entities;
      prevBuildingsRef.current = world.buildings;
      prevDisasterCountRef.current = world.disasters.length;
      prevMarriedCountRef.current = world.entities.filter(
        e => e.alive && e.type === EntityType.Human && e.relationshipStatus === 'married',
      ).length;
      prevResearchedCountRef.current = world.researchNodes.filter(n => n.researched).length;
      seededRef.current = true;
      return;
    }

    const prevEntities = prevEntitiesRef.current;
    const prevBuildings = prevBuildingsRef.current;
    const currentEntities = world.entities;
    const currentBuildings = world.buildings;

    // Hunt, tame, predator kills, transforms
    detectInteractionSounds(prevEntities, currentEntities);

    const prevBabies = new Set(prevEntities.filter(e => e.alive && e.isJuvenile).map(e => e.id));
    const newBabies = currentEntities.filter(e => e.alive && e.isJuvenile && !prevBabies.has(e.id));
    if (newBabies.length > 0) playBirthSound();

    const currentMarriedCount = currentEntities.filter(
      e => e.alive && e.type === EntityType.Human && e.relationshipStatus === 'married',
    ).length;
    if (currentMarriedCount > prevMarriedCountRef.current) playMarriageSound();
    prevMarriedCountRef.current = currentMarriedCount;

    const prevCompletedCount = prevBuildings.filter(b => b.completed).length;
    const currentCompletedCount = currentBuildings.filter(b => b.completed).length;
    if (currentCompletedCount > prevCompletedCount) playBuildSound();

    const prevLevels = prevBuildings.reduce((sum, b) => sum + b.level, 0);
    const currentLevels = currentBuildings.reduce((sum, b) => sum + b.level, 0);
    if (currentLevels > prevLevels && currentCompletedCount === prevCompletedCount) playUpgradeSound();

    if (world.disasters.length > prevDisasterCountRef.current) playDisasterSound();
    prevDisasterCountRef.current = world.disasters.length;

    const currentResearched = world.researchNodes.filter(n => n.researched).length;
    if (currentResearched > prevResearchedCountRef.current) playResearchCompleteSound();
    prevResearchedCountRef.current = currentResearched;

    prevEntitiesRef.current = currentEntities;
    prevBuildingsRef.current = currentBuildings;
  }, [world.tick, enabled, world.entities, world.buildings, world.disasters.length, world.researchNodes]);

  return { muted, volumePreset, toggleMute: handleToggleMute, setVolumePreset: handleVolumePreset };
}