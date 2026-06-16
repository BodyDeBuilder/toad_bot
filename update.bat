@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo =========================================
echo       Утилита синхронизации проекта
echo =========================================
echo 1. Скачать обновления из GitHub
echo 2. Загрузить локальные изменения в GitHub
echo =========================================
set /p action="Выберите действие (1 или 2): "

if "!action!"=="1" goto download_action
if "!action!"=="2" goto upload_action
goto invalid_choice

:download_action
echo.
echo Режимы скачивания:
echo 1. Мягкое обновление (сохраняет локальные изменения)
echo 2. Жесткое обновление (удаляет все локальные изменения и делает как в репозитории)
echo.
set /p mode="Выберите режим (1 или 2): "

if "!mode!"=="" goto invalid_choice
if "!mode!" NEQ "1" if "!mode!" NEQ "2" goto invalid_choice

echo.
echo Синхронизация списка веток...
git fetch --all --prune

echo.
echo Доступные ветки:
set count=0
for /f "tokens=*" %%a in ('git branch -r ^| findstr /v "\->" ^| findstr /v "HEAD"') do (
    set /a count+=1
    set "raw_branch=%%a"
    REM Убираем пробелы
    set "raw_branch=!raw_branch: =!"
    REM Убираем префикс origin/
    set "branch_name=!raw_branch:origin/=!"

    set "branch_!count!=!branch_name!"
    echo !count!. !branch_name!
)

if !count!==0 (
    echo Ветки не найдены.
    pause
    goto :EOF
)

echo.
set /p choice="Введите номер ветки: "

if "!choice!"=="" goto invalid_choice
if !choice! LSS 1 goto invalid_choice
if !choice! GTR !count! goto invalid_choice

set "selected_branch=!branch_%choice%!"

if "!mode!"=="1" goto soft_update
if "!mode!"=="2" goto hard_update

:soft_update
echo.
echo [МЯГКОЕ ОБНОВЛЕНИЕ] Переключение на ветку !selected_branch!...
git checkout !selected_branch!
echo Загрузка обновлений...
git pull origin !selected_branch!
echo Обновление завершено.
pause
goto :EOF

:hard_update
echo.
echo [ВНИМАНИЕ] Все незакоммиченные локальные изменения будут удалены!
set /p confirm="Вы уверены? (Y/N): "
if /I "!confirm!" NEQ "Y" (
    echo Отмена.
    pause
    goto :EOF
)

echo.
echo [ЖЕСТКОЕ ОБНОВЛЕНИЕ] Принудительное переключение на ветку !selected_branch!...
git fetch origin !selected_branch!
git checkout -B !selected_branch! origin/!selected_branch!
git reset --hard origin/!selected_branch!
git clean -fd

echo Жесткое обновление завершено. Файлы идентичны ветке !selected_branch!.
pause
goto :EOF

:upload_action
echo.
echo Синхронизация списка веток...
git fetch --all --prune

echo.
echo В какую ветку загружаем изменения?
echo Доступные ветки:
set count=0
for /f "tokens=*" %%a in ('git branch -r ^| findstr /v "\->" ^| findstr /v "HEAD"') do (
    set /a count+=1
    set "raw_branch=%%a"
    set "raw_branch=!raw_branch: =!"
    set "branch_name=!raw_branch:origin/=!"
    set "branch_!count!=!branch_name!"
    echo !count!. !branch_name!
)

set /p choice="Введите номер ветки: "

if "!choice!"=="" goto invalid_choice
if !choice! LSS 1 goto invalid_choice
if !choice! GTR !count! goto invalid_choice

set "selected_branch=!branch_%choice%!"

echo.
echo [ЗАГРУЗКА] Добавление всех файлов в коммит...
git checkout !selected_branch!
git add .

set /p commit_msg="Введите описание изменений (коммит): "
if "!commit_msg!"=="" set "commit_msg=Auto-update from local script"

git commit -m "!commit_msg!"
git push origin !selected_branch!

echo.
echo Загрузка изменений успешно завершена.
pause
goto :EOF

:invalid_choice
echo Ошибка: неверный выбор.
pause
goto :EOF
