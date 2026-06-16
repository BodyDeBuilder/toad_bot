FROM python:3.10-slim

# Установка часового пояса по умолчанию (МСК)
ENV TZ=Europe/Moscow
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# Отключение кэширования байткода Python и буферизации вывода
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Копирование зависимостей и установка
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копирование всего исходного кода
COPY . .

# Создание папки для базы данных
RUN mkdir -p data

CMD ["python", "main.py"]
