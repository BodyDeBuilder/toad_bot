# Поток данных: от ответа Жабабота до UI

Краткое описание того, как данные от бота-игры попадают в базы, парсятся, маппятся и отображаются в веб-интерфейсе.

> **Зачем:** При добавлении новой команды с Python-парсером нужно знать, в какую БД писать, как маппить поля, и как UI достаёт данные.

---

## 1. Две базы данных

| БД | Файл | Таблица | Назначение |
|---|---|---|---|
| **bot.db** | `data/bot.db` | `accounts` | Основная таблица аккаунтов: настройки, бота-статус, агрегированные поля жабы |
| **recognition.db** | `data/recognition.db` | `toad_states` | Полное состояние жабы: всё, что парсер распознал из ответов Жабабота |

Строки подключения: `self._connect()` → bot.db, `self._connect_rec()` → recognition.db (`db_manager.py`).

---

## 2. Схема таблиц (ключевые поля)

### `accounts` (bot.db) — 55 колонок

Поля, обновляемые из парсеров:

| Колонка | Тип | Источник |
|---|---|---|
| `vk_id` | INTEGER PK | — |
| `name` | TEXT | `toad_state_to_account_fields` → из `name` |
| `class_level` | INTEGER | mapper → из `level` |
| `satiety` | TEXT | mapper → формат `"cur/max"` |
| `is_prime` | INTEGER (0/1) | mapper → `"prime"/"prime+"` → 1 |
| `class_name` | TEXT | mapper → из `class` |
| `mood` | INTEGER | mapper → из `mood` |
| `bugs` | INTEGER | mapper → из `bugs` |
| `wins` | INTEGER | mapper → из `wins` |
| `losses` | INTEGER | mapper → из `losses` |
| `work_info` | TEXT | `parse_toad_info` → напрямую |
| `feed_info` | TEXT | `parse_toad_info` → напрямую |
| `fattening` | TEXT | `parse_toad_info` → напрямую |
| `status` | TEXT | Статус бота: `idle` / `working` / `offline` |
| `is_active` | INTEGER (0/1) | Включён/выключен в UI |

Полная схема: `db_manager.py:37-95`.

### `toad_states` (recognition.db) — 49 колонок

Группы полей:

| Группа | Колонки | Источник парсера |
|---|---|---|
| **«Жаба инфо»** (кулдауны) | `work_info`, `work_cooldown`, `feed_info`, `feed_cooldown`, `fattening`, `fattening_cooldown`, `dungeon_info`, `dungeon_cooldown`, `arena_info`, `arena_cooldown`, `party_info`, `marriage_info`, `spouse_1`, `spouse_2`, `robbery_info`, `map_info`, `location_name` | `parse_toad_info` |
| **«Моя жаба»** (статы) | `name`, `level`, `satiety_cur`, `satiety_max`, `status`, `state`, `bugs`, `class`, `mood`, `wins`, `losses`, `arenas` | `parse_my_toad` |
| **«Мой инвентарь»** (предметы) | `inv_lollipop`, `inv_bandages`, `inv_beer`, `inv_dragonfly`, `inv_map`, `inv_tape`, `inv_gang_frogs`, `inv_exp_capsule` | `parse_inventory` |
| **Инвентарь: снаряжение** | `eq_pass`, `eq_lockpick`, `eq_battery` | `parse_inventory` |
| **Инвентарь: крафт** | `cr_puzzle`, `cr_link`, `cr_stone`, `cr_mask`, `cr_paper`, `cr_lightning` | `parse_inventory` |
| **Метаданные** | `vk_id` (PK), `last_updated` | Автоматически |

Полная схема: `db_manager.py:851-900`.

---

## 3. Общий поток данных

```
Ответ Жабабота
     │
     ▼
handlers.py → определение action_type через KnowledgeBase
     │
     ├── ACTION_INFO ("Жаба инфо")
     │     parse_toad_info(text) → dict
     │     ├── save_toad_state(vk_id, dict) → recognition.db
     │     └── update_account_fields(vk_id, отфильтрованные поля) → bot.db
     │
     ├── ACTION_STATS ("Моя жаба")
     │     parse_my_toad(text) → dict
     │     ├── save_toad_state(vk_id, dict) → recognition.db
     │     └── toad_state_to_account_fields(dict) → update_account_fields → bot.db
     │
     ├── ACTION_INVENTORY ("Мой инвентарь")
     │     parse_inventory(text) → dict
     │     └── save_toad_state(vk_id, dict) → recognition.db  (в bot.db ничего)
     │
     └── Regex-команды
           match по recognition_rules → db_updates dict
           └── update_account_fields(vk_id, db_updates) → bot.db
```

**Ключевой принцип:** `save_toad_state` пишет **всё** что распарсил парсер в `recognition.db`. `update_account_fields` пишет **выборочно** в `bot.db` — только те поля, которые нужны для UI-агрегации и быстрого доступа.

---

## 4. `save_toad_state` — как работает

`db_manager.py:1608-1705`

```python
async def save_toad_state(self, vk_id: int, data: dict) -> None:
```

- Проверяет, что `vk_id` существует в `bot.db.accounts` (иначе молча выходит).
- `INSERT ... ON CONFLICT(vk_id) DO UPDATE SET ...` — upsert.
- **Каждая колонка:** `COALESCE(excluded.<col>, toad_states.<col>)` — `None`-значения **не перезаписывают** существующие данные.
- Это значит: если парсер не распознал поле (вернул `None` для него), старое значение сохраняется.

---

## 5. `toad_state_to_account_fields` — маппинг ключей

`toad_info_parser.py:314-352`

Преобразует ключи, которые возвращает `parse_my_toad`, в имена колонок таблицы `accounts`:

| Ключ парсера | Колонка accounts | Преобразование |
|---|---|---|
| `name` | `name` | напрямую |
| `level` | `class_level` | напрямую |
| `satiety_cur` + `satiety_max` | `satiety` | `"{cur}/{max}"` |
| `status` | `is_prime` | `"prime"`/`"prime+"` → `1`, иначе → `0` |
| `bugs` | `bugs` | напрямую |
| `class` | `class_name` | напрямую |
| `mood` | `mood` | напрямую |
| `wins` | `wins` | напрямую |
| `losses` | `losses` | напрямую |

---

## 6. Как UI получает данные

`get_all_accounts` (`db_manager.py:1211-1255`):

1. `SELECT a.*, s.* FROM accounts a LEFT JOIN settings s ON a.vk_id = s.vk_id` → bot.db
2. `SELECT * FROM toad_states` → recognition.db
3. Для каждого аккаунта: `acc["toad_state"] = toad_states[vk_id]` (или `None`)

В `app.js` данные доступны как:
- **accounts-поля:** `acc.bugs`, `acc.mood`, `acc.wins`, `acc.is_prime` и т.д.
- **toad_state-поля:** `acc.toad_state.level`, `acc.toad_state.state`, `acc.toad_state.work_cooldown`, `acc.toad_state.feed_cooldown` и т.д.

---

## 7. Как добавить новую команду с Python-парсером

### 7.1. Написать парсер

В `src/utils/toad_info_parser.py`:

```python
def parse_new_command(text: str) -> Optional[Dict[str, Any]]:
    result = {}
    # ... распознаём поля, кладём в result
    return result if result else None  # None если ничего не распознали
```

Ключи результата парсера должны совпадать с колонками `toad_states` (или добавьте новые колонки в схему).

### 7.2. Зарегистрировать в системе статусов

В `_evaluate_recognition_status` (`db_manager.py:1717`):

```python
elif command_name == "Новая команда":
    from src.utils.toad_info_parser import parse_new_command
    parsed_data = parse_new_command(text)
    if parsed_data is not None:
        if player_vk_id is not None:
            await self.save_toad_state(player_vk_id, parsed_data)
        return "Да"
    return "Нет"
```

### 7.3. Зарегистрировать в test-parse

В `server.py` (блок `elif cmd_real_name == ...` около строки 958):

```python
elif cmd_real_name == "Новая команда":
    from src.utils.toad_info_parser import parse_new_command
    parsed_data = parse_new_command(text)
    recognized = parsed_data is not None
```

### 7.4. (Опционально) Маппинг в accounts

Если часть полей нужно дублировать в `bot.db.accounts`:
- Добавить mapper-функцию в `toad_info_parser.py` (по аналогии с `toad_state_to_account_fields`)
- Вызвать её в `handlers.py` и передать результат в `update_account_fields`

### 7.5. Посеять правила в БД

В блоке посева `db_manager.py` (около строки 338) — документирующие regex-правила для вкладки «Распознавание». См. `RECOGNITION_GUIDE.md` § 9.

---

## 8. Связанные файлы

| Файл | Что содержит |
|---|---|
| `src/utils/toad_info_parser.py` | Все Python-парсеры (`parse_toad_info`, `parse_my_toad`, `parse_inventory`) |
| `src/database/db_manager.py` | Схемы БД, `save_toad_state`, `get_all_accounts`, `_evaluate_recognition_status`, посев правил |
| `src/vk/handlers.py` | Триггеры парсеров (ACTION_INFO/STATS/INVENTORY), вызовы save/update |
| `src/web/server.py` | Эндпоинт `test-parse` со спецеветками для парсеров |
| `src/web/static/app.js` | `SECTION_KEYS`, рендер UI из `acc.toad_state.*` и `acc.*` |
| `RECOGNITION_GUIDE.md` | Правила оформления regex-правил и подразделов распознавания |
| `project_specs.md` | Ограничения: не придумывать команды без указания пользователя |
