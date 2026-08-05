graph TD
   App[src\App.tsx]
   gameEngine[src\game\gameEngine.ts]
   buildingActions[src\game\buildingActions.ts]
   gameTypes[src\game\gameTypes.ts]
   dayCycle[src\game\dayCycle.ts]
   visitorQuest[src\game\visitorQuest.ts]
   groupEvents[src\game\groupEvents.ts]
   gameLoop[src\game\gameLoop.ts]
   commands[src\game\simWorker\commands.ts]
   entityCatalog[src\game\entityCatalog.ts]
   uiSimSummary[src\game\uiSimSummary.ts]
   resourceUtils[src\game\resourceUtils.ts]
   viewState[src\game\viewState.ts]
   buildingRotation[src\game\buildingRotation.ts]
   spriteLoader[src\game\spriteLoader.ts]
   humanSprites[src\game\humanSprites.ts]
   raidUtils[src\game\raidUtils.ts]
   SelectedBuildingPanel[src\components\SelectedBuildingPanel.tsx]
   MiniMap[src\components\MiniMap.tsx]
   playerHuman[src\game\playerHuman.ts]
   nameLoader[src\game\nameLoader.ts]
   dialogueTrees[src\game\dialogueTrees.ts]
   rendererLoader[src\game\rendererLoader.ts]
   IntroScreen[src\game\IntroScreen.tsx]
   MapSetupScreen[src\game\MapSetupScreen.tsx]
   CombatPreviewPanel[src\game\CombatPreviewPanel.tsx]
   BuildCatalogPanel[src\components\BuildCatalogPanel.tsx]
   eventLogExport[src\game\eventLogExport.ts]
   index[src\audio\index.ts]
   useGameAudio[src\hooks\useGameAudio.ts]
   useKeyboardControls[src\hooks\useKeyboardControls.ts]
   useCanvasInteractions[src\hooks\useCanvasInteractions.ts]
   useContextualTutorial[src\hooks\useContextualTutorial.ts]
   ContextualTutorialCard[src\components\ContextualTutorialCard.tsx]
   preferences[src\game\preferences.ts]
   ResourceCost[src\components\ResourceCost.tsx]
   resourceCost[src\game\resourceCost.ts]
   VillageTabPanel[src\components\tabPanels\VillageTabPanel.tsx]
   FrontierTabPanel[src\components\tabPanels\FrontierTabPanel.tsx]
   NatureTabPanel[src\components\tabPanels\NatureTabPanel.tsx]
   ProgressTabPanel[src\components\tabPanels\ProgressTabPanel.tsx]
   LogTabPanel[src\components\tabPanels\LogTabPanel.tsx]
   MoreTabPanel[src\components\tabPanels\MoreTabPanel.tsx]
   AlertBar[src\components\AlertBar.tsx]
   Emoji[src\components\Emoji.tsx]
   GameHeader[src\components\GameHeader.tsx]
   priorityAlerts[src\game\priorityAlerts.ts]
   focusHints[src\game\focusHints.ts]
   hotkeys[src\game\hotkeys.ts]
   TutorialOverlay[src\components\TutorialOverlay.tsx]
   buildingConfig[src\game\buildingConfig.ts]
   speciesConfig[src\game\speciesConfig.ts]
   simFocus[src\game\simFocus.ts]
   simHelpers[src\game\simHelpers.ts]
   grassEcology[src\game\grassEcology.ts]
   simEffects[src\game\simEffects.ts]
   juiceEffects[src\game\juiceEffects.ts]
   terrainSystems[src\game\terrainSystems.ts]
   adjacencyIndex[src\game\adjacencyIndex.ts]
   entityIndex[src\game\entityIndex.ts]
   workforce[src\game\workforce.ts]
   gameTick[src\game\gameTick.ts]
   terrainGen[src\game\terrainGen.ts]
   stats[src\game\stats.ts]
   victory[src\game\victory.ts]
   eventLog[src\game\eventLog.ts]
   rivalPeace[src\game\rivalPeace.ts]
   entityFactory[src\game\entityFactory.ts]
   frontierCombat[src\game\frontierCombat.ts]
   ecosystemPressure[src\game\ecosystemPressure.ts]
   ecoBreakdown[src\game\ecoBreakdown.ts]
   ecologyStage[src\game\ecologyStage.ts]
   populationGrowth[src\game\populationGrowth.ts]
   rivalDisplay[src\game\rivalDisplay.ts]
   combat[src\game\combat.ts]
   villageLeadership[src\game\villageLeadership.ts]
   entityCounts[src\game\entityCounts.ts]
   saveLoad[src\game\saveLoad.ts]
   stripBuild[src\game\stripBuild.ts]
   economy[src\game\economy.ts]
   research[src\game\research.ts]
   worldGen[src\game\worldGen.ts]
   lifeSimulation[src\game\lifeSimulation.ts]
   worldEvents[src\game\worldEvents.ts]
   version[src\game\version.ts]
   skills[src\game\skills.ts]
   forge[src\game\forge.ts]
   resourceTypes[src\game\resourceTypes.ts]
   omenTypes[src\game\omenTypes.ts]
   scentGrid[src\game\scentGrid.ts]
   spatialGrid[src\game\spatialGrid.ts]
   moonHowler[src\game\moonHowler.ts]
   humanChat[src\game\humanChat.ts]
   dayCycleConstants[src\game\dayCycleConstants.ts]
   nodeRuntime[src\game\nodeRuntime.ts]
   spatialQueryMetrics[src\game\spatialQueryMetrics.ts]
   tickLayerRealtime[src\game\tickLayerRealtime.ts]
   tickLayerSystems[src\game\tickLayerSystems.ts]
   tickLayerAssign[src\game\tickLayerAssign.ts]
   tickLayerDaily[src\game\tickLayerDaily.ts]
   defenseStructures[src\game\defenseStructures.ts]
   citizenId[src\game\citizenId.ts]
   renffrStar[src\game\renffrStar.ts]
   education[src\game\education.ts]
   townHall[src\game\townHall.ts]
   tradeCaravans[src\game\tradeCaravans.ts]
   factionWander[src\game\factionWander.ts]
   socialLife[src\game\socialLife.ts]
   hospitalCare[src\game\hospitalCare.ts]
   hotelStay[src\game\hotelStay.ts]
   pathfinding[src\game\pathfinding.ts]
   economyLedger[src\game\economyLedger.ts]
   simQueries[src\game\simQueries.ts]
   combatTech[src\game\combatTech.ts]
   resourceLabels[src\components\resourceLabels.ts]
   militiaBalance[src\game\militiaBalance.ts]
   huntvisuals[src\game\huntvisuals.ts]
   treeProximity[src\game\treeProximity.ts]
   challenges[src\game\challenges.ts]
   saveSchema[src\game\saveSchema.ts]
   contextualTutorial[src\game\contextualTutorial.ts]
   stripJunction[src\game\stripJunction.ts]
   stripTopology[src\game\stripTopology.ts]
   placementUtils[src\game\placementUtils.ts]
   renderSnapshot[src\game\renderSnapshot.ts]
   entityRenderMeta[src\game\simBuffers\entityRenderMeta.ts]
   renderSoAReader[src\game\simBuffers\renderSoAReader.ts]
   renderSoAEntities[src\game\simBuffers\renderSoAEntities.ts]
   simDelta[src\game\simBuffers\simDelta.ts]
   packRenderSoA[src\game\simBuffers\packRenderSoA.ts]
   schema[src\game\simBuffers\schema.ts]
   entityTypeCodes[src\game\simBuffers\entityTypeCodes.ts]
   applyKinematics[src\game\simBuffers\applyKinematics.ts]
   GameWorkerHost[src\game\simWorker\GameWorkerHost.ts]
   renderer[src\game\renderer.ts]
   buildCatalog[src\game\buildCatalog.ts]
   entitySprites[src\game\entitySprites.ts]
   stripRender[src\game\stripRender.ts]
   terrainLayer[src\game\terrainLayer.ts]
   entityLayer[src\game\entityLayer.ts]
   canvasLayer[src\game\canvasLayer.ts]
   renderBufferPool[src\game\simBuffers\renderBufferPool.ts]
   protocol[src\game\simWorker\protocol.ts]
   CollapsibleSection[src\components\CollapsibleSection.tsx]
   BlacksmithForgePanel[src\components\BlacksmithForgePanel.tsx]
   ResourceIcons[src\components\ResourceIcons.tsx]
   ambient[src\audio\ambient.ts]
   backgroundMusic[src\audio\backgroundMusic.ts]
   director[src\audio\director.ts]
   graph_xx[src\audio\graph.ts]
   introMusic[src\audio\introMusic.ts]
   preferences[src\audio\preferences.ts]
   tracks[src\audio\tracks.ts]
   interactionSfx[src\audio\interactionSfx.ts]
   constants[src\audio\constants.ts]
   sfx[src\audio\sfx.ts]
   trackPlayer[src\audio\trackPlayer.ts]
   sampleLoader[src\audio\sampleLoader.ts]
   htmlAudioSync[src\audio\htmlAudioSync.ts]
   scheduler[src\audio\scheduler.ts]
   session[src\audio\session.ts]
   interactionDetect[src\audio\interactionDetect.ts]
   FocusPanel[src\game\FocusPanel.tsx]
   VillageLeadershipPanel[src\game\VillageLeadershipPanel.tsx]
   PopulationPanel[src\game\PopulationPanel.tsx]
   FrontierPanel[src\components\FrontierPanel.tsx]
   temperature[src\game\temperature.ts]
   villagePortrait[src\game\villagePortrait.ts]
   ChallengesPanel[src\components\ChallengesPanel.tsx]
   StatisticsPanel[src\game\StatisticsPanel.tsx]
   EventLogPanel[src\game\EventLogPanel.tsx]
   CombatLogPanel[src\components\CombatLogPanel.tsx]
   guideHelp[src\game\guideHelp.ts]
   RoadmapPanel[src\game\RoadmapPanel.tsx]
   roadmapContent[src\game\roadmapContent.ts]
   GameMenu[src\components\GameMenu.tsx]
   ResourceBadge[src\components\ResourceBadge.tsx]
   class app myClass1
         App --> gameEngine
         App --> buildingActions
         App --> gameTypes
         App --> dayCycle
         App --> visitorQuest
         App --> groupEvents
         App --> gameLoop
         App --> commands
         App --> entityCatalog
         App --> uiSimSummary
         App --> resourceUtils
         App --> viewState
         App --> buildingRotation
         App --> spriteLoader
         App --> humanSprites
         App --> raidUtils
         App --> SelectedBuildingPanel
         App --> MiniMap
         App --> playerHuman
         App --> nameLoader
         App --> dialogueTrees
         App --> rendererLoader
         App --> IntroScreen
         App --> MapSetupScreen
         App --> CombatPreviewPanel
         App --> BuildCatalogPanel
         App --> eventLogExport
         App --> index
         App --> useGameAudio
         App --> useKeyboardControls
         App --> useCanvasInteractions
         App --> useContextualTutorial
         App --> ContextualTutorialCard
         App --> preferences
         App --> ResourceCost
         App --> resourceCost
         App --> VillageTabPanel
         App --> FrontierTabPanel
         App --> NatureTabPanel
         App --> ProgressTabPanel
         App --> LogTabPanel
         App --> MoreTabPanel
         App --> AlertBar
         App --> Emoji
         App --> GameHeader
         App --> priorityAlerts
         App --> focusHints
         App --> hotkeys
         App --> TutorialOverlay
         App --> buildingConfig
         gameEngine --> gameTypes
         gameEngine --> speciesConfig
         gameEngine --> simFocus
         gameEngine --> simHelpers
         gameEngine --> grassEcology
         gameEngine --> simEffects
         gameEngine --> juiceEffects
         gameEngine --> terrainSystems
         gameEngine --> adjacencyIndex
         gameEngine --> entityIndex
         gameEngine --> workforce
         gameEngine --> gameTick
         gameEngine --> terrainGen
         gameEngine --> stats
         gameEngine --> victory
         gameEngine --> eventLog
         gameEngine --> groupEvents
         gameEngine --> rivalPeace
         gameEngine --> playerHuman
         gameEngine --> entityFactory
         gameEngine --> frontierCombat
         gameEngine --> ecosystemPressure
         gameEngine --> ecoBreakdown
         gameEngine --> ecologyStage
         gameEngine --> populationGrowth
         gameEngine --> rivalDisplay
         gameEngine --> combat
         gameEngine --> villageLeadership
         gameEngine --> entityCounts
         gameEngine --> saveLoad
         gameEngine --> buildingActions
         gameEngine --> stripBuild
         gameEngine --> economy
         gameEngine --> research
         gameEngine --> worldGen
         gameEngine --> dayCycle
         gameEngine --> lifeSimulation
         gameEngine --> worldEvents
         gameEngine --> version
         gameEngine --> skills
         gameEngine --> forge
         gameTypes --> resourceTypes
         gameTypes --> ecologyStage
         gameTypes --> stats
         gameTypes --> omenTypes
         gameTypes --> scentGrid
         gameTypes --> spatialGrid
         gameTypes --> adjacencyIndex
         gameTypes --> version
         ecologyStage --> gameTypes
         ecologyStage --> dayCycle
         ecologyStage --> ecosystemPressure
         ecologyStage --> simEffects
         ecologyStage --> eventLog
         dayCycle --> gameTypes
         dayCycle --> moonHowler
         dayCycle --> humanChat
         dayCycle --> dayCycleConstants
         moonHowler --> gameTypes
         moonHowler --> dayCycleConstants
         moonHowler --> dayCycle
         moonHowler --> playerHuman
         moonHowler --> simFocus
         moonHowler --> simEffects
         moonHowler --> eventLog
         moonHowler --> workforce
         playerHuman --> gameTypes
         simFocus --> gameTypes
         simEffects --> gameTypes
         simEffects --> juiceEffects
         juiceEffects --> gameTypes
         juiceEffects --> playerHuman
         eventLog --> gameTypes
         workforce --> gameTypes
         workforce --> skills
         workforce --> playerHuman
         workforce --> dayCycle
         workforce --> eventLog
         workforce --> simEffects
         skills --> gameTypes
         humanChat --> dialogueTrees
         humanChat --> gameTypes
         dialogueTrees --> nodeRuntime
         ecosystemPressure --> gameTypes
         ecosystemPressure --> dayCycle
         ecosystemPressure --> grassEcology
         grassEcology --> gameTypes
         grassEcology --> dayCycle
         stats --> gameTypes
         stats --> playerHuman
         scentGrid --> gameTypes
         scentGrid --> spatialGrid
         scentGrid --> moonHowler
         spatialGrid --> gameTypes
         spatialGrid --> spatialQueryMetrics
         adjacencyIndex --> gameTypes
         speciesConfig --> gameTypes
         speciesConfig --> dayCycle
         simHelpers --> gameTypes
         terrainSystems --> gameTypes
         terrainSystems --> adjacencyIndex
         terrainSystems --> buildingRotation
         buildingRotation --> gameTypes
         entityIndex --> gameTypes
         gameTick --> gameTypes
         gameTick --> stats
         gameTick --> victory
         gameTick --> eventLog
         gameTick --> entityIndex
         gameTick --> grassEcology
         gameTick --> dayCycle
         gameTick --> simFocus
         gameTick --> simHelpers
         gameTick --> simEffects
         gameTick --> workforce
         gameTick --> playerHuman
         gameTick --> lifeSimulation
         gameTick --> tickLayerRealtime
         gameTick --> tickLayerSystems
         gameTick --> tickLayerAssign
         gameTick --> tickLayerDaily
         gameTick --> spatialGrid
         gameTick --> entityCounts
         gameTick --> spatialQueryMetrics
         victory --> gameTypes
         lifeSimulation --> gameTypes
         lifeSimulation --> defenseStructures
         lifeSimulation --> speciesConfig
         lifeSimulation --> simFocus
         lifeSimulation --> simEffects
         lifeSimulation --> workforce
         lifeSimulation --> economy
         lifeSimulation --> grassEcology
         lifeSimulation --> playerHuman
         lifeSimulation --> moonHowler
         lifeSimulation --> villageLeadership
         lifeSimulation --> ecologyStage
         lifeSimulation --> dayCycle
         lifeSimulation --> humanChat
         lifeSimulation --> humanSprites
         lifeSimulation --> citizenId
         lifeSimulation --> nameLoader
         lifeSimulation --> renffrStar
         lifeSimulation --> combat
         lifeSimulation --> buildingRotation
         lifeSimulation --> entityFactory
         lifeSimulation --> eventLog
         lifeSimulation --> education
         lifeSimulation --> townHall
         lifeSimulation --> frontierCombat
         lifeSimulation --> tradeCaravans
         lifeSimulation --> factionWander
         lifeSimulation --> socialLife
         lifeSimulation --> hospitalCare
         lifeSimulation --> hotelStay
         lifeSimulation --> pathfinding
         lifeSimulation --> economyLedger
         lifeSimulation --> spatialGrid
         lifeSimulation --> simQueries
         lifeSimulation --> scentGrid
         defenseStructures --> gameTypes
         defenseStructures --> dayCycle
         defenseStructures --> entityIndex
         defenseStructures --> forge
         forge --> gameTypes
         forge --> resourceCost
         forge --> dayCycle
         forge --> combatTech
         forge --> eventLog
         forge --> simEffects
         resourceCost --> resourceLabels
         economy --> gameTypes
         economy --> resourceUtils
         economy --> gameEngine
         economy --> tradeCaravans
         resourceUtils --> gameTypes
         tradeCaravans --> gameTypes
         tradeCaravans --> dayCycle
         tradeCaravans --> frontierCombat
         tradeCaravans --> gameEngine
         tradeCaravans --> resourceUtils
         tradeCaravans --> townHall
         tradeCaravans --> eventLog
         tradeCaravans --> entityFactory
         tradeCaravans --> entityIndex
         frontierCombat --> gameTypes
         frontierCombat --> dayCycle
         frontierCombat --> entityIndex
         frontierCombat --> combat
         frontierCombat --> citizenId
         frontierCombat --> eventLog
         frontierCombat --> playerHuman
         frontierCombat --> rivalPeace
         frontierCombat --> skills
         frontierCombat --> militiaBalance
         frontierCombat --> resourceCost
         combat --> gameTypes
         combat --> forge
         combat --> combatTech
         citizenId --> gameTypes
         citizenId --> dayCycle
         rivalPeace --> gameTypes
         militiaBalance --> gameTypes
         militiaBalance --> combat
         militiaBalance --> defenseStructures
         militiaBalance --> playerHuman
         townHall --> gameTypes
         townHall --> dayCycle
         townHall --> skills
         townHall --> gameEngine
         townHall --> economy
         townHall --> eventLog
         townHall --> villageLeadership
         townHall --> humanChat
         townHall --> playerHuman
         villageLeadership --> gameTypes
         villageLeadership --> dayCycle
         villageLeadership --> eventLog
         villageLeadership --> simEffects
         villageLeadership --> playerHuman
         villageLeadership --> humanChat
         villageLeadership --> skills
         entityFactory --> gameTypes
         entityFactory --> dayCycle
         entityFactory --> nameLoader
         entityFactory --> humanSprites
         entityFactory --> speciesConfig
         nameLoader --> citizenId
         nameLoader --> gameTypes
         nameLoader --> nodeRuntime
         humanSprites --> gameTypes
         humanSprites --> spriteLoader
         spriteLoader --> gameTypes
         renffrStar --> omenTypes
         renffrStar --> dayCycle
         renffrStar --> humanChat
         renffrStar --> playerHuman
         renffrStar --> gameTypes
         education --> gameTypes
         education --> dayCycle
         education --> skills
         education --> simEffects
         education --> citizenId
         education --> eventLog
         education --> playerHuman
         factionWander --> gameTypes
         factionWander --> frontierCombat
         factionWander --> dayCycle
         socialLife --> gameTypes
         socialLife --> dayCycle
         socialLife --> humanChat
         hospitalCare --> gameTypes
         hospitalCare --> dayCycle
         hospitalCare --> simEffects
         hospitalCare --> simHelpers
         hospitalCare --> humanChat
         hospitalCare --> skills
         hospitalCare --> playerHuman
         hotelStay --> gameTypes
         hotelStay --> dayCycle
         hotelStay --> simEffects
         hotelStay --> pathfinding
         hotelStay --> eventLog
         hotelStay --> humanChat
         hotelStay --> skills
         hotelStay --> playerHuman
         pathfinding --> gameTypes
         economyLedger --> gameTypes
         economyLedger --> dayCycle
         simQueries --> gameTypes
         simQueries --> playerHuman
         simQueries --> spatialGrid
         simQueries --> spatialQueryMetrics
         tickLayerRealtime --> huntvisuals
         tickLayerRealtime --> gameTypes
         tickLayerRealtime --> spatialGrid
         tickLayerRealtime --> scentGrid
         tickLayerRealtime --> entityCounts
         tickLayerRealtime --> lifeSimulation
         tickLayerRealtime --> workforce
         tickLayerRealtime --> renffrStar
         tickLayerRealtime --> dayCycle
         tickLayerRealtime --> eventLog
         tickLayerRealtime --> moonHowler
         tickLayerRealtime --> playerHuman
         tickLayerRealtime --> hotelStay
         tickLayerRealtime --> villageLeadership
         tickLayerRealtime --> simEffects
         huntvisuals --> gameTypes
         entityCounts --> gameTypes
         entityCounts --> playerHuman
         tickLayerSystems --> gameTypes
         tickLayerSystems --> speciesConfig
         tickLayerSystems --> dayCycle
         tickLayerSystems --> lifeSimulation
         tickLayerSystems --> worldEvents
         tickLayerSystems --> research
         tickLayerSystems --> tradeCaravans
         tickLayerSystems --> entityFactory
         tickLayerSystems --> entityIndex
         tickLayerSystems --> simEffects
         tickLayerSystems --> simFocus
         tickLayerSystems --> simHelpers
         tickLayerSystems --> entityCounts
         worldEvents --> gameTypes
         worldEvents --> dayCycle
         worldEvents --> entityIndex
         worldEvents --> citizenId
         worldEvents --> eventLog
         worldEvents --> gameEngine
         research --> gameTypes
         research --> eventLog
         research --> simEffects
         research --> simHelpers
         research --> education
         research --> playerHuman
         research --> dayCycle
         tickLayerAssign --> gameTypes
         tickLayerAssign --> lifeSimulation
         tickLayerAssign --> dayCycle
         tickLayerAssign --> workforce
         tickLayerDaily --> gameTypes
         tickLayerDaily --> adjacencyIndex
         tickLayerDaily --> entityIndex
         tickLayerDaily --> entityCounts
         tickLayerDaily --> economy
         tickLayerDaily --> eventLog
         tickLayerDaily --> forge
         tickLayerDaily --> treeProximity
         tickLayerDaily --> dayCycle
         tickLayerDaily --> lifeSimulation
         tickLayerDaily --> simHelpers
         tickLayerDaily --> simEffects
         tickLayerDaily --> economyLedger
         tickLayerDaily --> visitorQuest
         tickLayerDaily --> villageLeadership
         tickLayerDaily --> terrainSystems
         tickLayerDaily --> skills
         tickLayerDaily --> workforce
         tickLayerDaily --> playerHuman
         tickLayerDaily --> hospitalCare
         tickLayerDaily --> townHall
         tickLayerDaily --> ecologyStage
         tickLayerDaily --> groupEvents
         tickLayerDaily --> stats
         tickLayerDaily --> frontierCombat
         tickLayerDaily --> factionWander
         tickLayerDaily --> worldGen
         tickLayerDaily --> challenges
         tickLayerDaily --> huntvisuals
         tickLayerDaily --> juiceEffects
         tickLayerDaily --> preferences
         treeProximity --> gameTypes
         visitorQuest --> gameTypes
         visitorQuest --> dayCycle
         visitorQuest --> simEffects
         groupEvents --> gameTypes
         groupEvents --> dayCycle
         groupEvents --> entityFactory
         groupEvents --> entityIndex
         groupEvents --> speciesConfig
         groupEvents --> resourceUtils
         groupEvents --> nameLoader
         groupEvents --> combat
         groupEvents --> visitorQuest
         groupEvents --> eventLog
         groupEvents --> frontierCombat
         groupEvents --> factionWander
         groupEvents --> townHall
         groupEvents --> playerHuman
         groupEvents --> rivalPeace
         worldGen --> gameTypes
         worldGen --> terrainGen
         worldGen --> victory
         worldGen --> preferences
         worldGen --> nameLoader
         worldGen --> dayCycle
         worldGen --> eventLog
         worldGen --> entityIndex
         worldGen --> research
         worldGen --> entityCounts
         worldGen --> playerHuman
         worldGen --> speciesConfig
         worldGen --> entityFactory
         worldGen --> villageLeadership
         worldGen --> factionWander
         worldGen --> forge
         worldGen --> buildingRotation
         worldGen --> stats
         terrainGen --> gameTypes
         challenges --> gameTypes
         ecoBreakdown --> gameTypes
         ecoBreakdown --> playerHuman
         populationGrowth --> gameTypes
         populationGrowth --> dayCycle
         populationGrowth --> playerHuman
         rivalDisplay --> gameTypes
         saveLoad --> gameTypes
         saveLoad --> stats
         saveLoad --> viewState
         saveLoad --> saveSchema
         saveLoad --> terrainGen
         saveLoad --> dayCycle
         saveLoad --> combat
         saveLoad --> victory
         saveLoad --> preferences
         saveLoad --> eventLog
         saveLoad --> humanSprites
         saveLoad --> moonHowler
         saveLoad --> playerHuman
         saveLoad --> version
         saveLoad --> skills
         saveLoad --> contextualTutorial
         saveLoad --> research
         saveLoad --> gameEngine
         saveLoad --> entityIndex
         saveLoad --> frontierCombat
         saveLoad --> entityCounts
         saveLoad --> economy
         saveLoad --> tradeCaravans
         saveLoad --> factionWander
         saveLoad --> villageLeadership
         saveLoad --> ecologyStage
         saveLoad --> forge
         viewState --> gameTypes
         viewState --> stripBuild
         viewState --> saveSchema
         stripBuild --> gameTypes
         stripBuild --> stripJunction
         stripBuild --> buildingRotation
         stripJunction --> gameTypes
         stripJunction --> buildingRotation
         saveSchema --> gameTypes
         contextualTutorial --> gameTypes
         contextualTutorial --> focusHints
         contextualTutorial --> dayCycle
         contextualTutorial --> playerHuman
         focusHints --> gameTypes
         focusHints --> populationGrowth
         focusHints --> victory
         focusHints --> villageLeadership
         focusHints --> combat
         focusHints --> frontierCombat
         focusHints --> forge
         focusHints --> ecologyStage
         buildingActions --> gameTypes
         buildingActions --> skills
         buildingActions --> economy
         buildingActions --> simEffects
         buildingActions --> simHelpers
         buildingActions --> workforce
         buildingActions --> adjacencyIndex
         buildingActions --> terrainSystems
         buildingActions --> entityIndex
         buildingActions --> playerHuman
         buildingActions --> dayCycle
         buildingActions --> moonHowler
         buildingActions --> research
         buildingActions --> buildingRotation
         buildingActions --> stripBuild
         buildingActions --> stripTopology
         buildingActions --> entityFactory
         buildingActions --> worldGen
         buildingActions --> nameLoader
         buildingActions --> eventLog
         buildingActions --> placementUtils
         stripTopology --> gameTypes
         stripTopology --> buildingRotation
         stripTopology --> stripBuild
         stripTopology --> stripJunction
         placementUtils --> buildingRotation
         placementUtils --> gameTypes
         placementUtils --> renderSnapshot
         renderSnapshot --> gameTypes
         renderSnapshot --> gameEngine
         renderSnapshot --> dayCycle
         renderSnapshot --> preferences
         renderSnapshot --> entityCatalog
         renderSnapshot --> entityRenderMeta
         renderSnapshot --> renderSoAReader
         renderSnapshot --> scentGrid
         renderSnapshot --> renderSoAEntities
         renderSnapshot --> spatialGrid
         renderSnapshot --> viewState
         entityCatalog --> gameTypes
         entityCatalog --> playerHuman
         entityCatalog --> simDelta
         simDelta --> gameTypes
         simDelta --> gameEngine
         simDelta --> entityRenderMeta
         simDelta --> packRenderSoA
         simDelta --> schema
         entityRenderMeta --> gameTypes
         entityRenderMeta --> renderSoAReader
         entityRenderMeta --> schema
         renderSoAReader --> gameTypes
         renderSoAReader --> entityTypeCodes
         renderSoAReader --> schema
         entityTypeCodes --> gameTypes
         packRenderSoA --> gameTypes
         packRenderSoA --> gameEngine
         packRenderSoA --> playerHuman
         packRenderSoA --> entityTypeCodes
         packRenderSoA --> renderSoAReader
         packRenderSoA --> schema
         renderSoAEntities --> gameTypes
         renderSoAEntities --> spatialGrid
         renderSoAEntities --> entityRenderMeta
         renderSoAEntities --> renderSoAReader
         gameLoop --> gameTypes
         gameLoop --> gameEngine
         gameLoop --> entityCatalog
         gameLoop --> rendererLoader
         gameLoop --> renderSnapshot
         gameLoop --> applyKinematics
         gameLoop --> entityRenderMeta
         gameLoop --> renderSoAReader
         gameLoop --> factionWander
         gameLoop --> GameWorkerHost
         gameLoop --> commands
         gameLoop --> scentGrid
         gameLoop --> viewState
         rendererLoader --> renderer
         renderer --> gameEngine
         renderer --> viewState
         renderer --> gameTypes
         renderer --> renderSnapshot
         renderer --> renderSoAEntities
         renderer --> spatialGrid
         renderer --> buildCatalog
         renderer --> buildingRotation
         renderer --> juiceEffects
         renderer --> placementUtils
         renderer --> spriteLoader
         renderer --> humanSprites
         renderer --> entitySprites
         renderer --> humanChat
         renderer --> dayCycle
         renderer --> education
         renderer --> stripBuild
         renderer --> stripRender
         renderer --> stripJunction
         renderer --> simHelpers
         renderer --> renffrStar
         renderer --> huntvisuals
         renderer --> combat
         renderer --> terrainLayer
         renderer --> entityLayer
         renderer --> canvasLayer
         buildCatalog --> gameTypes
         buildCatalog --> resourceCost
         entitySprites --> gameTypes
         entitySprites --> humanSprites
         stripRender --> gameTypes
         stripRender --> buildingRotation
         stripRender --> stripJunction
         terrainLayer --> gameTypes
         terrainLayer --> canvasLayer
         terrainLayer --> spriteLoader
         entityLayer --> renderSnapshot
         entityLayer --> canvasLayer
         entityLayer --> gameTypes
         applyKinematics --> entityCatalog
         applyKinematics --> entityRenderMeta
         applyKinematics --> renderSoAReader
         applyKinematics --> schema
         GameWorkerHost --> gameTypes
         GameWorkerHost --> gameEngine
         GameWorkerHost --> renderSoAReader
         GameWorkerHost --> entityRenderMeta
         GameWorkerHost --> simDelta
         GameWorkerHost --> renderBufferPool
         GameWorkerHost --> scentGrid
         GameWorkerHost --> commands
         GameWorkerHost --> protocol
         renderBufferPool --> schema
         commands --> gameTypes
         commands --> buildingRotation
         commands --> stripBuild
         commands --> groupEvents
         commands --> buildingActions
         commands --> forge
         commands --> research
         commands --> tradeCaravans
         commands --> simEffects
         commands --> visitorQuest
         commands --> frontierCombat
         commands --> townHall
         commands --> simDelta
         protocol --> gameTypes
         uiSimSummary --> entityCatalog
         uiSimSummary --> gameTypes
         uiSimSummary --> dayCycle
         uiSimSummary --> populationGrowth
         uiSimSummary --> playerHuman
         raidUtils --> gameEngine
         raidUtils --> frontierCombat
         SelectedBuildingPanel --> CollapsibleSection
         SelectedBuildingPanel --> gameEngine
         SelectedBuildingPanel --> buildingActions
         SelectedBuildingPanel --> moonHowler
         SelectedBuildingPanel --> dayCycle
         SelectedBuildingPanel --> buildCatalog
         SelectedBuildingPanel --> townHall
         SelectedBuildingPanel --> hotelStay
         SelectedBuildingPanel --> gameTypes
         SelectedBuildingPanel --> buildingConfig
         SelectedBuildingPanel --> raidUtils
         SelectedBuildingPanel --> commands
         SelectedBuildingPanel --> CombatPreviewPanel
         SelectedBuildingPanel --> BlacksmithForgePanel
         buildingConfig --> gameEngine
         buildingConfig --> gameTypes
         CombatPreviewPanel --> frontierCombat
         BlacksmithForgePanel --> forge
         BlacksmithForgePanel --> gameTypes
         BlacksmithForgePanel --> Emoji
         BlacksmithForgePanel --> ResourceCost
         ResourceCost --> ResourceIcons
         ResourceCost --> resourceLabels
         ResourceCost --> resourceCost
         ResourceIcons --> resourceLabels
         MiniMap --> gameEngine
         MiniMap --> viewState
         MiniMap --> gameTypes
         IntroScreen --> index
         IntroScreen --> version
         index --> ambient
         index --> backgroundMusic
         index --> director
         index --> graph_xx
         index --> introMusic
         index --> preferences
         index --> tracks
         index --> interactionSfx
         index --> constants
         index --> sfx
         ambient --> graph_xx
         ambient --> trackPlayer
         ambient --> tracks
         graph_xx --> constants
         graph_xx --> preferences
         preferences --> constants
         trackPlayer --> graph_xx
         trackPlayer --> sampleLoader
         sampleLoader --> tracks
         sampleLoader --> graph_xx
         backgroundMusic --> constants
         backgroundMusic --> htmlAudioSync
         backgroundMusic --> graph_xx
         backgroundMusic --> scheduler
         backgroundMusic --> trackPlayer
         backgroundMusic --> tracks
         scheduler --> graph_xx
         director --> ambient
         director --> backgroundMusic
         director --> graph_xx
         director --> introMusic
         director --> preferences
         director --> sampleLoader
         director --> session
         introMusic --> htmlAudioSync
         introMusic --> graph_xx
         introMusic --> trackPlayer
         introMusic --> tracks
         introMusic --> scheduler
         interactionSfx --> graph_xx
         interactionSfx --> tracks
         interactionSfx --> trackPlayer
         interactionSfx --> sfx
         sfx --> constants
         sfx --> graph_xx
         sfx --> scheduler
         MapSetupScreen --> Emoji
         MapSetupScreen --> gameEngine
         MapSetupScreen --> index
         MapSetupScreen --> gameTypes
         BuildCatalogPanel --> gameEngine
         BuildCatalogPanel --> gameTypes
         BuildCatalogPanel --> buildCatalog
         BuildCatalogPanel --> Emoji
         BuildCatalogPanel --> ResourceCost
         BuildCatalogPanel --> buildingRotation
         eventLogExport --> gameTypes
         eventLogExport --> version
         useGameAudio --> gameEngine
         useGameAudio --> dayCycle
         useGameAudio --> interactionDetect
         useGameAudio --> index
         interactionDetect --> gameEngine
         interactionDetect --> interactionSfx
         useKeyboardControls --> gameLoop
         useKeyboardControls --> entityCatalog
         useKeyboardControls --> viewState
         useKeyboardControls --> buildingRotation
         useKeyboardControls --> playerHuman
         useKeyboardControls --> hotkeys
         useKeyboardControls --> gameEngine
         hotkeys --> gameTypes
         useCanvasInteractions --> gameLoop
         useCanvasInteractions --> gameEngine
         useCanvasInteractions --> buildingActions
         useCanvasInteractions --> viewState
         useCanvasInteractions --> buildingRotation
         useCanvasInteractions --> humanSprites
         useCanvasInteractions --> index
         useCanvasInteractions --> commands
         useContextualTutorial --> gameEngine
         useContextualTutorial --> contextualTutorial
         ContextualTutorialCard --> Emoji
         ContextualTutorialCard --> contextualTutorial
         ContextualTutorialCard --> focusHints
         VillageTabPanel --> gameTypes
         VillageTabPanel --> forge
         VillageTabPanel --> gameEngine
         VillageTabPanel --> economyLedger
         VillageTabPanel --> uiSimSummary
         VillageTabPanel --> focusHints
         VillageTabPanel --> CollapsibleSection
         VillageTabPanel --> FocusPanel
         VillageTabPanel --> VillageLeadershipPanel
         VillageTabPanel --> PopulationPanel
         FocusPanel --> Emoji
         FocusPanel --> focusHints
         FocusPanel --> gameTypes
         VillageLeadershipPanel --> gameTypes
         VillageLeadershipPanel --> villageLeadership
         PopulationPanel --> gameTypes
         PopulationPanel --> playerHuman
         PopulationPanel --> dayCycle
         PopulationPanel --> villageLeadership
         PopulationPanel --> populationGrowth
         PopulationPanel --> citizenId
         PopulationPanel --> education
         FrontierTabPanel --> gameEngine
         FrontierTabPanel --> FrontierPanel
         FrontierPanel --> gameTypes
         FrontierPanel --> CombatPreviewPanel
         FrontierPanel --> gameEngine
         FrontierPanel --> defenseStructures
         FrontierPanel --> militiaBalance
         NatureTabPanel --> gameEngine
         NatureTabPanel --> temperature
         NatureTabPanel --> gameTypes
         NatureTabPanel --> ecologyStage
         NatureTabPanel --> Emoji
         temperature --> gameTypes
         ProgressTabPanel --> gameTypes
         ProgressTabPanel --> gameEngine
         ProgressTabPanel --> tradeCaravans
         ProgressTabPanel --> villagePortrait
         ProgressTabPanel --> ChallengesPanel
         ProgressTabPanel --> StatisticsPanel
         villagePortrait --> gameTypes
         villagePortrait --> playerHuman
         villagePortrait --> rivalPeace
         villagePortrait --> eventLog
         ChallengesPanel --> challenges
         ChallengesPanel --> gameTypes
         StatisticsPanel --> gameEngine
         StatisticsPanel --> ResourceIcons
         LogTabPanel --> gameEngine
         LogTabPanel --> EventLogPanel
         LogTabPanel --> CombatLogPanel
         EventLogPanel --> gameTypes
         EventLogPanel --> eventLogExport
         CombatLogPanel --> gameTypes
         CombatLogPanel --> eventLog
         CombatLogPanel --> eventLogExport
         MoreTabPanel --> gameEngine
         MoreTabPanel --> guideHelp
         MoreTabPanel --> RoadmapPanel
         RoadmapPanel --> version
         RoadmapPanel --> roadmapContent
         AlertBar --> Emoji
         AlertBar --> priorityAlerts
         priorityAlerts --> gameTypes
         priorityAlerts --> forge
         priorityAlerts --> frontierCombat
         GameHeader --> Emoji
         GameHeader --> GameMenu
         GameHeader --> ResourceBadge
         GameHeader --> gameTypes
         GameHeader --> dayCycle
         GameHeader --> populationGrowth
         GameHeader --> villageLeadership
         GameHeader --> temperature
         GameMenu --> RoadmapPanel
         ResourceBadge --> ResourceIcons
         ResourceBadge --> resourceLabels
         TutorialOverlay --> Emoji



