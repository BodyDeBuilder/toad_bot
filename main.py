import asyncio
import logging
import sys
import uvicorn
from config import settings
from src.database.db_manager import DBManager
from src.vk.client_manager import ClientManager
from src.engine.scheduler import GameScheduler
from src.web.server import create_app

def setup_logging():
    """Настройка красивого форматированного вывода логов"""
    from datetime import datetime, timezone, timedelta
    
    def msk_converter(*args):
        import time
        timestamp = args[-1] if args else time.time()
        dt = datetime.fromtimestamp(timestamp, tz=timezone(timedelta(hours=3)))
        return dt.timetuple()
        
    logging.Formatter.converter = msk_converter
    
    log_format = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
        format=log_format,
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )

async def main():
    # Принудительно устанавливаем UTF-8 кодировку для потоков вывода на Windows во избежание UnicodeEncodeError
    if sys.stdout and hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    if sys.stderr and hasattr(sys.stderr, "reconfigure"):
        try:
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass
            
    setup_logging()
    logger = logging.getLogger("toadbot.main")
    
    logger.info("=" * 50)
    logger.info("Запуск VK ToadBot Server...")
    logger.info(f"Уровень логирования: {settings.LOG_LEVEL}")
    logger.info(f"Файл базы данных: {settings.DATABASE_PATH}")
    logger.info("=" * 50)
    
    # 1. Инициализация менеджера базы данных
    db = DBManager(settings.DATABASE_PATH)
    try:
        await db.initialize_db()
    except Exception as e:
        logger.error(f"Критическая ошибка при инициализации базы данных: {e}", exc_info=True)
        sys.exit(1)
        
    # 2. Инициализация диспетчера клиентов VK
    client_manager = ClientManager(db)
    
    # 3. Инициализация планировщика действий
    scheduler = GameScheduler(db, client_manager)
    
    # 4. Создание веб-сервера FastAPI
    app = create_app(db, client_manager)
    app.state.scheduler = scheduler
    
    # 5. Настройка и запуск веб-сервера Uvicorn
    # Мы запускаем Uvicorn программно в этом же цикле событий (event loop)
    web_host = "0.0.0.0" # Позволяет подключаться удаленно по локальному/публичному IP
    web_port = 8000
    
    logger.info(f"Веб-интерфейс запущен на http://localhost:{web_port}")
    logger.info(f"Для удаленного входа используйте: http://<IP_АДРЕС_СЕРВЕРА>:{web_port}")
    
    config = uvicorn.Config(app, host=web_host, port=web_port, log_level="warning")
    server = uvicorn.Server(config)
    
    try:
        # serve() - асинхронный запуск веб-сервера, блокирует текущую корутину до остановки
        await server.serve()
    except asyncio.CancelledError:
        logger.info("Получен сигнал отмены. Завершение работы...")
    except KeyboardInterrupt:
        logger.info("Завершение работы по запросу пользователя...")
    finally:
        logger.info("Веб-сервер остановлен. Завершение работы программы...")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nБот аварийно остановлен пользователем.")
