import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, List
from src.database.db_manager import DBManager

logger = logging.getLogger("toadbot.vk.monitor_manager")

class MonitorManager:
    def __init__(self, db: DBManager):
        self.db = db
        
        # Скользящая история команд пользователей по peer_id
        # peer_id -> список записей команд:
        # {
        #     "player_vk_id": int,
        #     "command_text": str,
        #     "timestamp": datetime # MSK
        # }
        self.recent_commands: Dict[int, List[Dict[str, Any]]] = {}

    def get_largest_photo_url(self, photo: Any) -> Optional[str]:
        if not photo.sizes:
            return None
        sorted_sizes = sorted(
            photo.sizes,
            key=lambda s: (s.width or 0) * (s.height or 0),
            reverse=True
        )
        return sorted_sizes[0].url if sorted_sizes else None

    async def download_and_save_photo(self, photo_url: str, cmd_name: str) -> None:
        try:
            sanitized_name = "".join(c for c in cmd_name if c not in r'\/?:*"<>|').strip()
            if not sanitized_name:
                sanitized_name = "Unknown"
            folder_path = os.path.join("Photos", sanitized_name)
            os.makedirs(folder_path, exist_ok=True)
            
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.get(photo_url, timeout=10.0)
                if resp.status_code == 200:
                    photo_bytes = resp.content
                    import hashlib
                    md5_hash = hashlib.md5(photo_bytes).hexdigest()
                    filename = f"{md5_hash}.jpg"
                    filepath = os.path.join(folder_path, filename)
                    
                    if not os.path.exists(filepath):
                        with open(filepath, "wb") as f:
                            f.write(photo_bytes)
                        logger.info(f"[Monitor Photo] Сохранено фото {filename} для команды '{cmd_name}'")
                    else:
                        logger.debug(f"[Monitor Photo] Фото {filename} для команды '{cmd_name}' уже существует, дубликат пропущен")
        except Exception as e:
            logger.error(f"Ошибка сохранения фото для команды '{cmd_name}': {e}", exc_info=True)

    def record_monitored_command(self, user_id: int, text: str, peer_id: int) -> None:
        """Записывает отслеживаемую команду в скользящее окно с очисткой старых записей"""
        now = datetime.now(timezone(timedelta(hours=3)))
        
        if peer_id not in self.recent_commands:
            self.recent_commands[peer_id] = []
            
        # Добавляем команду в скользящее окно
        self.recent_commands[peer_id].append({
            "player_vk_id": user_id,
            "command_text": text,
            "timestamp": now
        })
        
        # Удаляем команды старше 15 секунд
        self.recent_commands[peer_id] = [
            cmd for cmd in self.recent_commands[peer_id]
            if (now - cmd["timestamp"]).total_seconds() <= 15.0
        ]
        
        logger.debug(f"[Monitor] Зарегистрирована отслеживаемая команда в чате {peer_id} от {user_id}: {text}")

    def find_matching_monitored_command(self, peer_id: int, toadbot_text: str) -> Optional[Dict[str, Any]]:
        """Ищет самую свежую отслеживаемую команду в скользящем окне этого чата"""
        if peer_id not in self.recent_commands or not self.recent_commands[peer_id]:
            return None
            
        now = datetime.now(timezone(timedelta(hours=3)))
        
        # Фильтруем команды по давности не более 15 секунд
        valid_cmds = [
            cmd for cmd in self.recent_commands[peer_id]
            if (now - cmd["timestamp"]).total_seconds() <= 15.0
        ]
        
        if not valid_cmds:
            return None
            
        # Сначала ищем по упоминанию игрока (id{player_vk_id})
        for cmd in reversed(valid_cmds):
            mention_pattern = f"id{cmd['player_vk_id']}"
            if mention_pattern in toadbot_text:
                self.recent_commands[peer_id].remove(cmd)
                return cmd
                
        # Если совпадения по упоминанию нет, берем самую недавнюю команду
        matched_cmd = valid_cmds[-1]
        self.recent_commands[peer_id].remove(matched_cmd)
        return matched_cmd

    async def process_toadbot_message_new(
        self,
        vk_msg_id: int,
        peer_id: int,
        text: str,
        reply_message: Optional[Any] = None,
        fwd_messages: Optional[List[Any]] = None,
        attachments: Optional[List[Any]] = None
    ) -> None:
        """Обрабатывает начальный ответ Жабабота, сопоставляет его с отслеживаемыми командами и сохраняет"""
        matched_cmd_text = None
        player_vk_id = None
        
        # 1. Попытка сопоставить через reply_message или fwd_messages
        ref_msg = None
        if reply_message:
            ref_msg = reply_message
        elif fwd_messages and len(fwd_messages) > 0:
            ref_msg = fwd_messages[0]
            
        if ref_msg and ref_msg.from_id > 0:
            ref_text = ref_msg.text.strip()
            # Проверяем, совпадает ли текст исходного сообщения с одной из отслеживаемых команд
            monitored_cmds = await self.db.get_monitored_commands_list()
            # Исключаем служебные команды из прямого сопоставления
            monitored_cmds_filtered = [c for c in monitored_cmds if c not in ("Неопределенные люди", "Неопределенные жаба")]
            for cmd in monitored_cmds_filtered:
                if ref_text.lower() == cmd.lower():
                    matched_cmd_text = cmd
                    player_vk_id = ref_msg.from_id
                    break
                    
        # 2. Если не сопоставили напрямую, ищем в скользящем окне
        if not matched_cmd_text:
            matched_cmd = self.find_matching_monitored_command(peer_id, text)
            if matched_cmd:
                matched_cmd_text = matched_cmd["command_text"]
                player_vk_id = matched_cmd["player_vk_id"]
                
        # 3. Сохраняем ответ Жабабота
        target_cmd = matched_cmd_text if matched_cmd_text else "Неопределенные жаба"
        if matched_cmd_text:
            logger.info(f"[Monitor Match] Сопоставлен ответ Жабабота на команду '{matched_cmd_text}' в чате {peer_id} для игрока {player_vk_id}")
        else:
            logger.debug(f"[Monitor Match] Не удалось сопоставить сообщение Жабабота в чате {peer_id}, относим к 'Неопределенные жаба'")
            
        await self.db.save_monitored_response_new(target_cmd, vk_msg_id, text, player_vk_id)
        
        # 4. Сохраняем фото, если есть
        if attachments:
            for att in attachments:
                if att.photo:
                    photo_url = self.get_largest_photo_url(att.photo)
                    if photo_url:
                        import asyncio
                        asyncio.create_task(self.download_and_save_photo(photo_url, target_cmd))

    async def process_toadbot_message_edit(
        self,
        vk_msg_id: int,
        peer_id: int,
        text: str,
        attachments: Optional[List[Any]] = None
    ) -> None:
        """Обрабатывает редактирование сообщения Жабабота и сохраняет измененную историю"""
        cmd_name = await self.db.save_monitored_response_edit(vk_msg_id, text)
        if cmd_name and attachments:
            for att in attachments:
                if att.photo:
                    photo_url = self.get_largest_photo_url(att.photo)
                    if photo_url:
                        import asyncio
                        asyncio.create_task(self.download_and_save_photo(photo_url, cmd_name))
