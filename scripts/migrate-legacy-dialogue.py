import json
from pathlib import Path

APP_JSON = Path(__file__).resolve().parents[1] / 'src' / 'game' / 'data' / 'sim_dialogue_trees.json'
ROOT_JSON = Path(__file__).resolve().parents[2] / 'sim_dialogue_trees.json'


def tree(tid: str, category: str, a: str, b: str, l1: str, l2: str, l3: str) -> dict:
    return {
        'id': tid,
        'category': category,
        'speakers': [a, b],
        'lines': [
            {'speaker': a, 'text': l1},
            {'speaker': b, 'text': l2},
            {'speaker': a, 'text': l3},
        ],
    }


def main() -> None:
    data = json.loads(APP_JSON.read_text(encoding='utf-8'))
    existing_ids = {t['id'] for t in data['dialogue_trees']}

    legacy: list[dict] = []

    legacy += [
        tree('wf_home_arrival', 'needs', 'settler', 'housemate', 'Home at last.', 'Long day, huh?', 'Feet up soon.'),
        tree('wf_home_cozy', 'needs', 'settler', 'housemate', 'Cozy night.', 'Kettle on?', 'Quiet evening.'),
        tree('wf_home_warm', 'needs', 'settler', 'housemate', 'Warm fire soon.', 'Glad to be back.', 'Settle in?'),
        tree('wf_home_indoors', 'needs', 'settler', 'housemate', 'Finally indoors.', 'Smells like stew.', 'Good night.'),
        tree('wf_home_winter', 'needs', 'settler', 'housemate', 'Shut the door!', 'Chimney smoke.', 'Blankets out.'),
        tree('wf_home_festival', 'needs', 'settler', 'housemate', 'Guests in the lane!', 'Smell the pies?', 'Glad to be back.'),
        tree('wf_home_food', 'needs', 'settler', 'housemate', 'Thin stew tonight.', 'Save a crust for morning.', 'Children first.'),
        tree('wf_sleep', 'needs', 'settler', 'housemate', 'Zzz…', 'Good night.', 'Dream well.'),
        tree('wf_sleep_long', 'needs', 'settler', 'housemate', 'Long day…', 'Quiet house.', 'Home sweet home.'),
        tree('wf_food_crisis', 'needs', 'hungry_settler', 'pantry_keeper', 'Cupboards bare…', 'Ration the grain.', 'Hunters must bring more.'),
        tree('wf_food_soup', 'needs', 'cook', 'neighbor', 'Soup again?', 'We need farms.', 'Winter stores thin.'),
        tree('wf_pregnant', 'needs', 'expectant_mother', 'partner', 'Oof…', 'Little kick…', 'Counting days…'),
        tree('wf_pregnant_tired', 'needs', 'expectant_mother', 'friend', 'So tired…', 'Nursery ready?', "Baby's restless."),
    ]

    legacy += [
        tree('wf_work_shift', 'work', 'laborer', 'foreman', 'Hard work!', 'More wood!', 'Keep at it.'),
        tree('wf_work_busy', 'work', 'farmer', 'helper', 'Busy day.', 'Good yield.', 'One more load.'),
        tree('wf_work_tools', 'work', 'smith', 'carpenter', 'Sturdy beams.', 'Tools need sharpening.', "Shift's long."),
        tree('wf_work_winter', 'work', 'laborer', 'foreman', 'Fingers numb.', 'Shorter daylight.', 'Almost done.'),
        tree('wf_work_rain', 'work', 'builder', 'neighbor', 'Roof leak again.', 'Work in the barn.', 'Hope it holds.'),
        tree('wf_work_festival', 'work', 'laborer', 'friend', 'Half day tomorrow?', 'Finish before the dance.', 'Good yield.'),
        tree('wf_guard_patrol', 'work', 'guard', 'relief', 'All quiet.', 'Perimeter clear.', 'Hold the line.'),
        tree('wf_guard_night', 'work', 'guard', 'captain', 'Eyes open.', 'I saw movement.', 'Torch lit.'),
        tree('wf_guard_wait', 'work', 'guard', 'relief', 'Nothing yet.', 'Relief soon?', 'All quiet.'),
        tree('wf_hunt_stalk', 'work', 'hunter', 'partner', 'There!', 'Shhh…', 'Steady…'),
        tree('wf_hunt_catch', 'work', 'hunter', 'partner', 'Prey!', 'Quiet…', 'Got one!'),
        tree('wf_hunt_wind', 'work', 'hunter', 'partner', 'Tracks here.', "Wind's wrong.", 'Almost in range.'),
    ]

    legacy += [
        tree('wf_social_hey', 'social', 'neighbor_a', 'neighbor_b', 'Hey!', 'Fine day.', 'Fine village.'),
        tree('wf_social_peace', 'social', 'elder', 'youth', 'Peaceful, for now.', 'Heard the news?', 'Busy week.'),
        tree('wf_social_harvest', 'social', 'farmer', 'trader', 'Good harvest?', 'Roads help.', 'Seen the traders?'),
        tree('wf_social_kids', 'social', 'parent', 'neighbor', 'Kids are loud today.', 'Nice weather.', 'Hungry yet?'),
        tree('wf_social_wolves', 'social', 'settler', 'neighbor', 'Wolves again…', 'Bars are latched.', 'Cold out.'),
        tree('wf_child_mama', 'social', 'child', 'parent', 'Mama!', 'Look!', 'Race you!'),
        tree('wf_child_play', 'social', 'child', 'sibling', 'Yay!', 'I found a bug!', 'Hehe!'),
        tree('wf_child_help', 'social', 'child', 'parent', 'Can I help?', 'Story time?', 'Wait up!'),
        tree('wf_school_lesson', 'social', 'pupil', 'teacher', 'Lesson time!', 'ABC…', 'I learned!'),
        tree('wf_school_recess', 'social', 'pupil', 'classmate', 'Recess soon?', 'Books!', 'Sums are hard.'),
        tree('wf_school_class', 'social', 'pupil', 'teacher', 'Teacher?', "Who's top of class?", 'Books!'),
        tree('wf_courtship_walk', 'social', 'suitor', 'beloved', 'Walk with me?', 'Gladly.', 'Moon looks kind tonight.'),
        tree('wf_courtship_well', 'social', 'suitor', 'beloved', 'You look well.', 'So do you.', 'Care for a stroll?'),
        tree('wf_courtship_evening', 'social', 'suitor', 'beloved', 'Lovely evening.', 'It is now.', 'Fancy meeting you.'),
        tree('wf_courtship_company', 'social', 'suitor', 'beloved', 'Care for company?', 'I would.', 'Pretty view.'),
        tree('wf_courtship_boots', 'social', 'suitor', 'beloved', 'Nice boots.', 'Hi there.', 'Lovely day…'),
        tree('wf_visitor_trade', 'social', 'visitor', 'host', 'Greetings!', 'Trade?', 'Your reputation travels.'),
        tree('wf_visitor_roads', 'social', 'visitor', 'host', 'Safe roads?', 'Fine village.', 'We brought news.'),
        tree('wf_visitor_passing', 'social', 'visitor', 'host', 'Passing through.', 'Camped down the road.', 'Greetings!'),
        tree('wf_rival_fences', 'social', 'rival', 'settler', 'Mind your fences.', 'Our land too.', 'Bold settlers.'),
        tree('wf_rival_watch', 'social', 'rival', 'settler', 'Watching you.', 'Hmm.', 'Keep your distance.'),
        tree('wf_rival_slight', 'social', 'rival', 'settler', 'We remember slights.', 'Mind your fences.', 'Our land too.'),
        tree('wf_festival_feast', 'social', 'reveler', 'friend', 'What a feast!', 'Dance!', 'Music tonight!'),
        tree('wf_festival_cheers', 'social', 'reveler', 'friend', 'Cheers!', 'Harvest revel!', 'Flags up!'),
        tree('wf_festival_best', 'social', 'reveler', 'visitor', 'Visitors everywhere.', 'Best week of the year!', 'What a feast!'),
    ]

    for tid, l1, l2, l3 in [
        ('wf_housemate_longday', 'Long day.', 'Tell me about it.', 'Kettle on?'),
        ('wf_housemate_rain', 'Smells like rain.', 'Hope the roof holds.', "I'll check the thatch."),
        ('wf_housemate_kids', 'Kids asleep?', 'Finally quiet.', 'Until morning.'),
        ('wf_housemate_wood', 'Wood pile low.', "I'll chop tomorrow.", 'Again.'),
        ('wf_housemate_wolves', 'Heard wolves.', 'Bars are latched.', 'Sleep close.'),
        ('wf_housemate_harvest', 'Good harvest?', 'Bins are full.', 'For now.'),
        ('wf_housemate_cold', 'Cold night.', "Fire's warm enough.", 'Barely.'),
    ]:
        legacy.append(tree(tid, 'needs', 'housemate_a', 'housemate_b', l1, l2, l3))

    legacy += [
        tree('wf_fear_run', 'chaos', 'settler', 'neighbor', 'Run!', 'Wolf!', "Don't look back!"),
        tree('wf_fear_inside', 'chaos', 'settler', 'guard', 'Inside!', 'Help!', 'Too close!'),
        tree('wf_fear_moon', 'chaos', 'settler', 'elder', 'Moon curse!', 'Inside!', "Don't look back!"),
        tree('wf_affair_secret', 'chaos', 'lover_a', 'lover_b', 'Shh…', 'Our secret.', 'After dark…'),
        tree('wf_affair_meet', 'chaos', 'lover_a', 'lover_b', 'Meet me later.', 'Not here.', "They'll never know."),
        tree('wf_affair_kiss', 'chaos', 'lover_a', 'lover_b', 'Quick kiss.', "Don't tell.", 'Our secret.'),
    ]

    legacy += [
        tree('wf_renffr_stars', 'existential', 'gossip', 'skeptic', 'I saw Renffr in the stars…', 'Did anyone else see the sky?', "Just a shepherd's tale… right?"),
        tree('wf_renffr_mark', 'existential', 'believer', 'doubter', 'The mark of Renffr… plentiful harvest?', 'Grandmother feared that name.', 'Something wrote Renffr up there.'),
        tree('wf_renffr_letters', 'existential', 'scholar', 'farmer', 'The letters scattered…', 'Renffr — old valley omen.', 'Did anyone else see the sky?'),
        tree('wf_election_vote', 'existential', 'voter_a', 'voter_b', "Who'll lead us?", "My vote's cast.", 'Decennial year!'),
        tree('wf_election_speech', 'existential', 'voter', 'neighbor', 'Heard the speeches?', 'Town meeting soon.', 'New leader, new luck.'),
        tree('wf_election_incumbent', 'existential', 'voter_a', 'voter_b', 'Incumbent again?', "Who'll lead us?", 'Heard the speeches?'),
    ]

    legacy += [
        tree('wf_winter_cold', 'environment', 'settler', 'neighbor', 'So cold…', 'Frost again.', 'Boots frozen.'),
        tree('wf_winter_wood', 'environment', 'settler', 'elder', "Wood's low.", 'Heat the hall.', 'Spring feels far.'),
        tree('wf_winter_snow', 'environment', 'settler', 'neighbor', "Snow won't quit.", 'Ice on the well.', 'So cold…'),
        tree('wf_weather_rain', 'environment', 'settler', 'neighbor', 'Wet boots.', 'Mud everywhere.', "Rain'll pass."),
        tree('wf_weather_snow', 'environment', 'settler', 'neighbor', 'Deep drifts.', 'Paths are buried.', 'Cold out.'),
        tree('wf_weather_drought', 'environment', 'farmer', 'neighbor', 'Dust in the air.', 'Crops look thirsty.', 'Hungry yet?'),
    ]

    added = 0
    for entry in legacy:
        if entry['id'] not in existing_ids:
            data['dialogue_trees'].append(entry)
            existing_ids.add(entry['id'])
            added += 1

    data['version'] = '1.1'
    text = json.dumps(data, indent=2, ensure_ascii=False) + '\n'
    APP_JSON.write_text(text, encoding='utf-8')
    ROOT_JSON.write_text(text, encoding='utf-8')
    print(f'Added {added} legacy trees; total {len(data["dialogue_trees"])}')


if __name__ == '__main__':
    main()