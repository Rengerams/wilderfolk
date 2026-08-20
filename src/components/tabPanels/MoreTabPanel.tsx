import { Suspense, lazy, useMemo, useState } from 'react';
import { GAME_PHASE, GAME_VERSION } from '../../game/gameEngine';
import { searchGuideHelp } from '../../game/guideHelp';

type MoreSubTab = 'guide' | 'roadmap';

const RoadmapPanel = lazy(() => import('../../game/RoadmapPanel'));

export interface MoreTabPanelProps {
  moreSubTab: MoreSubTab;
  setMoreSubTab: (tab: MoreSubTab) => void;
  tutorialsEnabled: boolean;
  onReplayTutorial: () => void;
  onToggleTutorials: () => void;
  onSpawnMoonHowlerDebug: () => void;
}

export default function MoreTabPanel({
  moreSubTab,
  setMoreSubTab,
  tutorialsEnabled,
  onReplayTutorial,
  onToggleTutorials,
  onSpawnMoonHowlerDebug,
}: MoreTabPanelProps) {
  const [helpQuery, setHelpQuery] = useState('');
  const helpHits = useMemo(() => searchGuideHelp(helpQuery), [helpQuery]);

  return (
    <div className="space-y-3">
      <div className="progress-subnav">
        {(['guide', 'roadmap'] as MoreSubTab[]).map((id) => (
          <button
            key={id}
            type="button"
            data-active={moreSubTab === id}
            onClick={() => setMoreSubTab(id)}
          >
            {id === 'guide' ? '❓ Guide' : '🗺️ Roadmap'}
          </button>
        ))}
      </div>

      {moreSubTab === 'roadmap' && (
        <Suspense fallback={<p className="text-[13px] text-stone-300">Loading roadmap…</p>}>
          <RoadmapPanel />
        </Suspense>
      )}

      {moreSubTab === 'guide' && (
        <div className="space-y-3 text-[13px] text-stone-300">
          <div className="rounded-xl border border-sky-700/40 bg-sky-950/25 p-3">
            <h3 className="mb-1.5 text-sm font-bold text-sky-300">🔎 Quick help</h3>
            <input
              type="search"
              value={helpQuery}
              onChange={(e) => setHelpQuery(e.target.value)}
              placeholder="Type: swords, forge, raid, barracks…"
              className="w-full rounded-lg border border-stone-600/50 bg-stone-900/80 px-2.5 py-1.5 text-[13px] text-stone-100 placeholder:text-stone-500 focus:border-sky-500/50 focus:outline-none"
            />
            <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
              {helpHits.length === 0 && (
                <li className="text-xs text-stone-300">No match — try forge, swords, raid, rival…</li>
              )}
              {helpHits.map((t) => (
                <li key={t.id} className="rounded-lg border border-stone-600/40 bg-stone-800/50 px-2 py-1.5">
                  <p className="text-[13px] font-bold text-sky-100">{t.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-stone-300">{t.body}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3">
            <h3 className="mb-1 text-sm font-bold text-amber-300">⚠️ {GAME_PHASE} · v{GAME_VERSION}</h3>
            <p className="text-stone-300">Playtest build — expect bugs, rough edges, and features that change. Saves may break between updates. Feedback helps shape the real release.</p>
            <button
              type="button"
              onClick={() => setMoreSubTab('roadmap')}
              className="mt-2 w-full rounded-lg border border-indigo-600/40 bg-indigo-950/40 px-3 py-2 text-[13px] font-bold text-indigo-200 hover:bg-indigo-900/50"
            >
              🗺️ View development roadmap
            </button>
          </div>

          <div className="rounded-xl border border-violet-700/30 bg-violet-950/20 p-3">
            <h3 className="mb-2 text-sm font-bold text-violet-300">Why play? (honest answer)</h3>
            <div className="space-y-1.5 text-stone-300">
              <p>This is a <strong className="text-stone-200">sandbox frontier sim</strong>, not a campaign with one quest giver. Purpose comes from layers you choose:</p>
              <p>• <strong className="text-stone-200">Challenges</strong> (Progress → Goals) — stepped goals with resource rewards.</p>
              <p>• <strong className="text-stone-200">Your legend</strong> (Progress → Goals) — not a hard win. History describes you (warlike, steward, trader, builder, diplomat). Optional challenges give rewards.</p>
              <p>• <strong className="text-stone-200">Living drama</strong> — marriages, scandals, babies, moon howlers (Log / .txt chronicle).</p>
              <p>• <strong className="text-stone-200">The wider world</strong> — pilgrims, performers, rival camps appear as you grow.</p>
              <p>• <strong className="text-stone-200">Trade &amp; reputation</strong> — become a known township, link routes, unlock gold.</p>
              <p className="text-stone-300 italic">v0.4 is a playtest — more scripted story and rivals are planned. For now, pick one legacy and watch your chronicle unfold.</p>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-700/30 bg-emerald-950/20 p-3">
            <h3 className="mb-2 text-sm font-bold text-emerald-300">Getting Started</h3>
            <p className="mb-2 text-stone-300">
              {tutorialsEnabled
                ? 'Tips pop up the first time traders, rivals, winter, raids, and other mechanics appear. Replay quick start anytime.'
                : 'Tutorials are off. Turn them back on from the ☰ menu or below.'}
            </p>
            <div className="space-y-2">
              <button
                type="button"
                disabled={!tutorialsEnabled}
                onClick={onReplayTutorial}
                className="w-full rounded-lg bg-emerald-700 px-3 py-2 text-[13px] font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-500"
              >
                ↺ Replay Quick Start
              </button>
              <button
                type="button"
                onClick={onToggleTutorials}
                className="w-full rounded-lg border border-stone-600 px-3 py-2 text-[13px] font-semibold text-stone-300 hover:border-stone-500 hover:text-white"
              >
                {tutorialsEnabled ? 'Turn off all tutorials' : 'Turn tutorials back on'}
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-stone-700/50 p-3">
            <h3 className="mb-2 text-sm font-bold text-blue-300">Interface Overview</h3>
            <div className="space-y-1 text-stone-300">
              <p><strong className="text-stone-200">Alert strip</strong> — Under the header. Click raids, diplomacy, low food, or ready trade routes to jump there.</p>
              <p><strong className="text-stone-200">Build panel (left)</strong> — Press <strong className="text-stone-200">B</strong> to open. Pick a category, then a building. Keys <strong className="text-stone-200">1–9</strong> quick-select common types.</p>
              <p><strong className="text-stone-200">Grid</strong> — Press <strong className="text-stone-200">G</strong> to toggle the placement grid (auto-on when building).</p>
              <p><strong className="text-stone-200">Inspector</strong> — Top of the right panel; collapsible, auto-opens when you click the map.</p>
              <p><strong className="text-stone-200">Village</strong> — Focus hints with <strong className="text-stone-200">Go →</strong>, population, leadership, armament.</p>
              <p><strong className="text-stone-200">Frontier</strong> — Visitors, rivals, raids, diplomacy (badge when action needed).</p>
              <p><strong className="text-stone-200">Nature</strong> — Ecosystem health and wildlife counts.</p>
              <p><strong className="text-stone-200">Progress</strong> — Research · Trade · Goals (legend portrait + optional challenges). Sub-tabs show badges when researching or trade is ready.</p>
              <p><strong className="text-stone-200">More</strong> — Guide (this page) and Roadmap.</p>
              <p><strong className="text-stone-200">Tab hotkeys</strong> — <strong className="text-stone-200">V</strong> Village · <strong className="text-stone-200">F</strong> Frontier · <strong className="text-stone-200">N</strong> Nature · <strong className="text-stone-200">P</strong> Progress · <strong className="text-stone-200">L</strong> Log · <strong className="text-stone-200">M</strong> More.</p>
            </div>
          </div>

          <div className="rounded-xl bg-stone-700/50 p-3">
            <h3 className="mb-2 text-sm font-bold text-cyan-300">🧳 Visitors & Rival Settlements</h3>
            <div className="space-y-1 text-stone-300">
              <p>• <strong className="text-cyan-200">Traveling groups</strong> camp near your village — traders, pilgrims, scholars, performers, and more. They bring gifts and leave after a while.</p>
              <p>• <strong className="text-amber-200">Rival settlements</strong> appear on the same map and <strong className="text-stone-200">slowly expand</strong> (houses, farms, markets, or towers by mood — not always hostile).</p>
              <p>• Relationships vary: <em>friendly</em> neighbors trade &amp; grow peacefully, <em>competitive</em> ones hunt your deer, <em>tense</em> ones may fortify and raid.</p>
              <p>• Check the <strong className="text-stone-200">Frontier tab</strong> to see who&apos;s currently on the map.</p>
            </div>
          </div>

          <div className="rounded-xl bg-stone-700/50 p-3">
            <h3 className="mb-2 text-sm font-bold text-emerald-300">🌍 Why Animals & Humans?</h3>
            <p className="mb-2 text-stone-300 leading-relaxed">
              This world is a living ecosystem. Humans cannot survive alone — they are part of the food chain.
            </p>
            <div className="space-y-1.5 rounded bg-stone-800/60 p-2">
              <p><strong className="text-emerald-300">🌿 Producers:</strong> Grass and trees create food from sunlight.</p>
              <p><strong className="text-amber-300">🐰 Prey:</strong> Rabbits and deer eat grass. They are the bridge between plants and predators.</p>
              <p><strong className="text-rose-300">🐺 Predators:</strong> Wolves and foxes hunt prey to keep populations balanced.</p>
              <p><strong className="text-cyan-300">👨 Humans:</strong> Hunt animals for food AND build farms for stable food. But overbuilding pollutes and destroys habitat.</p>
            </div>
            <p className="mt-2 text-stone-300 italic">
              If wolves die out, deer overpopulate, eat all grass, rabbits starve, and humans have nothing to hunt. Balance is everything.
            </p>
          </div>

          <div className="rounded-xl bg-stone-700/50 p-3">
            <h3 className="mb-2 text-sm font-bold text-amber-300">👨‍👩‍👧 Family & Relationships</h3>
            <div className="space-y-1 text-stone-300">
              <p>• Every human has a <strong className="text-amber-200">name and surname</strong> passed down generations.</p>
              <p>• Single adults will <strong className="text-pink-300">court</strong> nearby singles (💕 hearts appear).</p>
              <p>• At 100% courtship, they <strong className="text-yellow-300">marry</strong> (💍 golden ring connects them).</p>
              <p>• Married couples can have <strong className="text-pink-300">babies</strong> (🤰 pregnant indicator).</p>
              <p>• Settlers may pursue <strong className="text-rose-300">secret affairs</strong> in the evenings — spouses can catch them; a <strong className="text-violet-300">Church</strong> makes gossip travel faster.</p>
              <p>• <strong className="text-violet-300">Bastards</strong> are born when the father isn&apos;t the mother&apos;s spouse — they take the mother&apos;s surname and village gossip spreads.</p>
              <p>• Legitimate children inherit their <strong className="text-amber-200">father&apos;s surname</strong>.</p>
              <p>• Click any person to see their <strong className="text-amber-200">full family tree</strong>.</p>
            </div>
          </div>

          <div className="rounded-xl bg-stone-700/50 p-3">
            <h3 className="mb-2 text-sm font-bold text-rose-300">⚔️ Hunting & Combat</h3>
            <div className="space-y-1 text-stone-300">
              <p>• <strong className="text-orange-300">Food chain:</strong> Grass → rabbits/deer → foxes/wolves → humans. Everyone hunts someone.</p>
              <p>• <strong className="text-cyan-300">Settlers hunt</strong> deer and rabbits when hungry and off-duty. Watch for orange <strong className="text-orange-300">🏹 chase lines</strong> and floating <em>Hunted!</em> text.</p>
              <p>• <strong className="text-stone-300">Wolves & foxes</strong> chase prey with grey dashed lines. Prey flees when predators get close.</p>
              <p>• <strong className="text-violet-300">Moon Howlers</strong> hunt settlers on full-moon nights — settlers flee home.</p>
              <p>• <strong className="text-amber-300">Weapons:</strong> Stone/wood gear unlocks from Defense research. <strong className="text-stone-200">Iron Spears & Shields</strong> need research <strong className="text-stone-200">and</strong> a forge order at a staffed Blacksmith (click the building → Village forge).</p>
              <p>• Click a settler to see <strong className="text-stone-200">Village gear</strong> once research (and Blacksmith for iron) is done.</p>
            </div>
          </div>

          <div className="rounded-xl bg-stone-700/50 p-3">
            <h3 className="mb-2 text-sm font-bold text-cyan-300">🏕️ Other tribes</h3>
            <div className="space-y-1 text-stone-300">
              <p>• <strong className="text-stone-200">Visitors</strong> camp nearby (traders, pilgrims, refugees…) — passive bonuses while they stay.</p>
              <p>• <strong className="text-stone-200">Rival settlements</strong> appear from ~6 population / yearly events — their camps grow slowly on the map (mood shapes what they build).</p>
              <p>• <strong className="text-stone-200">Diplomacy</strong> — click a rival camp for gifts, pacts, peace treaties (🕊️), militia, raids, and event responses.</p>
              <p>• <strong className="text-stone-200">Visitor camps</strong> — talk to the caravan leader (once per visit), trade goods, or negotiate refugees.</p>
              <p className="text-stone-300 italic">Raids use strength ratios (not a battle screen). Peace treaties block attacks; prep walls, barracks, and spears.</p>
            </div>
          </div>

          <div className="rounded-xl bg-stone-700/50 p-3">
            <h3 className="mb-2 text-sm font-bold text-violet-300">🌝 Moon Howlers</h3>
            <p className="text-stone-300 leading-relaxed">
              Sometimes a grown settler is <strong className="text-violet-200">cursed as a Moon Howler</strong>.
              Cursed settlers stay <strong className="text-violet-200">normal humans most nights</strong>. Only on a
              <strong className="text-violet-200"> full moon</strong> (about every 2 weeks) do they transform and
              <strong className="text-rose-300"> hunt settlers</strong>. Staff a
              <strong className="text-indigo-200"> Church</strong> — uncured settlers transform every 14 days and leave home to hunt (20:00–06:00). A staffed priest may go outside during that night to break the curse — or be eaten (RNG).
            </p>
          </div>

          <div className="rounded-xl border border-dashed border-violet-700/40 bg-violet-950/20 p-3">
            <h3 className="mb-2 text-sm font-bold text-violet-300">🧪 Testing</h3>
            <p className="mb-2 text-[13px] text-stone-300">Spawn a Moon Howler instantly for playtesting.</p>
            <button
              onClick={onSpawnMoonHowlerDebug}
              className="w-full rounded-lg bg-violet-800 px-3 py-2 text-[13px] font-bold text-violet-100 transition-all hover:bg-violet-700"
            >
              🌝 Spawn Moon Howler
            </button>
          </div>

          <div className="rounded-xl bg-stone-700/50 p-3">
            <h3 className="mb-2 text-sm font-bold text-blue-300">🎮 Controls</h3>
            <div className="grid grid-cols-2 gap-1 text-stone-300">
              <span><strong className="text-stone-200">WASD / Arrows</strong></span><span>Pan camera</span>
              <span><strong className="text-stone-200">Mouse drag</strong></span><span>Pan camera</span>
              <span><strong className="text-stone-200">Scroll</strong></span><span>Zoom in/out</span>
              <span><strong className="text-stone-200">Click</strong></span><span>Select / Build</span>
              <span><strong className="text-stone-200">Space</strong></span><span>Pause/Play</span>
              <span><strong className="text-stone-200">B</strong></span><span>Full build catalog (left)</span>
              <span><strong className="text-stone-200">G</strong></span><span>Toggle grid</span>
              <span><strong className="text-stone-200">1–9</strong></span><span>Quick-build (opens left catalog)</span>
              <span><strong className="text-stone-200">V F N P L M</strong></span><span>Sidebar tabs</span>
              <span><strong className="text-stone-200">H</strong></span><span>Find settlers (center camera)</span>
              <span><strong className="text-stone-200">ESC</strong></span><span>Cancel build</span>
              <span><strong className="text-stone-200">+ / -</strong></span><span>Zoom</span>
              <span><strong className="text-stone-200">🔊 / 🔇</strong></span><span>Mute sound — or pick Soft / Normal / Loud</span>
            </div>
          </div>

          <div className="rounded-xl bg-stone-700/50 p-3">
            <h3 className="mb-2 text-sm font-bold text-emerald-300">🏗️ Buildings Guide</h3>
            <div className="space-y-1 text-stone-300">
              <p>• <strong className="text-amber-200">House</strong> — Family home (6 slots). Click house → <strong className="text-stone-200">Expand</strong> for up to 10.</p>
              <p>• <strong className="text-amber-200">Farm</strong> — Produces food every season.</p>
              <p>• <strong className="text-amber-200">Lumber Mill</strong> — Produces wood. Needs workers.</p>
              <p>• <strong className="text-amber-200">Quarry/Mine</strong> — Produces stone.</p>
              <p>• <strong className="text-amber-200">Roads</strong> — Infra tab (key 8). Horizontal strips — zigzag them (step north/south each segment) for paths up hills. Boost nearby buildings +15%.</p>
              <p>• <strong className="text-amber-200">Town Hall</strong> — After <strong className="text-stone-200">Urban Planning</strong>. Staff officials for taxes, trade &amp; immigration boosts, election site, scandal buffer, and hosted festivals.</p>
              <p>• <strong className="text-amber-200">Church</strong> — Community tab, no research needed. Faster marriages, breaks Moon Howler curses, stricter morals.</p>
              <p>• <strong className="text-amber-200">Hospital</strong> — Staffed: +2 reputation every 5 days. Any hospital lowers energy drain.</p>
              <p>• <strong className="text-amber-200">Demolish</strong> — Click any building → sidebar → <strong className="text-stone-200">🗑 Demolish</strong> (works on houses too; residents are reassigned).</p>
              <p>• <strong className="text-amber-200">Reputation ⭐</strong> — Village header &amp; Progress → Trade. From Town Hall, Hospital, pilgrims, festivals, and avoiding scandals. Unlocks trade routes.</p>
              <p>• <strong className="text-amber-200">Village head 👑</strong> — First male leads until Year 5; merit elections every 5 years after that. Village tab → Leadership for standings and record score. Scandals hurt re-election; a strong challenger can still win.</p>
            </div>
          </div>

          <div className="rounded-xl bg-stone-700/50 p-3">
            <h3 className="mb-2 text-sm font-bold text-emerald-300">🦌 What Does Wildlife Do?</h3>
            <div className="space-y-1.5 text-stone-300">
              <p>Every animal has a role in the ecosystem. Without balance, your village will starve.</p>
              <div className="space-y-1 rounded bg-stone-800/60 p-2">
                <p><strong className="text-green-300">🌿 Grass</strong> — Grows naturally. Rabbits and deer eat it. If grass dies, everything starves.</p>
                <p><strong className="text-amber-300">🐰 Rabbits</strong> — Eat grass, reproduce fast. Foxes and wolves hunt them. Humans can hunt rabbits for food.</p>
                <p><strong className="text-orange-300">🦌 Deer</strong> — Eat grass, move in herds. Wolves and humans hunt deer. More deer = more food for predators.</p>
                <p><strong className="text-orange-500">🦊 Foxes</strong> — Hunt rabbits to keep their population in check. Without foxes, rabbits overpopulate and eat all the grass.</p>
                <p><strong className="text-stone-300">🐺 Wolves</strong> — Hunt deer and rabbits. Apex predators. Without wolves, deer overpopulate and destroy grasslands.</p>
                <p><strong className="text-cyan-300">👨 Humans</strong> — Hunt animals for food, build farms for stable food. Build too much and pollution rises, harming wildlife.</p>
              </div>
              <p className="text-stone-300 italic">If wolves die out, deer explode, eat all grass, rabbits starve, and your people have nothing to hunt. Balance is everything.</p>
            </div>
          </div>

          <div className="rounded-xl bg-stone-700/50 p-3">
            <h3 className="mb-2 text-sm font-bold text-amber-300">📜 Village Chronicle (Log tab)</h3>
            <div className="space-y-1 text-stone-300">
              <p>Right sidebar → <strong className="text-stone-200">📜 Log</strong> — scrollable history of everything that happened (newest on top).</p>
              <p>Filter by type, hit <strong className="text-stone-200">Download .txt</strong> for a text file (opens in Notepad), or enable export when you 💾 Save.</p>
              <p className="text-stone-300">File name: <strong className="text-stone-300">wilderfolk-YourVillage-chronicle.txt</strong> in your Downloads folder.</p>
            </div>
          </div>

          <div className="rounded-xl bg-stone-700/50 p-3">
            <h3 className="mb-2 text-sm font-bold text-violet-300">🦴 Taming Animals</h3>
            <div className="space-y-1 text-stone-300">
              <p>1. Build a <strong className="text-stone-200">Taming Post</strong> (Community tab).</p>
              <p>2. Click a wild <strong className="text-stone-200">wolf, fox, deer, or rabbit</strong> within ~140px of the post.</p>
              <p>3. Pick an adult settler — costs food: rabbit 10, fox 25, deer 30, wolf 40.</p>
              <p>4. Tamed animals <strong className="text-stone-200">follow their owner</strong>. Wolves and foxes sometimes hunt nearby prey for them.</p>
              <p className="text-stone-300 italic">Moon Howlers cannot be tamed — staff a Church on full-moon nights (20:00–06:00). More priests raise cure odds; no priest means the howler hunts freely and returns next full moon.</p>
            </div>
          </div>

          <div className="rounded-xl bg-stone-700/50 p-3">
            <h3 className="mb-2 text-sm font-bold text-rose-300">⚠️ Disasters & Seasons</h3>
            <div className="space-y-1 text-stone-300">
              <p>• <strong className="text-rose-300">Fire/Flood/Tornado</strong> — Damage buildings and kill wildlife.</p>
              <p>• <strong className="text-rose-300">Plague</strong> — Can be prevented with Medicine research.</p>
              <p>• <strong className="text-amber-200">Winter</strong> — Grass stops growing, animals struggle.</p>
              <p>• <strong className="text-emerald-300">Spring</strong> — Best season for growth and babies!</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
