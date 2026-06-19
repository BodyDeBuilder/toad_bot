import re
from typing import Optional, Dict, Any

# Правило: если в ответе игры написано "1ч 29м", мы интерпретируем это как "1ч 29м 59с".
# То есть добавляем 59 секунд к каждому распознанному значению (погрешность вверх —
# таймер в UI чуть дольше тикает, но не покажет "готов" раньше фактической готовности).
_SECONDS_BUFFER = 59

def _parse_duration(hours_str: Optional[str], minutes_str: Optional[str]) -> int:
    """Парсит 'ч/мин' в секунды (+59с буфер согласно правилу погрешности вверх)."""
    hours = int(hours_str) if hours_str else 0
    minutes = int(minutes_str) if minutes_str else 0
    return hours * 3600 + minutes * 60 + _SECONDS_BUFFER

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
    (r"^⚔️:\s*До нападения (\d+)\s*мин\.$", lambda m: ("cooldown", int(m.group(1)) * 60 + _SECONDS_BUFFER)),
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
    Разбирает ответ команды «Моя жаба» и возвращает словарь со спарсенными полями.

    Толерантный режим: каждое поле разбирается независимо. Если какое-то поле
    не сматчилось — оно просто не попадает в результат, остальные сохраняются
    («что спарсили — то и записали»). Возвращает None только если не удалось
    распознать ни одного поля.
    """
    text_clean = text.replace("\r", "")

    result: Dict[str, Any] = {}

    # 1. Name
    name_match = re.search(r'Имя жабы:\s*(.+)', text_clean)
    if name_match:
        result['name'] = name_match.group(1).strip()

    # 2. Level
    level_match = re.search(r'Уровень вашей жабы:\s*(\d+)', text_clean)
    if level_match:
        result['level'] = int(level_match.group(1))

    # 3. Satiety
    satiety_match = re.search(r'Сытость:\s*(\d+)/(\d+)', text_clean)
    if satiety_match:
        result['satiety_cur'] = int(satiety_match.group(1))
        result['satiety_max'] = int(satiety_match.group(2))

    # 4. Status
    status_match = re.search(r'Статус жабы:\s*(classic|prime|prime\+|классик|премиум|премиум\+)', text_clean, re.IGNORECASE)
    if status_match:
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
    if state_match:
        state_raw = state_match.group(1).strip().lower()
        if state_raw in ('alive', 'живая'):
            result['state'] = 'alive'
        elif 'реанимация' in state_raw or 'injured' in state_raw:
            result['state'] = 'injured'
        else:
            result['state'] = state_raw

    # 6. Bugs
    bugs_match = re.search(r'Букашки:\s*([\d\s\u00A0]+)', text_clean)
    if bugs_match:
        try:
            result['bugs'] = int(re.sub(r'[\s\u00A0]+', '', bugs_match.group(1)))
        except ValueError:
            pass

    # 7. Class — римская цифра ОПЦИОНАЛЬНА (не во всех ответах жабабота она есть)
    class_match = re.search(r'Класс:\s*(Авантюрист|adventurer|Ремесленник|worker|Ассасин|assassin)(?:\s+([IVXLCDM]+))?', text_clean, re.IGNORECASE)
    if class_match:
        class_name = class_match.group(1).strip().lower()
        class_lvl = class_match.group(2)  # может быть None
        # Нормализуем имя класса на русский
        if class_name in ('авантюрист', 'adventurer'):
            class_ru = 'Авантюрист'
        elif class_name in ('ремесленник', 'worker'):
            class_ru = 'Ремесленник'
        elif class_name in ('ассасин', 'assassin'):
            class_ru = 'Ассасин'
        else:
            class_ru = class_match.group(1).strip()
        result['class'] = f'{class_ru} {class_lvl}'.strip() if class_lvl else class_ru

    # 8. Mood — сохраняем только число из скобок
    mood_match = re.search(r'Настроение:\s*(?:[^\w\s]*\s*)?([а-яА-ЯёЁ\s]+)\s*\((\d+)\)', text_clean, re.IGNORECASE)
    if mood_match:
        result['mood'] = int(mood_match.group(2))

    # 9. Wins
    wins_match = re.search(r'Количество побед:\s*(\d+)', text_clean)
    if wins_match:
        result['wins'] = int(wins_match.group(1))

    # 10. Losses
    losses_match = re.search(r'Количество поражений:\s*(\d+)', text_clean)
    if losses_match:
        result['losses'] = int(losses_match.group(1))

    # 11. Arenas
    arenas_match = re.search(r'Арен за сезон:\s*(\d+)', text_clean)
    if arenas_match:
        result['arenas'] = int(arenas_match.group(1))

    return result if result else None


def toad_state_to_account_fields(parsed: Dict[str, Any]) -> Dict[str, Any]:
    """
    Преобразует канонические поля parse_my_toad (для toad_states в recognition.db)
    в ключи колонок таблицы accounts (bot.db).

    Включаются только поля, реально присутствующие в parsed.
    Маппинг (см. parameter_mappings.txt:30-39):
      name        -> name
      level       -> class_level
      satiety_*   -> satiety ("cur/max")
      status      -> is_prime (classic=0, prime/prime+=1)
      bugs        -> bugs
      class       -> class_name
      mood        -> mood
      wins        -> wins
      losses      -> losses
    """
    fields: Dict[str, Any] = {}

    if 'name' in parsed:
        fields['name'] = parsed['name']
    if 'level' in parsed:
        fields['class_level'] = parsed['level']
    if 'satiety_cur' in parsed and 'satiety_max' in parsed:
        fields['satiety'] = f"{parsed['satiety_cur']}/{parsed['satiety_max']}"
    if 'status' in parsed:
        fields['is_prime'] = 1 if parsed['status'] in ('prime', 'prime+') else 0
    if 'bugs' in parsed:
        fields['bugs'] = parsed['bugs']
    if 'class' in parsed:
        fields['class_name'] = parsed['class']
    if 'mood' in parsed:
        fields['mood'] = parsed['mood']
    if 'wins' in parsed:
        fields['wins'] = parsed['wins']
    if 'losses' in parsed:
        fields['losses'] = parsed['losses']

    return fields


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


# ---------------------------------------------------------------------------
# Модификаторы снаряжения
# ---------------------------------------------------------------------------
# Модификатор крепится к слоту брони (наголовник/нагрудник/налапники) как эмодзи в
# скобках правее предмета, например: «Добрых дел [31/40] [🌵]».
#   • [NN/NN] — прочность (содержит цифры);
#   • [эмодзи] — модификатор (без цифр).
# На один слот — максимум 1 модификатор (по данным жабабота).
#
# «tiers» — бонус комбинации в зависимости от количества предметов с этим модификатором
# (1 / 2 / 3 предмета). Сохраняем чётко, как в описании игры. В визуал не выводится —
# используется для будущих операций (расчёт, рекомендации).
EQUIPMENT_MODIFIERS: Dict[str, Dict[str, Any]] = {
    "👊": {"name": "Увеличенный урон",  "var_name": "mod_damage",      "tiers": ("+5",  "+8",  "+10")},
    "🛡️": {"name": "Увеличенная броня", "var_name": "mod_armor",       "tiers": ("+5",  "+8",  "+10")},
    "❤️": {"name": "Увеличенное здоровье", "var_name": "mod_health",   "tiers": ("+7",  "+10", "+15")},
    "🌵": {"name": "Шипы",             "var_name": "mod_thorns",      "tiers": ("3%",  "4%",  "5%")},
    "🧛": {"name": "Вампиризм",         "var_name": "mod_vampirism",   "tiers": ("25%", "35%", "50%")},
    "🦔": {"name": "Анти-Шип",          "var_name": "mod_antithorns",  "tiers": ("30%", "100%", "100%")},
    "☀️": {"name": "Анти-Вампир",       "var_name": "mod_antivamp",    "tiers": ("30%", "100%", "100%")},
}


def compute_modifier_bonus(emoji: str, count: int) -> Optional[str]:
    """
    Возвращает бонус комбинации для заданного модификатора в зависимости от того,
    на скольких предметах он нанесён (count ∈ {1,2,3}). Возвращает None, если
    модификатор неизвестен или count вне диапазона.

    Пример: compute_modifier_bonus("👊", 2) -> "+8"
            compute_modifier_bonus("🧛", 3) -> "50%"
    """
    info = EQUIPMENT_MODIFIERS.get(emoji)
    if info is None or count < 1 or count > 3:
        return None
    return info["tiers"][count - 1]


def _extract_modifier(slot_line: str) -> Optional[str]:
    """
    Из строки слота брони извлекает эмодзи-модификатор из квадратных скобок.
    Модификатор — это скобка, содержимое которой НЕ является прочностью (не содержит цифр).
    Возвращает эмодзи (как есть) или None.
    Пример: «Добрых дел [31/40] [🌵]» -> «🌵»
    """
    for m in re.finditer(r'\[([^\]]+)\]', slot_line):
        inner = m.group(1).strip()
        # Прочность всегда содержит цифры — пропускаем её
        if re.search(r'\d', inner):
            continue
        return inner
    return None


def _strip_modifier(slot_value: str) -> str:
    """
    Убирает из значения слота скобку с эмодзи-модификатором (прочность [NN/NN] оставляет).
    Пример: «Добрых дел [31/40] [🌵]» -> «Добрых дел [31/40]»
    """
    def _drop(m: re.Match) -> str:
        return "" if not re.search(r'\d', m.group(1)) else m.group(0)

    cleaned = re.sub(r'\s*\[([^\]]+)\]', lambda m: _drop(m), slot_value)
    return cleaned.rstrip()


def parse_equipment(text: str) -> Optional[Dict[str, Any]]:
    """
    Разбирает ответ команды «Мое снаряжение» и возвращает словарь со всеми полями.
    Все строки 1 в 1 как в ответе жабабота. Модификаторы сохраняются для наголовника,
    нагрудника и налапников. «Пусто❌» заменяется на прочерк. Баффы — опционально.
    """
    text_clean = text.replace("\r", "")

    # Проверяем, что это действительно ответ команды «Мое снаряжение»
    if not re.search(r'Ближний бой:', text_clean):
        return None

    result: Dict[str, Any] = {}

    # Вспомогательная функция: парсит строку снаряжения с учётом модификаторов и «Пусто❌»
    def _parse_slot(pattern: str, text: str) -> str:
        m = re.search(pattern, text)
        if not m:
            return "-"
        raw = m.group(1).strip()
        if "Пусто" in raw or "❌" in raw:
            return "-"
        return raw

    # --- Снаряжение ---
    result["eq_melee"] = _parse_slot(r'🗡️\s*Ближний бой:\s*(.+)', text_clean)
    result["eq_ranged"] = _parse_slot(r'🏹\s*Дальний бой:\s*(.+)', text_clean)
    eq_helmet_raw = _parse_slot(r'🐸\s*Наголовник:\s*(.+)', text_clean)
    eq_chest_raw = _parse_slot(r'🥼\s*Нагрудник:\s*(.+)', text_clean)
    eq_paws_raw = _parse_slot(r'🧤\s*Налапники:\s*(.+)', text_clean)

    # Модификаторы на 3 слотах брони: эмодзи в скобках (правее предмета). «-», если нет.
    result["eq_helmet_mod"] = _extract_modifier(eq_helmet_raw) or "-" if eq_helmet_raw != "-" else "-"
    result["eq_chest_mod"] = _extract_modifier(eq_chest_raw) or "-" if eq_chest_raw != "-" else "-"
    result["eq_paws_mod"] = _extract_modifier(eq_paws_raw) or "-" if eq_paws_raw != "-" else "-"

    # Само значение слота — без скобки модификатора (прочность [NN/NN] остаётся)
    result["eq_helmet"] = _strip_modifier(eq_helmet_raw) if eq_helmet_raw != "-" else "-"
    result["eq_chest"] = _strip_modifier(eq_chest_raw) if eq_chest_raw != "-" else "-"
    result["eq_paws"] = _strip_modifier(eq_paws_raw) if eq_paws_raw != "-" else "-"

    # --- Баффы от снаряжения (опциональная секция) ---
    buff_match = re.search(
        r'Баффы от снаряжения:\s*\n([\s\S]*?)(?=\n\n|\n\S)',
        text_clean
    )
    if buff_match:
        buff_text = buff_match.group(1).strip()
        result["eq_buffs"] = buff_text if (buff_text and "Пусто" not in buff_text) else "-"
    else:
        result["eq_buffs"] = "-"

    # --- Банда и усилитель ---
    result["eq_gang"] = _parse_slot(r'🏋️\s*Банда:\s*(.+)', text_clean)
    result["eq_booster"] = _parse_slot(r'🚀\s*Усилитель:\s*(.+)', text_clean)

    # --- Кусочки для крафта ---
    result["eq_parts_weapon"] = _parse_slot(r'⚙️\s*Оружейных кусочков:\s*(.+)', text_clean)
    result["eq_parts_algae"] = _parse_slot(r'🌿\s*Кусочков водорослей:\s*(.+)', text_clean)
    result["eq_parts_lily"] = _parse_slot(r'🥬\s*Кусочков кувшинки:\s*(.+)', text_clean)
    result["eq_parts_beak"] = _parse_slot(r'🦴\s*Кусочков клюва цапли:\s*(.+)', text_clean)

    # --- ЖабоГемы (сохраняем дробь N/N) ---
    gems_match = re.search(r'💠\s*ЖабоГемы:\s*(\d+/\d+)', text_clean)
    result["eq_gems"] = gems_match.group(1).strip() if gems_match else "-"

    # --- Характеристики ---
    health_match = re.search(r'❤️\s*Здоровье:\s*(\d+)', text_clean)
    result["eq_health"] = health_match.group(1).strip() if health_match else "-"

    attack_match = re.search(r'⚔️\s*Атака:\s*(\d+)', text_clean)
    result["eq_attack"] = attack_match.group(1).strip() if attack_match else "-"

    defense_match = re.search(r'🛡️\s*Защита:\s*(\d+)', text_clean)
    result["eq_defense"] = defense_match.group(1).strip() if defense_match else "-"

    return result


# ============================================================================
# Парсер команды «Покормить жабу»
# ============================================================================

def parse_feed(text: str) -> dict | None:
    """Парсит ответ Жабабота на команду «Покормить жабу».

    Возвращает dict с распознанными полями или None, если текст не относится
    к команде кормления.

    Два основных сценария:
      1. Кулдаун — «Покормить жабулю через N ч:M мин.»
      2. Успех — текст содержит «ты получил» + статичные эффекты + опциональный лут

    Толерантный режим: парсим что можем, неизвестные строки пропускаем.
    Ключи результата совместимы с колонками toad_states (feed_info, feed_cooldown,
    satiety_cur, satiety_max, mood, bugs, feed_loot).
    """
    result: dict = {}
    text_clean = text.replace('\r', '').strip()

    # --- Определяем сценарий: кулдаун или успех ---
    cooldown_match = re.search(
        r'покормить\s+жабулю\s+через\s+(?:(?P<hours>\d+)\s*ч[.:]?)?\s*(?P<minutes>\d+)\s*мин',
        text_clean,
        re.IGNORECASE
    )
    if cooldown_match:
        hours = int(cooldown_match.group("hours") or 0)
        minutes = int(cooldown_match.group("minutes"))
        total_seconds = hours * 3600 + minutes * 60 + 59  # +59 буфер
        result["feed_info"] = "cooldown"
        result["feed_cooldown"] = total_seconds
        return result

    # --- Успешное кормление: ищем «ты получил» ---
    if "ты получил" not in text_clean.lower():
        return None

    result["feed_info"] = "fed"

    # Статичные эффекты при кормлении (всегда присутствуют при успехе):
    # +1 сытость, +15 настроение, +N букашек.
    # Ключи — как в toad_states: satiety_cur, satiety_max, mood, bugs.

    # Сытость
    satiety_match = re.search(r'Сытость[:\s]*(\d+)/(\d+)', text_clean)
    if satiety_match:
        result["satiety_cur"] = int(satiety_match.group(1))
        result["satiety_max"] = int(satiety_match.group(2))

    # Настроение
    mood_match = re.search(r'Настроение[:\s]*([^\n\r]+?)(?:\s*\(|$)', text_clean)
    if mood_match:
        result["mood"] = mood_match.group(1).strip()

    # Букашки (количество полученных или текущий баланс)
    bugs_match = re.search(r'([+-]?\d+)\s*ба?на?шек?', text_clean, re.IGNORECASE)
    if bugs_match:
        result["bugs"] = int(bugs_match.group(1))

    # --- Динамический лут ---
    # Ищем весь текст после «ты получил» и собираем строки с эмодзи
    loot_items = []
    loot_section = re.search(r'ты\s+получил[:\s]*\n([\s\S]+?)(?:\n{2,}|\Z)', text_clean, re.IGNORECASE)
    if loot_section:
        for line in loot_section.group(1).split('\n'):
            line = line.strip()
            if not line:
                continue
            # Строка с эмодзи — считаем предметом лута
            if any(ord(c) > 0x2600 for c in line):
                loot_items.append(line)

    if loot_items:
        result["feed_loot"] = " | ".join(loot_items)

    return result if result else None


def parse_dailies(text: str) -> dict | None:
    """Парсит ответ Жабабота на команду «Дейлики» или «Ежедневные задания».

    Возвращает dict с распознанными полями или None, если текст не относится
    к команде дейликов.
    """
    text_clean = text.replace('\r', '').strip()

    # Проверяем, относится ли текст к дейликам
    if "ежедневные задания:" not in text_clean.lower():
        return None

    result: dict = {}

    # 1. Твой статус: например, "Твой статус: Золотой [46/∞]"
    status_match = re.search(r'Твой статус:\s*([^\n\r]+)', text_clean, re.IGNORECASE)
    if status_match:
        result["daily_status"] = status_match.group(1).strip()
    else:
        result["daily_status"] = "Не активен"

    # 2. Можно пропустить дней: например, "Можно пропустить дней: 5"
    skip_match = re.search(r'Можно пропустить дней:\s*([^\n\r]+)', text_clean, re.IGNORECASE)
    if skip_match:
        days_str = skip_match.group(1).strip()
        days_num_match = re.search(r'\d+', days_str)
        result["reserve_days"] = int(days_num_match.group(0)) if days_num_match else 0
    else:
        result["reserve_days"] = 0

    # 3. Разбор по строкам для задач и наград
    lines = [line.strip() for line in text_clean.split('\n') if line.strip()]

    current_section = None
    main_tasks = []
    bonus_tasks = []
    main_rewards = []
    bonus_rewards = []

    for line in lines:
        if "Ежедневные задания:" in line:
            current_section = "main_tasks"
            continue
        elif "Награда:" in line:
            current_section = "main_rewards"
            continue
        elif "Дополнительные задания:" in line:
            current_section = "bonus_tasks"
            continue
        elif "Дополнительная награда:" in line:
            current_section = "bonus_rewards"
            continue
        elif "Твой статус:" in line or "Можно пропустить дней:" in line or "Все задания на сегодня выполнены" in line:
            current_section = None
            continue

        if current_section == "main_tasks":
            if line.startswith("✅") or line.startswith("❌") or line.startswith("🔴"):
                main_tasks.append(line)
        elif current_section == "bonus_tasks":
            if line.startswith("✅") or line.startswith("❌") or line.startswith("🔴"):
                bonus_tasks.append(line)
        elif current_section == "main_rewards":
            main_rewards.append(line)
        elif current_section == "bonus_rewards":
            bonus_rewards.append(line)

    result["daily_tasks"] = " | ".join(main_tasks) if main_tasks else ""
    result["daily_reward"] = " | ".join(main_rewards) if main_rewards else ""
    result["daily_bonus_tasks"] = " | ".join(bonus_tasks) if bonus_tasks else ""
    result["daily_bonus_reward"] = " | ".join(bonus_rewards) if bonus_rewards else ""

    # 4. Проверка завершенности дейлика
    if "Все задания на сегодня выполнены" in text_clean:
        result["daily_completed"] = 1
    elif main_tasks and all(t.startswith("✅") for t in main_tasks):
        result["daily_completed"] = 1
    else:
        result["daily_completed"] = 0

    return result


def parse_family(text: str, current_account_name: str = "") -> Optional[Dict[str, Any]]:
    """
    Разбирает ответ на команду "Моя семья".
    Возвращает dict с полями для обновления таблицы accounts или None, если текст не относится к команде.
    """
    text_clean = text.replace('\r', '').strip()

    # Проверяем ключевые маркеры
    if "количество дней в браке:" not in text_clean.lower() and "ваш жабёныш:" not in text_clean.lower():
        return None

    result: dict = {
        "partner": "Нет",
        "marriage_days": 0,
        "candies": 0,
        "froglet": "Нет",
        "family_level": 1,
        "family_satiety": "Сыт",
        "family_authority": 0,
        "family_mood": "Спокойное",
        "feed_in": "—",
        "kindergarten": "—",
        "clash": "—"
    }

    # 1. Партнер
    partner_match = re.search(r"💖\s*(.*?)\s*и\s*(.*?):", text_clean)
    if partner_match:
        spouse_1 = partner_match.group(1).strip()
        spouse_2 = partner_match.group(2).strip()
        if current_account_name:
            # Сравниваем регистронезависимо или на подстроку
            c_name_lower = current_account_name.lower()
            s1_lower = spouse_1.lower()
            s2_lower = spouse_2.lower()
            if s1_lower == c_name_lower or s1_lower in c_name_lower or c_name_lower in s1_lower:
                result["partner"] = spouse_2
            else:
                result["partner"] = spouse_1
        else:
            result["partner"] = spouse_2

    # 2. Дни в браке
    days_match = re.search(r"💍 Количество дней в браке:\s*(\d+)", text_clean, re.IGNORECASE)
    if days_match:
        result["marriage_days"] = int(days_match.group(1))

    # 3. Конфетки
    candies_match = re.search(r"🍬 Конфетки:\s*(\d+)", text_clean, re.IGNORECASE)
    if candies_match:
        result["candies"] = int(candies_match.group(1))

    # 4. Имя жабёнка
    froglet_match = re.search(r"🐸 Имя жабёнка:\s*([^\n\r]+)", text_clean, re.IGNORECASE)
    if froglet_match:
        result["froglet"] = froglet_match.group(1).strip()

    # 5. Уровень
    level_match = re.search(r"[⭐⭐️] Уровень:\s*(\d+)", text_clean, re.IGNORECASE)
    if level_match:
        result["family_level"] = int(level_match.group(1))

    # 6. Сытость
    satiety_match = re.search(r"🍰 Сытость:\s*(\d+/\d+)", text_clean, re.IGNORECASE)
    if satiety_match:
        result["family_satiety"] = satiety_match.group(1).strip()

    # 7. Авторитет
    authority_match = re.search(r"😎 Авторитет:\s*(\d+)(?:/\d+)?", text_clean, re.IGNORECASE)
    if authority_match:
        result["family_authority"] = int(authority_match.group(1))

    # 8. Настроение
    mood_match = re.search(r"🙂 Настроение:\s*([^\n\r]+)", text_clean, re.IGNORECASE)
    if mood_match:
        result["family_mood"] = mood_match.group(1).strip()

    # 9. Кулдаун кормления ("Покормить через")
    if "[Кнопка: Покормить жабенка]" in text_clean:
        result["feed_in"] = "Готово"
    else:
        feed_match = re.search(r"😋 Можно покормить через\s*([^\n\r]+)", text_clean, re.IGNORECASE)
        if feed_match:
            result["feed_in"] = feed_match.group(1).strip()

    # 10. Кулдаун детского сада ("Забрать через")
    if "[Кнопка: Отправить жабенка в детсад]" in text_clean:
        result["kindergarten"] = "Нет"
    elif "[Кнопка: Забрать жабенка]" in text_clean:
        result["kindergarten"] = "Можно забрать"
    else:
        nursery_match = re.search(r"[🕒⏳] Можно забрать через\s*([^\n\r]+)", text_clean, re.IGNORECASE)
        if nursery_match:
            result["kindergarten"] = nursery_match.group(1).strip()

    # 11. Кулдаун махача ("Махач через")
    if "[Кнопка: Отправить жабенка на махач]" in text_clean:
        result["clash"] = "Доступен"
    else:
        clash_match = re.search(r"👊 Пойти на махач через\s*([^\n\r]+)", text_clean, re.IGNORECASE)
        if clash_match:
            result["clash"] = clash_match.group(1).strip()

    return result


def parse_gang(text: str) -> Optional[Dict[str, Any]]:
    """
    Разбирает ответ на команду "Моя банда".
    Возвращает dict с полями для toad_states и accounts или None, если текст не относится к команде.
    """
    text_clean = text.replace('\r', '').strip()

    # Проверяем ключевые маркеры команды «Моя банда»
    has_gang_active = "🏋️" in text_clean and "Банда:" in text_clean and "Верность:" in text_clean
    has_no_gang = "У тебя нет банды" in text_clean or "Жабульки в инвентаре:" in text_clean

    if not has_gang_active and not has_no_gang:
        return None

    result: dict = {
        "has_gang": 0,
        "gang_type": "-",
        "gang_name": "-",
        "gang_loyalty_cur": 0,
        "gang_loyalty_max": 0,
        "gang_damage": 0,
        "gang_chance": 0,
        "gang_pendant": "-",
        "gang_pendant_duration": "-",
        "gang_party": "-"
    }

    if has_no_gang:
        # Извлекаем жабулек (например, "🐸 Жабульки в инвентаре: 3/10")
        frogs_match = re.search(r"🐸\s*(?:Жабульки в инвентаре|Жабули для банды):\s*(\d+)", text_clean, re.IGNORECASE)
        if frogs_match:
            result["inv_gang_frogs"] = frogs_match.group(1).strip()
        result["has_gang"] = 0
        return result

    # Если банда есть (Сценарий А)
    result["has_gang"] = 1

    # 1. Тип банды
    type_match = re.search(r"🏋️\s*Банда:\s*([^\n\r]+)", text_clean, re.IGNORECASE)
    if type_match:
        result["gang_type"] = type_match.group(1).strip()

    # 2. Название
    name_match = re.search(r"🏷\s*Название:\s*([^\n\r]+)", text_clean, re.IGNORECASE)
    if name_match:
        result["gang_name"] = name_match.group(1).strip()

    # 3. Верность
    loyalty_match = re.search(r"🤝\s*Верность:\s*(\d+)/(\d+)", text_clean, re.IGNORECASE)
    if loyalty_match:
        result["gang_loyalty_cur"] = int(loyalty_match.group(1))
        result["gang_loyalty_max"] = int(loyalty_match.group(2))

    # 4. Урон
    damage_match = re.search(r"⚔️\s*Урон:\s*(\d+)%", text_clean, re.IGNORECASE)
    if damage_match:
        result["gang_damage"] = int(damage_match.group(1))

    # 5. Шанс срабатывания
    chance_match = re.search(r"🎯\s*Шанс срабатывания:\s*(\d+)%", text_clean, re.IGNORECASE)
    if chance_match:
        result["gang_chance"] = int(chance_match.group(1))

    # 6. Кулон
    pendant_match = re.search(r"📿\s*Кулон:\s*([^\n\r]+)", text_clean, re.IGNORECASE)
    if pendant_match:
        result["gang_pendant"] = pendant_match.group(1).strip()

    # 7. Время кулона (опционально)
    duration_match = re.search(r"🕒\s*Время действия:\s*([^\n\r]+)", text_clean, re.IGNORECASE)
    if duration_match:
        result["gang_pendant_duration"] = duration_match.group(1).strip()
    else:
        result["gang_pendant_duration"] = "-"

    # 8. Брать на тусу
    party_match = re.search(r"(?:💃🏻|💃)\s*Брать на тусу:\s*([^\n\r]+)", text_clean, re.IGNORECASE)
    if party_match:
        val = party_match.group(1).strip().lower()
        if "да" in val or "✅" in val:
            result["gang_party"] = "Да"
        elif "нет" in val or "❌" in val:
            result["gang_party"] = "Нет"
        else:
            result["gang_party"] = party_match.group(1).strip()

    return result


