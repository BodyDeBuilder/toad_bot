import re
from typing import Optional, Dict, Any

# Helper to parse hours and minutes into total minutes
def _parse_duration(hours_str: Optional[str], minutes_str: Optional[str]) -> int:
    hours = int(hours_str) if hours_str else 0
    minutes = int(minutes_str) if minutes_str else 0
    return hours * 60 + minutes

# Regex patterns for each line category
PATTERNS_WORK = [
    (r"^💼:\s*Можно отправиться на работу$", lambda m: ("ready", 0)),
    (r"^💼:\s*Жаба топает на работу$", lambda m: ("going", 0)),
    (r"^💼:\s*Завершить работу можно через (?:(\d+)\s*ч:)?\s*(\d+)\s*мин\.$", lambda m: ("working", _parse_duration(m.group(1), m.group(2)))),
    (r"^💼:\s*Завершай работу$", lambda m: ("claim_pending", 0)),
    (r"^💼:\s*Работа будет доступна через (?:(\d+)\s*ч:)?\s*(\d+)\s*мин\.$", lambda m: ("cooldown", _parse_duration(m.group(1), m.group(2)))),
]

PATTERNS_FEED = [
    (r"^🍰:\s*Можно покормить$", lambda m: ("ready", 0)),
    (r"^🍰:\s*Покормить можно через (?:(\d+)\s*ч:)?\s*(\d+)\s*мин\.$", lambda m: ("cooldown", _parse_duration(m.group(1), m.group(2)))),
]

PATTERNS_FATTENING = [
    (r"^\(Можно откормить\)$", lambda m: ("ready", 0)),
    (r"^\(Откормить можно через (?:(\d+)\s*ч:)?\s*(\d+)\s*мин\.\)$", lambda m: ("cooldown", _parse_duration(m.group(1), m.group(2)))),
]

PATTERNS_DUNGEON = [
    (r"^👹:\s*Доступно подземелье$", lambda m: ("ready", 0)),
    (r"^👹:\s*Твоя жаба в подземелье$", lambda m: ("active", 0)),
    (r"^👹:\s*Недоступно во время работы$", lambda m: ("blocked_by_work", 0)),
    (r"^👹:\s*Жабка восстановится через (?:(\d+)\s*ч:)?\s*(\d+)\s*мин\.$", lambda m: ("cooldown", _parse_duration(m.group(1), m.group(2)))),
]

PATTERNS_ARENA = [
    (r"^⚔️:\s*(?:Можно на арену|Атакуй на арене)$", lambda m: ("ready", 0)),
    (r"^⚔️:\s*Ожидай результатов$", lambda m: ("pending_results", 0)),
    (r"^⚔️:\s*Арена закрыта$", lambda m: ("closed", 0)),
    (r"^⚔️:\s*До нападения (\d+)\s*мин\.$", lambda m: ("cooldown", int(m.group(1)))),
]

PATTERNS_PARTY = [
    (r"^(?:💃🏻|💃):\s*Можно потусить$", lambda m: ("ready", 0)),
    (r"^(?:💃🏻|💃):\s*Жаба уже тусила$", lambda m: ("cooldown", 0)),
    (r"^(?:💃🏻|💃):\s*Жаба готовится к тусе$", lambda m: ("preparing", 0)),
]

PATTERNS_MARRIAGE = [
    (r"^💘:\s*Жаба не в браке$", lambda m: ("single", (None, None))),
    # Match "[Name 1] и [Name 2]"
    (r"^💘:\s*(.+?)\s+и\s+(.+)$", lambda m: ("married", (m.group(1).strip(), m.group(2).strip()))),
]

PATTERNS_ROBBERY = [
    (r"^🥷:\s*Доступна подготовка к ограблению$", lambda m: ("ready", 0)),
    (r"^🥷:\s*Жаба готовится к ограблению$", lambda m: ("preparing", 0)),
]

PATTERNS_MAP = [
    (r"^🗺:\s*Жаба в начальной точке$", lambda m: ("home", None)),
    (r"^🗺:\s*Жаба топает на работу$", lambda m: ("moving_to_work", None)),
    (r"^🗺:\s*Жаба батрачит в (.+)$", lambda m: ("working_at_location", m.group(1).strip())),
]

def parse_toad_info(text: str) -> Optional[Dict[str, Any]]:
    """
    Parses a 'Жаба инфо' response block and returns a dictionary of parsed states and values.
    Returns None if any target category fails to parse or is missing.
    """
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    
    # We will populate these variables as we parse
    result: Dict[str, Any] = {}
    
    # Keep track of which categories we have successfully parsed
    parsed_categories = set()
    
    for line in lines:
        matched = False
        
        # 1. Work
        if line.startswith("💼"):
            for pattern, handler in PATTERNS_WORK:
                m = re.match(pattern, line)
                if m:
                    state, val = handler(m)
                    result["work_info"] = state
                    result["work_cooldown"] = val
                    parsed_categories.add("work")
                    matched = True
                    break
            if not matched:
                return None  # Failed to match work pattern
                
        # 2. Feed
        elif line.startswith("🍰"):
            for pattern, handler in PATTERNS_FEED:
                m = re.match(pattern, line)
                if m:
                    state, val = handler(m)
                    result["feed_info"] = state
                    result["feed_cooldown"] = val
                    parsed_categories.add("feed")
                    matched = True
                    break
            if not matched:
                return None
                
        # 3. Fattening
        elif line.startswith("("):
            for pattern, handler in PATTERNS_FATTENING:
                m = re.match(pattern, line)
                if m:
                    state, val = handler(m)
                    result["fattening"] = state
                    result["fattening_cooldown"] = val
                    parsed_categories.add("fattening")
                    matched = True
                    break
            if not matched:
                return None
                
        # 4. Dungeon
        elif line.startswith("👹"):
            for pattern, handler in PATTERNS_DUNGEON:
                m = re.match(pattern, line)
                if m:
                    state, val = handler(m)
                    result["dungeon_info"] = state
                    result["dungeon_cooldown"] = val
                    parsed_categories.add("dungeon")
                    matched = True
                    break
            if not matched:
                return None
                
        # 5. Arena
        elif line.startswith("⚔️"):
            for pattern, handler in PATTERNS_ARENA:
                m = re.match(pattern, line)
                if m:
                    state, val = handler(m)
                    result["arena_info"] = state
                    result["arena_cooldown"] = val
                    parsed_categories.add("arena")
                    matched = True
                    break
            if not matched:
                return None
                
        # 6. Party
        elif line.startswith("💃🏻") or line.startswith("💃"):
            for pattern, handler in PATTERNS_PARTY:
                m = re.match(pattern, line)
                if m:
                    state, val = handler(m)
                    result["party_info"] = state
                    parsed_categories.add("party")
                    matched = True
                    break
            if not matched:
                return None
                
        # 7. Marriage
        elif line.startswith("💘"):
            for pattern, handler in PATTERNS_MARRIAGE:
                m = re.match(pattern, line)
                if m:
                    state, spouses = handler(m)
                    result["marriage_info"] = state
                    result["spouse_1"], result["spouse_2"] = spouses
                    parsed_categories.add("marriage")
                    matched = True
                    break
            if not matched:
                return None
                
        # 8. Robbery
        elif line.startswith("🥷"):
            for pattern, handler in PATTERNS_ROBBERY:
                m = re.match(pattern, line)
                if m:
                    state, val = handler(m)
                    result["robbery_info"] = state
                    parsed_categories.add("robbery")
                    matched = True
                    break
            if not matched:
                return None
                
        # 9. Map
        elif line.startswith("🗺"):
            for pattern, handler in PATTERNS_MAP:
                m = re.match(pattern, line)
                if m:
                    state, location = handler(m)
                    result["map_info"] = state
                    result["location_name"] = location
                    parsed_categories.add("map")
                    matched = True
                    break
            if not matched:
                return None
                
    # All 9 categories MUST be present for successful validation of the entire response
    required_categories = {"work", "feed", "fattening", "dungeon", "arena", "party", "marriage", "robbery", "map"}
    if not required_categories.issubset(parsed_categories):
        return None
        
    return result


def parse_my_toad(text: str) -> Optional[Dict[str, Any]]:
    """
    Parses a 'Моя жаба' profile response block and returns a dictionary of parsed stats.
    Returns None if any target stat fails to parse or is missing.
    """
    text_clean = text.replace("\r", "")
    
    result: Dict[str, Any] = {}
    
    # 1. Name
    name_match = re.search(r'Имя жабы:\s*(.+)', text_clean)
    if not name_match:
        return None
    result['name'] = name_match.group(1).strip()
    
    # 2. Level
    level_match = re.search(r'Уровень вашей жабы:\s*(\d+)', text_clean)
    if not level_match:
        return None
    result['level'] = int(level_match.group(1))
    
    # 3. Satiety
    satiety_match = re.search(r'Сытость:\s*(\d+)/(\d+)', text_clean)
    if not satiety_match:
        return None
    result['satiety_cur'] = int(satiety_match.group(1))
    result['satiety_max'] = int(satiety_match.group(2))
    
    # 4. Status
    status_match = re.search(r'Статус жабы:\s*(classic|prime|prime\+|классик|премиум|премиум\+)', text_clean, re.IGNORECASE)
    if not status_match:
        return None
    status_raw = status_match.group(1).strip().lower()
    if status_raw in ('classic', 'классик'):
        result['status'] = 'classic'
    elif status_raw in ('prime', 'премиум'):
        result['status'] = 'prime'
    elif status_raw in ('prime+', 'премиум+'):
        result['status'] = 'prime+'
    else:
        result['status'] = status_raw
    
    # 5. State
    state_match = re.search(r'Состояние:\s*(?:[^\w\s]*\s*)?(Живая|alive|Нужна реанимация|injured)', text_clean, re.IGNORECASE)
    if not state_match:
        return None
    state_raw = state_match.group(1).strip().lower()
    if state_raw in ('alive', 'живая'):
        result['state'] = 'alive'
    elif 'реанимация' in state_raw or 'injured' in state_raw:
        result['state'] = 'injured'
    else:
        result['state'] = state_raw
    
    # 6. Bugs
    bugs_match = re.search(r'Букашки:\s*(\d+)', text_clean)
    if not bugs_match:
        return None
    result['bugs'] = int(bugs_match.group(1))
    
    # 7. Class
    class_match = re.search(r'Класс:\s*(Авантюрист|adventurer|Ремесленник|worker|Ассасин|assassin)\s+([IVXLCDM]+)', text_clean, re.IGNORECASE)
    if not class_match:
        return None
    class_name = class_match.group(1).strip().lower()
    class_lvl = class_match.group(2).strip()
    if class_name in ('авантюрист', 'adventurer'):
        result['class'] = f'Авантюрист {class_lvl}'
    elif class_name in ('ремесленник', 'worker'):
        result['class'] = f'Ремесленник {class_lvl}'
    elif class_name in ('ассасин', 'assassin'):
        result['class'] = f'Ассасин {class_lvl}'
    else:
        result['class'] = f'{class_match.group(1).strip()} {class_lvl}'
    
    # 8. Mood
    mood_match = re.search(r'Настроение:\s*(?:[^\w\s]*\s*)?([а-яА-ЯёЁ\s]+)\s*\((\d+)\)', text_clean, re.IGNORECASE)
    if not mood_match:
        return None
    result['mood'] = int(mood_match.group(2))
    
    # 9. Wins
    wins_match = re.search(r'Количество побед:\s*(\d+)', text_clean)
    if not wins_match:
        return None
    result['wins'] = int(wins_match.group(1))
    
    # 10. Losses
    losses_match = re.search(r'Количество поражений:\s*(\d+)', text_clean)
    if not losses_match:
        return None
    result['losses'] = int(losses_match.group(1))
    
    # 11. Arenas
    arenas_match = re.search(r'Арен за сезон:\s*(\d+)', text_clean)
    if not arenas_match:
        return None
    result['arenas'] = int(arenas_match.group(1))
    
    return result


def parse_inventory(text: str) -> Optional[Dict[str, Any]]:
    """
    Parses a 'Мой инвентарь' response and returns a dictionary of inventory items.
    Returns None if it doesn't look like an inventory response.
    """
    text_clean = text.replace("\r", "")
    
    # Check if this is indeed an inventory response
    if "Твой инвентарь:" not in text_clean:
        return None
        
    result: Dict[str, Any] = {}
    
    # 1. Section: Твой инвентарь
    # 🍭 Леденцы: 42
    lollipop_match = re.search(r"🍭\s*Леденцы:\s*(\d+)", text_clean)
    result["inv_lollipop"] = lollipop_match.group(1) if lollipop_match else "0"
    
    # 💊 Аптечки: 34
    bandages_match = re.search(r"💊\s*Аптечки:\s*(\d+)", text_clean)
    result["inv_bandages"] = bandages_match.group(1) if bandages_match else "0"
    
    # 🍻 Пивас: На месте! / Жабка без пива :(
    beer_match = re.search(r"🍻\s*Пивас:\s*([^\n\r]+)", text_clean)
    result["inv_beer"] = beer_match.group(1).strip() if beer_match else "-"
    
    # 🦟 Стрекозюля удачи: На месте!
    dragonfly_match = re.search(r"🦟\s*Стрекозюля удачи:\s*([^\n\r]+)", text_clean)
    result["inv_dragonfly"] = dragonfly_match.group(1).strip() if dragonfly_match else "-"
    
    # 🗺 Карта болота: 1 / 0 + (🌌 7)
    map_match = re.search(r"🗺\s*Карта болота:\s*([^\n\r]+)", text_clean)
    if map_match:
        map_str = map_match.group(1).strip()
        cosmic_match = re.search(r"(\d+)\s*\+\s*\(\s*🌌\s*(\d+)\s*\)", map_str)
        if cosmic_match:
            result["inv_map"] = f"{cosmic_match.group(1)}+🌌{cosmic_match.group(2)}"
        else:
            num_match = re.search(r"^(\d+)$", map_str)
            if num_match:
                result["inv_map"] = f"{num_match.group(1)}+🌌0"
            else:
                result["inv_map"] = map_str
    else:
        result["inv_map"] = "0+🌌0"
    
    # 🧿 Изолента: 4
    tape_match = re.search(r"🧿\s*Изолента:\s*(\d+)", text_clean)
    result["inv_tape"] = tape_match.group(1) if tape_match else "0"
    
    # 🐸 Жабули для банды: 0/10 -> parse 0
    gang_match = re.search(r"🐸\s*Жабули для банды:\s*(\d+)(?:/\d+)?", text_clean)
    result["inv_gang_frogs"] = gang_match.group(1) if gang_match else "-"
    
    # 🔋 Капсула опыта: 4 (optional)
    exp_match = re.search(r"🔋\s*Капсула опыта:\s*(\d+)", text_clean)
    result["inv_exp_capsule"] = exp_match.group(1) if exp_match else "-"
    
    # 2. Section: Снаряжение для ограбления (optional)
    if "Снаряжение для ограбления:" in text_clean:
        # 🔖 Пропуск: 0/1
        pass_match = re.search(r"🔖\s*Пропуск(?:[^:]*):\s*(\d+)(?:/\d+)?", text_clean)
        result["eq_pass"] = pass_match.group(1) if pass_match else "-"
        
        # 🪛 Отмычка: 4/10
        lockpick_match = re.search(r"🪛\s*Отмычка(?:[^:]*):\s*(\d+)(?:/\d+)?", text_clean)
        result["eq_lockpick"] = lockpick_match.group(1) if lockpick_match else "-"
        
        # 🔋 Батарейка: 0/10
        battery_match = re.search(r"🔋\s*Батарейка(?:[^:]*):\s*(\d+)(?:/\d+)?", text_clean)
        result["eq_battery"] = battery_match.group(1) if battery_match else "-"
    else:
        result["eq_pass"] = "-"
        result["eq_lockpick"] = "-"
        result["eq_battery"] = "-"
        
    # 3. Section: Кусочки для крафта (optional)
    if "Кусочки для крафта:" in text_clean:
        # 🧩: 4/10
        puzzle_match = re.search(r"🧩:\s*(\d+)(?:/\d+)?", text_clean)
        result["cr_puzzle"] = puzzle_match.group(1) if puzzle_match else "-"
        
        # 🔗: 5/10
        link_match = re.search(r"🔗:\s*(\d+)(?:/\d+)?", text_clean)
        result["cr_link"] = link_match.group(1) if link_match else "-"
        
        # 🪨: 6/10
        stone_match = re.search(r"🪨:\s*(\d+)(?:/\d+)?", text_clean)
        result["cr_stone"] = stone_match.group(1) if stone_match else "-"
        
        # 🎭: 5/10
        mask_match = re.search(r"🎭:\s*(\d+)(?:/\d+)?", text_clean)
        result["cr_mask"] = mask_match.group(1) if mask_match else "-"
        
        # 📃: 6/10
        paper_match = re.search(r"📃:\s*(\d+)(?:/\d+)?", text_clean)
        result["cr_paper"] = paper_match.group(1) if paper_match else "-"
        
        # ⚡️: 5/10 (also support ⚡ without variant selector)
        lightning_match = re.search(r"⚡️?:\s*(\d+)(?:/\d+)?", text_clean)
        result["cr_lightning"] = lightning_match.group(1) if lightning_match else "-"
    else:
        result["cr_puzzle"] = "-"
        result["cr_link"] = "-"
        result["cr_stone"] = "-"
        result["cr_mask"] = "-"
        result["cr_paper"] = "-"
        result["cr_lightning"] = "-"
        
    return result
