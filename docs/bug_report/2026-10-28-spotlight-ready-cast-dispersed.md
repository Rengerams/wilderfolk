# Ready spotlight can begin with displaced performers

- Bug: A scene in the ready phase can present dialogue after emergency movement has pulled the heroine or a singer away from the stage; an inconsistent saved ready scene can likewise begin with a dispersed cast.
- Status: resolved in code on PR #91; new CI and browser smoke verification pending
- Severity: medium (P2, presentation correctness)
- Date discovered: 2026-10-28
- Version/build: 0.6.5.2 development, PR #91 (audit after `94006e6c`)
- Reporter: focused source audit
- Area: spotlight lore state machine / save normalization
- Owner module: `src/game/spotlightLore.ts`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/91

## Observed behavior

`tickSpotlightGathering` validated actor eligibility during `ready` but returned before checking whether the complete cast still occupied the stage. Emergency steering has priority over spotlight movement. A performer could therefore move away during the worker-to-React pause handoff while the UI still began the performance. `normalizeSpotlightLoreOnLoad` also accepted structurally valid ready scenes with valid but distant actors.

## Expected behavior

Ready means every selected speaker **and** the heroine are alive, eligible and physically within the existing 11-unit arrival threshold. Emergency movement still wins, but a displaced ready scene aborts instead of presenting to an empty stage. A saved gathering scene remains loadable when actors are still travelling.

## Fix

After the single bounded actor scan, check the ready phase's current arrival count and heroine distance before the existing timeout return. During save normalization, reject only physically dispersed **ready** scenes; do not reject gathering scenes for missing arrival. No new RNG, scheduling pass, movement writer, reward, field, event or cooldown rule.

## Reproduction and regression

1. Create a physically valid six-singer ready scene; move one singer 30 world units away; tick. The scene must abort.
2. Repeat with the heroine moved away. Abort without Chronicle completion event, resource change or reward.
3. Normalize a saved ready scene with a distant singer, then with a distant heroine. Reject both.
4. Normalize a valid still-gathering scene with a distant actor. Preserve it so movement can finish.
5. Keep the ready-scene test fixture physically consistent with its stated phase.

## Verification

Source change and regressions committed to PR #91. These focused cases were added after the prior passing suite; new CI and visual/worker smoke still need confirmation.
