import sqlite3
import logging
import contextlib
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional
import aiosqlite

logger = logging.getLogger("toadbot.database")

class DBManager:
    def __init__(self, db_path: Path):
        self.db_path = db_path

    @contextlib.asynccontextmanager
    async def _connect(self):
        """Открытие асинхронного соединения с включением внешних ключей"""
        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            await conn.execute("PRAGMA foreign_keys = ON;")
            yield conn

    @contextlib.asynccontextmanager
    async def _connect_rec(self):
        """Открытие асинхронного соединения с БД распознавания"""
        rec_path = self.db_path.parent / "recognition.db"
        async with aiosqlite.connect(rec_path) as conn:
            conn.row_factory = aiosqlite.Row
            yield conn

    async def initialize_db(self) -> None:
        """Создание таблиц БД, если они отсутствуют"""
        logger.info(f"Инициализация базы данных: {self.db_path}")
        async with self._connect() as conn:
            # 1. Таблица аккаунтов ВКонтакте
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS accounts (
                    vk_id INTEGER PRIMARY KEY,
                    name TEXT,
                    token TEXT NOT NULL,
                    is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
                    is_prime INTEGER DEFAULT 0 CHECK(is_prime IN (0, 1)),
                    chat_id INTEGER,
                    status TEXT DEFAULT 'idle',
                    last_fed TEXT,
                    last_worked TEXT,
                    last_dungeon TEXT,
                    last_arena TEXT,
                    class_name TEXT,
                    class_level INTEGER DEFAULT 0,
                    mood INTEGER DEFAULT 250,
                    bugs INTEGER DEFAULT 0,
                    satiety TEXT DEFAULT 'Сыта 🍏',
                    wins INTEGER DEFAULT 0,
                    losses INTEGER DEFAULT 0,
                    daily_status TEXT DEFAULT 'Не активен',
                    reserve_days INTEGER DEFAULT 0,
                    daily_completed INTEGER DEFAULT 0,
                    daily_tasks TEXT DEFAULT NULL,
                    daily_reward TEXT DEFAULT NULL,
                    daily_bonus_tasks TEXT DEFAULT NULL,
                    daily_bonus_reward TEXT DEFAULT NULL,
                    last_checked TEXT,
                    work_info TEXT DEFAULT 'Не на работе',
                    feed_info TEXT DEFAULT 'Не кормлена',
                    next_feed_time TEXT DEFAULT NULL,
                    fattening TEXT DEFAULT 'Нет',
                    positions TEXT DEFAULT 'Рядовой',
                    partner TEXT DEFAULT 'Нет',
                    marriage_days INTEGER DEFAULT 0,
                    froglet TEXT DEFAULT 'Нет',
                    family_level INTEGER DEFAULT 1,
                    family_satiety TEXT DEFAULT 'Сыт',
                    family_authority INTEGER DEFAULT 0,
                    candies INTEGER DEFAULT 0,
                    family_mood TEXT DEFAULT 'Спокойное',
                    kindergarten TEXT DEFAULT 'Нет',
                    clash TEXT DEFAULT 'Доступен',
                    feed_in TEXT DEFAULT 'Готово',
                    arena_season TEXT DEFAULT 'Загрузка...',
                    arena_wins INTEGER DEFAULT 0,
                    arena_losses INTEGER DEFAULT 0,
                    arena_place TEXT DEFAULT 'Нет',
                    arena_points INTEGER DEFAULT 0,
                    clan_name TEXT DEFAULT 'Нет',
                    clan_members TEXT DEFAULT '0',
                    clan_offmap TEXT DEFAULT 'Нет',
                    clan_cards TEXT DEFAULT '0',
                    clan_exp TEXT DEFAULT '0',
                    clan_level INTEGER DEFAULT 1,
                    clan_league TEXT DEFAULT 'Нет',
                    clan_battles INTEGER DEFAULT 0,
                    clan_points INTEGER DEFAULT 0,
                    clan_booster TEXT DEFAULT 'Нет',
                    clan_bonus TEXT DEFAULT '-',
                    clan_war TEXT DEFAULT '-',
                    clan_achievements TEXT DEFAULT '-',
                    has_gang INTEGER DEFAULT 0,
                    gang_type TEXT DEFAULT '-',
                    gang_name TEXT DEFAULT '-',
                    gang_loyalty_cur INTEGER DEFAULT 0,
                    gang_loyalty_max INTEGER DEFAULT 0,
                    gang_damage INTEGER DEFAULT 0,
                    gang_chance INTEGER DEFAULT 0,
                    gang_pendant TEXT DEFAULT '-',
                    gang_pendant_duration TEXT DEFAULT '-',
                    gang_party TEXT DEFAULT '-',
                    proxy_host TEXT,
                    proxy_port INTEGER,
                    proxy_user TEXT,
                    proxy_pass TEXT,
                    proxy_type TEXT CHECK(proxy_type IN ('socks5', 'socks4', 'http') OR proxy_type IS NULL),
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Безопасная миграция существующих таблиц для добавления новых колонок
            new_columns = {
                "satiety": "TEXT DEFAULT 'Сыта 🍏'",
                "wins": "INTEGER DEFAULT 0",
                "losses": "INTEGER DEFAULT 0",
                "daily_status": "TEXT DEFAULT 'Не активен'",
                "reserve_days": "INTEGER DEFAULT 0",
                "daily_completed": "INTEGER DEFAULT 0",
                "last_checked": "TEXT",
                "work_info": "TEXT DEFAULT 'Не на работе'",
                "feed_info": "TEXT DEFAULT 'Не кормлена'",
                "fattening": "TEXT DEFAULT 'Нет'",
                "positions": "TEXT DEFAULT 'Рядовой'",
                "partner": "TEXT DEFAULT 'Нет'",
                "marriage_days": "INTEGER DEFAULT 0",
                "froglet": "TEXT DEFAULT 'Нет'",
                "family_level": "INTEGER DEFAULT 1",
                "family_satiety": "TEXT DEFAULT 'Сыт'",
                "family_authority": "INTEGER DEFAULT 0",
                "kindergarten": "TEXT DEFAULT 'Нет'",
                "clash": "TEXT DEFAULT 'Доступен'",
                "feed_in": "TEXT DEFAULT 'Готово'",
                "screen_name": "TEXT",
                "arena_season": "TEXT DEFAULT 'Загрузка...'",
                "arena_wins": "INTEGER DEFAULT 0",
                "arena_losses": "INTEGER DEFAULT 0",
                "arena_place": "TEXT DEFAULT 'Нет'",
                "arena_points": "INTEGER DEFAULT 0",
                "clan_name": "TEXT DEFAULT 'Нет'",
                "clan_members": "TEXT DEFAULT '0'",
                "clan_offmap": "TEXT DEFAULT 'Нет'",
                "clan_cards": "TEXT DEFAULT '0'",
                "clan_exp": "TEXT DEFAULT '0'",
                "clan_level": "INTEGER DEFAULT 1",
                "clan_league": "TEXT DEFAULT 'Нет'",
                "clan_battles": "INTEGER DEFAULT 0",
                "clan_points": "INTEGER DEFAULT 0",
                "clan_booster": "TEXT DEFAULT 'Нет'",
                "clan_bonus": "TEXT DEFAULT '-'",
                "clan_war": "TEXT DEFAULT '-'",
                "clan_achievements": "TEXT DEFAULT '-'",
                "has_gang": "INTEGER DEFAULT 0",
                "gang_type": "TEXT DEFAULT '-'",
                "gang_name": "TEXT DEFAULT '-'",
                "gang_loyalty_cur": "INTEGER DEFAULT 0",
                "gang_loyalty_max": "INTEGER DEFAULT 0",
                "gang_damage": "INTEGER DEFAULT 0",
                "gang_chance": "INTEGER DEFAULT 0",
                "gang_pendant": "TEXT DEFAULT '-'",
                "gang_pendant_duration": "TEXT DEFAULT '-'",
                "gang_party": "TEXT DEFAULT '-'",
                "dungeon_info": "TEXT DEFAULT 'Неизвестно'",
                "arena_info": "TEXT DEFAULT 'Неизвестно'",
                "party_info": "TEXT DEFAULT 'Неизвестно'",
                "marriage_info": "TEXT DEFAULT 'Неизвестно'",
                "robbery_info": "TEXT DEFAULT 'Неизвестно'",
                "map_info": "TEXT DEFAULT 'Неизвестно'",
                "next_feed_time": "TEXT DEFAULT NULL"
            }
            for col_name, col_type in new_columns.items():
                try:
                    await conn.execute(f"ALTER TABLE accounts ADD COLUMN {col_name} {col_type};")
                except sqlite3.OperationalError:
                    pass  # Колонка уже есть, пропускаем

            # 2. Таблица настроек автоматизации аккаунта
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    vk_id INTEGER PRIMARY KEY REFERENCES accounts(vk_id) ON DELETE CASCADE,
                    auto_feed INTEGER DEFAULT 1 CHECK(auto_feed IN (0, 1)),
                    auto_work INTEGER DEFAULT 1 CHECK(auto_work IN (0, 1)),
                    auto_arena INTEGER DEFAULT 1 CHECK(auto_arena IN (0, 1)),
                    auto_dungeon INTEGER DEFAULT 0 CHECK(auto_dungeon IN (0, 1)),
                    work_type TEXT DEFAULT 'столовая',
                    dungeon_type TEXT DEFAULT 'бронзовое',
                    arena_league TEXT DEFAULT 'деревянная'
                );
            """)

            # 3. Таблица логов действий бота
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS actions_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vk_id INTEGER REFERENCES accounts(vk_id) ON DELETE CASCADE,
                    action TEXT NOT NULL,
                    message TEXT,
                    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # 4. Таблица глобальных настроек (фора)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS global_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            """)

            # Вставляем дефолтные задержки, если их нет
            default_settings = [
                ("work_start_grace", "60"),
                ("work_travel_grace", "60"),
                ("work_end_grace", "60"),
                ("min_command_delay", "3"),
                ("monitor_mode_enabled", "1")
            ]
            for key, val in default_settings:
                await conn.execute("""
                    INSERT OR IGNORE INTO global_settings (key, value) VALUES (?, ?)
                """, (key, val))

            # Создаем виртуальный системный аккаунт "Общее" с vk_id = 0 для логов и связей
            await conn.execute("""
                INSERT OR IGNORE INTO accounts (vk_id, name, token, is_active)
                VALUES (0, 'Общее', 'SYSTEM_TOKEN', 0)
            """)

            # 5. Таблица нераспознанных ответов Жабабота
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS unrecognized_responses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vk_id INTEGER REFERENCES accounts(vk_id) ON DELETE CASCADE,
                    command TEXT,
                    response TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # 6. Реестр поддерживаемых команд базы знаний
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS commands_registry (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action_type TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    trigger_regex TEXT NOT NULL,
                    default_cooldown INTEGER DEFAULT 0
                );
            """)

            # 7. Шаблоны цельных ответов Жабабота
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS response_templates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action_type TEXT NOT NULL REFERENCES commands_registry(action_type) ON DELETE CASCADE,
                    pattern_name TEXT NOT NULL,
                    response_type TEXT CHECK(response_type IN ('success', 'cooldown', 'duplicate', 'error')) NOT NULL,
                    regex TEXT NOT NULL,
                    db_updates TEXT NOT NULL
                );
            """)

            # 8. Шаблоны построчного разбора сложных сводок
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS modular_line_templates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action_type TEXT NOT NULL REFERENCES commands_registry(action_type) ON DELETE CASCADE,
                    category TEXT NOT NULL,
                    category_name TEXT NOT NULL,
                    emojis TEXT NOT NULL,
                    keywords TEXT NOT NULL,
                    exclude_keywords TEXT DEFAULT '[]',
                    regex TEXT NOT NULL,
                    db_column TEXT NOT NULL
                );
            """)

            # 9. Таблицы нового механизма мониторинга
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS monitored_commands (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    command TEXT UNIQUE NOT NULL COLLATE NOCASE
                );
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS monitored_responses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    command_id INTEGER REFERENCES monitored_commands(id) ON DELETE CASCADE,
                    response_text TEXT NOT NULL,
                    match_count INTEGER DEFAULT 1,
                    last_mention_at TEXT,
                    recognition_status TEXT DEFAULT 'Не распознаем',
                    UNIQUE(command_id, response_text)
                );
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS active_monitored_messages (
                    vk_msg_id INTEGER PRIMARY KEY,
                    command_id INTEGER REFERENCES monitored_commands(id) ON DELETE CASCADE,
                    current_response_id INTEGER REFERENCES monitored_responses(id) ON DELETE SET NULL,
                    texts TEXT NOT NULL,
                    player_vk_id INTEGER,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            await conn.commit()

            # Seed virtual commands for monitoring if they don't exist
            for v_cmd in ("Неопределенные люди", "Неопределенные жаба"):
                await conn.execute(
                    "INSERT OR IGNORE INTO monitored_commands (command) VALUES (?)", (v_cmd,)
                )
            # Force monitor mode enabled at start
            await conn.execute("""
                INSERT INTO global_settings (key, value) VALUES ('monitor_mode_enabled', '1')
                ON CONFLICT(key) DO UPDATE SET value = '1'
            """)
            await conn.commit()

            # Migrations/updates for new columns
            try:
                await conn.execute("ALTER TABLE monitored_responses ADD COLUMN last_mention_at TEXT;")
            except sqlite3.OperationalError:
                pass
            try:
                await conn.execute("ALTER TABLE monitored_responses ADD COLUMN recognition_status TEXT DEFAULT 'Не распознаем';")
            except sqlite3.OperationalError:
                pass
            try:
                await conn.execute("ALTER TABLE monitored_commands ADD COLUMN recognition_status TEXT DEFAULT 'Не распознаем';")
            except sqlite3.OperationalError:
                pass
            try:
                await conn.execute("ALTER TABLE monitored_commands ADD COLUMN in_recognition INTEGER DEFAULT 0;")
            except sqlite3.OperationalError:
                pass
            # Тип парсера команды: control (перезапись состояния) / simple (regex-статус) / additive (дельты лута)
            try:
                await conn.execute("ALTER TABLE monitored_commands ADD COLUMN parser_type TEXT DEFAULT 'control';")
            except sqlite3.OperationalError:
                pass
            # Описание назначения команды (для AI-агентов и справки)
            try:
                await conn.execute("ALTER TABLE monitored_commands ADD COLUMN description TEXT DEFAULT '';")
            except sqlite3.OperationalError:
                pass
            try:
                await conn.execute("ALTER TABLE active_monitored_messages ADD COLUMN player_vk_id INTEGER;")
            except sqlite3.OperationalError:
                pass
            for new_col, new_type in [("daily_tasks", "TEXT"), ("daily_reward", "TEXT"), ("daily_bonus_tasks", "TEXT"), ("daily_bonus_reward", "TEXT"), ("candies", "INTEGER DEFAULT 0"), ("family_mood", "TEXT DEFAULT 'Спокойное'")]:
                try:
                    await conn.execute(f"ALTER TABLE accounts ADD COLUMN {new_col} {new_type};")
                except sqlite3.OperationalError:
                    pass
            await conn.commit()

            # 10. Таблицы новой системы распознавания правил
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS recognition_subcommands (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    command_id INTEGER NOT NULL REFERENCES monitored_commands(id) ON DELETE CASCADE,
                    name TEXT NOT NULL
                );
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS recognition_rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subcommand_id INTEGER NOT NULL REFERENCES recognition_subcommands(id) ON DELETE CASCADE,
                    pattern TEXT NOT NULL,
                    output_value TEXT NOT NULL,
                    variable_name TEXT NOT NULL
                );
            """)
            await conn.commit()

            # Посев дефолтных отслеживаемых команд ("Моя жаба", "Работа", "Жаба инфо", "Мой инвентарь", "Мое снаряжение", "Покормить жабу", "Дейлики", "Моя семья")
            for cmd_name in ("Моя жаба", "Работа", "Жаба инфо", "Мой инвентарь", "Мое снаряжение", "Покормить жабу", "Дейлики", "Моя семья"):
                await conn.execute(
                    "INSERT OR IGNORE INTO monitored_commands (command) VALUES (?)", (cmd_name,)
                )
            # Принудительно включаем распознавание для «Моя жаба», «Жаба инфо», «Мой инвентарь», «Мое снаряжение», «Покормить жабу», «Дейлики» и «Моя семья»
            await conn.execute("UPDATE monitored_commands SET in_recognition = 1 WHERE command IN ('Моя жаба', 'Жаба инфо', 'Мой инвентарь', 'Мое снаряжение', 'Покормить жабу', 'Дейлики', 'Моя семья')")

            # Посев типа парсера (parser_type) для существующих команд.
            # control — перезапись полного состояния (Жаба инфо, Моя жаба, инвентарь и т.д.)
            # additive — извлечение дельт/лута и прибавление к текущим значениям (Покормить жабу)
            # simple — только regex-статус успеха/кулдауна, без детального парсинга (Работа)
            await conn.execute("""
                UPDATE monitored_commands SET parser_type = CASE
                    WHEN command = 'Покормить жабу' THEN 'additive'
                    WHEN command = 'Работа' THEN 'simple'
                    WHEN command IN ('Неопределенные люди', 'Неопределенные жаба') THEN parser_type
                    ELSE 'control'
                END
                WHERE parser_type IS NULL OR parser_type = '' OR parser_type = 'control'
            """)
            await conn.execute("UPDATE monitored_commands SET parser_type = 'additive' WHERE command = 'Покормить жабу'")
            await conn.execute("UPDATE monitored_commands SET parser_type = 'simple' WHERE command = 'Работа'")
            await conn.commit()

            # Посев описаний (description) для известных команд — справка для разработчика
            # и контекст для AI-агента при выборе parser_type. В логике не участвует.
            # Описания даются персонально каждой команде, остальные заполняются вручную через UI
            # или поштучно при добавлении нового парсера (см. RECOGNITION_GUIDE.md § 10, шаг 2).
            known_descriptions = {
                "Жаба инфо": "Полный снимок состояния жабы: кулдауны всех действий, работа, брак, локация. Перезаписывает все поля (control).",
                "Моя жаба": "Профиль жабы: имя, уровень, сытость, класс, статы (победы/поражения/арены), букашки, настроение. Перезаписывает (control).",
                "Мой инвентарь": "Содержимое инвентаря: предметы, снаряжение, крафт-материалы. Перезаписывает соответствующие колонки (control).",
                "Мое снаряжение": "Текущее снаряжение жабы. Перезаписывает колонки снаряжения (control).",
                "Покормить жабу": "Кормление жабы: при успехе прибавляет букашки/лут к текущим (additive), обновляет сытость и настроение. При кулдауне — таймер.",
                "Работа": "Отправка жабы на работу. Распознаёт только результат: успех/кулдаун/ошибка (simple). В статистику не пишет детально.",
                "Дейлики": "Ежедневные задания жабы: список, прогресс, награды за выполнение. Перезаписывает поля дейликов (control).",
                "Мой клан": "Информация о клане жабы: название, состав, бонусы. Перезаписывает клановые поля (control).",
                "Моя банда": "Состав банды жабы: имя, лояльность, урон, шанс,pendant. Перезаписывает поля банды (control).",
                "Моя семья": "Состав семьи жабы: партнёр, дети, жабята. Перезаписывает семейные поля (control).",
            }
            for cmd_name, desc in known_descriptions.items():
                await conn.execute(
                    "UPDATE monitored_commands SET description = ? WHERE command = ? AND (description IS NULL OR description = '')",
                    (desc, cmd_name)
                )
            await conn.commit()

            # Обеспечиваем наличие команды 'inventory' в commands_registry
            await conn.execute("""
                INSERT OR IGNORE INTO commands_registry (action_type, name, trigger_regex, default_cooldown)
                VALUES ('inventory', 'Мой инвентарь', '^мой\\s+инвентарь$', 0)
            """)
            # Обеспечиваем наличие шаблона в response_templates
            async with conn.execute("SELECT 1 FROM response_templates WHERE action_type = 'inventory'") as cursor:
                if not await cursor.fetchone():
                    await conn.execute("""
                        INSERT INTO response_templates (action_type, pattern_name, response_type, regex, db_updates)
                        VALUES ('inventory', 'Разбор инвентаря', 'success', 'Твой инвентарь:', '{}')
                    """)
            await conn.commit()

            # Обеспечиваем наличие команды 'equipment' в commands_registry
            await conn.execute("""
                INSERT OR IGNORE INTO commands_registry (action_type, name, trigger_regex, default_cooldown)
                VALUES ('equipment', 'Мое снаряжение', '^мое\\s+снаряжение$', 0)
            """)
            # Обеспечиваем наличие шаблона снаряжения в response_templates
            async with conn.execute("SELECT 1 FROM response_templates WHERE action_type = 'equipment'") as cursor:
                if not await cursor.fetchone():
                    await conn.execute("""
                        INSERT INTO response_templates (action_type, pattern_name, response_type, regex, db_updates)
                        VALUES ('equipment', 'Разбор снаряжения', 'success', 'Ближний бой:', '{}')
                    """)
            await conn.commit()


            # Посев тестовых правил распознавания
            async with conn.execute("SELECT id, command FROM monitored_commands WHERE command IN ('Моя жаба', 'Работа', 'Жаба инфо', 'Мой инвентарь', 'Мое снаряжение', 'Покормить жабу', 'Дейлики', 'Моя семья')") as cursor:
                cmd_rows = await cursor.fetchall()
                cmd_ids = {row["command"]: row["id"] for row in cmd_rows}

            if "Моя жаба" in cmd_ids:
                cmd_id = cmd_ids["Моя жаба"]
                async with conn.execute("SELECT COUNT(*) as cnt FROM recognition_subcommands WHERE command_id = ?", (cmd_id,)) as cursor:
                    cnt_row = await cursor.fetchone()
                    if cnt_row and cnt_row["cnt"] == 0:
                        # 1. Имя жабы
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Имя жабы")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, 'Имя жабы: (?P<name>[^\\n]+)', 'Имя = {name}', 'name')
                        """, (sub_id,))

                        # 2. Уровень
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Уровень")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, 'Уровень вашей жабы: (?P<level>\\d+)', 'Уровень = {level}', 'level')
                        """, (sub_id,))

                        # 3. Сытость
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Сытость")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, 'Сытость: (?P<satiety_cur>\\d+)/(?P<satiety_max>\\d+)', 'Сытость = {satiety_cur}/{satiety_max}', 'satiety')
                        """, (sub_id,))

                        # 4. Статус
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Статус")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '👑 Статус жабы: (?P<status>classic|классик)', 'Статус = классик (classic)', 'classic')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '👑 Статус жабы: (?P<status>prime|премиум)', 'Статус = премиум (prime)', 'prime')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '👑 Статус жабы: (?P<status>prime\\+|премиум\\+)', 'Статус = премиум+ (prime+)', 'prime_plus')
                        """, (sub_id,))

                        # 5. Состояние
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Состояние")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '❤️ Состояние: (?P<state>Живая|alive)', 'Состояние = Живая (alive)', 'alive')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '😵 Состояние: (?P<state>❤️🩹\\s*Нужна реанимация|injured)', 'Состояние = Нужна реанимация (injured)', 'injured')
                        """, (sub_id,))

                        # 6. Букашки
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Букашки")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, 'Букашки: (?P<bugs>\\d+)', 'Букашки = {bugs}', 'bugs')
                        """, (sub_id,))

                        # 7. Класс
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Класс")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '🧙 Класс: (?P<class>Авантюрист\\s+[IVXLCDM]+)', 'Класс = {class} (adventurer)', 'adventurer')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '👷 Класс: (?P<class>Ремесленник\\s+[IVXLCDM]+)', 'Класс = {class} (worker)', 'worker')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '🦹 Класс: (?P<class>Ассасин\\s+[IVXLCDM]+)', 'Класс = {class} (assassin)', 'assassin')
                        """, (sub_id,))

                        # 8. Настроение
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Настроение")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '🙂 Настроение: (?P<mood>Отличное)\\s*\\((?P<mood_val>\\d+)\\)', 'Настроение = {mood} ({mood_val})', 'excellent')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '😐 Настроение: (?P<mood>Нормальное)\\s*\\((?P<mood_val>\\d+)\\)', 'Настроение = {mood} ({mood_val})', 'normal')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '😞 Настроение: (?P<mood>Плохое)\\s*\\((?P<mood_val>\\d+)\\)', 'Настроение = {mood} ({mood_val})', 'bad')
                        """, (sub_id,))

                        # 9. Победы
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Победы")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, 'Количество побед: (?P<wins>\\d+)', 'Побед = {wins}', 'wins')
                        """, (sub_id,))

                        # 10. Поражения
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Поражения")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, 'Количество поражений: (?P<losses>\\d+)', 'Поражений = {losses}', 'losses')
                        """, (sub_id,))

                        # 11. Арены
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Арены")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, 'Арен за сезон: (?P<arenas>\\d+)', 'Арен за сезон = {arenas}', 'arenas')
                        """, (sub_id,))

            if "Работа" in cmd_ids:
                cmd_id = cmd_ids["Работа"]
                async with conn.execute("SELECT COUNT(*) as cnt FROM recognition_subcommands WHERE command_id = ?", (cmd_id,)) as cursor:
                    cnt_row = await cursor.fetchone()
                    if cnt_row and cnt_row["cnt"] == 0:
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Успех")
                        )
                        sub_id_ok = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, 'отправилась на работу в (?P<work_place>[а-яА-Я]+)', 'Статус = Работа, Место = {work_place}', 'work_place')
                        """, (sub_id_ok,))

                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Кулдаун")
                        )
                        sub_id_cd = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, 'жаба устала и отдыхает.*разрешит через (?P<hours>\\d+) ч', 'Статус = Отдых, Осталось = {hours} ч', 'cooldown_hours')
                        """, (sub_id_cd,))

            if "Жаба инфо" in cmd_ids:
                cmd_id = cmd_ids["Жаба инфо"]
                async with conn.execute("SELECT COUNT(*) as cnt FROM recognition_subcommands WHERE command_id = ?", (cmd_id,)) as cursor:
                    cnt_row = await cursor.fetchone()
                    if cnt_row and cnt_row["cnt"] == 0:
                        # 1. Работа
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Работа")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '💼: Можно отправиться на работу', 'Можно отправиться на работу (ready)', 'ready')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '💼: Жаба топает на работу', 'Жаба топает на работу (going)', 'going')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '💼: Завершить работу можно через (?:(?P<hours>\\d+)\\s*ч:)?\\s*(?P<minutes>\\d+)\\s*мин\\.', 'Завершить работу можно через {hours}ч:{minutes}мин (working)', 'working')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '💼: Завершай работу', 'Завершай работу (claim_pending)', 'claim_pending')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '💼: Работа будет доступна через (?:(?P<hours>\\d+)\\s*ч:)?\\s*(?P<minutes>\\d+)\\s*мин\\.', 'Работа будет доступна через {hours}ч:{minutes}мин (cooldown)', 'cooldown')
                        """, (sub_id,))

                        # 2. Кормление
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Кормление")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '🍰: Можно покормить', 'Можно покормить (ready)', 'ready')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '🍰: Покормить можно через (?:(?P<hours>\\d+)\\s*ч:)?\\s*(?P<minutes>\\d+)\\s*мин\\.', 'Покормить можно через {hours}ч:{minutes}мин (cooldown)', 'cooldown')
                        """, (sub_id,))

                        # 3. Откорм
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Откорм")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '\\(Можно откормить\\)', 'Можно откормить (ready)', 'ready')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '\\(Откормить можно через (?:(?P<hours>\\d+)\\s*ч:)?\\s*(?P<minutes>\\d+)\\s*мин\\.\\)', 'Откормить можно через {hours}ч:{minutes}мин (cooldown)', 'cooldown')
                        """, (sub_id,))

                        # 4. Подземелье
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Подземелье")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '👹: Доступно подземелье', 'Доступно подземелье (ready)', 'ready')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '👹: Твоя жаба в подземелье', 'Твоя жаба в подземелье (active)', 'active')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '👹: Недоступно во время работы', 'Недоступно во время работы (blocked_by_work)', 'blocked_by_work')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '👹: Жабка восстановится через (?:(?P<hours>\\d+)\\s*ч:)?\\s*(?P<minutes>\\d+)\\s*мин\\.', 'Жабка восстановится через {hours}ч:{minutes}мин (cooldown)', 'cooldown')
                        """, (sub_id,))

                        # 5. Арена
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Арена")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '⚔️: (?:Можно на арену|Атакуй на арене)', 'Доступна арена (ready)', 'ready')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '⚔️: Ожидай результатов', 'Ожидай результатов (pending_results)', 'pending_results')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '⚔️: Арена закрыта', 'Арена закрыта (closed)', 'closed')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '⚔️: До нападения (?P<minutes>\\d+)\\s*мин\\.', 'До нападения {minutes}мин (cooldown)', 'cooldown')
                        """, (sub_id,))

                        # 6. Туса
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Туса")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '(?:💃🏻|💃): Можно потусить', 'Можно потусить (ready)', 'ready')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '(?:💃🏻|💃): Жаба уже тусила', 'Жаба уже тусила (cooldown)', 'cooldown')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '(?:💃🏻|💃): Жаба готовится к тусе', 'Жаба готовится к тусе (preparing)', 'preparing')
                        """, (sub_id,))

                        # 7. Брак
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Брак")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '💘: Жаба не в браке', 'Жаба не в браке (single)', 'single')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '💘: (?P<spouse1>.+?)\\s+и\\s+(?P<spouse2>.+)', 'В браке: {spouse1} и {spouse2} (married)', 'married')
                        """, (sub_id,))

                        # 8. Ограбление
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Ограбление")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '🥷: Доступна подготовка к ограблению', 'Доступна подготовка (ready)', 'ready')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '🥷: Жаба готовится к ограблению', 'Жаба готовится к ограблению (preparing)', 'preparing')
                        """, (sub_id,))

                        # 9. Карта
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Карта")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '🗺: Жаба в начальной точке', 'В начальной точке (home)', 'home')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '🗺: Жаба топает на работу', 'Топает на работу (moving_to_work)', 'moving_to_work')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, '🗺: Жаба батрачит в (?P<location>.+)', 'Батрачит в {location} (working_at_location)', 'working_at_location')
                        """, (sub_id,))

            if "Мой инвентарь" in cmd_ids:
                cmd_id = cmd_ids["Мой инвентарь"]
                async with conn.execute("SELECT COUNT(*) as cnt FROM recognition_subcommands WHERE command_id = ?", (cmd_id,)) as cursor:
                    cnt_row = await cursor.fetchone()
                    if cnt_row and cnt_row["cnt"] == 0:
                        rules_data = [
                            ("Леденцы", "🍭\\s*Леденцы:\\s*(?P<inv_lollipop>\\d+)", "Леденцы = {inv_lollipop}", "inv_lollipop"),
                            ("Аптечки", "💊\\s*Аптечки:\\s*(?P<inv_bandages>\\d+)", "Аптечки = {inv_bandages}", "inv_bandages"),
                            ("Пивас", "🍻\\s*Пивас:\\s*(?P<inv_beer>[^\\n\\r]+)", "Пивас = {inv_beer}", "inv_beer"),
                            ("Стрекозюля удачи", "🦟\\s*Стрекозюля удачи:\\s*(?P<inv_dragonfly>[^\\n\\r]+)", "Стрекозюля = {inv_dragonfly}", "inv_dragonfly"),
                            ("Карта болота", "🗺\\s*Карта болота:\\s*(?P<inv_map>[^\\n\\r]+)", "Карта = {inv_map}", "inv_map"),
                            ("Изолента", "🧿\\s*Изолента:\\s*(?P<inv_tape>\\d+)", "Изолента = {inv_tape}", "inv_tape"),
                            ("Жабули для банды", "🐸\\s*Жабули для банды:\\s*(?P<inv_gang_frogs>\\d+)(?:/\\d+)?", "Жабули = {inv_gang_frogs}/10", "inv_gang_frogs"),
                            ("Капсула опыта", "🔋\\s*Капсула опыта:\\s*(?P<inv_exp_capsule>\\d+)", "Капсула опыта = {inv_exp_capsule}", "inv_exp_capsule"),
                            ("Пропуск", "🔖\\s*Пропуск(?:[^:]*):\\s*(?P<eq_pass>\\d+)(?:/\\d+)?", "Пропуск = {eq_pass}/1", "eq_pass"),
                            ("Отмычка", "🪛\\s*Отмычка(?:[^:]*):\\s*(?P<eq_lockpick>\\d+)(?:/\\d+)?", "Отмычка = {eq_lockpick}/10", "eq_lockpick"),
                            ("Батарейка", "🔋\\s*Батарейка(?:[^:]*):\\s*(?P<eq_battery>\\d+)(?:/\\d+)?", "Батарейка = {eq_battery}/10", "eq_battery"),
                            ("🧩", "🧩:\\s*(?P<cr_puzzle>\\d+)(?:/\\d+)?.*", "Пазл = {cr_puzzle}/10", "cr_puzzle"),
                            ("🔗", "🔗:\\s*(?P<cr_link>\\d+)(?:/\\d+)?.*", "Звено = {cr_link}/10", "cr_link"),
                            ("🪨", "🪨:\\s*(?P<cr_stone>\\d+)(?:/\\d+)?.*", "Камень = {cr_stone}/10", "cr_stone"),
                            ("🎭", "🎭:\\s*(?P<cr_mask>\\d+)(?:/\\d+)?.*", "Маска = {cr_mask}/10", "cr_mask"),
                            ("📃", "📃:\\s*(?P<cr_paper>\\d+)(?:/\\d+)?.*", "Бумага = {cr_paper}/10", "cr_paper"),
                            ("⚡️", "⚡️?:\\s*(?P<cr_lightning>\\d+)(?:/\\d+)?.*", "Молния = {cr_lightning}/10", "cr_lightning"),
                        ]
                        for sub_name, pattern, output_val, var_name in rules_data:
                            cursor_sub = await conn.execute(
                                "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, sub_name)
                            )
                            sub_id = cursor_sub.lastrowid
                            await conn.execute("""
                                INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                                VALUES (?, ?, ?, ?)
                            """, (sub_id, pattern, output_val, var_name))

            if "Мое снаряжение" in cmd_ids:
                cmd_id = cmd_ids["Мое снаряжение"]
                async with conn.execute("SELECT COUNT(*) as cnt FROM recognition_subcommands WHERE command_id = ?", (cmd_id,)) as cursor:
                    cnt_row = await cursor.fetchone()
                    if cnt_row and cnt_row["cnt"] == 0:
                        rules_data = [
                            ("Ближний бой", r"🗡️\s*Ближний бой:\s*(?P<eq_melee>[^\n\r]+)", "Ближний бой = {eq_melee}", "eq_melee"),
                            ("Дальний бой", r"🏹\s*Дальний бой:\s*(?P<eq_ranged>[^\n\r]+)", "Дальний бой = {eq_ranged}", "eq_ranged"),
                            ("Наголовник", r"🐸\s*Наголовник:\s*(?P<eq_helmet>[^\n\r]+)", "Наголовник = {eq_helmet}", "eq_helmet"),
                            ("Нагрудник", r"🥼\s*Нагрудник:\s*(?P<eq_chest>[^\n\r]+)", "Нагрудник = {eq_chest}", "eq_chest"),
                            ("Налапники", r"🧤\s*Налапники:\s*(?P<eq_paws>[^\n\r]+)", "Налапники = {eq_paws}", "eq_paws"),
                            ("Баффы", r"Баффы от снаряжения:\s*\n(?P<eq_buffs>[\s\S]*?)(?=\n\n|\n\S)", "Баффы = {eq_buffs}", "eq_buffs"),
                            ("Банда", r"🏋️\s*Банда:\s*(?P<eq_gang>[^\n\r]+)", "Банда = {eq_gang}", "eq_gang"),
                            ("Усилитель", r"🚀\s*Усилитель:\s*(?P<eq_booster>[^\n\r]+)", "Усилитель = {eq_booster}", "eq_booster"),
                            ("Оружейные кусочки", r"⚙️\s*Оружейных кусочков:\s*(?P<eq_parts_weapon>\d+)", "Оружейные = {eq_parts_weapon}", "eq_parts_weapon"),
                            ("Кусочки водорослей", r"🌿\s*Кусочков водорослей:\s*(?P<eq_parts_algae>\d+)", "Водоросли = {eq_parts_algae}", "eq_parts_algae"),
                            ("Кусочки кувшинки", r"🥬\s*Кусочков кувшинки:\s*(?P<eq_parts_lily>\d+)", "Кувшинки = {eq_parts_lily}", "eq_parts_lily"),
                            ("Кусочки клюва цапли", r"🦴\s*Кусочков клюва цапли:\s*(?P<eq_parts_beak>\d+)", "Клюв цапли = {eq_parts_beak}", "eq_parts_beak"),
                            ("ЖабоГемы", r"💠\s*ЖабоГемы:\s*(?P<eq_gems>\d+/\d+)", "ЖабоГемы = {eq_gems}", "eq_gems"),
                            ("Здоровье", r"❤️\s*Здоровье:\s*(?P<eq_health>\d+)", "Здоровье = {eq_health}", "eq_health"),
                            ("Атака", r"⚔️\s*Атака:\s*(?P<eq_attack>\d+)", "Атака = {eq_attack}", "eq_attack"),
                            ("Защита", r"🛡️\s*Защита:\s*(?P<eq_defense>\d+)", "Защита = {eq_defense}", "eq_defense"),
                            # --- Модификаторы снаряжения (нанесены на броню как [эмодзи] в скобках) ---
                            # Подраздел = эмодзи+имя; variable_name = тег из EQUIPMENT_MODIFIERS (toad_info_parser.py).
                            # regex матчит строку слота брони с модификатором в скобках; тиражи [1|2|3] = бонус при 1/2/3 предметах.
                            ("👊 Увеличенный урон", r"[^\n]*\s\[👊\]", "Увеличенный урон [+5|+8|+10]", "mod_damage"),
                            ("🛡️ Увеличенная броня", r"[^\n]*\s\[🛡️\]", "Увеличенная броня [+5|+8|+10]", "mod_armor"),
                            ("❤️ Увеличенное здоровье", r"[^\n]*\s\[❤️\]", "Увеличенное здоровье [+7|+10|+15]", "mod_health"),
                            ("🌵 Шипы", r"[^\n]*\s\[🌵\]", "Шипы [3%|4%|5%]", "mod_thorns"),
                            ("🧛 Вампиризм", r"[^\n]*\s\[🧛\]", "Вампиризм 15% [25%|35%|50%]", "mod_vampirism"),
                            ("🦔 Анти-Шип", r"[^\n]*\s\[🦔\]", "Анти-Шип [30%|100%|100%]", "mod_antithorns"),
                            ("☀️ Анти-Вампир", r"[^\n]*\s\[☀️\]", "Анти-Вампир [30%|100%|100%]", "mod_antivamp"),
                        ]
                        for sub_name, pattern, output_val, var_name in rules_data:
                            cursor_sub = await conn.execute(
                                "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, sub_name)
                            )
                            sub_id = cursor_sub.lastrowid
                            await conn.execute("""
                                INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                                VALUES (?, ?, ?, ?)
                            """, (sub_id, pattern, output_val, var_name))

            if "Покормить жабу" in cmd_ids:
                cmd_id = cmd_ids["Покормить жабу"]
                async with conn.execute("SELECT COUNT(*) as cnt FROM recognition_subcommands WHERE command_id = ?", (cmd_id,)) as cursor:
                    cnt_row = await cursor.fetchone()
                    if cnt_row and cnt_row["cnt"] == 0:
                        # 1. Успешное кормление
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Успешное кормление")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, 'ты получил', 'Успешное кормление (success)', 'success')
                        """, (sub_id,))

                        # 2. Кулдаун
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Кулдаун")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, 'покормить жабулю через (?:(?P<hours>\\d+)\\s*ч[.:]?)?\\s*(?P<minutes>\\d+)\\s*мин', 'Кулдаун {hours}ч:{minutes}мин (cooldown)', 'cooldown')
                        """, (sub_id,))

            if "Дейлики" in cmd_ids:
                cmd_id = cmd_ids["Дейлики"]
                async with conn.execute("SELECT COUNT(*) as cnt FROM recognition_subcommands WHERE command_id = ?", (cmd_id,)) as cursor:
                    cnt_row = await cursor.fetchone()
                    if cnt_row and cnt_row["cnt"] == 0:
                        # 1. Статус дейлика
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Статус дейлика")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, 'Твой статус:\\s*(?P<status>Золотой\\s+\\[\\d+/∞\\])', 'Статус = Золотой (gold)', 'gold')
                        """, (sub_id,))
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, 'Твой статус:\\s*(?P<status>Зеленый\\s+\\[\\d+/3\\])', 'Статус = Зеленый (green)', 'green')
                        """, (sub_id,))

                        # 2. Дней в запасе
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Дней в запасе")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, 'Можно пропустить дней:\\s*(?P<reserve_days>\\d+)', 'Дней в запасе = {reserve_days}', 'reserve_days')
                        """, (sub_id,))

                        # 3. Выполнен сегодня?
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Выполнен сегодня?")
                        )
                        sub_id = cursor_sub.lastrowid
                        await conn.execute("""
                            INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                            VALUES (?, 'Все задания на сегодня выполнены', 'Выполнено сегодня = Да (completed)', 'completed')
                        """, (sub_id,))

                        # 4. Задания
                        cursor_sub = await conn.execute(
                            "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, "Задания")
                        )
                        sub_id = cursor_sub.lastrowid
                        tasks_rules = [
                            ('Завершить работу', 'task_work'),
                            ('Покормить жабенка', 'task_baby'),
                            ('Посетить тусу', 'task_party'),
                            ('Покормить жабу', 'task_feed'),
                            ('Сыграть в рулетку', 'task_roulette'),
                            ('Посетить жабью гонку', 'task_race'),
                            ('Посетить подземелье', 'task_dungeon'),
                            ('Совершить атаку на арене', 'task_arena'),
                            ('Сделать любой подарок партнеру', 'task_gift'),
                            ('Совершить атаку в клановой войне', 'task_clan_war')
                        ]
                        for task_name, var_name in tasks_rules:
                            await conn.execute("""
                                INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                                VALUES (?, ?, ?, ?)
                            """, (sub_id, fr"{task_name} \[\d+/\d+\]", task_name, var_name))

            if "Моя семья" in cmd_ids:
                cmd_id = cmd_ids["Моя семья"]
                async with conn.execute("SELECT COUNT(*) as cnt FROM recognition_subcommands WHERE command_id = ?", (cmd_id,)) as cursor:
                    cnt_row = await cursor.fetchone()
                    if cnt_row and cnt_row["cnt"] == 0:
                        rules_data = [
                            ("Партнер", r"💖\s*(?P<partner>[^\n]+)", "Партнер = {partner}", "partner"),
                            ("Дни в браке", r"💍 Количество дней в браке:\s*(?P<marriage_days>\d+)", "Дней в браке = {marriage_days}", "marriage_days"),
                            ("Конфетки", r"🍬 Конфетки:\s*(?P<candies>\d+)", "Конфетки = {candies}", "candies"),
                            ("Имя жабёнка", r"🐸 Имя жабёнка:\s*(?P<froglet>[^\n]+)", "Имя жабёнка = {froglet}", "froglet"),
                            ("Уровень", r"[⭐⭐️] Уровень:\s*(?P<family_level>\d+)", "Уровень = {family_level}", "family_level"),
                            ("Сытость", r"🍰 Сытость:\s*(?P<family_satiety>\d+/\d+)", "Сытость = {family_satiety}", "family_satiety"),
                            ("Авторитет", r"😎 Авторитет:\s*(?P<family_authority>\d+/\d+|\d+)", "Авторитет = {family_authority}", "family_authority"),
                            ("Настроение", r"🙂 Настроение:\s*(?P<family_mood>[^\n]+)", "Настроение = {family_mood}", "family_mood"),
                            ("Покормить через", r"😋 Можно покормить через\s*(?P<feed_in>[^\n]+)", "Покормить через = {feed_in}", "feed_in"),
                            ("Забрать через", r"[🕒⏳] Можно забрать через\s*(?P<kindergarten>[^\n]+)", "Забрать через = {kindergarten}", "kindergarten"),
                            ("Махач через", r"👊 Пойти на махач через\s*(?P<clash>[^\n]+)", "Махач через = {clash}", "clash"),
                        ]
                        for sub_name, pattern, output_val, var_name in rules_data:
                            cursor_sub = await conn.execute(
                                "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (cmd_id, sub_name)
                            )
                            sub_id = cursor_sub.lastrowid
                            await conn.execute("""
                                INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                                VALUES (?, ?, ?, ?)
                            """, (sub_id, pattern, output_val, var_name))

            await conn.commit()
            
        # Посев дефолтных правил, если таблицы пусты или не все команды на месте
        async with self._connect() as conn:
            async with conn.execute("SELECT COUNT(*) as cnt FROM commands_registry") as cursor:
                row = await cursor.fetchone()
                if row and row["cnt"] < 75:
                    logger.info("База знаний пуста или не обновлена. Запускаем наполнение дефолтными правилами (seeding)...")
                    await self.seed_default_knowledge_base()

        # Миграция: обновление уникальных имен для "Моя жаба" и добавление новой вариации для "Туса"
        async with self._connect() as conn:
            logger.info("Запуск миграции правил распознавания...")
            # 1. Сделать уникальные имена для "Моя жаба" реально уникальными
            await conn.execute("UPDATE recognition_rules SET variable_name = 'classic' WHERE pattern = '👑 Статус жабы: (?P<status>classic|классик)'")
            await conn.execute("UPDATE recognition_rules SET variable_name = 'prime' WHERE pattern = '👑 Статус жабы: (?P<status>prime|премиум)'")
            await conn.execute("UPDATE recognition_rules SET variable_name = 'prime_plus' WHERE pattern = '👑 Статус жабы: (?P<status>prime\\+|премиум\\+)'")
            await conn.execute("UPDATE recognition_rules SET variable_name = 'alive' WHERE pattern = '❤️ Состояние: (?P<state>Живая|alive)'")
            await conn.execute("UPDATE recognition_rules SET variable_name = 'injured' WHERE pattern = '😵 Состояние: (?P<state>❤️🩹\\s*Нужна реанимация|injured)'")
            await conn.execute("UPDATE recognition_rules SET variable_name = 'adventurer' WHERE pattern = '🧙 Класс: (?P<class>Авантюрист\\s+[IVXLCDM]+)'")
            await conn.execute("UPDATE recognition_rules SET variable_name = 'worker' WHERE pattern = '👷 Класс: (?P<class>Ремесленник\\s+[IVXLCDM]+)'")
            await conn.execute("UPDATE recognition_rules SET variable_name = 'assassin' WHERE pattern = '🦹 Класс: (?P<class>Ассасин\\s+[IVXLCDM]+)'")
            await conn.execute("UPDATE recognition_rules SET variable_name = 'excellent' WHERE pattern = '🙂 Настроение: (?P<mood>Отличное)\\s*\\((?P<mood_val>\\d+)\\)'")
            await conn.execute("UPDATE recognition_rules SET variable_name = 'normal' WHERE pattern = '😐 Настроение: (?P<mood>Нормальное)\\s*\\((?P<mood_val>\\d+)\\)'")
            await conn.execute("UPDATE recognition_rules SET variable_name = 'bad' WHERE pattern = '😞 Настроение: (?P<mood>Плохое)\\s*\\((?P<mood_val>\\d+)\\)'")

            # 2. Добавление новой вариации для тусовки
            async with conn.execute("""
                SELECT s.id 
                FROM recognition_subcommands s
                JOIN monitored_commands c ON s.command_id = c.id
                WHERE c.command = 'Жаба инфо' AND s.name = 'Туса'
            """) as cursor:
                row = await cursor.fetchone()
                if row:
                    sub_id = row["id"]
                    # Проверяем, существует ли уже это правило
                    async with conn.execute(
                        "SELECT id FROM recognition_rules WHERE subcommand_id = ? AND pattern = ?",
                        (sub_id, '(?:💃🏻|💃): Жаба готовится к тусе')
                    ) as check_cursor:
                        if not await check_cursor.fetchone():
                            await conn.execute("""
                                INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                                VALUES (?, '(?:💃🏻|💃): Жаба готовится к тусе', 'Жаба готовится к тусе (preparing)', 'preparing')
                            """, (sub_id,))
                            logger.info("Миграция: Добавлено новое правило для тусы.")

            # 3. Миграция для "Моя семья"
            await conn.execute("UPDATE commands_registry SET trigger_regex = '^моя\\s+семья$' WHERE action_type = 'excel_моя_семья'")
            async with conn.execute("SELECT 1 FROM response_templates WHERE action_type = 'excel_моя_семья'") as cursor_tpl:
                if not await cursor_tpl.fetchone():
                    await conn.execute("""
                        INSERT INTO response_templates (action_type, pattern_name, response_type, regex, db_updates)
                        VALUES ('excel_моя_семья', 'Разбор семьи', 'success', '💖[\\s\\S]*?и[\\s\\S]*?:', '{}')
                    """)
            
            # 4. Добавление подкоманд и правил для "Моя семья" (на случай если база уже создана)
            async with conn.execute("SELECT id FROM monitored_commands WHERE command = 'Моя семья'") as cursor_fam:
                fam_row = await cursor_fam.fetchone()
                if fam_row:
                    fam_cmd_id = fam_row["id"]
                    async with conn.execute("SELECT COUNT(*) as cnt FROM recognition_subcommands WHERE command_id = ?", (fam_cmd_id,)) as sub_cursor:
                        fam_sub_cnt = (await sub_cursor.fetchone())["cnt"]
                    
                    if fam_sub_cnt == 0:
                        rules_data = [
                            ("Партнер", r"💖\s*(?P<partner>[^\n]+)", "Партнер = {partner}", "partner"),
                            ("Дни в браке", r"💍 Количество дней в браке:\s*(?P<marriage_days>\d+)", "Дней в браке = {marriage_days}", "marriage_days"),
                            ("Конфетки", r"🍬 Конфетки:\s*(?P<candies>\d+)", "Конфетки = {candies}", "candies"),
                            ("Имя жабёнка", r"🐸 Имя жабёнка:\s*(?P<froglet>[^\n]+)", "Имя жабёнка = {froglet}", "froglet"),
                            ("Уровень", r"[⭐⭐️] Уровень:\s*(?P<family_level>\d+)", "Уровень = {family_level}", "family_level"),
                            ("Сытость", r"🍰 Сытость:\s*(?P<family_satiety>\d+/\d+)", "Сытость = {family_satiety}", "family_satiety"),
                            ("Авторитет", r"😎 Авторитет:\s*(?P<family_authority>\d+/\d+|\d+)", "Авторитет = {family_authority}", "family_authority"),
                            ("Настроение", r"🙂 Настроение:\s*(?P<family_mood>[^\n]+)", "Настроение = {family_mood}", "family_mood"),
                            ("Покормить через", r"😋 Можно покормить через\s*(?P<feed_in>[^\n]+)", "Покормить через = {feed_in}", "feed_in"),
                            ("Забрать через", r"[🕒⏳] Можно забрать через\s*(?P<kindergarten>[^\n]+)", "Забрать через = {kindergarten}", "kindergarten"),
                            ("Махач через", r"👊 Пойти на махач через\s*(?P<clash>[^\n]+)", "Махач через = {clash}", "clash"),
                        ]
                        for sub_name, pattern, output_val, var_name in rules_data:
                            cursor_sub = await conn.execute(
                                "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (fam_cmd_id, sub_name)
                            )
                            sub_id = cursor_sub.lastrowid
                            await conn.execute("""
                                INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                                VALUES (?, ?, ?, ?)
                            """, (sub_id, pattern, output_val, var_name))
                        logger.info("Миграция: Добавлены правила распознавания для 'Моя семья'.")

            # 5. Добавление подкоманд и правил для "Мой инвентарь" (на случай если база уже создана или имеет старый формат)
            async with conn.execute("SELECT id FROM monitored_commands WHERE command = 'Мой инвентарь'") as cursor:
                inv_row = await cursor.fetchone()
                if inv_row:
                    inv_cmd_id = inv_row["id"]
                    # Проверяем, есть ли старые/неверные подкомандные структуры (например, "Инвентарь", "Ограбление", "Крафт")
                    async with conn.execute("SELECT COUNT(*) as cnt FROM recognition_subcommands WHERE command_id = ? AND name IN ('Инвентарь', 'Ограбление', 'Крафт')", (inv_cmd_id,)) as check_sub_cursor:
                        has_old_layout = (await check_sub_cursor.fetchone())["cnt"] > 0
                        
                    async with conn.execute("SELECT COUNT(*) as cnt FROM recognition_subcommands WHERE command_id = ?", (inv_cmd_id,)) as sub_cursor:
                        inv_sub_cnt = (await sub_cursor.fetchone())["cnt"]
                        
                    # Проверяем, нужно ли обновить правила крафта (добавить .* в конец)
                    async with conn.execute("""
                        SELECT r.pattern FROM recognition_rules r
                        JOIN recognition_subcommands s ON r.subcommand_id = s.id
                        WHERE s.command_id = ? AND s.name = '🧩'
                    """, (inv_cmd_id,)) as craft_cursor:
                        craft_row = await craft_cursor.fetchone()
                        needs_craft_update = craft_row and not craft_row["pattern"].endswith(".*")
                        
                    if inv_sub_cnt == 0 or has_old_layout or needs_craft_update:
                        logger.info("Миграция: Пересоздание подкоманд и правил для 'Мой инвентарь'...")
                        await conn.execute("DELETE FROM recognition_subcommands WHERE command_id = ?", (inv_cmd_id,))
                        
                        rules_data = [
                            ("Леденцы", "🍭\\s*Леденцы:\\s*(?P<inv_lollipop>\\d+)", "Леденцы = {inv_lollipop}", "inv_lollipop"),
                            ("Аптечки", "💊\\s*Аптечки:\\s*(?P<inv_bandages>\\d+)", "Аптечки = {inv_bandages}", "inv_bandages"),
                            ("Пивас", "🍻\\s*Пивас:\\s*(?P<inv_beer>[^\\n\\r]+)", "Пивас = {inv_beer}", "inv_beer"),
                            ("Стрекозюля удачи", "🦟\\s*Стрекозюля удачи:\\s*(?P<inv_dragonfly>[^\\n\\r]+)", "Стрекозюля = {inv_dragonfly}", "inv_dragonfly"),
                            ("Карта болота", "🗺\\s*Карта болота:\\s*(?P<inv_map>[^\\n\\r]+)", "Карта = {inv_map}", "inv_map"),
                            ("Изолента", "🧿\\s*Изолента:\\s*(?P<inv_tape>\\d+)", "Изолента = {inv_tape}", "inv_tape"),
                            ("Жабули для банды", "🐸\\s*Жабули для банды:\\s*(?P<inv_gang_frogs>\\d+)(?:/\\d+)?", "Жабули = {inv_gang_frogs}/10", "inv_gang_frogs"),
                            ("Капсула опыта", "🔋\\s*Капсула опыта:\\s*(?P<inv_exp_capsule>\\d+)", "Капсула опыта = {inv_exp_capsule}", "inv_exp_capsule"),
                            ("Пропуск", "🔖\\s*Пропуск(?:[^:]*):\\s*(?P<eq_pass>\\d+)(?:/\\d+)?", "Пропуск = {eq_pass}/1", "eq_pass"),
                            ("Отмычка", "🪛\\s*Отмычка(?:[^:]*):\\s*(?P<eq_lockpick>\\d+)(?:/\\d+)?", "Отмычка = {eq_lockpick}/10", "eq_lockpick"),
                            ("Батарейка", "🔋\\s*Батарейка(?:[^:]*):\\s*(?P<eq_battery>\\d+)(?:/\\d+)?", "Батарейка = {eq_battery}/10", "eq_battery"),
                            ("🧩", "🧩:\\s*(?P<cr_puzzle>\\d+)(?:/\\d+)?.*", "Пазл = {cr_puzzle}/10", "cr_puzzle"),
                            ("🔗", "🔗:\\s*(?P<cr_link>\\d+)(?:/\\d+)?.*", "Звено = {cr_link}/10", "cr_link"),
                            ("🪨", "🪨:\\s*(?P<cr_stone>\\d+)(?:/\\d+)?.*", "Камень = {cr_stone}/10", "cr_stone"),
                            ("🎭", "🎭:\\s*(?P<cr_mask>\\d+)(?:/\\d+)?.*", "Маска = {cr_mask}/10", "cr_mask"),
                            ("📃", "📃:\\s*(?P<cr_paper>\\d+)(?:/\\d+)?.*", "Бумага = {cr_paper}/10", "cr_paper"),
                            ("⚡️", "⚡️?:\\s*(?P<cr_lightning>\\d+)(?:/\\d+)?.*", "Молния = {cr_lightning}/10", "cr_lightning"),
                        ]
                        for sub_name, pattern, output_val, var_name in rules_data:
                            cursor_sub = await conn.execute(
                                "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (inv_cmd_id, sub_name)
                            )
                            sub_id = cursor_sub.lastrowid
                            await conn.execute("""
                                INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                                VALUES (?, ?, ?, ?)
                            """, (sub_id, pattern, output_val, var_name))
                        logger.info("Миграция: Подкоманды и правила для 'Мой инвентарь' успешно пересозданы.")
            
            # --- МИГРАЦИЯ ПРАВИЛ РАСПОЗНАВАНИЯ ДЛЯ 'МОЙ КЛАН' ---
            try:
                # Обеспечиваем наличие команды 'Мой клан' в monitored_commands
                await conn.execute("INSERT OR IGNORE INTO monitored_commands (command) VALUES ('Мой клан')")
                await conn.execute("UPDATE monitored_commands SET in_recognition = 1 WHERE command = 'Мой клан'")
                
                # Обеспечиваем наличие шаблона в response_templates для 'excel_мой_клан'
                async with conn.execute("SELECT 1 FROM response_templates WHERE action_type = 'excel_мой_клан'") as cursor_tpl:
                    if not await cursor_tpl.fetchone():
                        await conn.execute("""
                            INSERT INTO response_templates (action_type, pattern_name, response_type, regex, db_updates)
                            VALUES ('excel_мой_клан', 'Разбор клана', 'success', '^Клан[\\s\\S]*?:', '{}')
                        """)

                # Создаем подкоманды и правила
                async with conn.execute("SELECT id FROM monitored_commands WHERE command = 'Мой клан'") as cursor_clan:
                    clan_row = await cursor_clan.fetchone()
                    if clan_row:
                        clan_cmd_id = clan_row["id"]
                        # Перезаписываем правила для «Мой клан», чтобы они всегда были актуальны
                        await conn.execute("DELETE FROM recognition_subcommands WHERE command_id = ?", (clan_cmd_id,))
                        
                        rules_data = [
                            ("Название", r"^Клан\s+(?P<clan_name>[^\n:]+):", "Название = {clan_name}", "clan_name"),
                            ("Состав", r"^(?P<clan_members>(?:(?:👷|🧙|🦹|🐸)[^\n]+\n?)+)", "{clan_members}", "clan_members"),
                            ("Уровень", r"^[⭐⭐️]?\s*Уровень:\s*(?P<clan_level>\d+)", "Уровень = {clan_level}", "clan_level"),
                            ("Опыт", r"^⏳\s*Опыт вашего клана:\s*(?P<clan_exp>\S+)", "Опыт = {clan_exp}", "clan_exp"),
                            ("Карт", r"^🗺\s*Общее количество карт:\s*(?P<clan_cards>[^\n]+)", "Карт = {clan_cards}", "clan_cards"),
                            ("Бонус на карту", r"^❇️\s*(?:\[[^\]]+\]|[^:]+)\s*:\s*(?P<clan_bonus>[^\n]+)", "Бонус на карту = {clan_bonus}", "clan_bonus"),
                            ("За картой", r"^(?:🗺|🕐)?\s*(?:Отправиться|Пойти)\s+за\s+картой\s+можно\s+через\s+(?P<cooldown>(?:(?:\d+)\s*(?:ч|ч\.|ч:|час|часа|часов)\s*)?(?:\d+)\s*(?:мин|минут)\.?)", "За картой = Через {cooldown}", "cooldown"),
                            ("За картой", r"\A(?![\s\S]*(?:Отправиться|Пойти)\s+за\s+картой\s+можно\s+через).*", "За картой = Можно", "ready"),
                            ("Клановые войны", r"^(?:🤼‍♂️|⚔️)?\s*Клановые войны начнутся через (?P<clan_war>[^\n]+)", "Клановые войны = {clan_war}", "clan_war"),
                            ("Лига", r"^⚔️\s*Лига:\s*(?P<clan_league>[а-яА-ЯёЁ]+)", "Лига = {clan_league}", "clan_league"),
                            ("Сражений за сезон", r"^🧮\s*Сражений за сезон:\s*(?P<clan_battles>\d+)", "Сражений за сезон = {clan_battles}", "clan_battles"),
                            ("Очков", r"^🏆\s*Клановых очков:\s*(?P<clan_points>\d+)", "Очков = {clan_points}", "clan_points"),
                            ("Усилитель", r"^🚀\s*Усилитель:\s*(?P<clan_booster>[^\n]+)", "Усилитель = {clan_booster}", "clan_booster"),
                            ("Ачивки", r"^(?P<clan_achievements>(?:(?:🥇|🥈|🥉|🏆|🎖|🎗)[^\n]+\n?)+)", "{clan_achievements}", "clan_achievements"),
                        ]
                        subcommand_ids = {}
                        for sub_name, pattern, output_val, var_name in rules_data:
                            if sub_name not in subcommand_ids:
                                cursor_sub = await conn.execute(
                                    "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (clan_cmd_id, sub_name)
                                )
                                sub_id = cursor_sub.lastrowid
                                subcommand_ids[sub_name] = sub_id
                            else:
                                sub_id = subcommand_ids[sub_name]
                                
                            await conn.execute("""
                                INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                                VALUES (?, ?, ?, ?)
                            """, (sub_id, pattern, output_val, var_name))
                        logger.info("Миграция: Обновлены правила распознавания для 'Мой клан'.")
            except Exception as e:
                logger.error(f"Ошибка миграции правил распознавания для 'Мой клан': {e}")

            # --- МИГРАЦИЯ ПРАВИЛ РАСПОЗНАВАНИЯ ДЛЯ 'МОЯ БАНДА' ---
            try:
                # Обеспечиваем наличие команды 'Моя банда' в monitored_commands
                await conn.execute("INSERT OR IGNORE INTO monitored_commands (command) VALUES ('Моя банда')")
                await conn.execute("UPDATE monitored_commands SET in_recognition = 1 WHERE command = 'Моя банда'")
                
                # Обеспечиваем наличие триггера и шаблона
                await conn.execute("UPDATE commands_registry SET trigger_regex = '^моя\\s+банда$' WHERE action_type = 'excel_моя_банда'")
                async with conn.execute("SELECT 1 FROM response_templates WHERE action_type = 'excel_моя_банда'") as cursor_tpl:
                    if not await cursor_tpl.fetchone():
                        await conn.execute("""
                            INSERT INTO response_templates (action_type, pattern_name, response_type, regex, db_updates)
                            VALUES ('excel_моя_банда', 'Разбор банды', 'success', '🏋️\\s*Банда:|У\\s+тебя\\s+нет\\s+банды|Жабульки\\s+в\\s+инвентаре:', '{}')
                        """)

                # Создаем подкоманды и правила
                async with conn.execute("SELECT id FROM monitored_commands WHERE command = 'Моя банда'") as cursor_gang:
                    gang_row = await cursor_gang.fetchone()
                    if gang_row:
                        gang_cmd_id = gang_row["id"]
                        await conn.execute("DELETE FROM recognition_subcommands WHERE command_id = ?", (gang_cmd_id,))
                        
                        rules_data = [
                            ("Тип банды", r"🏋️\s*Банда:\s*(?P<gang_type>[^\n]+)", "Тип банды = {gang_type}", "gang_type"),
                            ("Название банды", r"🏷\s*Название:\s*(?P<gang_name>[^\n]+)", "Название = {gang_name}", "gang_name"),
                            ("Верность банды", r"🤝\s*Верность:\s*(?P<gang_loyalty_cur>\d+)(?:/\d+)?", "Верность = {gang_loyalty_cur}", "gang_loyalty_cur"),
                            ("Урон банды", r"⚔️\s*Урон:\s*(?P<gang_damage>\d+)%", "Урон = {gang_damage}%", "gang_damage"),
                            ("Шанс срабатывания", r"🎯\s*Шанс срабатывания:\s*(?P<gang_chance>\d+)%", "Шанс = {gang_chance}%", "gang_chance"),
                            ("Кулон", r"📿\s*Кулон:\s*(?P<gang_pendant>[^\n]+)", "Кулон = {gang_pendant}", "gang_pendant"),
                            ("Время кулона", r"🕒\s*Время действия:\s*(?P<gang_pendant_duration>[^\n]+)", "Время кулона = {gang_pendant_duration}", "gang_pendant_duration"),
                            ("Брать на тусу", r"(?:💃🏻|💃)\s*Брать на тусу:\s*(?P<gang_party>[^\n]+)", "Брать на тусу = {gang_party}", "gang_party")
                        ]
                        for sub_name, pattern, output_val, var_name in rules_data:
                            cursor_sub = await conn.execute(
                                "INSERT INTO recognition_subcommands (command_id, name) VALUES (?, ?)", (gang_cmd_id, sub_name)
                            )
                            sub_id = cursor_sub.lastrowid
                            await conn.execute("""
                                INSERT INTO recognition_rules (subcommand_id, pattern, output_value, variable_name)
                                VALUES (?, ?, ?, ?)
                            """, (sub_id, pattern, output_val, var_name))
                        logger.info("Миграция: Обновлены правила распознавания для 'Моя банда'.")
            except Exception as e:
                logger.error(f"Ошибка миграции правил распознавания для 'Моя банда': {e}")

            # --- ЧИСТКА ИМЕН В ACCOUNTS ---
            try:
                await conn.execute("UPDATE accounts SET name = TRIM(SUBSTR(name, 11)) WHERE name LIKE 'Имя жабы:%'")
                logger.info("Проведена очистка префиксов 'Имя жабы:' в таблице accounts.")
            except Exception as e:
                logger.error(f"Ошибка при очистке имен в accounts: {e}")

            await conn.commit()

        # Инициализация новой БД распознавания
        rec_path = self.db_path.parent / "recognition.db"
        logger.info(f"Инициализация базы данных распознавания: {rec_path}")
        async with self._connect_rec() as r_conn:
            await r_conn.execute("""
                CREATE TABLE IF NOT EXISTS toad_states (
                    vk_id INTEGER PRIMARY KEY,
                    last_updated TEXT,
                    work_info TEXT,
                    work_cooldown INTEGER,
                    feed_info TEXT,
                    feed_cooldown INTEGER,
                    fattening TEXT,
                    fattening_cooldown INTEGER,
                    dungeon_info TEXT,
                    dungeon_cooldown INTEGER,
                    arena_info TEXT,
                    arena_cooldown INTEGER,
                    party_info TEXT,
                    marriage_info TEXT,
                    spouse_1 TEXT,
                    spouse_2 TEXT,
                    robbery_info TEXT,
                    map_info TEXT,
                    location_name TEXT,
                    daily_status TEXT,
                    reserve_days INTEGER,
                    daily_completed INTEGER,
                    daily_tasks TEXT,
                    daily_reward TEXT,
                    daily_bonus_tasks TEXT,
                    daily_bonus_reward TEXT,
                    name TEXT,
                    level INTEGER,
                    satiety_cur INTEGER,
                    satiety_max INTEGER,
                    status TEXT,
                    state TEXT,
                    bugs INTEGER,
                    class TEXT,
                    mood TEXT,
                    wins INTEGER,
                    losses INTEGER,
                    arenas INTEGER,
                    inv_lollipop TEXT,
                    inv_bandages TEXT,
                    inv_beer TEXT,
                    inv_dragonfly TEXT,
                    inv_map TEXT,
                    inv_tape TEXT,
                    inv_gang_frogs TEXT,
                    inv_exp_capsule TEXT,
                    eq_pass TEXT,
                    eq_lockpick TEXT,
                    eq_battery TEXT,
                    cr_puzzle TEXT,
                    cr_link TEXT,
                    cr_stone TEXT,
                    cr_mask TEXT,
                    cr_paper TEXT,
                    cr_lightning TEXT,
                    eq_melee TEXT,
                    eq_ranged TEXT,
                    eq_helmet TEXT,
                    eq_helmet_mod TEXT,
                    eq_chest TEXT,
                    eq_chest_mod TEXT,
                    eq_paws TEXT,
                    eq_paws_mod TEXT,
                    eq_buffs TEXT,
                    eq_gang TEXT,
                    eq_booster TEXT,
                    eq_parts_weapon TEXT,
                    eq_parts_algae TEXT,
                    eq_parts_lily TEXT,
                    eq_parts_beak TEXT,
                    eq_gems TEXT,
                    eq_health TEXT,
                    eq_attack TEXT,
                    eq_defense TEXT,
                    has_gang INTEGER,
                    gang_type TEXT,
                    gang_name TEXT,
                    gang_loyalty_cur INTEGER,
                    gang_loyalty_max INTEGER,
                    gang_damage INTEGER,
                    gang_chance INTEGER,
                    gang_pendant TEXT,
                    gang_pendant_duration TEXT,
                    gang_party TEXT,
                    feed_loot TEXT
                );
            """)
            # Таблица аудита дельт — логирование инкрементов/декрементов (additive-парсеры)
            # и предупреждений о пропущенных обязательных полях (control/additive-парсеры).
            # Позволяет визуально контролировать корректность прибавления лута/боя.
            await r_conn.execute("""
                CREATE TABLE IF NOT EXISTS delta_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vk_id INTEGER NOT NULL,
                    command TEXT,
                    event_type TEXT NOT NULL,
                    field_name TEXT NOT NULL,
                    delta_value TEXT,
                    old_value TEXT,
                    new_value TEXT,
                    raw_text TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            await r_conn.commit()

            # Добавляем новые колонки, если таблица уже существовала без них
            columns_to_add = [
                ("name", "TEXT"),
                ("level", "INTEGER"),
                ("satiety_cur", "INTEGER"),
                ("satiety_max", "INTEGER"),
                ("status", "TEXT"),
                ("state", "TEXT"),
                ("bugs", "INTEGER"),
                ("class", "TEXT"),
                ("mood", "TEXT"),
                ("wins", "INTEGER"),
                ("losses", "INTEGER"),
                ("arenas", "INTEGER"),
                ("inv_lollipop", "TEXT"),
                ("inv_bandages", "TEXT"),
                ("inv_beer", "TEXT"),
                ("inv_dragonfly", "TEXT"),
                ("inv_map", "TEXT"),
                ("inv_tape", "TEXT"),
                ("inv_gang_frogs", "TEXT"),
                ("inv_exp_capsule", "TEXT"),
                ("eq_pass", "TEXT"),
                ("eq_lockpick", "TEXT"),
                ("eq_battery", "TEXT"),
                ("cr_puzzle", "TEXT"),
                ("cr_link", "TEXT"),
                ("cr_stone", "TEXT"),
                ("cr_mask", "TEXT"),
                ("cr_paper", "TEXT"),
                ("cr_lightning", "TEXT"),
                ("eq_melee", "TEXT"),
                ("eq_ranged", "TEXT"),
                ("eq_helmet", "TEXT"),
                ("eq_helmet_mod", "TEXT"),
                ("eq_chest", "TEXT"),
                ("eq_chest_mod", "TEXT"),
                ("eq_paws", "TEXT"),
                ("eq_paws_mod", "TEXT"),
                ("eq_buffs", "TEXT"),
                ("eq_gang", "TEXT"),
                ("eq_booster", "TEXT"),
                ("eq_parts_weapon", "TEXT"),
                ("eq_parts_algae", "TEXT"),
                ("eq_parts_lily", "TEXT"),
                ("eq_parts_beak", "TEXT"),
                ("eq_gems", "TEXT"),
                ("eq_health", "TEXT"),
                ("eq_attack", "TEXT"),
                ("eq_defense", "TEXT"),
                ("has_gang", "INTEGER"),
                ("gang_type", "TEXT"),
                ("gang_name", "TEXT"),
                ("gang_loyalty_cur", "INTEGER"),
                ("gang_loyalty_max", "INTEGER"),
                ("gang_damage", "INTEGER"),
                ("gang_chance", "INTEGER"),
                ("gang_pendant", "TEXT"),
                ("gang_pendant_duration", "TEXT"),
                ("gang_party", "TEXT"),
                ("daily_status", "TEXT"),
                ("reserve_days", "INTEGER"),
                ("daily_completed", "INTEGER"),
                ("daily_tasks", "TEXT"),
                ("daily_reward", "TEXT"),
                ("daily_bonus_tasks", "TEXT"),
                ("daily_bonus_reward", "TEXT"),
                ("feed_loot", "TEXT")
            ]
            async with r_conn.execute("PRAGMA table_info(toad_states)") as cursor:
                existing_cols = {r["name"] for r in await cursor.fetchall()}
            for col_name, col_type in columns_to_add:
                if col_name not in existing_cols:
                    try:
                        await r_conn.execute(f"ALTER TABLE toad_states ADD COLUMN {col_name} {col_type}")
                    except Exception as e:
                        logger.error(f"Ошибка при добавлении колонки {col_name} в toad_states: {e}")
            
            # --- ЧИСТКА ИМЕН В TOAD_STATES ---
            try:
                await r_conn.execute("UPDATE toad_states SET name = TRIM(SUBSTR(name, 11)) WHERE name LIKE 'Имя жабы:%'")
                logger.info("Проведена очистка префиксов 'Имя жабы:' в таблице toad_states.")
            except Exception as e:
                logger.error(f"Ошибка при очистке имен в toad_states: {e}")

            # --- МИГРАЦИЯ: кулдауны минут -> секунд ---
            # Раньше work_cooldown/feed_cooldown/... хранились в МИНУТАХ (INTEGER).
            # Теперь храним в СЕКУНДАХ, чтобы таймеры тикали до секунды в UI.
            # Старые минутные значения сбрасываем в NULL: они устарели быстро,
            # а новый парс при первом распознавании команды запишет корректные секунды.
            # ПРИМЕЧАНИЕ: Закомментировано, так как при каждом перезапуске сбрасывало текущие активные таймеры в NULL.
            # try:
            #     await r_conn.execute("""
            #         UPDATE toad_states SET
            #             work_cooldown = NULL,
            #             feed_cooldown = NULL,
            #             fattening_cooldown = NULL,
            #             dungeon_cooldown = NULL,
            #             arena_cooldown = NULL
            #     """)
            #     logger.info("Миграция кулдаунов: старые минутные значения сброшены в NULL (теперь хранятся в секундах).")
            # except Exception as e:
            #     logger.error(f"Ошибка при миграции кулдаунов: {e}")

            await r_conn.commit()
            
            # Фоновый импорт истории для отображения дейликов/снаряжения на старте
            try:
                await self.backfill_states_from_history()
            except Exception as e:
                logger.error(f"Ошибка при импорте состояний из истории на старте: {e}", exc_info=True)
                    
        logger.info("Инициализация базы данных успешно завершена.")


    async def backfill_states_from_history(self) -> None:
        """
        Импортирует и парсит последние ответы команд «Дейлики» и «Мое снаряжение»
        из unrecognized_responses и active_monitored_messages для всех активных аккаунтов.
        Помогает сразу заполнить статистику в панели без ожидания новых команд.
        """
        logger.info("Запуск фонового восстановления состояний жаб из логов истории...")
        
        # Получаем всех активных пользователей
        async with self._connect() as conn:
            async with conn.execute("SELECT vk_id FROM accounts WHERE vk_id > 0") as cursor:
                rows = await cursor.fetchall()
                vk_ids = [row["vk_id"] for row in rows]

        from src.utils.toad_info_parser import parse_dailies, parse_equipment
        import json

        for vk_id in vk_ids:
            # --- 1. Восстановление ДЕЙЛИКОВ ---
            daily_text = None
            async with self._connect() as conn:
                async with conn.execute("""
                    SELECT response FROM unrecognized_responses
                    WHERE vk_id = ? AND (command LIKE '%дейлики%' OR response LIKE '%Ежедневные задания:%')
                    ORDER BY created_at DESC LIMIT 1
                """, (vk_id,)) as cursor:
                    row = await cursor.fetchone()
                    if row:
                        daily_text = row["response"]
                        
            if daily_text:
                parsed = parse_dailies(daily_text)
                if parsed:
                    logger.info(f"[{vk_id}] Восстановлено состояние дейликов из unrecognized_responses")
                    await self.save_toad_state(vk_id, parsed)
                    # Также обновляем account fields в bot.db
                    allowed_columns = {
                        "daily_status", "reserve_days", "daily_completed", 
                        "daily_tasks", "daily_reward", "daily_bonus_tasks", "daily_bonus_reward"
                    }
                    filtered_parsed = {k: v for k, v in parsed.items() if k in allowed_columns}
                    await self.update_account_fields(vk_id, filtered_parsed)

            # --- 2. Восстановление СНАРЯЖЕНИЯ ---
            eq_text = None
            async with self._connect() as conn:
                async with conn.execute("""
                    SELECT r.response_text 
                    FROM active_monitored_messages m
                    JOIN monitored_responses r ON m.current_response_id = r.id
                    JOIN monitored_commands c ON m.command_id = c.id
                    WHERE m.player_vk_id = ? AND c.command = 'Мое снаряжение'
                    ORDER BY m.updated_at DESC LIMIT 1
                """, (vk_id,)) as cursor:
                    row = await cursor.fetchone()
                    if row:
                        try:
                            data = json.loads(row["response_text"])
                            eq_text = data[0] if isinstance(data, list) and len(data) > 0 else row["response_text"]
                        except Exception:
                            eq_text = row["response_text"]

            # Если не нашли в active_monitored_messages, ищем в unrecognized_responses
            if not eq_text:
                async with self._connect() as conn:
                    async with conn.execute("""
                        SELECT response FROM unrecognized_responses
                        WHERE vk_id = ? AND (command = 'Мое снаряжение' OR response LIKE '%Ближний бой:%')
                        ORDER BY created_at DESC LIMIT 1
                    """, (vk_id,)) as cursor:
                        row = await cursor.fetchone()
                        if row:
                            eq_text = row["response"]

            if eq_text:
                parsed = parse_equipment(eq_text)
                if parsed:
                    logger.info(f"[{vk_id}] Восстановлено состояние снаряжения из истории")
                    await self.save_toad_state(vk_id, parsed)



    async def seed_default_knowledge_base(self) -> None:
        """Сброс и наполнение базы знаний дефолтными правилами и регулярными выражениями"""
        import json
        import openpyxl
        import re
        
        async with self._connect() as conn:
            # Очищаем старые данные
            await conn.execute("DELETE FROM modular_line_templates;")
            await conn.execute("DELETE FROM response_templates;")
            await conn.execute("DELETE FROM commands_registry;")
            
            # 1. Заполняем реестр команд базовыми (системными) командами
            default_commands = [
                ("work", "Работа", r"^(поход в столовую|работа крупье|работа грабитель|отправиться в кафетерий|отправиться в казино|отправиться в банк|начать работу|завершить работу)$", 0),
                ("info", "Жаба инфо", r"^жаба\s+инфо$", 0),
                ("stats", "Анкета", r"^моя\s+жаба$", 0),
                ("feed", "Обычное кормление", r"^покормить\s+жабу$", 43200),
                ("fattening", "Принудительный откорм", r"^откормить\s+жабу$", 14400),
                ("inventory", "Мой инвентарь", r"^мой\s+инвентарь$", 0),
                ("equipment", "Мое снаряжение", r"^мое\s+снаряжение$", 0),
                ("dailies", "Дейлики", r"^(дейлики|ежедневные\s+задания)$", 0),
            ]
            
            
            # Статический список импортированных команд из Excel (разовый импорт)
            excel_commands = [
                ('excel_мой_инвентарь', 'Мой инвентарь', '', 0),
                ('excel_моя_семья', 'Моя семья', r'^моя\s+семья$', 0),
                ('excel_дейлики', 'Дейлики', '', 0),
                ('excel_взять_жабу', 'Взять жабу', '', 0),
                ('excel_жаба_дня', 'Жаба дня', '', 0),
                ('excel_использовать_леденцы_n', 'Использовать леденцы N', '', 0),
                ('excel_реанимировать_жабу', 'Реанимировать жабу', '', 0),
                ('excel_отправить_аптечки_n', 'Отправить аптечки N', '', 0),
                ('excel_отправить_леденцы_n', 'Отправить леденцы N', '', 0),
                ('excel_отправить_букашки_n', 'Отправить букашки N', '', 0),
                ('excel_отправить_карту', 'Отправить карту', '', 0),
                ('excel_продать_аптечки_n', 'Продать аптечки N', '', 0),
                ('excel_продать_леденцы_n', 'Продать леденцы N', '', 0),
                ('excel_продать_букашки_n', 'Продать букашки N', '', 0),
                ('excel_на_арену', 'На Арену', '', 0),
                ('excel_арена_сезон', 'Арена сезон', '', 0),
                ('excel_моя_банда', 'Моя банда', '', 0),
                ('excel_собрать_банду', 'Собрать банду', '', 0),
                ('excel_брать_на_тусу', 'Брать на тусу', '', 0),
                ('excel_скрафтить_наголовник_из_грязи', 'Скрафтить наголовник из грязи', '', 0),
                ('excel_скрафтить_нагрудник_из_грязи', 'Скрафтить нагрудник из грязи', '', 0),
                ('excel_скрафтить_налапники_из_грязи', 'Скрафтить налапники из грязи', '', 0),
                ('excel_скрафтить_камыша', 'Скрафтить камыша', '', 0),
                ('excel_скрафтить_комок_грязи', 'Скрафтить комок грязи', '', 0),
                ('excel_скрафтить_наголовник_из_водорослей', 'Скрафтить наголовник из водорослей', '', 0),
                ('excel_скрафтить_нагрудник_из_водорослей', 'Скрафтить нагрудник из водорослей', '', 0),
                ('excel_скрафтить_налапники_из_водорослей', 'Скрафтить налапники из водорослей', '', 0),
                ('excel_скрафтить_корягу', 'Скрафтить корягу', '', 0),
                ('excel_скрафтить_наголовник_из_кувшинок', 'Скрафтить наголовник из кувшинок', '', 0),
                ('excel_скрафтить_нагрудник_из_кувшинок', 'Скрафтить нагрудник из кувшинок', '', 0),
                ('excel_скрафтить_налапники_из_кувшинок', 'Скрафтить налапники из кувшинок', '', 0),
                ('excel_скрафтить_наголовник_из_клюва_цапли', 'Скрафтить наголовник из клюва цапли', '', 0),
                ('excel_скрафтить_нагрудник_из_клюва_цапли', 'Скрафтить нагрудник из клюва цапли', '', 0),
                ('excel_скрафтить_налапники_из_клюва_цапли', 'Скрафтить налапники из клюва цапли', '', 0),
                ('excel_скрафтить_клюв_цапли', 'Скрафтить клюв цапли', '', 0),
                ('excel_скрафтить_букашкомет', 'Скрафтить букашкомет', '', 0),
                ('excel_починить_наголовник', 'Починить наголовник', '', 0),
                ('excel_починить_нагрудник', 'Починить нагрудник', '', 0),
                ('excel_починить_налапники', 'Починить налапники', '', 0),
                ('excel_починить_ближний_бой', 'Починить ближний бой', '', 0),
                ('excel_починить_дальний_бой', 'Починить дальний бой', '', 0),
                ('excel_мое_снаряжение', 'Мое снаряжение', '', 0),
                ('excel_брак_вознаграждение', 'Брак вознаграждение', '', 0),
                ('excel_покормить_жабенка', 'Покормить жабенка', '', 0),
                ('excel_отправить_жабенка_в_детсад', 'Отправить жабенка в детсад', '', 0),
                ('excel_забрать_жабенка', 'Забрать жабенка', '', 0),
                ('excel_отправить_жабенка_на_махач', 'Отправить жабенка на махач', '', 0),
                ('excel_сделать_подарок', 'Сделать подарок', '', 0),
                ('excel_мой_клан', 'Мой клан', r'^мой\s+клан$', 0),
                ('excel_клан_сезон', 'Клан сезон', '', 0),
                ('excel_начать_клановую_войну', 'Начать клановую войну', '', 0),
                ('excel_напасть_на_клан', 'Напасть на клан', '', 0),
                ('excel_выйти_из_клановой_войны', 'Выйти из клановой войны', '', 0),
                ('excel_клан_вознаграждение', 'Клан вознаграждение', '', 0),
                ('excel_отправиться_за_картой', 'Отправиться за картой', '', 0),
                ('excel_отправиться_в_бронзовое_подземелье', 'Отправиться в бронзовое подземелье', '', 0),
                ('excel_отправиться_в_серебряное_подземелье', 'Отправиться в серебряное подземелье', '', 0),
                ('excel_отправиться_в_золотое_подземелье', 'Отправиться в золотое подземелье', '', 0),
                ('excel_рейд_инфо', 'Рейд инфо', '', 0),
                ('excel_рейд_старт', 'Рейд старт', '', 0),
                ('excel_выйти_из_подземелья', 'Выйти из подземелья', '', 0),
                ('excel_кмн_сумма', 'Кмн СУММА', '', 0),
                ('excel_рулетка_100_черный', 'Рулетка 100 черный', '', 0),
                ('excel_гонка_сумма', 'Гонка СУММА', '', 0),
                ('excel_начать_гонку', 'Начать гонку', '', 0),
                ('excel_забег_инфо', 'Забег инфо', '', 0),
                ('excel_выйти_из_гонки', 'Выйти из гонки', '', 0),
                ('excel_жабу_на_тусу', 'Жабу на тусу', '', 0),
                ('excel_туса_инфо', 'Туса инфо', '', 0),
                ('excel_начать_тусу', 'Начать тусу', '', 0),
                ('excel_покинуть_тусу', 'Покинуть тусу', '', 0)
            ]
                
            # Записываем все команды в БД
            all_commands = default_commands + excel_commands
            for action, name, trigger, cd in all_commands:
                await conn.execute("""
                    INSERT OR REPLACE INTO commands_registry (action_type, name, trigger_regex, default_cooldown)
                    VALUES (?, ?, ?, ?)
                """, (action, name, trigger, cd))
                
            default_responses = [
                ("work", "Успешная отправка на работу", "success", r"(?:жаба|она)\s+(?:отправилась|пошла)\s+на\s+работу\s+в\s+(?P<work_place>[а-яА-Я]+)[\s\S]+через\s+(?P<hours>\d+)\s+(?:часа|часов|час|ч)", json.dumps({"status": "working", "work_info": "💼 На работе в {work_place}"})),
                ("work", "Жаба уже работает", "duplicate", r"жаба\s+уже\s+работает\s+в\s+(?P<work_place>[а-яА-Я]+)", json.dumps({"status": "working", "work_info": "💼 На работе в {work_place}"})),
                ("work", "Кулдаун работы (устала)", "cooldown", r"жаба\s+(?:устала|отдыхает)[\s\S]+осталось\s+(?P<hours>\d+)\s*ч.*?(\s+(?P<minutes>\d+)\s*мин)?", json.dumps({"status": "idle", "work_info": "💤 Кулдаун {hours} ч. {minutes} мин."})),
                ("work", "Альтернативный кулдаун работы", "cooldown", r"твоя\s+жабуля\s+устала\s+после\s+трудового\s+дня[\s\S]+через\s+(?P<hours>\d+)\s*ч:(?P<minutes>\d+)\s*мин", json.dumps({"status": "idle", "work_info": "💤 Кулдаун {hours} ч. {minutes} мин."})),
                ("work", "Жаба в подземелье", "success", r"ваша\s+жабка\s+находится\s+в\s+подземелье", json.dumps({"status": "dungeon", "work_info": "👹 В подземелье!"})),
                ("work", "Жаба на тусе", "success", r"ваша\s+жаба\s+на\s+тусе", json.dumps({"status": "party", "work_info": "🎉 На тусовке!"})),
                ("fattening", "Кулдаун откорма", "cooldown", r"откормить\s+жабу\s+можно\s+через\s+(?P<hours>\d+)\s*ч:(?P<minutes>\d+)\s*мин", json.dumps({"fattening": "Кулдаун {hours} ч. {minutes} мин."})),
                ("feed", "Кулдаун кормления", "cooldown", r"покормить\s+жабу\s+можно\s+через\s+(?P<hours>\d+)\s*ч:(?P<minutes>\d+)\s*мин", json.dumps({"feed_info": "well-fed"})),
                ("stats", "Разбор анкеты", "success", r"(?:🐸|Имя жабы)[\s\S]*?(?:Уровень|Сытость|Атака|Здоровье|Букашек|Опыт)", json.dumps({}))
            ]
            
            # Добавим инвентарь принудительно, если не пересоздаются
            default_responses.append(
                ("inventory", "Разбор инвентаря", "success", r"Твой инвентарь:", json.dumps({}))
            )
            # Добавим снаряжение принудительно, если не пересоздаются
            default_responses.append(
                ("equipment", "Разбор снаряжения", "success", r"Ближний бой:[\s\S]*?(?:Дальний бой|Наголовник|Нагрудник|Налапники)", json.dumps({}))
            )
            for action, name, rtype, regex, updates in default_responses:
                await conn.execute("""
                    INSERT INTO response_templates (action_type, pattern_name, response_type, regex, db_updates)
                    VALUES (?, ?, ?, ?, ?)
                """, (action, name, rtype, regex, updates))
                
            # 3. Заполняем построчные шаблоны для сложных ответов
            default_modular_lines = [
                ("info", "dungeon_info", "Подземелье", json.dumps(["👹"]), json.dumps(["подземелье", "подземель"]), json.dumps([]), r'Подземелье: доступно|Подземелье: недоступно', "dungeon_info"),
                ("info", "arena_info", "Арена", json.dumps(["⚔️"]), json.dumps(["арена"]), json.dumps([]), r'Арена: доступна|Арена: доступна через \d+ мин', "arena_info"),
                ("info", "party_info", "Тусовка", json.dumps(["💃", "💃🏻", "💃🏼", "💃🏽", "💃🏾", "💃🏿"]), json.dumps(["потусить", "туса", "тусовк"]), json.dumps([]), r'Потусить: можно|Потусить: через \d+ ч', "party_info"),
                ("info", "marriage_info", "Брак", json.dumps(["💘", "💍"]), json.dumps(["союз", "брак", "муж", "жена", "не петя", "именно петя"]), json.dumps([]), r'Брак:|Партнер:', "marriage_info"),
                ("info", "robbery_info", "Ограбление", json.dumps(["🥷"]), json.dumps(["ограблен"]), json.dumps([]), r'Ограбление: доступна подготовка|Ограбление: недоступно', "robbery_info"),
                ("info", "map_info", "Карта/Поход", json.dumps(["🗺"]), json.dumps(["батрачит", "карт", "поход", "кафетери"]), json.dumps(["💼", "на работе"]), r'Карта: поход доступен|Жаба батрачит в', "map_info"),
                ("info", "feed_info", "Кормление", json.dumps(["🍰"]), json.dumps(["покормить"]), json.dumps([]), r'Покормить: можно через|Покормить: можно', "feed_info"),
                ("info", "fattening", "Откорм", json.dumps(["🍬", "🍭"]), json.dumps(["откормить"]), json.dumps([]), r'Откорм: можно откормить|Откорм: можно через', "fattening"),
                ("info", "work_info", "Работа", json.dumps(["💼"]), json.dumps(["работ"]), json.dumps([]), r'Работа: доступна|Работа: жаба батрачит в', "work_info"),
            ]
            for action, category, name, emojis, keywords, exclude, regex, col in default_modular_lines:
                await conn.execute("""
                    INSERT INTO modular_line_templates (action_type, category, category_name, emojis, keywords, exclude_keywords, regex, db_column)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (action, category, name, emojis, keywords, exclude, regex, col))
                
            await conn.commit()

    async def add_account(
        self, 
        vk_id: int, 
        name: str, 
        token: str, 
        chat_id: Optional[int] = None,
        is_prime: int = 0,
        proxy_host: Optional[str] = None,
        proxy_port: Optional[int] = None,
        proxy_user: Optional[str] = None,
        proxy_pass: Optional[str] = None,
        proxy_type: Optional[str] = None,
        screen_name: Optional[str] = None
    ) -> None:
        """Добавление нового аккаунта или обновление токена и прокси существующего"""
        async with self._connect() as conn:
            await conn.execute("""
                INSERT INTO accounts (
                    vk_id, name, token, chat_id, is_prime, 
                    proxy_host, proxy_port, proxy_user, proxy_pass, proxy_type, screen_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(vk_id) DO UPDATE SET
                    name = excluded.name,
                    token = excluded.token,
                    chat_id = COALESCE(excluded.chat_id, accounts.chat_id),
                    is_prime = excluded.is_prime,
                    proxy_host = excluded.proxy_host,
                    proxy_port = excluded.proxy_port,
                    proxy_user = excluded.proxy_user,
                    proxy_pass = excluded.proxy_pass,
                    proxy_type = excluded.proxy_type,
                    screen_name = COALESCE(excluded.screen_name, accounts.screen_name);
            """, (
                vk_id, name, token, chat_id, is_prime,
                proxy_host, proxy_port, proxy_user, proxy_pass, proxy_type, screen_name
            ))
            
            # Автоматически создаем пустые настройки автоматизации для нового аккаунта
            await conn.execute("""
                INSERT OR IGNORE INTO settings (vk_id) VALUES (?);
            """, (vk_id,))
            
            await conn.commit()
        logger.info(f"Аккаунт {name} (ID: {vk_id}) добавлен/обновлен.")

    async def update_account_status(
        self, 
        vk_id: int, 
        status: str, 
        mood: Optional[int] = None, 
        bugs: Optional[int] = None
    ) -> None:
        """Обновление текущего статуса, настроения и баланса букашек жабы"""
        async with self._connect() as conn:
            query = "UPDATE accounts SET status = ?"
            params = [status]
            
            if mood is not None:
                query += ", mood = ?"
                params.append(mood)
            if bugs is not None:
                query += ", bugs = ?"
                params.append(bugs)
                
            query += " WHERE vk_id = ?"
            params.append(vk_id)
            
            await conn.execute(query, tuple(params))
            await conn.commit()


    async def update_last_checked(self, vk_id: int, timestamp: datetime) -> None:
        """Обновление времени последней проверки/активности данных через бота"""
        ts_str = timestamp.isoformat()
        async with self._connect() as conn:
            await conn.execute("""
                UPDATE accounts SET last_checked = ? WHERE vk_id = ?
            """, (ts_str, vk_id))
            await conn.commit()

    async def get_account(self, vk_id: int) -> Optional[Dict[str, Any]]:
        """Получение данных аккаунта по vk_id"""
        async with self._connect() as conn:
            async with conn.execute("""
                SELECT a.*, s.auto_feed, s.auto_work, s.auto_arena, s.auto_dungeon, 
                       s.work_type, s.dungeon_type, s.arena_league
                FROM accounts a
                LEFT JOIN settings s ON a.vk_id = s.vk_id
                WHERE a.vk_id = ?
            """, (vk_id,)) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def get_active_accounts(self) -> List[Dict[str, Any]]:
        """Получение всех активных аккаунтов"""
        async with self._connect() as conn:
            async with conn.execute("""
                SELECT a.*, s.auto_feed, s.auto_work, s.auto_arena, s.auto_dungeon, 
                       s.work_type, s.dungeon_type, s.arena_league
                FROM accounts a
                LEFT JOIN settings s ON a.vk_id = s.vk_id
                WHERE a.is_active = 1 AND a.vk_id > 0
            """) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_all_accounts(self) -> List[Dict[str, Any]]:
        """Получение абсолютно всех аккаунтов (активных и неактивных) с присоединенными данными распознавания"""
        # 1. Получаем аккаунты из bot.db
        async with self._connect() as conn:
            async with conn.execute("""
                SELECT a.*, s.auto_feed, s.auto_work, s.auto_arena, s.auto_dungeon, 
                       s.work_type, s.dungeon_type, s.arena_league
                FROM accounts a
                LEFT JOIN settings s ON a.vk_id = s.vk_id
                WHERE a.vk_id > 0
            """) as cursor:
                rows = await cursor.fetchall()
                accounts = [dict(row) for row in rows]

        # 2. Получаем состояния из recognition.db
        toad_states = {}
        try:
            async with self._connect_rec() as r_conn:
                async with r_conn.execute("SELECT * FROM toad_states") as cursor:
                    r_rows = await cursor.fetchall()
                    for r_row in r_rows:
                        toad_states[r_row["vk_id"]] = dict(r_row)
        except Exception as e:
            logger.error(f"Ошибка при загрузке состояний жаб из recognition.db: {e}")

        # 3. Объединяем данные + обнуление просроченных кулдаунов в памяти
        now_dt = datetime.now(timezone(timedelta(hours=3)))
        cooldown_fields = [
            ("work_info", "work_cooldown"),
            ("feed_info", "feed_cooldown"),
            ("fattening", "fattening_cooldown"),
            ("dungeon_info", "dungeon_cooldown"),
            ("arena_info", "arena_cooldown"),
        ]
        for acc in accounts:
            vk_id = acc["vk_id"]
            state_data = toad_states.get(vk_id)
            if state_data:
                lu = state_data.get("last_updated")
                last_updated_dt = None
                if lu:
                    try:
                        last_updated_dt = datetime.strptime(lu, "%d.%m.%Y %H:%M:%S").replace(
                            tzinfo=timezone(timedelta(hours=3))
                        )
                        state_data["last_updated_iso"] = last_updated_dt.strftime("%Y-%m-%dT%H:%M:%S")
                    except Exception:
                        state_data["last_updated_iso"] = None
                else:
                    state_data["last_updated_iso"] = None

                # Если кулдаун истёк по времени — зануляем в памяти (БД не трогаем).
                # При следующем парсе реальные данные перезапишут (парс приоритетнее).
                if last_updated_dt:
                    elapsed_sec = int((now_dt - last_updated_dt).total_seconds())
                    for info_key, cd_key in cooldown_fields:
                        cd = state_data.get(cd_key)
                        if cd is not None and isinstance(cd, (int, float)) and cd > 0 and elapsed_sec >= cd:
                            state_data[cd_key] = 0
                            if info_key == "work_info" and state_data.get(info_key) == "working":
                                state_data[info_key] = "claim_pending"
                            else:
                                state_data[info_key] = "ready"
                acc["toad_state"] = state_data
            else:
                acc["toad_state"] = None

        return accounts

    async def update_settings(self, vk_id: int, updates: Dict[str, Any]) -> None:
        """Обновление автоматизационных настроек аккаунта"""
        if not updates:
            return
            
        allowed_keys = {
            "auto_feed", "auto_work", "auto_arena", "auto_dungeon",
            "work_type", "dungeon_type", "arena_league"
        }
        
        # Фильтруем присланные ключи
        filtered_updates = {k: v for k, v in updates.items() if k in allowed_keys}
        if not filtered_updates:
            return
            
        fields = ", ".join(f"{k} = ?" for k in filtered_updates.keys())
        params = list(filtered_updates.values())
        params.append(vk_id)
        
        async with self._connect() as conn:
            await conn.execute(f"""
                UPDATE settings SET {fields} WHERE vk_id = ?
            """, tuple(params))
            await conn.commit()
        logger.info(f"Настройки автоматизации для аккаунта ID: {vk_id} обновлены.")

    async def toggle_account_active(self, vk_id: int, is_active: int) -> None:
        """Включение или выключение активности аккаунта"""
        async with self._connect() as conn:
            await conn.execute("""
                UPDATE accounts SET is_active = ? WHERE vk_id = ?
            """, (is_active, vk_id))
            await conn.commit()
        logger.info(f"Аккаунт ID: {vk_id} активный статус изменен на {is_active}.")

    async def update_account_fields(self, vk_id: int, fields: Dict[str, Any]) -> None:
        """Универсальное обновление любых полей аккаунта по vk_id"""
        if not fields:
            return
        
        # Получаем реальные колонки таблицы accounts из PRAGMA
        async with self._connect() as conn:
            async with conn.execute("PRAGMA table_info(accounts)") as cursor:
                rows = await cursor.fetchall()
                allowed_cols = {row["name"] for row in rows}
                
        # Оставляем только существующие колонки
        filtered_fields = {k: v for k, v in fields.items() if k in allowed_cols}
        if not filtered_fields:
            return
            
        set_clause = ", ".join(f"{k} = ?" for k in filtered_fields.keys())
        params = list(filtered_fields.values())
        params.append(vk_id)
        async with self._connect() as conn:
            await conn.execute(f"UPDATE accounts SET {set_clause} WHERE vk_id = ?", tuple(params))
            await conn.commit()

    async def save_clan_info(self, vk_id: int, parsed_data: Dict[str, Any]) -> None:
        """
        Сохраняет данные о клане для текущего аккаунта и распространяет
        актуальную информацию другим аккаунтам в боте, которые состоят в этом же клане.
        """
        # Сначала обновляем поля для текущего аккаунта
        await self.update_account_fields(vk_id, parsed_data)

        # Если в составе есть участники, пробуем распространить информацию
        members_str = parsed_data.get("clan_members", "")
        if not members_str or members_str in ("-", "0"):
            return

        from src.utils.toad_info_parser import clean_member_name
        
        # Получаем очищенные имена всех участников из состава клана
        member_lines = [line.strip() for line in members_str.split("\n") if line.strip()]
        cleaned_members = {clean_member_name(m).lower() for m in member_lines if clean_member_name(m)}
        
        if not cleaned_members:
            return

        # Нам нужны только общие поля клана для распространения (ко всем игрокам клана)
        propagate_fields = {
            "clan_name": parsed_data.get("clan_name", "Нет"),
            "clan_members": members_str,
            "clan_level": parsed_data.get("clan_level", 1),
            "clan_exp": parsed_data.get("clan_exp", "0"),
            "clan_cards": parsed_data.get("clan_cards", "0"),
            "clan_bonus": parsed_data.get("clan_bonus", "-"),
            "clan_offmap": parsed_data.get("clan_offmap", "Можно"),
            "clan_war": parsed_data.get("clan_war", "-"),
            "clan_league": parsed_data.get("clan_league", "Нет"),
            "clan_battles": parsed_data.get("clan_battles", 0),
            "clan_points": parsed_data.get("clan_points", 0),
            "clan_booster": parsed_data.get("clan_booster", "-"),
            "clan_achievements": parsed_data.get("clan_achievements", "-")
        }

        # Получаем все остальные аккаунты из базы
        async with self._connect() as conn:
            async with conn.execute("SELECT vk_id, name FROM accounts WHERE vk_id != ?", (vk_id,)) as cursor:
                other_accounts = await cursor.fetchall()

        # Проверяем совпадение имен
        for acc in other_accounts:
            acc_vk_id = acc["vk_id"]
            acc_name = acc["name"]
            if not acc_name:
                continue
            
            # Очищаем имя аккаунта в БД так же, как и имя в составе
            cleaned_acc_name = clean_member_name(acc_name).lower()
            if cleaned_acc_name in cleaned_members:
                logger.info(f"Синхронизация клана: распространение данных клана '{propagate_fields['clan_name']}' на аккаунт {acc_name} (ID: {acc_vk_id})")
                await self.update_account_fields(acc_vk_id, propagate_fields)

    async def delete_account(self, vk_id: int) -> None:
        """Удаление аккаунта из базы данных"""
        async with self._connect() as conn:
            await conn.execute("DELETE FROM accounts WHERE vk_id = ?", (vk_id,))
            await conn.commit()
        logger.info(f"Аккаунт ID: {vk_id} удален из базы данных.")

    async def log_action(self, vk_id: int, action: str, message: str) -> None:
        """Запись лога игрового действия"""
        from datetime import datetime, timezone, timedelta
        msk_time = datetime.now(timezone(timedelta(hours=3)))
        ts_str = msk_time.strftime("%Y-%m-%d %H:%M:%S")
        async with self._connect() as conn:
            await conn.execute("""
                INSERT INTO actions_log (vk_id, action, message, timestamp) VALUES (?, ?, ?, ?)
            """, (vk_id, action, message, ts_str))
            await conn.commit()

    async def get_logs(self, vk_id: Optional[int] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """Получение последних логов действий"""
        async with self._connect() as conn:
            if vk_id is not None:
                query = """
                    SELECT * FROM actions_log 
                    WHERE vk_id = ? 
                    ORDER BY id DESC LIMIT ?
                """
                params = (vk_id, limit)
            else:
                query = """
                    SELECT * FROM actions_log 
                    ORDER BY id DESC LIMIT ?
                """
                params = (limit,)
                
            async with conn.execute(query, params) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
                
    async def clear_logs(self, vk_id: int) -> None:
        """Очистка логов для конкретного аккаунта"""
        async with self._connect() as conn:
            await conn.execute("DELETE FROM actions_log WHERE vk_id = ?", (vk_id,))
            await conn.commit()

    async def clear_all_logs(self) -> None:
        """Очистка вообще всех логов в системе"""
        async with self._connect() as conn:
            await conn.execute("DELETE FROM actions_log")
            await conn.commit()
            
    async def reset_account_stats(self, vk_id: int) -> None:
        """Сброс всей игровой статистики аккаунта до значений по умолчанию"""
        async with self._connect() as conn:
            await conn.execute("""
                UPDATE accounts SET
                    satiety = 'Не кормлена 🍏',
                    class_name = 'Не выбран',
                    class_level = 0,
                    mood = 250,
                    bugs = 0,
                    wins = 0,
                    losses = 0,
                    daily_status = 'Не активен',
                    reserve_days = 0,
                    daily_completed = 0,
                    work_info = 'Не на работе',
                    feed_info = 'Не кормлена',
                    next_feed_time = NULL,
                    fattening = 'Нет',
                    positions = 'Рядовой',
                    partner = 'Нет',
                    marriage_days = 0,
                    candies = 0,
                    froglet = 'Нет',
                    family_level = 1,
                    family_satiety = 'Сыт',
                    family_authority = 0,
                    family_mood = 'Спокойное',
                    kindergarten = 'Нет',
                    clash = 'Доступен',
                    feed_in = 'Готово',
                    arena_season = 'Загрузка...',
                    arena_wins = 0,
                    arena_losses = 0,
                    arena_place = 'Нет',
                    arena_points = 0,
                    clan_name = 'Нет',
                    clan_members = '0',
                    clan_offmap = 'Нет',
                    clan_cards = '0',
                    clan_exp = '0',
                    clan_level = 1,
                    clan_league = 'Нет',
                    clan_battles = 0,
                    clan_points = 0,
                    clan_booster = 'Нет',
                    clan_bonus = '-',
                    clan_war = '-',
                    clan_achievements = '-',
                    last_checked = NULL
                WHERE vk_id = ?
            """, (vk_id,))
            await conn.commit()

    async def get_global_settings(self) -> Dict[str, int]:
        """Получение всех глобальных настроек из таблицы global_settings"""
        async with self._connect() as conn:
            async with conn.execute("SELECT key, value FROM global_settings") as cursor:
                rows = await cursor.fetchall()
                # Превращаем строки в int, по умолчанию 60 если что-то пошло не так
                settings = {}
                for row in rows:
                    try:
                        settings[row["key"]] = int(row["value"])
                    except (ValueError, TypeError):
                        settings[row["key"]] = 60
                
                # На всякий случай гарантируем наличие всех ключей
                for key in ["work_start_grace", "work_travel_grace", "work_end_grace", "min_command_delay"]:
                    if key not in settings:
                        settings[key] = 3 if key == "min_command_delay" else 60
                return settings

    async def update_global_settings(self, settings: Dict[str, int]) -> None:
        """Обновление глобальных настроек"""
        async with self._connect() as conn:
            for key, val in settings.items():
                if key in ["work_start_grace", "work_travel_grace", "work_end_grace", "min_command_delay"]:
                    await conn.execute("""
                        INSERT INTO global_settings (key, value) VALUES (?, ?)
                        ON CONFLICT(key) DO UPDATE SET value = excluded.value
                    """, (key, str(val)))
            await conn.commit()
        logger.info(f"Глобальные настройки обновлены: {settings}")

    async def save_unrecognized_response(self, vk_id: int, command: str, response: str) -> None:
        """Сохранение неизвестного ответа от Жабабота"""
        async with self._connect() as conn:
            await conn.execute("""
                INSERT INTO unrecognized_responses (vk_id, command, response)
                VALUES (?, ?, ?)
            """, (vk_id, command, response))
            await conn.commit()
        logger.info(f"Сохранен нераспознанный ответ для VK ID {vk_id}: {command} -> {response[:30]}...")

    async def get_unrecognized_responses(self) -> List[Dict[str, Any]]:
        """Получение списка нераспознанных ответов с именами аккаунтов"""
        async with self._connect() as conn:
            async with conn.execute("""
                SELECT ur.id, ur.vk_id, a.name as account_name, ur.command, ur.response, ur.created_at
                FROM unrecognized_responses ur
                LEFT JOIN accounts a ON ur.vk_id = a.vk_id
                ORDER BY ur.id DESC
            """) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def clear_unrecognized_responses(self) -> None:
        """Очистка всех нераспознанных ответов"""
        async with self._connect() as conn:
            await conn.execute("DELETE FROM unrecognized_responses")
            await conn.commit()
        logger.info("Все нераспознанные ответы удалены.")

    async def delete_unrecognized_response(self, response_id: int) -> None:
        """Удаление одного нераспознанного ответа по ID"""
        async with self._connect() as conn:
            await conn.execute("DELETE FROM unrecognized_responses WHERE id = ?", (response_id,))
            await conn.commit()
        logger.info(f"Нераспознанный ответ ID {response_id} удален.")

    async def is_monitor_mode_enabled(self) -> bool:
        """Проверяет, включен ли режим мониторинга"""
        async with self._connect() as conn:
            async with conn.execute("SELECT value FROM global_settings WHERE key = 'monitor_mode_enabled'") as cursor:
                row = await cursor.fetchone()
                return row["value"] == "1" if row else True

    async def set_monitor_mode_enabled(self, enabled: bool) -> None:
        """Включает или выключает режим мониторинга"""
        val_str = "1" if enabled else "0"
        async with self._connect() as conn:
            await conn.execute("""
                INSERT INTO global_settings (key, value) VALUES ('monitor_mode_enabled', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """, (val_str,))
            await conn.commit()
        logger.info(f"Режим мониторинга установлен в: {enabled}")

    async def get_monitored_commands(self) -> List[Dict[str, Any]]:
        """Получает список отслеживаемых команд (сортировка по алфавиту) с их уникальными ответами"""
        async with self._connect() as conn:
            async with conn.execute("""
                SELECT c.id as command_id, c.command, c.in_recognition, c.parser_type, c.description,
                       r.id as response_id, r.response_text, r.match_count, r.last_mention_at,
                       r.recognition_status as response_recognition_status
                FROM monitored_commands c
                LEFT JOIN monitored_responses r ON c.id = r.command_id
                ORDER BY c.command COLLATE NOCASE ASC, r.match_count DESC
            """) as cursor:
                rows = await cursor.fetchall()
                
                commands_map = {}
                for row in rows:
                    cmd_id = row["command_id"]
                    cmd_text = row["command"]
                    
                    if cmd_id not in commands_map:
                        commands_map[cmd_id] = {
                            "id": cmd_id,
                            "command": cmd_text,
                            "recognition_status": None,
                            "in_recognition": row["in_recognition"],
                            "parser_type": row["parser_type"] or "control",
                            "description": row["description"] or "",
                            "variations": []
                        }
                        
                    if row["response_id"] is not None:
                        import json
                        resp_text_val = row["response_text"]
                        history_list = [resp_text_val]
                        try:
                            parsed_history = json.loads(resp_text_val)
                            if isinstance(parsed_history, list) and len(parsed_history) > 0:
                                resp_text_val = parsed_history[0]
                                history_list = parsed_history
                        except Exception:
                            pass
                            
                        commands_map[cmd_id]["variations"].append({
                            "id": row["response_id"],
                            "response_text": resp_text_val,
                            "response_history": history_list,
                            "match_count": row["match_count"],
                            "last_mention_at": row["last_mention_at"],
                            "recognition_status": row["response_recognition_status"] or "Не распознаем"
                        })
                        
                def sort_key(cmd):
                    name = cmd["command"]
                    if name == "Неопределенные жаба":
                        return (2, name)
                    elif name == "Неопределенные люди":
                        return (1, name)
                    else:
                        return (0, name.lower())
                return sorted(commands_map.values(), key=sort_key)

    async def get_monitored_commands_list(self) -> List[str]:
        """Возвращает плоский список строк-команд для быстрого сопоставления в хендлере"""
        async with self._connect() as conn:
            async with conn.execute("SELECT command FROM monitored_commands") as cursor:
                rows = await cursor.fetchall()
                return [row["command"] for row in rows]

    async def add_monitored_commands_batch(self, commands: List[str]) -> int:
        """Массовое добавление списка команд с игнорированием дубликатов"""
        added_count = 0
        async with self._connect() as conn:
            for cmd in commands:
                cmd_clean = cmd.strip()
                if not cmd_clean:
                    continue
                cursor = await conn.execute("""
                    INSERT OR IGNORE INTO monitored_commands (command) VALUES (?)
                """, (cmd_clean,))
                if cursor.rowcount > 0:
                    added_count += cursor.rowcount
            await conn.commit()
        logger.info(f"Массово добавлено команд: {added_count}")
        return added_count

    async def add_monitored_command(self, command: str) -> None:
        """Добавление новой отслеживаемой команды"""
        cmd_clean = command.strip()
        if not cmd_clean:
            return
        async with self._connect() as conn:
            await conn.execute("""
                INSERT OR IGNORE INTO monitored_commands (command) VALUES (?)
            """, (cmd_clean,))
            await conn.commit()
        logger.info(f"Добавлена отслеживаемая команда: {cmd_clean}")

    async def delete_monitored_command(self, command_id: int) -> None:
        """Очистка накопленных ответов для отслеживаемой команды по ID (убирает сигнал об ошибке из отладки)"""
        async with self._connect() as conn:
            await conn.execute("DELETE FROM monitored_responses WHERE command_id = ?", (command_id,))
            await conn.commit()
        logger.info(f"Очищены накопленные ответы для отслеживаемой команды ID: {command_id}")

    async def clear_monitored_responses(self) -> None:
        """Очищает все сохраненные ответы Жабабота (сброс отчета)"""
        async with self._connect() as conn:
            await conn.execute("DELETE FROM monitored_responses")
            await conn.commit()
        logger.info("Все ответы монитора успешно очищены.")

    async def save_toad_state(self, vk_id: int, data: dict) -> None:
        """Сохраняет распознанное состояние жабы в recognition.db.

        Поддерживает 4 категории полей, передаваемых парсером в `data`:

        1. **Значения** (ключи верхнего уровня) → **перезапись** актуального состояния.
           Используется control-парсерами (Жаба инфо, Моя жаба, инвентарь и т.д.).
           Пример: ``{"bugs": 21024}`` → в БД запишется 21024.

        2. **``_deltas``** (dict приращений) → **инкремент**: ``col = COALESCE(col, 0) + N``.
           Используется additive-парсерами (лут, результаты боя).
           Пример: ``{"_deltas": {"bugs": 150, "cr_puzzle": 2}}`` → к текущим значениям прибавятся.

        3. **``_missing_required``** (список обязательных полей, не найденных в ответе)
           → **старое значение не трогается**, но в аудит дельт пишется предупреждение.
           Защищает от незамеченной поломки шаблона ответа Жабабота.
           Пример: ``{"_missing_required": ["mood"]}`` → mood остаётся, алерт в аудит.

        4. **``_optional_nulls``** (список опциональных полей, сознательно отсутствующих)
           → **прочерк (NULL)**: поле обнуляется.
           Пример: ``{"_optional_nulls": ["gang_pendant"]}`` → pendant = NULL.

        Поля, которых нет ни в одной из 4 категорий (опциональные, парсер их не трогал),
        остаются без изменений (как прежний COALESCE с None).
        """
        # Проверяем, добавлен ли аккаунт
        async with self._connect() as conn:
            async with conn.execute("SELECT 1 FROM accounts WHERE vk_id = ?", (vk_id,)) as cursor:
                exists = await cursor.fetchone()
        if not exists:
            logger.debug(f"[Save Toad State] Пропущен vk_id {vk_id}, так как аккаунт не добавлен в систему")
            return

        from datetime import datetime, timezone, timedelta
        msk_now_str = datetime.now(timezone(timedelta(hours=3))).strftime("%d.%m.%Y %H:%M:%S")

        # Разбор 4 категорий данных от парсера
        deltas: dict = data.get("_deltas") or {}
        missing_required: list = data.get("_missing_required") or []
        optional_nulls: list = data.get("_optional_nulls") or []

        # Категория 1: обычные значения (всё, что не начинается с "_")
        plain_values = {
            k: v for k, v in data.items()
            if not k.startswith("_") and v is not None
        }

        # Белый список допустимых колонок toad_states (защита от SQL-инъекций через имена полей)
        ALLOWED_COLUMNS = {
            "work_info", "work_cooldown", "feed_info", "feed_cooldown",
            "fattening", "fattening_cooldown", "dungeon_info", "dungeon_cooldown",
            "arena_info", "arena_cooldown", "party_info", "marriage_info",
            "spouse_1", "spouse_2", "robbery_info", "map_info", "location_name",
            "name", "level", "satiety_cur", "satiety_max", "status", "state",
            "bugs", "class", "mood", "wins", "losses", "arenas",
            "inv_lollipop", "inv_bandages", "inv_beer", "inv_dragonfly",
            "inv_map", "inv_tape", "inv_gang_frogs", "inv_exp_capsule",
            "eq_pass", "eq_lockpick", "eq_battery",
            "cr_puzzle", "cr_link", "cr_stone", "cr_mask", "cr_paper", "cr_lightning",
            "eq_melee", "eq_ranged", "eq_helmet", "eq_helmet_mod",
            "eq_chest", "eq_chest_mod", "eq_paws", "eq_paws_mod", "eq_buffs",
            "eq_gang", "eq_booster", "eq_parts_weapon", "eq_parts_algae",
            "eq_parts_lily", "eq_parts_beak", "eq_gems", "eq_health",
            "eq_attack", "eq_defense",
            "has_gang", "gang_type", "gang_name", "gang_loyalty_cur", "gang_loyalty_max",
            "gang_damage", "gang_chance", "gang_pendant", "gang_pendant_duration", "gang_party",
            "daily_status", "reserve_days", "daily_completed", "daily_tasks",
            "daily_reward", "daily_bonus_tasks", "daily_bonus_reward",
            "feed_loot"
        }

        # Фильтруем все категории по белому списку колонок
        plain_values = {k: v for k, v in plain_values.items() if k in ALLOWED_COLUMNS}
        deltas = {k: v for k, v in deltas.items() if k in ALLOWED_COLUMNS}
        missing_required = [c for c in missing_required if c in ALLOWED_COLUMNS]
        optional_nulls = [c for c in optional_nulls if c in ALLOWED_COLUMNS]

        # Записи для аудита дельт (собираем здесь, пишем одним батчем)
        audit_rows: list = []

        async with self._connect_rec() as conn:
            # Гарантируем наличие строки аккаунта
            await conn.execute(
                "INSERT OR IGNORE INTO toad_states (vk_id, last_updated) VALUES (?, ?)",
                (vk_id, msk_now_str)
            )

            # --- Динамическая сборка UPDATE ---
            set_clauses: list = ["last_updated = ?"]
            params: list = [msk_now_str]

            # Категория 1: перезапись значений
            for col, val in plain_values.items():
                set_clauses.append(f"{col} = ?")
                params.append(val)

            # Категория 4: прочерк (NULL) для сознательно отсутствующих опциональных полей
            for col in optional_nulls:
                set_clauses.append(f"{col} = NULL")

            # Категория 2: инкремент дельт
            # Нужно знать старые значения для аудита "было → стало", поэтому читаем их заранее
            old_values: dict = {}
            if deltas:
                col_list = ", ".join(deltas.keys())
                async with conn.execute(
                    f"SELECT {col_list} FROM toad_states WHERE vk_id = ?", (vk_id,)
                ) as cursor:
                    row = await cursor.fetchone()
                    if row:
                        old_values = {k: row[k] for k in deltas.keys()}

            for col, delta_val in deltas.items():
                # COALESCE(col, 0) + N — если старого значения нет, считаем с нуля
                set_clauses.append(f"{col} = COALESCE({col}, 0) + ?")
                params.append(delta_val)

            # Выполняем основной UPDATE
            params.append(vk_id)
            await conn.execute(
                f"UPDATE toad_states SET {', '.join(set_clauses)} WHERE vk_id = ?",
                params
            )

            # --- Категория 2: аудит инкрементов ---
            for col, delta_val in deltas.items():
                old_v = old_values.get(col)
                new_v = (old_v or 0) + delta_val if isinstance(delta_val, (int, float)) else None
                audit_rows.append((
                    vk_id, data.get("_command", ""), "delta", col,
                    str(delta_val), str(old_v) if old_v is not None else None,
                    str(new_v) if new_v is not None else None, data.get("_raw_text")
                ))

            # --- Категория 3: аудит пропущенных обязательных полей ---
            for col in missing_required:
                logger.warning(
                    f"[Save Toad State] vk_id={vk_id}: обязательное поле '{col}' "
                    f"не найдено в ответе команды '{data.get('_command', '?')}'. "
                    f"Старое значение сохранено."
                )
                audit_rows.append((
                    vk_id, data.get("_command", ""), "missing_required", col,
                    None, None, None, data.get("_raw_text")
                ))

            # Пишем аудит одним батчем
            if audit_rows:
                await conn.executemany(
                    """INSERT INTO delta_audit
                       (vk_id, command, event_type, field_name, delta_value,
                        old_value, new_value, raw_text)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    audit_rows
                )

            await conn.commit()

        # Синхронизация is_prime в основной базе bot.db (таблица accounts) при наличии статуса
        status_val = data.get("status")
        if status_val:
            is_p = 1 if status_val in ("prime", "prime+", "премиум", "премиум+") else 0
            async with self._connect() as conn:
                await conn.execute("UPDATE accounts SET is_prime = ? WHERE vk_id = ?", (is_p, vk_id))
                await conn.commit()

    async def _evaluate_recognition_status(self, conn, command_id: int, command_name: str, text: str, player_vk_id: Optional[int] = None) -> str:
        """
        Вспомогательный метод для вычисления статуса распознавания ("Да" / "Нет" / "Не распознаем")
        на основе регулярных выражений из БД и при необходимости сохранения состояния жабы.
        """
        if command_name == "Жаба инфо":
            from src.utils.toad_info_parser import parse_toad_info
            parsed_data = parse_toad_info(text)
            if parsed_data is not None:
                if player_vk_id is not None:
                    await self.save_toad_state(player_vk_id, parsed_data)
                return "Да"
            return "Нет"
            
        if command_name == "Моя жаба":
            from src.utils.toad_info_parser import parse_my_toad
            parsed_data = parse_my_toad(text)
            if parsed_data is not None:
                if player_vk_id is not None:
                    await self.save_toad_state(player_vk_id, parsed_data)
                return "Да"
            return "Нет"

        if command_name == "Мой инвентарь":
            from src.utils.toad_info_parser import parse_inventory
            parsed_data = parse_inventory(text)
            if parsed_data is not None:
                if player_vk_id is not None:
                    await self.save_toad_state(player_vk_id, parsed_data)
                return "Да"
            return "Нет"

        if command_name == "Мое снаряжение":
            from src.utils.toad_info_parser import parse_equipment
            parsed_data = parse_equipment(text)
            if parsed_data is not None:
                if player_vk_id is not None:
                    await self.save_toad_state(player_vk_id, parsed_data)
                return "Да"
            return "Нет"

        if command_name == "Покормить жабу":
            from src.utils.toad_info_parser import parse_feed
            parsed_data = parse_feed(text)
            if parsed_data is not None:
                if player_vk_id is not None:
                    await self.save_toad_state(player_vk_id, parsed_data)
                return "Да"
            return "Нет"

        if command_name == "Дейлики":
            from src.utils.toad_info_parser import parse_dailies
            parsed_data = parse_dailies(text)
            if parsed_data is not None:
                if player_vk_id is not None:
                    await self.save_toad_state(player_vk_id, parsed_data)
                return "Да"
            return "Нет"

        if command_name == "Моя семья":
            from src.utils.toad_info_parser import parse_family
            acc_name = ""
            if player_vk_id is not None:
                async with conn.execute("SELECT name FROM accounts WHERE vk_id = ?", (player_vk_id,)) as acc_cursor:
                    acc_row = await acc_cursor.fetchone()
                    acc_name = acc_row["name"] if acc_row else ""
            parsed_data = parse_family(text, acc_name)
            if parsed_data is not None:
                if player_vk_id is not None:
                    await self.update_account_fields(player_vk_id, parsed_data)
                return "Да"
            return "Нет"

        if command_name == "Мой клан":
            from src.utils.toad_info_parser import parse_clan
            parsed_data = parse_clan(text)
            if parsed_data is not None:
                if player_vk_id is not None:
                    await self.save_clan_info(player_vk_id, parsed_data)
                return "Да"
            return "Нет"

        if command_name == "Моя банда":
            from src.utils.toad_info_parser import parse_gang
            parsed_data = parse_gang(text)
            if parsed_data is not None:
                if player_vk_id is not None:
                    await self.save_toad_state(player_vk_id, parsed_data)
                    allowed_columns = {
                        "has_gang", "gang_type", "gang_name", 
                        "gang_loyalty_cur", "gang_loyalty_max", 
                        "gang_damage", "gang_chance", "gang_pendant", 
                        "gang_pendant_duration", "gang_party"
                    }
                    filtered_fields = {k: v for k, v in parsed_data.items() if k in allowed_columns}
                    await self.update_account_fields(player_vk_id, filtered_fields)
                return "Да"
            return "Нет"


        # Для остальных команд проверяем по правилам из БД
        import re
        # Получаем все правила для этой команды
        async with conn.execute("""
            SELECT r.pattern
            FROM recognition_subcommands s
            JOIN recognition_rules r ON s.id = r.subcommand_id
            WHERE s.command_id = ?
        """, (command_id,)) as cursor:
            rules = await cursor.fetchall()
            
        if not rules:
            return "Не распознаем"
            
        text_clean = text.replace("\r", "")
        any_matched = False
        for rule in rules:
            try:
                pattern = rule["pattern"].strip()
                if not pattern.endswith("$") and not pattern.endswith(".*"):
                    pattern = pattern + "$"
                regex = re.compile(pattern, re.IGNORECASE | re.MULTILINE)
                if regex.search(text_clean):
                    any_matched = True
                    break
            except Exception:
                pass
                
        return "Да" if any_matched else "Нет"

    async def save_monitored_response_new(self, command_text: str, vk_msg_id: int, response_text: str, player_vk_id: Optional[int] = None) -> None:
        """Сохраняет начальный ответ Жабабота на команду и регистрирует его для отслеживания редактирования"""
        cmd_clean = command_text.strip()
        resp_clean = response_text.strip()
        if not cmd_clean or not resp_clean:
            return
            
        import json
        initial_history_json = json.dumps([resp_clean])
        
        # Получаем дату и время по Москве
        from datetime import datetime, timezone, timedelta
        msk_now_str = datetime.now(timezone(timedelta(hours=3))).strftime("%d.%m.%Y %H:%M:%S")
        
        async with self._connect() as conn:
            # Ищем ID команды по тексту без учета регистра (COLLATE NOCASE)
            async with conn.execute(
                "SELECT id, in_recognition, command FROM monitored_commands WHERE command = ? COLLATE NOCASE", (cmd_clean,)
            ) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return
                cmd_id = row["id"]
                in_recognition = row["in_recognition"]
                cmd_real_name = row["command"]
                
            # Вычисляем статус распознавания
            status = "Не распознаем"
            if in_recognition == 1:
                status = await self._evaluate_recognition_status(conn, cmd_id, cmd_real_name, resp_clean, player_vk_id)
            
            
            # Очищаем старые записи (старше 1 часа)
            await conn.execute(
                "DELETE FROM active_monitored_messages WHERE datetime(updated_at) < datetime('now', '-1 hour')"
            )
            
            # Вставляем или инкрементируем match_count при совпадении уникальной связки (начальная история)
            await conn.execute("""
                INSERT INTO monitored_responses (command_id, response_text, match_count, last_mention_at, recognition_status)
                VALUES (?, ?, 1, ?, ?)
                ON CONFLICT(command_id, response_text) DO UPDATE SET 
                    match_count = match_count + 1,
                    last_mention_at = excluded.last_mention_at,
                    recognition_status = excluded.recognition_status
            """, (cmd_id, initial_history_json, msk_now_str, status))
            
            # Получаем id созданной или обновленной записи в monitored_responses
            async with conn.execute(
                "SELECT id FROM monitored_responses WHERE command_id = ? AND response_text = ?",
                (cmd_id, initial_history_json)
            ) as cursor:
                resp_row = await cursor.fetchone()
                current_response_id = resp_row["id"] if resp_row else None
                
            if current_response_id is not None:
                await conn.execute("""
                    INSERT OR REPLACE INTO active_monitored_messages (vk_msg_id, command_id, current_response_id, texts, player_vk_id)
                    VALUES (?, ?, ?, ?, ?)
                """, (vk_msg_id, cmd_id, current_response_id, initial_history_json, player_vk_id))
                
            await conn.commit()
        logger.info(f"[Monitor] Зарегистрирован начальный ответ на команду '{cmd_clean}' (Msg ID {vk_msg_id}, Player {player_vk_id}): '{resp_clean[:30]}...' -> Status: {status}")

    async def save_monitored_response_edit(self, vk_msg_id: int, response_text: str, player_vk_id: Optional[int] = None) -> Optional[str]:
        """Обновляет последовательность ответов при редактировании сообщения Жабабота и возвращает имя команды"""
        resp_clean = response_text.strip()
        if not resp_clean:
            return None
            
        import json
        # Получаем дату и время по Москве
        from datetime import datetime, timezone, timedelta
        msk_now_str = datetime.now(timezone(timedelta(hours=3))).strftime("%d.%m.%Y %H:%M:%S")
        
        async with self._connect() as conn:
            # Ищем активное сообщение в отслеживаемых и подгружаем имя команды и player_vk_id
            async with conn.execute("""
                SELECT a.command_id, a.current_response_id, a.texts, a.player_vk_id, c.command, c.in_recognition
                FROM active_monitored_messages a
                JOIN monitored_commands c ON a.command_id = c.id
                WHERE a.vk_msg_id = ?
            """, (vk_msg_id,)) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None
                cmd_id = row["command_id"]
                current_response_id = row["current_response_id"]
                command_name = row["command"]
                in_recognition = row["in_recognition"]
                db_player_vk_id = row["player_vk_id"]
                try:
                    texts = json.loads(row["texts"])
                except Exception:
                    texts = []
                    
            if not isinstance(texts, list):
                texts = []
                
            # Игнорируем, если текст совпадает с последним
            if texts and texts[-1] == resp_clean:
                return command_name
                
            # Добавляем новую редакцию
            texts.append(resp_clean)
            new_history_json = json.dumps(texts)
            
            # Решаем, какой player_vk_id использовать
            final_vk_id = player_vk_id if player_vk_id is not None else db_player_vk_id
            
            # Вычисляем статус распознавания
            status = "Не распознаем"
            if in_recognition == 1:
                status = await self._evaluate_recognition_status(conn, cmd_id, command_name, resp_clean, final_vk_id)
            
            # Уменьшаем счетчик старой последовательности
            if current_response_id:
                await conn.execute(
                    "UPDATE monitored_responses SET match_count = match_count - 1 WHERE id = ?",
                    (current_response_id,)
                )
                # Удаляем, если счетчик стал 0
                await conn.execute(
                    "DELETE FROM monitored_responses WHERE id = ? AND match_count <= 0",
                    (current_response_id,)
                )
                
            # Добавляем или увеличиваем счетчик новой последовательности
            await conn.execute("""
                INSERT INTO monitored_responses (command_id, response_text, match_count, last_mention_at, recognition_status)
                VALUES (?, ?, 1, ?, ?)
                ON CONFLICT(command_id, response_text) DO UPDATE SET 
                    match_count = match_count + 1,
                    last_mention_at = excluded.last_mention_at,
                    recognition_status = excluded.recognition_status
            """, (cmd_id, new_history_json, msk_now_str, status))
            
            # Получаем id новой записи
            async with conn.execute(
                "SELECT id FROM monitored_responses WHERE command_id = ? AND response_text = ?",
                (cmd_id, new_history_json)
            ) as cursor:
                resp_row = await cursor.fetchone()
                new_response_id = resp_row["id"] if resp_row else None
                
            # Обновляем активное сообщение
            update_fields = [new_response_id, new_history_json]
            update_query = "UPDATE active_monitored_messages SET current_response_id = ?, texts = ?, updated_at = CURRENT_TIMESTAMP"
            if player_vk_id is not None:
                update_query += ", player_vk_id = ?"
                update_fields.append(player_vk_id)
            update_query += " WHERE vk_msg_id = ?"
            update_fields.append(vk_msg_id)
            
            await conn.execute(update_query, tuple(update_fields))
            await conn.commit()
        logger.info(f"[Monitor] Зарегистрировано редактирование сообщения (Msg ID {vk_msg_id}, Player {final_vk_id}), статус: {status}")
        return command_name

    async def delete_monitored_response(self, response_id: int) -> None:
        """Удаление конкретного варианта ответа по ID"""
        async with self._connect() as conn:
            await conn.execute("DELETE FROM monitored_responses WHERE id = ?", (response_id,))
            await conn.commit()
        logger.info(f"Удален вариант ответа ID: {response_id}")

    async def update_monitored_command_recognition(self, command_id: int, status: str) -> None:
        """Обновление статуса распознавания отслеживаемой команды"""
        async with self._connect() as conn:
            await conn.execute("""
                UPDATE monitored_commands
                SET recognition_status = ?
                WHERE id = ?
            """, (status, command_id))
            await conn.commit()
        logger.info(f"Статус распознавания команды ID {command_id} изменен на: {status}")

    async def update_monitored_response_recognition(self, response_id: int, status: str) -> None:
        """Обновление статуса распознавания конкретного варианта ответа"""
        async with self._connect() as conn:
            await conn.execute("""
                UPDATE monitored_responses
                SET recognition_status = ?
                WHERE id = ?
            """, (status, response_id))
            await conn.commit()
        logger.info(f"Статус распознавания варианта ответа ID {response_id} изменен на: {status}")

    async def toggle_monitored_command_in_recognition(self, command_id: int, enabled: int) -> None:
        """Добавление/удаление команды из вкладки Распознавание"""
        async with self._connect() as conn:
            # Получаем имя команды
            async with conn.execute("SELECT command FROM monitored_commands WHERE id = ?", (command_id,)) as cursor:
                row = await cursor.fetchone()
                command_name = row["command"] if row else ""
                
            await conn.execute("""
                UPDATE monitored_commands
                SET in_recognition = ?
                WHERE id = ?
            """, (enabled, command_id))
            
            # Пересчитываем статусы для всех вариаций этой команды
            async with conn.execute(
                "SELECT id, response_text FROM monitored_responses WHERE command_id = ?", (command_id,)
            ) as cursor:
                responses = await cursor.fetchall()
                
            import json
            for resp in responses:
                resp_id = resp["id"]
                resp_json = resp["response_text"]
                try:
                    texts = json.loads(resp_json)
                    last_text = texts[-1] if isinstance(texts, list) and texts else resp_json
                except Exception:
                    last_text = resp_json
                    
                status = "Не распознаем"
                if enabled == 1:
                    status = await self._evaluate_recognition_status(conn, command_id, command_name, last_text, None)
                
                await conn.execute(
                    "UPDATE monitored_responses SET recognition_status = ? WHERE id = ?", (status, resp_id)
                )
                
            await conn.commit()
        logger.info(f"Команда ID {command_id} ({command_name}) статус in_recognition изменен на: {enabled}. Пересчитано вариаций: {len(responses)}")

    async def get_recognition_rules_for_command(self, command_id: int) -> List[Dict[str, Any]]:
        """Получает правила распознавания (подкоманды и регулярные выражения) для команды"""
        async with self._connect() as conn:
            async with conn.execute("""
                SELECT s.id as subcommand_id, s.name as subcommand_name,
                       r.id as rule_id, r.pattern, r.output_value, r.variable_name
                FROM recognition_subcommands s
                LEFT JOIN recognition_rules r ON s.id = r.subcommand_id
                WHERE s.command_id = ?
                ORDER BY s.id ASC, r.id ASC
            """, (command_id,)) as cursor:
                rows = await cursor.fetchall()
                
                subcommands_map = {}
                for row in rows:
                    sub_id = row["subcommand_id"]
                    if sub_id not in subcommands_map:
                        subcommands_map[sub_id] = {
                            "id": sub_id,
                            "name": row["subcommand_name"],
                            "rules": []
                        }
                    if row["rule_id"] is not None:
                        subcommands_map[sub_id]["rules"].append({
                            "id": row["rule_id"],
                            "pattern": row["pattern"],
                            "output_value": row["output_value"],
                            "variable_name": row["variable_name"]
                        })
                return list(subcommands_map.values())

    async def get_unrecognized_monitor_variations(self) -> List[Dict[str, Any]]:
        """
        Возвращает список команд и их вариаций ответов, которые должны быть распознаны (recognition_status = 'Нет'),
        но не соответствуют хотя бы одному из правил распознавания этой команды.
        """
        import json
        import re
        async with self._connect() as conn:
            # 1. Получаем все monitored_commands
            async with conn.execute("SELECT id, command FROM monitored_commands") as cursor:
                commands = [dict(row) for row in await cursor.fetchall()]
                
            result = []
            for cmd in commands:
                cmd_id = cmd["id"]
                
                # 2. Получаем правила для этой команды
                async with conn.execute("""
                    SELECT s.name as subcommand_name, r.id as rule_id, r.pattern, r.variable_name
                    FROM recognition_subcommands s
                    JOIN recognition_rules r ON s.id = r.subcommand_id
                    WHERE s.command_id = ?
                """, (cmd_id,)) as cursor:
                    rules = [dict(row) for row in await cursor.fetchall()]
                    
                # 3. Получаем вариации ответов для этой команды со статусом "Нет"
                async with conn.execute("""
                    SELECT id, response_text, match_count, last_mention_at, recognition_status
                    FROM monitored_responses
                    WHERE command_id = ? AND recognition_status = 'Нет'
                """, (cmd_id,)) as cursor:
                    variations = [dict(row) for row in await cursor.fetchall()]
                    
                if not variations:
                    continue
                    
                unrecognized_vars = []
                for var in variations:
                    # Декодируем текст
                    try:
                        texts = json.loads(var["response_text"])
                        latest_text = texts[-1] if texts else ""
                    except Exception:
                        latest_text = var["response_text"]
                        
                    failed_rules = []
                    # Если правила есть, проверяем их
                    for rule in rules:
                        try:
                            latest_text_clean = latest_text.replace("\r", "")
                            pattern = rule["pattern"].strip()
                            if not pattern.endswith("$") and not pattern.endswith(".*"):
                                pattern = pattern + "$"
                            regex = re.compile(pattern, re.IGNORECASE | re.MULTILINE)
                            if not regex.search(latest_text_clean):
                                failed_rules.append({
                                    "rule_id": rule["rule_id"],
                                    "subcommand_name": rule["subcommand_name"],
                                    "variable_name": rule["variable_name"],
                                    "pattern": rule["pattern"]
                                })
                        except Exception as e:
                            failed_rules.append({
                                "rule_id": rule["rule_id"],
                                "subcommand_name": rule["subcommand_name"],
                                "variable_name": rule["variable_name"],
                                "pattern": rule["pattern"],
                                "error": str(e)
                            })
                            
                    # Если правил нет, то считаем, что все правила провалились (т.к. статус "Нет", но правил нет вообще)
                    if not rules:
                        failed_rules.append({
                            "rule_id": 0,
                            "subcommand_name": "Система",
                            "variable_name": "правила_не_заданы",
                            "pattern": "Нет правил для этой команды"
                        })
                        
                    # Декодируем историю для отображения
                    try:
                        history = json.loads(var["response_text"])
                    except Exception:
                        history = [var["response_text"]]
                        
                    unrecognized_vars.append({
                        "id": var["id"],
                        "response_text": latest_text,
                        "response_history": history,
                        "match_count": var["match_count"],
                        "last_mention_at": var["last_mention_at"] or "",
                        "recognition_status": var["recognition_status"],
                        "failed_rules": failed_rules
                    })
                        
                if unrecognized_vars:
                    result.append({
                        "id": cmd["id"],
                        "command": cmd["command"],
                        "variations": unrecognized_vars
                    })
                    
            return result


