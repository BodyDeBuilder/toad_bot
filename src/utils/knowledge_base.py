import re
from typing import Dict, Any, Optional

class KnowledgeBase:
    # Игровые действия
    ACTION_WORK = "work"
    ACTION_INFO = "info"
    ACTION_STATS = "stats"
    ACTION_INVENTORY = "inventory"
    ACTION_EQUIPMENT = "equipment"
    ACTION_FEED = "feed"
    ACTION_DAILIES = "dailies"
    ACTION_GANG = "excel_моя_банда"

    # Регулярные выражения триггеров команд пользователя
    COMMAND_TRIGGERS = {
        ACTION_WORK: re.compile(
            r"^(поход в столовую|работа крупье|работа грабитель|отправиться в кафетерий|отправиться в казино|отправиться в банк|начать работу|завершить работу)$",
            re.IGNORECASE
        ),
        ACTION_INFO: re.compile(
            r"^жаба\s+инфо$",
            re.IGNORECASE
        ),
        ACTION_STATS: re.compile(
            r"^моя\s+жаба$",
            re.IGNORECASE
        ),
        ACTION_INVENTORY: re.compile(
            r"^мой\s+инвентарь$",
            re.IGNORECASE
        ),
        ACTION_EQUIPMENT: re.compile(
            r"^мое\s+снаряжение$",
            re.IGNORECASE
        ),
        ACTION_FEED: re.compile(
            r"^покормить\s+жабу$",
            re.IGNORECASE
        ),
        ACTION_DAILIES: re.compile(
            r"^(дейлики|ежедневные\s+задания)$",
            re.IGNORECASE
        ),
        ACTION_GANG: re.compile(
            r"^моя\s+банда$",
            re.IGNORECASE
        )
    }

    # Флаги критичности/повторяемости команд для обхода коллизий
    CRITICAL_ACTIONS = {
        ACTION_WORK: False,      # Нельзя отправить дважды, не страшно упустить
        ACTION_INFO: False,
        ACTION_STATS: False,
        ACTION_INVENTORY: False,
        ACTION_EQUIPMENT: False,
        ACTION_FEED: False,
        ACTION_DAILIES: False,
        ACTION_GANG: False,
    }

    # Регулярные выражения для распознавания ответов Жабабота и обновления БД
    # Каждая запись содержит:
    # - pattern: регулярное выражение ответа бота
    # - action_type: тип действия
    # - db_updates: словарь сопоставления групп регулярного выражения полям БД (или константные значения)
    RESPONSE_PATTERNS = [
        # --- РАБОТА ---
        {
            # Успешная отправка на работу
            "pattern": re.compile(r"(?:жаба|она)\s+(?:отправилась|пошла)\s+на\s+работу\s+в\s+(?P<work_place>[а-яА-Я]+)[\s\S]+через\s+(?P<hours>\d+)\s+(?:часа|часов|час|ч)", re.IGNORECASE),
            "action_type": ACTION_WORK,
            "db_updates": {
                "status": "working",
                "work_info": "💼 На работе в {work_place}"
            }
        },
        {
            # Жаба уже работает (кулдаун/повтор)
            "pattern": re.compile(r"жаба\s+уже\s+работает\s+в\s+(?P<work_place>[а-яА-Я]+)", re.IGNORECASE),
            "action_type": ACTION_WORK,
            "db_updates": {
                "status": "working",
                "work_info": "💼 На работе в {work_place}"
            }
        },
        {
            # Кулдаун работы (устала/отдыхает)
            "pattern": re.compile(r"жаба\s+(?:устала|отдыхает)[\s\S]+осталось\s+(?P<hours>\d+)\s*ч.*?(\s+(?P<minutes>\d+)\s*мин)?", re.IGNORECASE),
            "action_type": ACTION_WORK,
            "db_updates": {
                "status": "idle",
                "work_info": "💤 Кулдаун {hours} ч. {minutes} мин."
            }
        },
        {
            # Альтернативный кулдаун работы (устала после трудового дня)
            "pattern": re.compile(r"твоя\s+жабуля\s+устала\s+после\s+трудового\s+дня[\s\S]+через\s+(?P<hours>\d+)\s*ч:(?P<minutes>\d+)\s*мин", re.IGNORECASE),
            "action_type": ACTION_WORK,
            "db_updates": {
                "status": "idle",
                "work_info": "💤 Кулдаун {hours} ч. {minutes} мин."
            }
        },
        {
            # Жаба находится в подземелье (смайлики и знаки препинания необязательны)
            "pattern": re.compile(r"ваша\s+жабка\s+находится\s+в\s+подземелье", re.IGNORECASE),
            "action_type": ACTION_WORK,
            "db_updates": {
                "status": "dungeon",
                "work_info": "👹 В подземелье!"
            }
        },
        {
            # Жаба на тусе (хвостовая часть фразы необязательна)
            "pattern": re.compile(r"ваша\s+жаба\s+на\s+тусе", re.IGNORECASE),
            "action_type": ACTION_WORK,
            "db_updates": {
                "status": "party",
                "work_info": "🎉 На тусовке!"
            }
        },
        # --- ЖАБА ИНФО ---
        {
            "pattern": re.compile(r"Жаба\s+Инфо", re.IGNORECASE | re.DOTALL),
            "action_type": ACTION_INFO,
            "db_updates": {}
        },
        # --- МОЯ ЖАБА ---
        {
            "pattern": re.compile(r"🐸[\s\S]*?(?:Уровень|Сытость|Атака|Здоровье|Букашек)", re.IGNORECASE | re.DOTALL),
            "action_type": ACTION_STATS,
            "db_updates": {}
        },
        # --- МОЙ ИНВЕНТАРЬ ---
        {
            "pattern": re.compile(r"Твой инвентарь:", re.IGNORECASE | re.DOTALL),
            "action_type": ACTION_INVENTORY,
            "db_updates": {}
        },
        # --- МОЕ СНАРЯЖЕНИЕ ---
        {
            "pattern": re.compile(r"Ближний бой:[\s\S]*?(?:Дальний бой|Наголовник|Нагрудник|Налапники)", re.IGNORECASE | re.DOTALL),
            "action_type": ACTION_EQUIPMENT,
            "db_updates": {}
        },
        # --- ПОКОРМИТЬ ЖАБУ ---
        {
            # Кулдаун кормления
            "pattern": re.compile(r"покормить\s+жабулю\s+через", re.IGNORECASE),
            "action_type": ACTION_FEED,
            "db_updates": {}
        },
        {
            # Успешное кормление (текст "ты получил")
            "pattern": re.compile(r"ты\s+получил", re.IGNORECASE),
            "action_type": ACTION_FEED,
            "db_updates": {}
        },
        # --- ДЕЙЛИКИ ---
        {
            "pattern": re.compile(r"Ежедневные\s+задания:", re.IGNORECASE),
            "action_type": ACTION_DAILIES,
            "db_updates": {}
        },
        # --- БАНДА ---
        {
            # Сценарий А (Есть банда)
            "pattern": re.compile(r"🏋️\s*Банда:", re.IGNORECASE),
            "action_type": ACTION_GANG,
            "db_updates": {}
        },
        {
            # Сценарий Б (Нет банды)
            "pattern": re.compile(r"У\s+тебя\s+нет\s+банды", re.IGNORECASE),
            "action_type": ACTION_GANG,
            "db_updates": {}
        }
    ]

    # Кэшированные построчные шаблоны для разбора сложных ответов
    MODULAR_LINE_PATTERNS = {}

    @classmethod
    async def load_from_db(cls, db) -> None:
        """Динамическая загрузка Базы Знаний и компиляция регулярных выражений из SQLite"""
        import json
        import logging
        logger = logging.getLogger("toadbot.utils.knowledge_base")
        logger.info("Загрузка Базы Знаний из базы данных...")
        
        async with db._connect() as conn:
            # 1. Загружаем реестр команд
            async with conn.execute("SELECT action_type, name, trigger_regex FROM commands_registry") as cursor:
                rows = await cursor.fetchall()
                cls.COMMAND_TRIGGERS = {}
                for row in rows:
                    try:
                        trig = row["trigger_regex"]
                        if not trig:
                            # Если регулярка пустая, строим простейший триггер для точного совпадения названия,
                            # заменяя N/СУММА на \d+ для распознавания в чате
                            name_lower = row["name"].lower()
                            # Заменяем переменные N/СУММА и пробелы на уникальные маркеры перед экранированием
                            placeholder = re.sub(r'\b(n|сумма)\b', '__NUM__', name_lower, flags=re.IGNORECASE)
                            placeholder = re.sub(r'\s+', '__WS__', placeholder)
                            escaped = re.escape(placeholder)
                            # Заменяем маркеры на соответствующие регулярные выражения
                            regex_pattern = escaped.replace('__NUM__', r'\d+').replace('__WS__', r'\s+')
                            cls.COMMAND_TRIGGERS[row["action_type"]] = re.compile(f"^{regex_pattern}$", re.IGNORECASE)
                        else:
                            cls.COMMAND_TRIGGERS[row["action_type"]] = re.compile(trig, re.IGNORECASE)
                    except Exception as e:
                        logger.error(f"Ошибка компиляции триггера '{row['action_type']}': {e}")
                        
            # 2. Загружаем шаблоны общих ответов
            async with conn.execute("SELECT action_type, pattern_name, response_type, regex, db_updates FROM response_templates") as cursor:
                rows = await cursor.fetchall()
                cls.RESPONSE_PATTERNS = []
                for row in rows:
                    try:
                        cls.RESPONSE_PATTERNS.append({
                            "pattern": re.compile(row["regex"], re.IGNORECASE),
                            "action_type": row["action_type"],
                            "response_type": row["response_type"],
                            "pattern_name": row["pattern_name"],
                            "db_updates": json.loads(row["db_updates"])
                        })
                    except Exception as e:
                        logger.error(f"Ошибка компиляции общего шаблона '{row['pattern_name']}': {e}")
                        
            # 3. Загружаем построчные шаблоны
            async with conn.execute("""
                SELECT action_type, category, category_name, emojis, keywords, exclude_keywords, regex, db_column 
                FROM modular_line_templates
            """) as cursor:
                rows = await cursor.fetchall()
                cls.MODULAR_LINE_PATTERNS = {}
                for row in rows:
                    act = row["action_type"]
                    if act not in cls.MODULAR_LINE_PATTERNS:
                        cls.MODULAR_LINE_PATTERNS[act] = []
                        
                    try:
                        cls.MODULAR_LINE_PATTERNS[act].append({
                            "category": row["category"],
                            "category_name": row["category_name"],
                            "emojis": json.loads(row["emojis"]),
                            "keywords": json.loads(row["keywords"]),
                            "exclude_keywords": json.loads(row["exclude_keywords"]),
                            "regex": re.compile(row["regex"], re.IGNORECASE) if row["regex"] else None,
                            "db_column": row["db_column"]
                        })
                    except Exception as e:
                        logger.error(f"Ошибка парсинга построчного шаблона '{row['category']}': {e}")
                        
        logger.info(f"База Знаний успешно загружена в память. Команд: {len(cls.COMMAND_TRIGGERS)}, Шаблонов: {len(cls.RESPONSE_PATTERNS)}")

    @classmethod
    def get_command_type(cls, text: str) -> Optional[str]:
        """Определяет тип команды по тексту сообщения с очисткой от упоминаний бота"""
        # Убираем упоминания ВК вида [club12345|@toadbot] или [id12345|Имя] (включая возможные знаки минус)
        clean_text = re.sub(r'\[[a-zA-Z0-9_-]+\|[^\]]+\]', '', text)
        # Убираем возможные двоеточия, запятые и пробелы в начале, оставшиеся после упоминания
        clean_text = re.sub(r'^[,\s:\-]+', '', clean_text)
        # Очищаем края и переводим в нижний регистр для регистронезависимого сравнения
        clean_text = clean_text.strip().lower()
        
        # Строгое сопоставление с триггерами
        for action, trigger in cls.COMMAND_TRIGGERS.items():
            if trigger.search(clean_text):
                return action
                
        return None

    @classmethod
    def is_critical_action(cls, action_type: str) -> bool:
        """Является ли команда критичной для выполнения"""
        return cls.CRITICAL_ACTIONS.get(action_type, False)

    @classmethod
    def match_bot_response(cls, text: str) -> Optional[Dict[str, Any]]:
        """Ищет соответствие текста сообщения шаблонам ответов Жабабота"""
        # 1. Текстовое мажоритарное правило для команды "Жаба инфо"
        clean_text = text.lower()
        if "покормить" in clean_text and "откормить" in clean_text:
            # Считаем уникальные категории
            found_categories = set()
            found_categories.add("feed")
            found_categories.add("fattening")
            
            # Проверяем другие ключевые темы
            if any(kw in clean_text for kw in ["работа", "работу", "батрачит"]):
                found_categories.add("work")
            if any(kw in clean_text for kw in ["подземелье", "подземель"]):
                found_categories.add("dungeon")
            if "арена" in clean_text:
                found_categories.add("arena")
            if any(kw in clean_text for kw in ["потусить", "туса", "тусовка"]):
                found_categories.add("party")
            if any(kw in clean_text for kw in ["ограбление", "ограблению"]):
                found_categories.add("robbery")
                
            # Если суммарное количество уникальных категорий >= 3
            if len(found_categories) >= 3:
                return {
                    "action_type": cls.ACTION_INFO,
                    "db_updates": {},
                    "groups": {}
                }

        # 2. Стандартный поиск по регулярным выражениям Базы Знаний
        for entry in cls.RESPONSE_PATTERNS:
            match = entry["pattern"].search(text)
            if match:
                groups = match.groupdict()
                return {
                    "action_type": entry["action_type"],
                    "response_type": entry.get("response_type", "success"),
                    "db_updates": entry["db_updates"],
                    "groups": groups
                }
        return None

    @classmethod
    def get_all_literal_commands(cls) -> list[str]:
        """Возвращает плоский список всех литеральных команд из COMMAND_TRIGGERS"""
        commands = []
        for trigger in cls.COMMAND_TRIGGERS.values():
            pattern_str = trigger.pattern
            # Извлекаем все альтернативы из скобок, убирая символы начала и конца строки
            clean = pattern_str.strip("^$()")
            for part in clean.split("|"):
                part_clean = part.strip()
                if part_clean:
                    commands.append(part_clean)
        return sorted(list(set(commands)))
