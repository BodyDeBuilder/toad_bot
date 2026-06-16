import os
from pathlib import Path
from dotenv import load_dotenv

# Загрузка переменных окружения из .env
load_dotenv()

# Базовая папка проекта
BASE_DIR = Path(__file__).resolve().parent.parent

# Уровень логирования
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

# Относительный или абсолютный путь к БД
DATABASE_PATH_RAW = os.getenv("DATABASE_PATH", "data/bot.db")
DATABASE_PATH = Path(DATABASE_PATH_RAW)

# Если путь относительный, делаем его абсолютным относительно корня проекта
if not DATABASE_PATH.is_absolute():
    DATABASE_PATH = BASE_DIR / DATABASE_PATH

# Создаем родительские папки для базы данных, если они отсутствуют
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

# Лимит сетевых попыток VK API
API_RETRY_COUNT = int(os.getenv("API_RETRY_COUNT", "5"))
