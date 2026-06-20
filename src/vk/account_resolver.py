"""Резолвер получателя push-сообщений Жабабота.

Push-сообщения — это ответы бота, инициируемые самим Жабаботом (а не командой
пользователя): результаты боёв по расписанию, клановые войны, переводы/подарки,
ответы на пересланные сообщения. Для них неприменима pending-очередь команд,
поэтому получатель определяется прямо из текста ответа по трём уровням надёжности:

1. **Тег [id|Имя]** — наиболее надёжный. Бот сам зашивает VK ID игрока.
   Имя в теге сверяется с accounts.name для защиты от случая «сменилась жаба
   под тем же vk_id» (расхождение → name_verified=False → алерт, но резолвим).
2. **fwd/reply** — если бот отвечает на/пересылает сообщение от нашего аккаунта,
   берём from_id исходного сообщения.
3. **Bare-имя** — для секций «X получил:» без тега (фоллбэк): точное совпадение
   слова с нормализованным именем жабы (clean_member_name). Самый хрупкий
   уровень, применяется только при отсутствии (1) и (2).

Резолвер возвращает список результатов, т.к. одно сообщение (например, клан-бой)
может адресовать нескольким нашим аккаунтам одновременно.
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger("toadbot.vk.account_resolver")

# Регулярка для извлечения тегов ВК: [id123|Имя], [durov|Павел], [club456|Группа]
# (club* здесь не используется — у нас интересуют только людей).
TAG_PATTERN = re.compile(r"\[(id\d+|[a-zA-Z0-9_\.]+)\|([^\]]+)\]")


@dataclass
class ResolveResult:
    """Результат резолвинга получателя push-сообщения."""
    vk_id: int
    source: str  # "tag" | "fwd" | "name"
    name_verified: bool  # совпало ли имя в теге с accounts.name
    raw_name: Optional[str] = None  # имя из тега (для алерта при расхождении)


def _extract_tag_recipients(
    text: str, candidates: List[Dict[str, Any]]
) -> List[ResolveResult]:
    """Уровень 1: резолвинг по тегам [id|Имя]."""
    results: List[ResolveResult] = []
    if not candidates:
        return results

    # Карта vk_id -> имя для быстрого поиска
    cand_by_id: Dict[int, Dict[str, Any]] = {c["vk_id"]: c for c in candidates}

    for match in TAG_PATTERN.finditer(text):
        tag_id, tag_name = match.group(1), match.group(2).strip()
        if not tag_id.startswith("id"):
            continue  # поддерживаем только id-теги людей (не screen_name/club)
        try:
            vk_id = int(tag_id[2:])
        except ValueError:
            continue
        if vk_id not in cand_by_id:
            continue  # тег не нашего аккаунта

        acc_name = cand_by_id[vk_id].get("name") or ""
        # Сравнение имён без учёта регистра и регистра нормализуем
        verified = bool(acc_name) and acc_name.strip().lower() == tag_name.lower()
        results.append(ResolveResult(
            vk_id=vk_id,
            source="tag",
            name_verified=verified,
            raw_name=tag_name,
        ))
    return results


def _extract_fwd_recipients(
    reply_message: Optional[Any],
    fwd_messages: Optional[List[Any]],
    candidates: List[Dict[str, Any]],
) -> List[ResolveResult]:
    """Уровень 2: резолвинг по пересланному/ответному сообщению от нашего аккаунта."""
    cand_ids = {c["vk_id"] for c in candidates}
    results: List[ResolveResult] = []

    # Берём первое доступное исходное сообщение (reply приоритетнее fwd)
    ref_msg = None
    if reply_message:
        ref_msg = reply_message
    elif fwd_messages:
        ref_msg = fwd_messages[0]

    if ref_msg is None:
        return results

    from_id = getattr(ref_msg, "from_id", None)
    if from_id is None:
        return results
    # Жабабот пересылает сообщения людей (from_id > 0); нас интересуют только наши
    if from_id <= 0:
        return results
    if from_id in cand_ids:
        results.append(ResolveResult(
            vk_id=from_id,
            source="fwd",
            name_verified=True,  # по fwd нет имени для сверки, но ID точный
            raw_name=None,
        ))
    return results


def _extract_name_recipients(
    text: str, candidates: List[Dict[str, Any]]
) -> List[ResolveResult]:
    """Уровень 3 (фоллбэк): резолвинг по bare-имени жабы в секциях «X получил:».

    Применяется только когда нет ни тега, ни fwd. Имя должно совпасть точно
    (словом) с нормализованным именем жабы аккаунта.
    """
    # Импорт здесь, чтобы избежать циклической зависимости на верхнем уровне
    from src.utils.toad_info_parser import clean_member_name

    # Находим все упоминания вида «<Имя> получил:»
    name_pattern = re.compile(r"(?:^|\n)\s*([А-ЯA-Za-zЁ][А-Яа-яA-Za-zёЁ0-9 ]{1,40}?)\s+получил\s*:", re.MULTILINE)
    mentioned_names = {m.group(1).strip() for m in name_pattern.finditer(text)}
    if not mentioned_names:
        return []

    results: List[ResolveResult] = []
    for cand in candidates:
        acc_name = cand.get("name") or ""
        if not acc_name:
            continue
        clean_acc = clean_member_name(acc_name).lower()
        if not clean_acc:
            continue
        for raw_name in mentioned_names:
            clean_mentioned = clean_member_name(raw_name).lower()
            # Точное совпадение целого имени (не подстрока!) — защита от
            # ложных срабатываний («Петя» vs «Не Петя» vs «Именно Петя»)
            if clean_acc == clean_mentioned:
                results.append(ResolveResult(
                    vk_id=cand["vk_id"],
                    source="name",
                    name_verified=True,
                    raw_name=raw_name,
                ))
                break
    return results


def resolve(
    text: str,
    candidates: List[Dict[str, Any]],
    reply_message: Optional[Any] = None,
    fwd_messages: Optional[List[Any]] = None,
) -> List[ResolveResult]:
    """Определяет всех получателей-наших-аккаунтов в push-сообщении Жабабота.

    Args:
        text: полный текст сообщения Жабабота (с тегами, кнопками).
        candidates: список наших аккаунтов, сидящих в этом чате
            (dict с ключами vk_id, name, screen_name).
        reply_message: объект ответа vkbottle (опц.).
        fwd_messages: список пересланных сообщений vkbottle (опц.).

    Returns:
        Список ResolveResult. Может содержать несколько аккаунтов (клан-бой).
        Дубликаты по vk_id устраняются: приоритет по source tag > fwd > name.
    """
    if not candidates:
        return []

    # Собираем результаты со всех уровней
    all_results: List[ResolveResult] = []
    all_results.extend(_extract_tag_recipients(text, candidates))
    all_results.extend(_extract_fwd_recipients(reply_message, fwd_messages, candidates))
    all_results.extend(_extract_name_recipients(text, candidates))

    if not all_results:
        return []

    # Дедупликация по vk_id: оставляем одну запись на аккаунт по приоритету источника.
    source_priority = {"tag": 0, "fwd": 1, "name": 2}
    best_by_id: Dict[int, ResolveResult] = {}
    for r in all_results:
        existing = best_by_id.get(r.vk_id)
        if existing is None or source_priority[r.source] < source_priority[existing.source]:
            best_by_id[r.vk_id] = r
    return list(best_by_id.values())


def find_section_recipient_name(
    text: str, section_text: str, resolver_result: ResolveResult
) -> Optional[str]:
    """Ищет имя, которому адресована конкретная секция лута в сообщении.

    Используется в кейсах вида:
        «Каждый из вас получил: ...   ← общий дроп (всем)
         Петя получил: ...            ← индивидуальный (только Пете)»

    Возвращает имя игрока из заголовка секции, ближайшей перед ``section_text``,
    либо None, если секция общая («Каждый из вас» / «Ты получил»).
    """
    # Ищем последнюю секцию «<Имя> получил:» перед вхождением section_text
    idx = text.lower().find(section_text.lower())
    if idx < 0:
        return None
    before = text[:idx]
    matches = re.findall(
        r"(?:^|\n)\s*([А-ЯA-Za-zЁ][А-Яа-яA-Za-zёЁ0-9 ]{1,40}?)\s+получил\s*:",
        before,
    )
    if not matches:
        return None
    return matches[-1].strip()
