@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

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
    REM Убираем префикс origin/ чтобы получить локальное имя ветки
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
set /p choice="Введите номер ветки для обновления и переключения: "

if "!choice!"=="" goto invalid
if !choice! LSS 1 goto invalid
if !choice! GTR !count! goto invalid

set "selected_branch=!branch_%choice%!"

echo.
echo Переключение на ветку !selected_branch!...
git checkout !selected_branch!

echo.
echo Загрузка обновлений для !selected_branch!...
git "pull" origin !selected_branch!

echo.
echo Обновление завершено.
pause
goto :EOF

:invalid
echo Неверный выбор.
pause
goto :EOF
