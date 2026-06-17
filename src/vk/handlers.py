import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
from vkbottle.user import User, Message
from vkbottle_types.events import UserEventType
from vkbottle_types.events.user_events import MessageEdit
from src.database.db_manager import DBManager
from src.utils.knowledge_base import KnowledgeBase
from src.utils.toad_info_parser import (
    parse_toad_info,
    parse_my_toad,
    parse_inventory,
    toad_state_to_account_fields,
)

logger = logging.getLogger("toadbot.vk.handlers")


def extract_buttons(message: Any) -> str:
    """Извлекает названия кнопок из клавиатуры сообщения и форматирует как [Кнопка: Название]"""
    labels = []
    keyboard = getattr(message, "keyboard", None)
    if keyboard and hasattr(keyboard, "buttons") and keyboard.buttons:
        for row in keyboard.buttons:
            for btn in row:
                action = getattr(btn, "action", None)
                if action and getattr(action, "label", None):
                    labels.append(f"[Кнопка: {action.label}]")
    return " ".join(labels)


def register_handlers(user: User, db: DBManager, vk_id: int, pending_manager: Any):
    """
    Регистрация пассивных обработчиков сообщений для аккаунта.
    Слушает все сообщения чата и маршрутизирует логи / статистику на основе детектора коллизий и Базы Знаний.
    """
    
    @user.on.message()
    async def handle_new_message(message: Message):
        text = message.text
        if not text:
            return
            
        from_id = message.from_id
        
        # Получаем данные аккаунта для проверки привязанного чата
        acc = await db.get_account(vk_id)
        if not acc:
            return
            
        chat_id = acc.get("chat_id")
        
        # Проверяем, что сообщение пришло именно из нашего игрового чата (Peer ID)
        if message.peer_id == chat_id:
            # 1. Записываем сообщение в историю PendingManager для аудита коллизий
            pending_manager.record_chat_message(from_id, text)
            
            # Обновляем время последней проверки данных через бота
            msk_now = datetime.now(timezone(timedelta(hours=3)))
            await db.update_last_checked(vk_id, msk_now)

            # --- Монитор-режим ---
            try:
                if await db.is_monitor_mode_enabled():
                    monitor_mgr = pending_manager.client_manager.monitor_manager
                    if from_id > 0:
                        clean_msg = text.strip()
                        # Получаем список отслеживаемых команд
                        monitored_cmds = await db.get_monitored_commands_list()
                        matched_cmd = None
                        for cmd in monitored_cmds:
                            if clean_msg.lower() == cmd.lower():
                                matched_cmd = cmd
                                break
                        if matched_cmd:
                            # Записываем команду мгновенно для связки с ответом Жабабота
                            monitor_mgr.record_monitored_command(from_id, matched_cmd, message.peer_id)
                        elif clean_msg:
                            # Это нераспознанное сообщение от людей. Записываем его под виртуальной командой "Неопределенные люди"
                            await db.save_monitored_response_new("Неопределенные люди", message.id, clean_msg)
                    elif from_id < 0:
                        # Запускаем задачу получения полной информации и сохранения
                        async def process_full_message_task():
                            try:
                                full_res = await message.ctx_api.messages.get_by_id(message_ids=[message.id])
                                if full_res and full_res.items:
                                    full_msg = full_res.items[0]
                                    
                                    # Извлекаем кнопки
                                    btn_text = extract_buttons(full_msg)
                                    msg_text = full_msg.text or ""
                                    if btn_text:
                                        msg_text = f"{msg_text}\n{btn_text}"
                                        
                                    await monitor_mgr.process_toadbot_message_new(
                                        vk_msg_id=message.id,
                                        peer_id=message.peer_id,
                                        text=msg_text,
                                        reply_message=full_msg.reply_message,
                                        fwd_messages=full_msg.fwd_messages,
                                        attachments=full_msg.attachments
                                    )
                            except Exception as ex:
                                logger.error(f"Ошибка получения подробных сведений о сообщении Жабабота: {ex}", exc_info=True)
                                
                        import asyncio
                        asyncio.create_task(process_full_message_task())
            except Exception as e:
                logger.error(f"Ошибка в логике монитор-режима: {e}", exc_info=True)

            # 2. Если написал сам владелец аккаунта (или наш бот отправил команду)
            if from_id == vk_id:
                action_type = KnowledgeBase.get_command_type(text)
                if action_type:
                    logger.info(f"[{vk_id}] Зарегистрирована наша команда в чате (тип {action_type}): {text[:80]}")
                    
                    # Добавляем в очередь ожидающих команд
                    pending_manager.register_sent_command(vk_id, text)
                    
                    # Записываем в персональный лог этого аккаунта
                    await db.log_action(
                        vk_id, 
                        "command", 
                        f"Вы отправили команду: {text}"
                    )
                
            # 3. Если пишет Жабабот (ответы игрового бота имеют отрицательный ID)
            elif from_id < 0:
                # Проверяем, есть ли активный тест фраз в режиме реального времени
                try:
                    cm = pending_manager.client_manager
                    if hasattr(cm, "test_phrase_futures") and vk_id in cm.test_phrase_futures:
                        fut = cm.test_phrase_futures[vk_id]
                        if fut and not fut.done():
                            logger.info(f"[{vk_id}] Перехватили ответ Жабабота для теста фраз: {text[:80]}")
                            fut.set_result(text)
                            return
                except Exception as ex:
                    logger.error(f"Ошибка перехвата ответа для теста фраз: {ex}", exc_info=True)

                # Проверяем соответствие ответа Жабабота шаблонам из Базы Знаний
                bot_match = KnowledgeBase.match_bot_response(text)
                
                # Проверяем, адресован ли этот ответ нашему аккаунту или кому-то другому:
                is_for_us = False
                is_for_someone_else = False
                
                # А. Проверка тегов/упоминаний в тексте ответа Жабабота
                tags = re.findall(r"\[(id\d+|[a-zA-Z0-9_\.]+)\|[^\]]+\]", text)
                if tags:
                    for tag in tags:
                        if tag.startswith("id"):
                            tid = int(tag[2:])
                            if tid == vk_id:
                                is_for_us = True
                                break
                        else:
                            if acc.get("screen_name") and tag.lower() == acc["screen_name"].lower():
                                is_for_us = True
                                break
                    # Если теги есть, но ни один не совпал с нами — сообщение адресовано другому игроку
                    if not is_for_us:
                        is_for_someone_else = True
                                
                if bot_match:
                    action_type = bot_match["action_type"]
                    db_updates = bot_match["db_updates"]
                    groups = bot_match["groups"]
                    
                    # Б. Сопоставляем через FIFO очередь ожидающих команд только если сообщение
                    # не содержит теги другого игрока (то есть не адресовано явно кому-то еще)
                    if not is_for_us:
                        if not is_for_someone_else:
                            pending_cmd = pending_manager.match_pending_command(action_type, target_vk_id=vk_id)
                            if pending_cmd:
                                is_for_us = True
                    else:
                        pending_manager.match_pending_command(action_type, target_vk_id=vk_id)

                    # Если ответ точно предназначен нашему аккаунту:
                    if is_for_us:
                        logger.info(f"[{vk_id}] Успешно сопоставлен ответ Жабабота (тип {action_type}): {text[:80]}")
                        
                        # Логируем ответ Жабабота с указанием, кому ответили
                        await db.log_action(
                            vk_id, 
                            "game_event", 
                            f"Ответ Жабабота для {acc['name']}: {text}"
                        )
                        
                        # --- Парсинг характеристик и сохранение в SQLite ---
                        parsed_fields = {}
                        
                        if action_type == KnowledgeBase.ACTION_INFO:
                            parsed_fields = parse_toad_info(text)
                            if parsed_fields:
                                # Сохраняем полное состояние в recognition.db.toad_states
                                await db.save_toad_state(vk_id, parsed_fields)
                                # Фильтруем поля для основной таблицы accounts (bot.db) во избежание OperationalError
                                allowed_columns = {
                                    "work_info", "feed_info", "fattening", "dungeon_info", 
                                    "arena_info", "party_info", "marriage_info", "robbery_info", "map_info"
                                }
                                parsed_fields = {k: v for k, v in parsed_fields.items() if k in allowed_columns}
                        elif action_type == KnowledgeBase.ACTION_STATS:
                            # Единый канонический парсер «Моя жаба».
                            # Полное состояние сохраняем в recognition.db.toad_states,
                            # а часть полей (имя, уровень, букашки, класс и т.д.) — в accounts (bot.db).
                            parsed_my_toad_data = parse_my_toad(text)
                            if parsed_my_toad_data:
                                await db.save_toad_state(vk_id, parsed_my_toad_data)
                                parsed_fields = toad_state_to_account_fields(parsed_my_toad_data)
                        elif action_type == KnowledgeBase.ACTION_INVENTORY:
                            parsed_fields = parse_inventory(text)
                            if parsed_fields:
                                await db.save_toad_state(vk_id, parsed_fields)
                                parsed_fields = {}
                        else:
                            # Стандартный парсинг из регулярного выражения Базы Знаний
                            for col, rule in db_updates.items():
                                if "{" in rule:
                                    parsed_fields[col] = rule.format(**groups)
                                else:
                                    parsed_fields[col] = rule
                                        
                        # Сохраняем спарсенные поля в базу данных
                        if parsed_fields:
                            logger.info(f"[{vk_id}] Обновление характеристик в БД: {parsed_fields}")
                            await db.update_account_fields(vk_id, parsed_fields)
                else:
                    # bot_match is None (не распознано)
                    # Проверяем, есть ли в очереди отправленная нами команда (только если сообщение не для чужого ID)
                    if not is_for_someone_else:
                        pending_cmd = pending_manager.match_any_pending_command(vk_id)
                        if pending_cmd:
                            logger.warning(f"[{vk_id}] Получен нераспознанный ответ на нашу команду '{pending_cmd['text']}': {text[:100]}")
                            await db.save_unrecognized_response(vk_id, pending_cmd["text"], text)
                            await db.log_action(
                                vk_id,
                                "warning",
                                f"Нераспознанный ответ Жабабота на команду '{pending_cmd['text']}': {text[:100]}..."
                            )

    @user.on.raw_event(UserEventType.MESSAGE_EDIT, MessageEdit)
    async def handle_message_edit(event: MessageEdit):
        try:
            if await db.is_monitor_mode_enabled():
                acc = await db.get_account(vk_id)
                if not acc:
                    return
                if event.object.peer_id == acc.get("chat_id"):
                    async def process_edit_task():
                        try:
                            message_id = event.object.message_id
                            full_res = await event.ctx_api.messages.get_by_id(message_ids=[message_id])
                            if full_res and full_res.items:
                                full_msg = full_res.items[0]
                                if full_msg.from_id < 0:
                                    btn_text = extract_buttons(full_msg)
                                    msg_text = full_msg.text or ""
                                    if btn_text:
                                        msg_text = f"{msg_text}\n{btn_text}"
                                        
                                    monitor_mgr = pending_manager.client_manager.monitor_manager
                                    await monitor_mgr.process_toadbot_message_edit(
                                        vk_msg_id=message_id,
                                        peer_id=event.object.peer_id,
                                        text=msg_text,
                                        attachments=full_msg.attachments
                                    )
                        except Exception as ex:
                            logger.error(f"Ошибка при обработке редактирования сообщения: {ex}", exc_info=True)
                            
                    import asyncio
                    asyncio.create_task(process_edit_task())
        except Exception as ex:
            logger.error(f"Ошибка в ресивере редактирования сообщения: {ex}", exc_info=True)


