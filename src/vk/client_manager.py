import asyncio
import logging
import random
from typing import Dict, Any, Optional
from vkbottle.user import User
from src.database.db_manager import DBManager

logger = logging.getLogger("toadbot.vk.client_manager")

class ClientManager:
    def __init__(self, db: DBManager):
        self.db = db
        self.clients: Dict[int, User] = {}
        self.tasks: Dict[int, asyncio.Task] = {}
        self.last_sent_times: Dict[int, float] = {}
        self.test_phrase_futures: Dict[int, asyncio.Future] = {}
        self.running_like_tasks = set()
        self.like_tasks_status: Dict[int, Dict[str, Any]] = {}
        from src.vk.pending_manager import PendingManager
        self.pending_manager = PendingManager(self.db, self)
        from src.vk.monitor_manager import MonitorManager
        self.monitor_manager = MonitorManager(self.db)


    async def start_account(self, account: Dict[str, Any]) -> bool:
        """Запуск асинхронного клиента для одного аккаунта"""
        vk_id = account["vk_id"]
        token = account["token"]
        name = account["name"]
        
        if vk_id in self.tasks:
            logger.warning(f"Аккаунт {name} ({vk_id}) уже запущен.")
            return False
            
        logger.info(f"Инициализация клиента для аккаунта {name} ({vk_id})...")
        
        try:
            # Создаем пользователя vkbottle
            user = User(token=token)
            
            # Предотвращаем бесконечный быстрый цикл ретраев vkbottle при критических ошибках API (например, Too many requests)
            user.polling.error_handler.raise_exceptions = True
            
            # Настраиваем логику обработчиков событий для этого конкретного юзера
            from src.vk.handlers import register_handlers
            register_handlers(user, self.db, vk_id, self.pending_manager)
            
            self.clients[vk_id] = user
            
            # Запускаем LongPoll как фоновую задачу asyncio
            async def run_polling_safe():
                try:
                    logger.info(f"Запуск LongPoll для {name} ({vk_id})...")
                    polling = user.polling
                    async for event in polling.listen():
                        for update in event.get("updates", []):
                            asyncio.create_task(user.router.route(update, polling.api))
                except asyncio.CancelledError:
                    logger.info(f"LongPoll для {name} ({vk_id}) остановлен.")
                except Exception as e:
                    # Проверяем, является ли ошибка превышением лимита запросов (Too many requests - VKAPIError code 6)
                    is_rate_limit = False
                    from vkbottle.exception_factory import VKAPIError
                    if isinstance(e, VKAPIError) and e.code == 6:
                        is_rate_limit = True
                        
                    logger.error(f"Ошибка LongPoll для {name} ({vk_id}): {e}", exc_info=True)
                    
                    # Обязательно вычищаем аккаунт из активных диспетчеров для корректного перезапуска
                    self.tasks.pop(vk_id, None)
                    self.clients.pop(vk_id, None)
                    
                    if is_rate_limit:
                        await self.db.update_account_status(vk_id, "offline")
                        await self.db.log_action(
                            vk_id, 
                            "system", 
                            "⚠️ Превышен лимит запросов VK. Бот временно переведен в режим ожидания. Автоматический перезапуск через 15 секунд..."
                        )
                        
                        # Асинхронный отложенный автоматический перезапуск
                        async def delayed_restart():
                            await asyncio.sleep(15)
                            acc_data = await self.db.get_account(vk_id)
                            # Перезапускаем только если аккаунт все еще должен быть запущен (пользователь не отключил его вручную за эти 15 секунд)
                            if acc_data and acc_data.get("is_active") == 1:
                                await self.db.log_action(vk_id, "system", "🔄 Выполняется автоматическая попытка перезапуска бота...")
                                await self.start_account(acc_data)
                                
                        asyncio.create_task(delayed_restart())
                    else:
                        await self.db.log_action(vk_id, "error", f"Ошибка LongPoll: {e}")
                        # Обновляем статус в БД на 'offline' при критической ошибке
                        await self.db.update_account_status(vk_id, "offline")
            
            self.tasks[vk_id] = asyncio.create_task(run_polling_safe())
            await self.db.update_account_status(vk_id, "idle")
            await self.db.log_action(vk_id, "system", "Бот успешно запущен в системе.")
            return True
            
        except Exception as e:
            logger.error(f"Не удалось запустить аккаунт {name} ({vk_id}): {e}", exc_info=True)
            await self.db.log_action(vk_id, "error", f"Ошибка запуска аккаунта: {e}")
            return False

    async def stop_account(self, vk_id: int) -> bool:
        """Остановка клиента для одного аккаунта"""
        if vk_id not in self.tasks:
            return False
            
        task = self.tasks[vk_id]
        logger.info(f"Остановка LongPoll для аккаунта ID {vk_id}...")
        
        # Отменяем задачу asyncio
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
            
        # Удаляем из списков
        self.tasks.pop(vk_id, None)
        self.clients.pop(vk_id, None)
        
        await self.db.update_account_status(vk_id, "offline")
        await self.db.log_action(vk_id, "system", "Бот остановлен пользователем.")
        return True

    async def start_all(self) -> None:
        """Загрузка и запуск всех активных аккаунтов из базы данных"""
        active_accounts = await self.db.get_active_accounts()
        logger.info(f"Запуск {len(active_accounts)} активных аккаунтов...")
        for acc in active_accounts:
            await self.start_account(acc)

    async def stop_all(self) -> None:
        """Остановка всех запущенных аккаунтов"""
        logger.info("Остановка всех активных клиентов...")
        vk_ids = list(self.tasks.keys())
        for vk_id in vk_ids:
            await self.stop_account(vk_id)

    async def send_command(self, vk_id: int, chat_id: int, message: str) -> bool:
        """Отправка сообщения от имени конкретного аккаунта в чат"""
        if vk_id not in self.clients:
            logger.error(f"Не удалось отправить команду: клиент для {vk_id} не найден.")
            return False
            
        import time
        # Проверяем минимальную задержку между командами
        try:
            settings = await self.db.get_global_settings()
            min_delay = settings.get("min_command_delay", 3)
            
            now = time.time()
            last_sent = self.last_sent_times.get(vk_id, 0)
            time_passed = now - last_sent
            if time_passed < min_delay:
                sleep_needed = min_delay - time_passed
                logger.info(f"[{vk_id}] Соблюдаем минимальную задержку между командами. Спим {sleep_needed:.2f} сек.")
                await asyncio.sleep(sleep_needed)
        except Exception as e:
            logger.error(f"Ошибка при расчете минимальной задержки для ID {vk_id}: {e}", exc_info=True)
            
        user = self.clients[vk_id]
        try:
            logger.info(f"[{vk_id}] Отправка команды в чат {chat_id}: '{message}'")
            # Генерируем случайный random_id для VK API
            random_id = random.randint(-2147483648, 2147483647)
            await user.api.messages.send(
                peer_id=chat_id,
                message=message,
                random_id=random_id
            )
            self.last_sent_times[vk_id] = time.time()
            await self.db.log_action(vk_id, "command", f"Отправлена команда: {message}")
            return True
        except Exception as e:
            logger.error(f"Ошибка при отправке команды [{message}] для ID {vk_id}: {e}", exc_info=True)
            await self.db.log_action(vk_id, "error", f"Ошибка отправки команды [{message}]: {e}")
            return False

    async def like_group_posts(self, vk_id: int) -> None:
        """Обход группы vk.com/toadbot и лайкание постов от имени сообщества"""
        if vk_id in self.running_like_tasks:
            logger.warning(f"[{vk_id}] Задача лайков уже запущена.")
            return
            
        self.running_like_tasks.add(vk_id)
        try:
            user = self.clients.get(vk_id)
            if not user:
                logger.error(f"[{vk_id}] Клиент не найден для запуска лайков.")
                await self.db.log_action(vk_id, "error", "Ошибка лайков: клиент не запущен (оффлайн).")
                return
                
            await self.db.log_action(vk_id, "like", "Начат процесс лайкинга постов в сообществе vk.com/toadbot")
            
            # Инициализация статуса прогресса
            self.like_tasks_status[vk_id] = {
                "is_running": True,
                "stage": "collecting",
                "total_posts": 0,
                "collected_posts": 0,
                "to_like_count": 0,
                "liked_count": 0,
                "skipped_count": 0,
                "error": None
            }
            
            all_posts_to_like = []
            offset = 0
            skipped_in_collecting = 0
            
            # Этап 1: Сбор всех постов
            while True:
                response = await user.api.wall.get(
                    domain="toadbot",
                    filter="owner",
                    offset=offset,
                    count=100
                )
                
                # Обновляем общее количество постов в группе (берется из первого ответа VK API)
                self.like_tasks_status[vk_id]["total_posts"] = response.count
                
                if not response.items:
                    break
                    
                for post in response.items:
                    self.like_tasks_status[vk_id]["collected_posts"] += 1
                    
                    # Проверяем, если ли лайк от текущего пользователя
                    if not post.likes.user_likes and post.likes.can_like:
                        all_posts_to_like.append(post)
                    else:
                        skipped_in_collecting += 1
                        
                self.like_tasks_status[vk_id]["skipped_count"] = skipped_in_collecting
                
                if len(response.items) < 100:
                    break
                    
                offset += 100
                await asyncio.sleep(0.35)  # небольшая задержка, чтобы не получить Flood Control при сборе
                
            # Этап 2: Простановка лайков
            self.like_tasks_status[vk_id]["stage"] = "liking"
            self.like_tasks_status[vk_id]["to_like_count"] = len(all_posts_to_like)
            
            for post in all_posts_to_like:
                # Если в процессе клиент был остановлен/удален из менеджера
                if vk_id not in self.clients:
                    self.like_tasks_status[vk_id]["is_running"] = False
                    self.like_tasks_status[vk_id]["error"] = "Клиент отключился."
                    return
                    
                try:
                    await user.api.request(
                        "likes.add",
                        {
                            "type": "post",
                            "owner_id": post.owner_id,
                            "item_id": post.id
                        }
                    )
                    self.like_tasks_status[vk_id]["liked_count"] += 1
                    await self.db.log_action(
                        vk_id, 
                        "like", 
                        f"Лайкнут пост: vk.com/wall{post.owner_id}_{post.id}"
                    )
                    
                    # Задержка 1-2 секунды между лайками по требованию пользователя
                    delay = random.uniform(1.0, 2.0)
                    await asyncio.sleep(delay)
                except Exception as ex:
                    err_str = str(ex)
                    if "Unknown method passed" in err_str:
                        error_msg = "likes.add недоступен для Kate Mobile. Требуется токен VK для Android."
                        self.like_tasks_status[vk_id]["error"] = error_msg
                        await self.db.log_action(
                            vk_id, 
                            "error", 
                            f"Ошибка лайков: {error_msg}"
                        )
                        break
                    else:
                        logger.error(f"[{vk_id}] Ошибка при лайке поста {post.id}: {ex}")
                        await self.db.log_action(
                            vk_id, 
                            "error", 
                            f"Ошибка при лайке поста vk.com/wall{post.owner_id}_{post.id}: {ex}"
                        )
                        # Тоже инкрементируем пропущенные, чтобы не виснуть
                        self.like_tasks_status[vk_id]["skipped_count"] += 1
                        
            # Завершено успешно
            self.like_tasks_status[vk_id]["is_running"] = False
            self.like_tasks_status[vk_id]["stage"] = "completed"
            await self.db.log_action(
                vk_id, 
                "like", 
                f"Процесс лайкинга постов завершен. Лайкнуто новых: {self.like_tasks_status[vk_id]['liked_count']}, пропущено: {self.like_tasks_status[vk_id]['skipped_count']}"
            )
            
        except Exception as e:
            logger.error(f"[{vk_id}] Критическая ошибка в задаче лайков: {e}", exc_info=True)
            if vk_id in self.like_tasks_status:
                self.like_tasks_status[vk_id]["is_running"] = False
                self.like_tasks_status[vk_id]["stage"] = "error"
                self.like_tasks_status[vk_id]["error"] = str(e)
            await self.db.log_action(vk_id, "error", f"Критическая ошибка задачи лайков: {e}")
        finally:
            self.running_like_tasks.discard(vk_id)

