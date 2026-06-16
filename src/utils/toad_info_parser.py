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
    state_match = re.search(r'Состояние:\s*(Живая|alive|❤️🩹\s*Нужна реанимация|injured)', text_clean, re.IGNORECASE)
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
    mood_match = re.search(r'Настроение:\s*(.+?)\s*\((\d+)\)', text_clean)
    if not mood_match:
        return None
    result['mood'] = mood_match.group(1).strip()
    result['mood_val'] = int(mood_match.group(2))
    
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
