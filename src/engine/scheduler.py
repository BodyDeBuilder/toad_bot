import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from src.database.db_manager import DBManager
from src.vk.client_manager import ClientManager

logger = logging.getLogger("toadbot.engine.scheduler")

class GameScheduler:
    def __init__(self, db: DBManager, client_manager: ClientManager):
        self.db = db
        self.client_manager = client_manager
        self.scheduler = AsyncIOScheduler()
        self._compiled_once = False
        self._first_run = True
        
    def start(self):
        """Запуск планировщика задач"""
        logger.info("Запуск планировщика действий...")
        # Добавляем задачу периодической проверки кулдаунов каждые 60 секунд
        self.scheduler.add_job(self.check_and_dispatch_actions, "interval", seconds=60, id="toad_check_job")
        
        self.scheduler.start()
        
    def stop(self):
        """Остановка планировщика"""
        logger.info("Остановка планировщика...")
        self.scheduler.shutdown()

    async def check_and_dispatch_actions(self):
        """Проверка кулдаунов (автоматические действия временно отключены пользователем)"""
        logger.debug("Проверка планировщика: автоматическая отправка команд отключена.")
        pass
