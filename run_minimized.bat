@echo off
:: Если скрипт запущен без специального параметра, перезапускаем его свернутым
if not "%1"=="min" (
    start "" /min "%~f0" min
    exit /b
)

:: Запуск фоновой службы в свернутом окне с принудительной поддержкой UTF-8
cd /d %~dp0
.venv\Scripts\python -X utf8 main.py
pause
