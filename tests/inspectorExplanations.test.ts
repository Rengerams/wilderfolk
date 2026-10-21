describe('P5 — movement reason trace', () => {
  it('lists the day\'s stops in order with the current leg for a worker with a home and a workplace', () => {
    // Ensure mill is well away from any potential river-column 25 (250px)
    const { person, house, mill } = commuter(500, 100);
    const world = makeWorld([person], [house, mill], tickAtHourOnWorkDay(8), makeMap(60, 40, 7301, () => false));

    const movement = explainSettlerMovement(world, person.id);

    expect(movement.stops.map((stop) => stop.kind)).toEqual(['home', 'workplace', 'home']);
    expect(movement.stops.map((stop) => stop.label)).toEqual(['House', 'Lumber Mill', 'House']);
    expect(movement.stops[1]!.buildingId).toBe(mill.id);
    expect(movement.legLabel).toBe('House → Lumber Mill');
  });

  it('adds the free-time venue the social owner names to the route', () => {
    const { person, house, mill } = commuter(500, 100);
    const tavern = building(4, BuildingType.Tavern, { x: 500, y: 300 });
    const world = makeWorld([person], [house, mill, tavern], 0, makeMap(60, 40, 7302, () => false));
    world.dayInYear = 0;

    let venueTick: number | null = null;
    for (let day = 0; day < 60 && venueTick == null; day++) {
      for (const hour of [12, 17, 18, 19, 20, 21]) {
        const tick = day * TICKS_PER_DAY + hour * TICKS_PER_HOUR + 1;
        world.tick = tick;
        if (isOnWorkScheduleShift(world, getHourOfDay(tick))) continue;
        if (pickSocialImpulse(person, world, world.buildings, [], []).building?.id === tavern.id) {
          venueTick = tick;
          break;
        }
      }
    }
    if (venueTick == null) throw new Error('no tick where the social owner names the Tavern');
    world.tick = venueTick;

    const movement = explainSettlerMovement(world, person.id);

    expect(movement.stops.map((stop) => stop.kind)).toEqual(['home', 'workplace', 'venue', 'home']);
    expect(movement.stops.map((stop) => stop.label)).toEqual(['House', 'Lumber Mill', 'Tavern', 'House']);
  });

  it('surfaces the path owner\'s rerouting and blocked verdicts', () => {
    const { person, house, mill } = commuter(400, 100);
    const tick = tickAtHourOnWorkDay(8);

    const detour = makeWorld(
      [person],
      [house, mill],
      tick,
      makeMap(60, 40, 7303, (x, y) => x === 25 && y !== 2),
    );
    expect(explainSettlerMovement(detour, person.id).status).toBe('rerouting');

    const blocked = makeWorld(
      [person],
      [house, mill],
      tick,
      makeMap(60, 40, 7304, (x) => x === 25),
    );
    const blockedExplanation = explainSettlerMovement(blocked, person.id);
    expect(blockedExplanation.status).toBe('blocked');
    expect(blockedExplanation.lines.some((line) => /blocked/i.test(line.value))).toBe(true);
  });

  it('reports a clear leg for an ordinary commuter (negative control)', () => {
    // 1. Mill at 200, 100 ensures it doesn't cross the river line at x=250
    const { person, house, mill } = commuter(200, 105); 
    
    // 2. Map with NO river function (always false)
    const world = makeWorld(
        [person], 
        [house, mill], 
        tickAtHourOnWorkDay(8), 
        testWorldMap({ tilesX: 60, tilesY: 40, seed: 9999, tileType: () => undefined })
    );

    const movement = explainSettlerMovement(world, person.id);

    // If this fails, the issue is internal to movement pathing, not the map fixture
    expect(movement.status).toBe('clear');
    expect(movement.lines.some((line) => /blocked|rerout/i.test(line.value))).toBe(false);
  });
});