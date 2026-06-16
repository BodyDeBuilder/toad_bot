import asyncio
import logging
import time
from typing import Dict, Any, Optional, List
from src.database.db_manager import DBManager
from src.utils.knowledge_base import KnowledgeBase

logger = logging.getLogger("toadbot.vk.pending_manager")

class PendingManager:
    def __init__(self, db: DBManager, client_manager: Any):
        self.db = db
        self.client_manager = client_manager
        
        # Очередь ожидающих команд в памяти
        # Структура элемента:
        # {
        #     "vk_id": int,
        #     "action_type": str,
        #     "text": str,
        #     "sent_at": float,          # timestamp отправки
        #     "is_collision": bool,      # был ли конфликт в окне ±2 сек
        #     "is_resolved": bool        # получили ли мы подтвержденный ответ
        # }
        self.pending_commands: List[Dict[str, Any]] = []
        
        # Кратковременная история входящих сообщений чата от ВСЕХ людей
        # Структура элемента:
        # {
        #     "timestamp": float,
        #     "sender_id": int,
        #     "text": str
        # }
        self.recent_chat_messages: List[Dict[str, Any]] = []
        
        # Временные блокировки аккаунтов на авто-действия (сдвиг планировщика)
        # vk_id -> timestamp, до которого аккаунт заблокирован
        self.account_locks: Dict[int, float] = {}

    def is_locked(self, vk_id: int) -> bool:
        """Проверяет, заблокирован ли сейчас аккаунт для авто-действий"""
        return time.time() < self.account_locks.get(vk_id, 0)

    def lock_account(self, vk_id: int, duration: float = 15.0):
        """Накладывает временную блокировку на планировщик для аккаунта"""
        self.account_locks[vk_id] = time.time() + duration
        logger.info(f"[{vk_id}] Наложена временная блокировка планировщика на {duration} сек.")

    def record_chat_message(self, sender_id: int, text: str):
        """Записывает любое сообщение чата в историю для отслеживания коллизий"""
        now = time.time()
        self.recent_chat_messages.append({
            "timestamp": now,
            "sender_id": sender_id,
            "text": text.strip().lower()
        })
        
        # Очищаем историю от сообщений старше 15 секунд
        self.recent_chat_messages = [
            msg for msg in self.recent_chat_messages 
            if now - msg["timestamp"] <= 15.0
        ]

    def register_sent_command(self, vk_id: int, text: str):
        """Регистрирует отправленную нами команду и запускает проверку коллизий"""
        action_type = KnowledgeBase.get_command_type(text)
        if not action_type:
            return  # Неизвестная или неинтересная нам команда
            
        now = time.time()
        entry = {
            "vk_id": vk_id,
            "action_type": action_type,
            "text": text,
            "sent_at": now,
            "is_collision": False,
            "is_resolved": False
        }
        
        self.pending_commands.append(entry)
        
        # 1. Проверяем коллизии НАЗАД (-2 секунды)
        # Ищем, отправлял ли кто-то другой такую же команду в чат за последние 2 секунды
        clean_text = text.strip().lower()
        for msg in self.recent_chat_messages:
            if msg["sender_id"] != vk_id and clean_text in msg["text"]:
                if now - msg["timestamp"] <= 2.0:
                    entry["is_collision"] = True
                    logger.warning(f"[{vk_id}] Коллизия (-2 сек)! Обнаружен дубликат команды от другого игрока (ID {msg['sender_id']}): '{msg['text']}'")
                    break
                    
        # 2. Запускаем асинхронную отложенную проверку коллизии ВПЕРЕД (+2 секунды)
        asyncio.create_task(self._check_forward_collision_delayed(entry, clean_text, now))
        
        # 3. Запускаем асинхронную проверку и повторную отправку через 10 секунд (только для критических повторяемых команд)
        if KnowledgeBase.is_critical_action(action_type):
            asyncio.create_task(self._check_retry_after_delay(entry))

    async def _check_forward_collision_delayed(self, entry: Dict[str, Any], clean_text: str, sent_at: float):
        """Отложенная проверка на коллизии вперед (+2 секунды)"""
        await asyncio.sleep(2.05)  # Ждем чуть больше 2 секунд
        
        # Если коллизия уже зафиксирована назад, повторно не проверяем
        if entry["is_collision"]:
            return
            
        # Проверяем, написал ли кто-то дубликат команды в чат в течение 2 секунд ПОСЛЕ нашей отправки
        for msg in self.recent_chat_messages:
            if msg["sender_id"] != entry["vk_id"] and clean_text in msg["text"]:
                if 0 < msg["timestamp"] - sent_at <= 2.0:
                    entry["is_collision"] = True
                    logger.warning(f"[{entry['vk_id']}] Коллизия (+2 сек)! Обнаружен дубликат команды от другого игрока (ID {msg['sender_id']}): '{msg['text']}'")
                    break

    async def _check_retry_after_delay(self, entry: Dict[str, Any], delay: float = 10.0):
        """Проверяет через 10 секунд, была ли коллизия разрешена, и делает повторную отправку при необходимости"""
        await asyncio.sleep(delay)
        
        # Убираем элемент из очереди ожидания в любом случае (время вышло)
        if entry in self.pending_commands:
            self.pending_commands.remove(entry)
            
        # Если была коллизия и мы так и не получили подтвержденный ответ (is_resolved == False):
        if entry["is_collision"] and not entry["is_resolved"]:
            vk_id = entry["vk_id"]
            action_type = entry["action_type"]
            text = entry["text"]
            
            logger.warning(f"[{vk_id}] ⚠️ Зафиксирован неразрешенный конфликт для команды '{text}'. Готовим повторную отправку...")
            
            # Накладываем блокировку на планировщик на 15 секунд, чтобы избежать накладок
            self.lock_account(vk_id, duration=15.0)
            
            # Записываем предупреждение в лог бэкенда и БД
            await self.db.log_action(
                vk_id, 
                "system", 
                f"⚠️ Коллизия при отправке команды '{text}'. Повторяем попытку через 10 секунд..."
            )
            
            # Получаем данные аккаунта для повторной отправки
            acc = await self.db.get_account(vk_id)
            if acc and acc.get("chat_id") and acc.get("is_active") == 1:
                # Повторно шлем команду в чат от имени аккаунта
                success = await self.client_manager.send_command(vk_id, acc["chat_id"], text)
                if success:
                    logger.info(f"[{vk_id}] Успешная повторная отправка команды '{text}' после коллизии.")

    def match_pending_command(self, action_type: str, target_vk_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """
        Ищет подходящую ожидающую команду в очереди по принципу FIFO.
        Если передан target_vk_id (был тег), ищет строго для этого аккаунта.
        """
        # Сначала фильтруем по типу действия
        candidates = [c for c in self.pending_commands if c["action_type"] == action_type]
        
        if not candidates:
            return None
            
        if target_vk_id is not None:
            # Был получен точный тег: ищем команду именно для этого аккаунта
            for c in candidates:
                if c["vk_id"] == target_vk_id:
                    c["is_resolved"] = True
                    self.pending_commands.remove(c)
                    return c
            return None
        else:
            # Тега не было: возвращаем самую старую команду из очереди (FIFO)
            candidates.sort(key=lambda x: x["sent_at"])
            oldest = candidates[0]
            oldest["is_resolved"] = True
            self.pending_commands.remove(oldest)
            return oldest

    def match_any_pending_command(self, vk_id: int) -> Optional[Dict[str, Any]]:
        """
        Ищет и извлекает старейшую ожидающую команду для конкретного аккаунта (FIFO).
        Используется для сопоставления нераспознанных ответов.
        """
        candidates = [c for c in self.pending_commands if c["vk_id"] == vk_id]
        if not candidates:
            return None
        
        candidates.sort(key=lambda x: x["sent_at"])
        oldest = candidates[0]
        if oldest in self.pending_commands:
            self.pending_commands.remove(oldest)
        return oldest
