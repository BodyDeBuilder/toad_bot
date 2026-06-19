document.addEventListener('DOMContentLoaded', () => {
    // Хранилище состояния в памяти
    let state = {
        accounts: [],
        logs: [],
        lastLogId: 0,
        selectedAccountId: null,  // ID выбранного в данный момент аккаунта
        parsedAccount: null,      // Распарсенный на Шаге 1 аккаунт
        deletingAccountId: null,  // ID удаляемого аккаунта
        activeTab: 'schedule',    // Активная вкладка ('schedule', 'stats', 'logs', 'settings')
        activeSubTab: 'general',  // Активная подвкладка статистики ('general', 'toad', 'family', 'gang', 'arena', 'clan', 'inventory')
        renderedAccountId: null,  // ID последнего отрендеренного аккаунта деталей
        globalSettings: {},       // Глобальные настройки (фора начала, похода и завершения работы)
        monitorHasFailed: false   // Флаг наличия нераспознанных ответов в отладке
    };

    // Хранилище состояния модального окна инициализации
    let sessionInitState = {
        vkId: null,
        name: ""
    };

    // Состояние мониторинга
    let monitorStatsInterval = null;
    let likesPollInterval = null;
    let liveTimersInterval = null;
    let isMonitorActive = false;

    function formatError(err) {
        if (!err) return 'Неизвестная ошибка';
        const detail = err.detail;
        if (!detail) return err.message || 'Произошла ошибка';
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail)) {
            return detail.map(e => {
                const loc = e.loc ? e.loc.join('.') : '';
                return (loc ? loc + ': ' : '') + e.msg;
            }).join(', ');
        }
        if (typeof detail === 'object') return JSON.stringify(detail);
        return String(detail);
    }


    // DOM Элементы
    const accountsListContainer = document.getElementById('accounts-list-container');
    const dashboardDetailsLayout = document.getElementById('dashboard-details-layout');
    const accountsCountBadge = document.getElementById('accounts-count');
    
    // Модальное окно и шаги
    const modalOverlay = document.getElementById('modal-overlay');
    const btnAddAccount = document.getElementById('btn-add-account');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelModal = document.querySelector('.btn-cancel-modal');
    
    const modalStep1 = document.getElementById('modal-step-1');
    const modalStep2 = document.getElementById('modal-step-2');
    const modalLoader = document.getElementById('modal-loader');
    
    // Новые кнопки управления шагами (взамен форм)
    const btnNextStep = document.getElementById('btn-next-step');
    const btnSubmitFinal = document.getElementById('btn-submit-final');
    
    // Шаг 2 Элементы
    const parsedUserName = document.getElementById('parsed-user-name');
    const parsedUserId = document.getElementById('parsed-user-id');
    const accChatSelect = document.getElementById('acc-chat-select');
    const chatAccessWarning = document.getElementById('chat-access-warning');
    const btnBackToStep1 = document.getElementById('btn-back-to-step-1');
    
    // Модальное окно подтверждения удаления аккаунта
    const confirmDeleteModalOverlay = document.getElementById('confirm-delete-modal-overlay');
    const btnCloseDeleteModal = document.getElementById('btn-close-delete-modal');
    const btnCancelDelete = document.getElementById('btn-cancel-delete');
    const btnConfirmDelete = document.getElementById('btn-confirm-delete');
    const deleteAccountName = document.getElementById('delete-account-name');
    const deleteAccountId = document.getElementById('delete-account-id');

    async function fetchGlobalSettings() {
        try {
            const response = await fetch('/api/global/settings');
            if (!response.ok) throw new Error('Ошибка загрузки глобальных настроек');
            state.globalSettings = await response.json();
        } catch (error) {
            console.error('Ошибка fetchGlobalSettings:', error);
        }
    }

    // Инициализация
    function init() {
        fetchGlobalSettings();
        fetchAccounts(true); // Загружаем с принудительным выбором первого аккаунта
        fetchLogs();
        fetchFailedMonitorVariations();
        
        // Запуск интервалов опроса
        setInterval(fetchAccounts, 3000);
        setInterval(fetchLogs, 3000);
        setInterval(fetchFailedMonitorVariations, 3000);
        
        setupEventListeners();
    }

    // Слушатели событий
    function setupEventListeners() {
        // Открытие модального окна
        btnAddAccount.addEventListener('click', () => {
            resetModal();
            modalOverlay.classList.add('active');
        });
        
        // Закрытие модального окна
        btnCloseModal.addEventListener('click', closeModal);
        if (btnCancelModal) {
            btnCancelModal.addEventListener('click', closeModal);
        }
        
        // Кнопка "Назад" во втором шаге
        btnBackToStep1.addEventListener('click', () => {
            modalStep2.classList.add('hidden');
            modalStep1.classList.remove('hidden');
        });
        
        // Клики на кнопки Шага 1 и Шага 2 (вместо submit форм)
        btnNextStep.addEventListener('click', handleParseTokenSubmit);
        btnSubmitFinal.addEventListener('click', handleAddAccountFinalSubmit);
        
        // Закрытие модального окна удаления
        btnCloseDeleteModal.addEventListener('click', closeDeleteModal);
        btnCancelDelete.addEventListener('click', closeDeleteModal);
        btnConfirmDelete.addEventListener('click', handleConfirmDeleteSubmit);
        
        // Листенеры модального окна инициализации (сброса статистики)
        const btnInitYes = document.getElementById('btn-init-yes');
        const btnInitNo = document.getElementById('btn-init-no');
        const btnCloseInitModal = document.getElementById('btn-close-init-modal');

        if (btnInitYes) {
            btnInitYes.addEventListener('click', async () => {
                const targetVkId = sessionInitState.vkId;
                closeInitSessionModal();
                if (targetVkId === 0) {
                    document.querySelectorAll('.sidebar-toggle-btn').forEach(btn => btn.classList.add('pending'));
                    await toggleAllAccountsActive(1, 1);
                } else {
                    const sbItem = document.querySelector(`.sidebar-account-item[data-vkid="${targetVkId}"] .sidebar-toggle-btn`);
                    if (sbItem) sbItem.classList.add('pending');
                    await toggleAccountActive(targetVkId, 1, 1);
                }
            });
        }

        if (btnInitNo) {
            btnInitNo.addEventListener('click', async () => {
                const targetVkId = sessionInitState.vkId;
                closeInitSessionModal();
                if (targetVkId === 0) {
                    document.querySelectorAll('.sidebar-toggle-btn').forEach(btn => btn.classList.add('pending'));
                    await toggleAllAccountsActive(1, 0);
                } else {
                    const sbItem = document.querySelector(`.sidebar-account-item[data-vkid="${targetVkId}"] .sidebar-toggle-btn`);
                    if (sbItem) sbItem.classList.add('pending');
                    await toggleAccountActive(targetVkId, 1, 0);
                }
            });
        }
        
        if (btnCloseInitModal) {
            btnCloseInitModal.addEventListener('click', closeInitSessionModal);
        }

        // Монитор-режим (модальное окно Мониторинга)
        const btnCloseMonitorModal = document.getElementById('btn-close-monitor-modal');
        const btnCloseMonitorFooter = document.getElementById('btn-close-monitor-footer');
        const btnMonitorClearLogs = document.getElementById('btn-monitor-clear-logs');
        const btnMonitorToggleMode = document.getElementById('btn-monitor-toggle-mode');
        const monitorModalOverlay = document.getElementById('monitor-modal-overlay');

        if (btnCloseMonitorModal) {
            btnCloseMonitorModal.addEventListener('click', closeMonitorModal);
        }
        if (btnCloseMonitorFooter) {
            btnCloseMonitorFooter.addEventListener('click', closeMonitorModal);
        }
        if (monitorModalOverlay) {
            monitorModalOverlay.addEventListener('click', (e) => {
                if (e.target === monitorModalOverlay) {
                    closeMonitorModal();
                }
            });
        }
        if (btnMonitorToggleMode) {
            btnMonitorToggleMode.addEventListener('click', handleToggleMonitor);
        }
        if (btnMonitorClearLogs) {
            btnMonitorClearLogs.addEventListener('click', async () => {
                if (!confirm('Вы действительно хотите полностью очистить логи мониторинга и удалить файл отчета Excel?')) {
                    return;
                }
                try {
                    const res = await fetch('/api/debug/monitor/clear', { method: 'POST' });
                    if (res.ok) {
                        showToast('🗑️ Отчет и база данных мониторинга очищены!', 'success');
                        if (monitorModalOverlay && monitorModalOverlay.classList.contains('active')) {
                            fetchAndRenderMonitorVariations();
                        }
                    } else {
                        showToast('❌ Не удалось очистить отчет', 'error');
                    }
                } catch (err) {
                    console.error(err);
                    showToast('❌ Ошибка при очистке', 'error');
                }
            });
        }
        // Вкладки мониторинга / распознавания / отладки / теста
        const btnTabMonitor = document.getElementById('btn-tab-monitor');
        const btnTabRecognition = document.getElementById('btn-tab-recognition');
        const btnTabDebug = document.getElementById('btn-tab-debug');
        const btnTabTest = document.getElementById('btn-tab-test');
        const panelMonitorTab = document.getElementById('panel-monitor-tab');
        const panelRecognitionTab = document.getElementById('panel-recognition-tab');
        const panelDebugTab = document.getElementById('panel-debug-tab');
        const panelTestTab = document.getElementById('panel-test-tab');
        const monitorActionsHeader = document.getElementById('monitor-actions-header');
        const recognitionActionsHeader = document.getElementById('recognition-actions-header');

        if (btnTabMonitor) {
            btnTabMonitor.addEventListener('click', () => {
                btnTabMonitor.classList.add('active');
                if (btnTabRecognition) btnTabRecognition.classList.remove('active');
                if (btnTabDebug) btnTabDebug.classList.remove('active');
                if (btnTabTest) btnTabTest.classList.remove('active');
                btnTabMonitor.style.color = 'var(--color-text-main)';
                if (btnTabRecognition) btnTabRecognition.style.color = 'var(--color-text-muted)';
                if (btnTabDebug) btnTabDebug.style.color = 'var(--color-text-muted)';
                if (btnTabTest) btnTabTest.style.color = 'var(--color-text-muted)';

                if (panelMonitorTab) panelMonitorTab.classList.remove('hidden');
                if (panelRecognitionTab) panelRecognitionTab.classList.add('hidden');
                if (panelDebugTab) panelDebugTab.classList.add('hidden');
                if (panelTestTab) panelTestTab.classList.add('hidden');
                if (monitorActionsHeader) monitorActionsHeader.classList.remove('hidden');
                if (recognitionActionsHeader) recognitionActionsHeader.classList.add('hidden');

                fetchAndRenderMonitorVariations();
            });
        }

        if (btnTabRecognition) {
            btnTabRecognition.addEventListener('click', () => {
                btnTabRecognition.classList.add('active');
                if (btnTabMonitor) btnTabMonitor.classList.remove('active');
                if (btnTabDebug) btnTabDebug.classList.remove('active');
                if (btnTabTest) btnTabTest.classList.remove('active');
                btnTabRecognition.style.color = 'var(--color-text-main)';
                if (btnTabMonitor) btnTabMonitor.style.color = 'var(--color-text-muted)';
                if (btnTabDebug) btnTabDebug.style.color = 'var(--color-text-muted)';
                if (btnTabTest) btnTabTest.style.color = 'var(--color-text-muted)';

                if (panelMonitorTab) panelMonitorTab.classList.add('hidden');
                if (panelRecognitionTab) panelRecognitionTab.classList.remove('hidden');
                if (panelDebugTab) panelDebugTab.classList.add('hidden');
                if (panelTestTab) panelTestTab.classList.add('hidden');
                if (monitorActionsHeader) monitorActionsHeader.classList.add('hidden');
                if (recognitionActionsHeader) recognitionActionsHeader.classList.remove('hidden');

                fetchAndRenderRecognitionRules();
            });
        }

        if (btnTabDebug) {
            btnTabDebug.addEventListener('click', () => {
                btnTabDebug.classList.add('active');
                if (btnTabMonitor) btnTabMonitor.classList.remove('active');
                if (btnTabRecognition) btnTabRecognition.classList.remove('active');
                if (btnTabTest) btnTabTest.classList.remove('active');
                btnTabDebug.style.color = 'var(--color-text-main)';
                if (btnTabMonitor) btnTabMonitor.style.color = 'var(--color-text-muted)';
                if (btnTabRecognition) btnTabRecognition.style.color = 'var(--color-text-muted)';
                if (btnTabTest) btnTabTest.style.color = 'var(--color-text-muted)';

                if (panelMonitorTab) panelMonitorTab.classList.add('hidden');
                if (panelRecognitionTab) panelRecognitionTab.classList.add('hidden');
                if (panelDebugTab) panelDebugTab.classList.remove('hidden');
                if (panelTestTab) panelTestTab.classList.add('hidden');
                if (monitorActionsHeader) monitorActionsHeader.classList.add('hidden');
                if (recognitionActionsHeader) recognitionActionsHeader.classList.add('hidden');

                fetchAndRenderDebugUnrecognized();
            });
        }

        if (btnTabTest) {
            btnTabTest.addEventListener('click', () => {
                btnTabTest.classList.add('active');
                if (btnTabMonitor) btnTabMonitor.classList.remove('active');
                if (btnTabRecognition) btnTabRecognition.classList.remove('active');
                if (btnTabDebug) btnTabDebug.classList.remove('active');
                btnTabTest.style.color = 'var(--color-text-main)';
                if (btnTabMonitor) btnTabMonitor.style.color = 'var(--color-text-muted)';
                if (btnTabRecognition) btnTabRecognition.style.color = 'var(--color-text-muted)';
                if (btnTabDebug) btnTabDebug.style.color = 'var(--color-text-muted)';

                if (panelMonitorTab) panelMonitorTab.classList.add('hidden');
                if (panelRecognitionTab) panelRecognitionTab.classList.add('hidden');
                if (panelDebugTab) panelDebugTab.classList.add('hidden');
                if (panelTestTab) panelTestTab.classList.remove('hidden');
                if (monitorActionsHeader) monitorActionsHeader.classList.add('hidden');
                if (recognitionActionsHeader) recognitionActionsHeader.classList.add('hidden');

                initTestTab();
            });
        }

        // Обработчик "Добавить команду" во вкладке распознавания
        const btnShowAddRecognition = document.getElementById('btn-show-add-recognition');
        if (btnShowAddRecognition) {
            btnShowAddRecognition.addEventListener('click', async (e) => {
                e.stopPropagation();
                const dropdown = document.getElementById('add-recognition-dropdown-list');
                if (!dropdown) return;
                
                const isCurrentlyHidden = dropdown.style.display === 'none' || !dropdown.style.display;
                if (!isCurrentlyHidden) {
                    dropdown.style.display = 'none';
                    return;
                }
                
                dropdown.innerHTML = `
                    <div style="padding: 8px 12px; color: var(--color-text-muted); font-size: 11px; text-align: center;">
                        <div class="spinner" style="width: 12px; height: 12px; border-width: 1px; display: inline-block; margin-right: 4px;"></div> Загрузка...
                    </div>
                `;
                dropdown.style.display = 'block';
                
                try {
                    const res = await fetch('/api/monitor/commands');
                    if (!res.ok) throw new Error();
                    const commands = await res.json();
                    
                    const available = commands.filter(cmd => cmd.in_recognition === 0);
                    if (available.length === 0) {
                        dropdown.innerHTML = `
                            <div style="padding: 8px 12px; color: var(--color-text-muted); font-size: 11px; text-align: center; font-style: italic;">
                                Все команды уже добавлены
                            </div>
                        `;
                        return;
                    }
                    
                    let html = '';
                    available.forEach(cmd => {
                        html += `
                            <div class="dropdown-item-rec" style="padding: 8px 12px; cursor: pointer; color: var(--color-text-main); font-size: 12px; transition: background 0.2s;" onmouseover="this.style.background='var(--color-bg-light)'" onmouseout="this.style.background='transparent'" data-id="${cmd.id}">
                                ${escapeHtml(cmd.command)}
                            </div>
                        `;
                    });
                    dropdown.innerHTML = html;
                    
                    // Клики по элементам дропдауна
                    dropdown.querySelectorAll('.dropdown-item-rec').forEach(item => {
                        item.addEventListener('click', async () => {
                            const cmdId = item.getAttribute('data-id');
                            dropdown.style.display = 'none';
                            try {
                                const postRes = await fetch(`/api/monitor/commands/${cmdId}/recognition/toggle`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ in_recognition: 1 })
                                });
                                if (postRes.ok) {
                                    showToast('Команда добавлена в распознавание', 'success');
                                    await fetchAndRenderRecognitionRules();
                                } else {
                                    const err = await postRes.json();
                                    showToast('Ошибка: ' + formatError(err), 'error');
                                }
                            } catch (err) {
                                console.error(err);
                                showToast('❌ Ошибка сети', 'error');
                            }
                        });
                    });
                    
                } catch (err) {
                    console.error(err);
                    dropdown.innerHTML = `
                        <div style="padding: 8px 12px; color: var(--color-danger); font-size: 11px; text-align: center;">
                            Ошибка загрузки
                        </div>
                    `;
                }
            });
        }

        // Закрытие дропдауна кликом вовне
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('add-recognition-dropdown-list');
            const btn = document.getElementById('btn-show-add-recognition');
            if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });

        // Показ/скрытие поля добавления команды и отправка на сервер
        const btnShowAddCommand = document.getElementById('btn-show-add-command');
        const addCommandInputWrapper = document.getElementById('add-command-input-wrapper');
        const inputNewCommand = document.getElementById('input-new-command');
        const btnSubmitNewCommand = document.getElementById('btn-submit-new-command');
        const btnCancelNewCommand = document.getElementById('btn-cancel-new-command');

        const btnImportCommands = document.getElementById('btn-import-commands');
        const inputImportCommandsFile = document.getElementById('input-import-commands-file');

        if (btnShowAddCommand) {
            btnShowAddCommand.addEventListener('click', () => {
                btnShowAddCommand.style.display = 'none';
                if (btnImportCommands) btnImportCommands.style.display = 'none';
                addCommandInputWrapper.style.display = 'flex';
                inputNewCommand.value = '';
                inputNewCommand.focus();
            });
        }

        if (btnCancelNewCommand) {
            btnCancelNewCommand.addEventListener('click', () => {
                addCommandInputWrapper.style.display = 'none';
                btnShowAddCommand.style.display = 'flex';
                if (btnImportCommands) btnImportCommands.style.display = 'flex';
            });
        }

        if (btnSubmitNewCommand) {
            btnSubmitNewCommand.addEventListener('click', async () => {
                const cmd = inputNewCommand.value.trim();
                if (!cmd) {
                    showToast('⚠️ Введите команду', 'error');
                    return;
                }
                try {
                    const res = await fetch('/api/monitor/commands', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ command: cmd })
                    });
                    if (res.ok) {
                        showToast(`Команда "${cmd}" добавлена`, 'success');
                        addCommandInputWrapper.style.display = 'none';
                        btnShowAddCommand.style.display = 'flex';
                        if (btnImportCommands) btnImportCommands.style.display = 'flex';
                        fetchAndRenderMonitorVariations();
                    } else {
                        const err = await res.json();
                        showToast('Ошибка: ' + formatError(err), 'error');
                    }
                } catch (err) {
                    console.error(err);
                    showToast('❌ Ошибка сети', 'error');
                }
            });
        }

        if (btnImportCommands && inputImportCommandsFile) {
            btnImportCommands.addEventListener('click', () => {
                inputImportCommandsFile.value = '';
                inputImportCommandsFile.click();
            });

            inputImportCommandsFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (event) => {
                    const text = event.target.result;
                    const commands = text.split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0);

                    if (commands.length === 0) {
                        showToast('⚠️ Выбранный файл не содержит команд', 'error');
                        return;
                    }

                    try {
                        const res = await fetch('/api/monitor/commands/import', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ commands: commands })
                        });

                        if (res.ok) {
                            const data = await res.json();
                            showToast(data.message || `Импортировано команд: ${commands.length}`, 'success');
                            fetchAndRenderMonitorVariations();
                        } else {
                            const err = await res.json();
                            showToast('Ошибка импорта: ' + formatError(err), 'error');
                        }
                    } catch (err) {
                        console.error(err);
                        showToast('❌ Ошибка сети при импорте списка команд', 'error');
                    }
                };
                reader.readAsText(file);
            });
        }

        // Экспорт в Excel
        const btnMonitorExportExcel = document.getElementById('btn-monitor-export-excel');
        if (btnMonitorExportExcel) {
            btnMonitorExportExcel.addEventListener('click', async () => {
                try {
                    const res = await fetch('/api/monitor/download');
                    if (res.ok) {
                        const blob = await res.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'monitor_report.xlsx';
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(url);
                        showToast('📊 Отчет Excel успешно загружен', 'success');
                    } else {
                        const err = await res.json();
                        showToast('Ошибка экспорта: ' + formatError(err), 'error');
                    }
                } catch (err) {
                    console.error(err);
                    showToast('❌ Ошибка сети при экспорте в Excel', 'error');
                }
            });
        }

        // Свернуть все
        const btnMonitorCollapseAll = document.getElementById('btn-monitor-collapse-all');
        if (btnMonitorCollapseAll) {
            btnMonitorCollapseAll.addEventListener('click', () => {
                const container = document.getElementById('monitor-table-container');
                if (!container) return;
                
                // Находим все раскрытые строки и убираем класс expanded
                container.querySelectorAll('.command-parent-row.expanded').forEach(row => {
                    row.classList.remove('expanded');
                });
                
                // Скрываем все дочерние строки
                container.querySelectorAll('.command-child-row').forEach(row => {
                    row.classList.add('hidden');
                });
            });
        }

        // Всплывающая подсказка и копирование для регулярных выражений (data-regex)
        document.addEventListener('mouseover', (e) => {
            const badge = e.target.closest('.kb-regex-badge-compact');
            if (!badge) return;

            const regexText = badge.getAttribute('data-regex') || badge.textContent;
            
            // Получаем или создаем элемент всплывающей подсказки
            let tooltip = document.getElementById('kb-global-tooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.id = 'kb-global-tooltip';
                tooltip.className = 'kb-floating-tooltip';
                document.body.appendChild(tooltip);
            }
            
            tooltip.textContent = regexText;
            tooltip.classList.add('active');
            
            const updatePosition = (event) => {
                const x = event.clientX + 12;
                const y = event.clientY + 12;
                
                // Корректируем, чтобы подсказка не улетала за экран
                const rect = tooltip.getBoundingClientRect();
                let left = x;
                let top = y;
                if (x + rect.width > window.innerWidth - 10) {
                    left = event.clientX - rect.width - 12;
                }
                if (y + rect.height > window.innerHeight - 10) {
                    top = event.clientY - rect.height - 12;
                }
                
                tooltip.style.left = `${left}px`;
                tooltip.style.top = `${top}px`;
            };
            
            updatePosition(e);
            
            const onMouseMove = (moveEvent) => {
                updatePosition(moveEvent);
            };
            
            const onMouseLeave = () => {
                tooltip.classList.remove('active');
                badge.removeEventListener('mousemove', onMouseMove);
                badge.removeEventListener('mouseleave', onMouseLeave);
            };
            
            badge.addEventListener('mousemove', onMouseMove);
            badge.addEventListener('mouseleave', onMouseLeave);
        });

        // Клик по бейджу копирует регулярное выражение в буфер обмена
        document.addEventListener('click', (e) => {
            const badge = e.target.closest('.kb-regex-badge-compact');
            if (!badge) return;
            
            const regexText = badge.getAttribute('data-regex') || badge.textContent;
            navigator.clipboard.writeText(regexText).then(() => {
                showToast('Регулярное выражение скопировано!', 'success');
            }).catch(() => {
                // Альтернативный метод копирования
                const textarea = document.createElement('textarea');
                textarea.value = regexText;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                    showToast('Регулярное выражение скопировано!', 'success');
                } catch (err) {
                    console.error('Ошибка копирования:', err);
                }
                document.body.removeChild(textarea);
            });
        });
    }

    // Сброс окон добавления
    function resetModal() {
        document.getElementById('acc-token-url').value = '';
        document.getElementById('acc-is-prime').checked = false;
        modalStep1.classList.remove('hidden');
        modalStep2.classList.add('hidden');
        modalLoader.classList.add('hidden');
        accChatSelect.innerHTML = '<option value="">-- Выберите чат из списка последних --</option>';
        chatAccessWarning.classList.add('hidden');
        state.parsedAccount = null;
    }

    function closeModal() {
        modalOverlay.classList.remove('active');
        setTimeout(resetModal, 300);
    }

    function closeDeleteModal() {
        confirmDeleteModalOverlay.classList.remove('active');
        state.deletingAccountId = null;
    }

    function showInitSessionModal(vkId, name) {
        sessionInitState.vkId = vkId;
        sessionInitState.name = name;
        
        const initAccountName = document.getElementById('init-account-name');
        if (initAccountName) {
            initAccountName.textContent = name;
        }
        
        const modal = document.getElementById('init-session-modal-overlay');
        if (modal) {
            modal.classList.add('active');
        }
    }

    function closeInitSessionModal() {
        const modal = document.getElementById('init-session-modal-overlay');
        if (modal) {
            modal.classList.remove('active');
        }
        sessionInitState.vkId = null;
        sessionInitState.name = "";
        // Снимаем оранжевую подсветку со всех кнопок переключения в сайдбаре при закрытии/отмене
        document.querySelectorAll('.sidebar-toggle-btn').forEach(btn => btn.classList.remove('pending'));
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function fetchFailedMonitorVariations() {
        try {
            const response = await fetch('/api/monitor/debug/unrecognized');
            if (!response.ok) return;
            const data = await response.json();
            
            state.monitorHasFailed = (data.length > 0);
            
            const btnOpenMonitor = document.getElementById('btn-open-monitor');
            if (btnOpenMonitor) {
                if (state.monitorHasFailed) {
                    btnOpenMonitor.classList.add('has-failed');
                } else {
                    btnOpenMonitor.classList.remove('has-failed');
                }
            }
        } catch (err) {
            console.error('Ошибка fetchFailedMonitorVariations:', err);
        }
    }

    // --- Логика Монитор-режима ---
    async function syncMonitorStatus() {
        try {
            const res = await fetch('/api/monitor/status');
            if (res.ok) {
                const data = await res.json();
                isMonitorActive = data.enabled;
                updateMonitorUI(isMonitorActive);
            }
        } catch (err) {
            console.error('Ошибка получения статуса монитора:', err);
        }
    }

    function updateMonitorUI(enabled) {
        const btnToggle = document.getElementById('btn-monitor-toggle-mode');
        if (!btnToggle) return;
        
        const dot = btnToggle.querySelector('.dot');
        const text = btnToggle.querySelector('.text');
        
        if (enabled) {
            btnToggle.classList.add('active');
            if (text) text.innerText = 'Монитор: ВКЛ';
        } else {
            btnToggle.classList.remove('active');
            if (text) text.innerText = 'Монитор: ВЫКЛ';
        }
    }

    async function handleToggleMonitor() {
        const nextState = !isMonitorActive;
        
        // 1. Оптимистичное обновление UI для мгновенной реакции на клик
        isMonitorActive = nextState;
        updateMonitorUI(isMonitorActive);
        
        try {
            const res = await fetch('/api/monitor/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: nextState })
            });
            if (res.ok) {
                const data = await res.json();
                // 2. Синхронизируем с реальным ответом сервера
                isMonitorActive = data.enabled;
                updateMonitorUI(isMonitorActive);
                showToast(isMonitorActive ? '🟢 Монитор-режим успешно включен!' : '🔴 Монитор-режим выключен.', 'info');
                
                // Сразу обновляем статистику
                fetchMonitorStats();
            } else {
                throw new Error('Ошибка сервера');
            }
        } catch (err) {
            console.error('Ошибка переключения монитора:', err);
            // 3. Откатываем UI назад при сбое
            isMonitorActive = !nextState;
            updateMonitorUI(isMonitorActive);
            showToast('❌ Ошибка при переключении режима монитора', 'error');
        }
    }

    async function fetchMonitorStats() {
        try {
            const res = await fetch('/api/monitor/stats');
            if (res.ok) {
                const stats = await res.json();
                const successEl = document.getElementById('monitor-success-cnt');
                const errorEl = document.getElementById('monitor-error-cnt');
                if (successEl) successEl.innerText = stats.success;
                if (errorEl) errorEl.innerText = stats.error;
            }
        } catch (err) {
            console.error('Ошибка загрузки статистики монитора:', err);
        }
    }

    function showLikesProgressModal(vkId) {
        const modalOverlay = document.getElementById('likes-progress-modal-overlay');
        const btnClose = document.getElementById('btn-close-likes-modal');
        const btnCloseFooter = document.getElementById('btn-close-likes-footer');
        
        // Сброс полей модалки
        document.getElementById('likes-step-1-status').textContent = 'Ожидание...';
        document.getElementById('likes-step-1-status').className = 'step-status';
        document.getElementById('likes-step-2-status').textContent = 'Ожидание...';
        document.getElementById('likes-step-2-status').className = 'step-status';
        document.getElementById('likes-total-posts').textContent = '0';
        document.getElementById('likes-collected-posts').textContent = '0';
        document.getElementById('likes-to-like-count').textContent = '0';
        document.getElementById('likes-liked-count').textContent = '0';
        document.getElementById('likes-skipped-count').textContent = '0';
        document.getElementById('likes-step-1-progress').style.width = '0%';
        document.getElementById('likes-step-2-progress').style.width = '0%';
        
        const errorBox = document.getElementById('likes-error-box');
        errorBox.classList.add('hidden');
        
        modalOverlay.classList.add('active');
        
        const closeLikesModal = () => {
            modalOverlay.classList.remove('active');
            if (likesPollInterval) {
                clearInterval(likesPollInterval);
                likesPollInterval = null;
            }
        };
        
        btnClose.onclick = closeLikesModal;
        btnCloseFooter.onclick = closeLikesModal;
        
        // Опрос статуса
        const pollStatus = async () => {
            try {
                const res = await fetch(`/api/accounts/${vkId}/like_status`);
                if (!res.ok) throw new Error('Не удалось получить статус задачи');
                const status = await res.json();
                
                // Обновление значений 1 этапа
                document.getElementById('likes-total-posts').textContent = status.total_posts;
                document.getElementById('likes-collected-posts').textContent = status.collected_posts;
                
                // Обновление значений 2 этапа
                document.getElementById('likes-to-like-count').textContent = status.to_like_count;
                document.getElementById('likes-liked-count').textContent = status.liked_count;
                document.getElementById('likes-skipped-count').textContent = status.skipped_count;
                
                // Расчет прогресс-баров
                if (status.total_posts > 0) {
                    const pct1 = Math.min(100, Math.round((status.collected_posts / status.total_posts) * 100));
                    document.getElementById('likes-step-1-progress').style.width = `${pct1}%`;
                }
                if (status.to_like_count > 0) {
                    const pct2 = Math.min(100, Math.round((status.liked_count / status.to_like_count) * 100));
                    document.getElementById('likes-step-2-progress').style.width = `${pct2}%`;
                } else if (status.stage === 'completed') {
                    document.getElementById('likes-step-2-progress').style.width = '100%';
                }
                
                // Обновление статусов этапов
                if (status.stage === 'collecting') {
                    document.getElementById('likes-step-1-status').textContent = 'Выполняется...';
                    document.getElementById('likes-step-1-status').className = 'step-status warning';
                } else if (status.stage === 'liking') {
                    document.getElementById('likes-step-1-status').textContent = 'Готово';
                    document.getElementById('likes-step-1-status').className = 'step-status success';
                    document.getElementById('likes-step-1-progress').style.width = '100%';
                    
                    document.getElementById('likes-step-2-status').textContent = 'Выполняется...';
                    document.getElementById('likes-step-2-status').className = 'step-status warning';
                } else if (status.stage === 'completed') {
                    document.getElementById('likes-step-1-status').textContent = 'Готово';
                    document.getElementById('likes-step-1-status').className = 'step-status success';
                    document.getElementById('likes-step-1-progress').style.width = '100%';
                    
                    document.getElementById('likes-step-2-status').textContent = 'Готово';
                    document.getElementById('likes-step-2-status').className = 'step-status success';
                    document.getElementById('likes-step-2-progress').style.width = '100%';
                    
                    // Останавливаем поллинг при успешном завершении
                    clearInterval(likesPollInterval);
                    likesPollInterval = null;
                } else if (status.stage === 'error') {
                    document.getElementById('likes-step-1-status').textContent = 'Ошибка';
                    document.getElementById('likes-step-1-status').className = 'step-status danger';
                    
                    document.getElementById('likes-step-2-status').textContent = 'Ошибка';
                    document.getElementById('likes-step-2-status').className = 'step-status danger';
                    
                    document.getElementById('likes-error-msg').textContent = status.error || 'Неизвестная ошибка';
                    errorBox.classList.remove('hidden');
                    
                    clearInterval(likesPollInterval);
                    likesPollInterval = null;
                }
                
                if (status.error) {
                    document.getElementById('likes-error-msg').textContent = status.error;
                    errorBox.classList.remove('hidden');
                }
                
            } catch (err) {
                console.error('Ошибка поллинга статуса лайков:', err);
            }
        };
        
        pollStatus();
        likesPollInterval = setInterval(pollStatus, 1000);
    }


    async function showMonitorModal() {
        const modal = document.getElementById('monitor-modal-overlay');
        if (modal) {
            modal.classList.add('active');
        }
        
        // Сброс активной вкладки на Мониторинг при открытии
        const btnTabMonitor = document.getElementById('btn-tab-monitor');
        const btnTabRecognition = document.getElementById('btn-tab-recognition');
        const btnTabDebug = document.getElementById('btn-tab-debug');
        const btnTabTest = document.getElementById('btn-tab-test');
        const panelMonitorTab = document.getElementById('panel-monitor-tab');
        const panelRecognitionTab = document.getElementById('panel-recognition-tab');
        const panelDebugTab = document.getElementById('panel-debug-tab');
        const panelTestTab = document.getElementById('panel-test-tab');
        const monitorActionsHeader = document.getElementById('monitor-actions-header');
        const recognitionActionsHeader = document.getElementById('recognition-actions-header');
        
        if (btnTabMonitor && btnTabRecognition && btnTabDebug && btnTabTest) {
            btnTabMonitor.classList.add('active');
            btnTabRecognition.classList.remove('active');
            btnTabDebug.classList.remove('active');
            btnTabTest.classList.remove('active');
            btnTabMonitor.style.color = 'var(--color-text-main)';
            btnTabRecognition.style.color = 'var(--color-text-muted)';
            btnTabDebug.style.color = 'var(--color-text-muted)';
            btnTabTest.style.color = 'var(--color-text-muted)';
        }
        if (panelMonitorTab) panelMonitorTab.classList.remove('hidden');
        if (panelRecognitionTab) panelRecognitionTab.classList.add('hidden');
        if (panelDebugTab) panelDebugTab.classList.add('hidden');
        if (panelTestTab) panelTestTab.classList.add('hidden');
        if (monitorActionsHeader) monitorActionsHeader.classList.remove('hidden');
        if (recognitionActionsHeader) recognitionActionsHeader.classList.add('hidden');

        await syncMonitorStatus();
        await fetchAndRenderMonitorVariations();
    }

    function closeMonitorModal() {
        const modal = document.getElementById('monitor-modal-overlay');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    async function fetchAndRenderMonitorVariations() {
        const container = document.getElementById('monitor-table-container');
        if (!container) return;

        container.innerHTML = `
            <div class="loading-placeholder">
                <div class="spinner"></div>
                <p>Загрузка данных мониторинга...</p>
            </div>
        `;

        try {
            const response = await fetch('/api/monitor/commands');
            if (!response.ok) throw new Error('Не удалось загрузить данные мониторинга');
            const commands = await response.json();

            let html = `
                <div style="overflow-x: auto; width: 100%; height: 100%;">
                    <table class="monitor-table">
                        <thead>
                            <tr>
                                <th style="width: 50px; text-align: center;"></th>
                                <th style="width: 220px; text-align: left;">Команда</th>
                                <th style="text-align: left;">Текст ответа</th>
                                <th style="width: 180px; text-align: center;">Дата</th>
                                <th style="width: 100px; text-align: center;">Совпадений</th>
                                <th style="width: 120px; text-align: center;">Действия</th>
                                <th style="width: 150px; text-align: center;">Распознавание</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            if (!commands || commands.length === 0) {
                html += `
                    <tr class="empty-row">
                        <td colspan="7" style="text-align: center; color: var(--color-text-muted); padding: 32px; font-style: italic;">
                            Список отслеживаемых команд пуст. Добавьте команды с помощью кнопки выше.
                        </td>
                    </tr>
                `;
            } else {
                commands.forEach(cmd => {
                    const variations = cmd.variations || [];
                    const totalMatches = variations.reduce((sum, v) => sum + (v.match_count || 0), 0);

                    const commandTextHtml = cmd.in_recognition === 1 
                        ? `<span style="background: rgba(46, 125, 50, 0.2); border: 1px solid rgba(46, 125, 50, 0.4); color: #81c784; padding: 2px 8px; border-radius: 6px; display: inline-block;">${escapeHtml(cmd.command)}</span>`
                        : escapeHtml(cmd.command);

                    html += `
                        <tr class="command-parent-row" data-command-id="${cmd.id}">
                            <td style="text-align: center; cursor: pointer;" class="toggle-expand-btn">
                                <span class="expand-icon">▶</span>
                            </td>
                            <td style="font-weight: 600; color: var(--color-primary-hover); cursor: pointer;" class="toggle-expand-btn">
                                ${commandTextHtml}
                            </td>
                            <td style="color: var(--color-text-muted); font-style: italic; cursor: pointer;" class="toggle-expand-btn">
                                ${variations.length > 0 ? `Вариантов ответов: ${variations.length}` : 'Варианты ответов отсутствуют'}
                            </td>
                            <td></td>
                            <td style="text-align: center; font-weight: 600; color: var(--color-text-main);">
                                ${totalMatches}
                            </td>
                            <td style="text-align: center;">
                                <button class="btn danger small delete-command-btn" data-id="${cmd.id}" style="padding: 4px 10px; font-size: 11px; margin: 0; background-color: var(--color-danger); border-color: var(--color-danger); color: #fff; cursor: pointer; border-radius: 6px;">
                                    Удалить
                                </button>
                            </td>
                            <td></td>
                        </tr>
                    `;

                    if (variations.length === 0) {
                        html += `
                            <tr class="command-child-row hidden" data-parent-id="${cmd.id}">
                                <td></td>
                                <td colspan="6" style="text-align: left; color: var(--color-text-muted); padding: 10px 16px; font-style: italic;">
                                    Пока нет сохраненных ответов от Жабабота для этой команды.
                                </td>
                            </tr>
                        `;
                    } else {
                        variations.forEach((v, idx) => {
                            html += `
                                <tr class="command-child-row hidden" data-parent-id="${cmd.id}">
                                    <td></td>
                                    <td style="padding-left: 20px;"><span class="badge badge-variant">Вариант ${idx + 1}</span></td>
                                    <td class="code-font" style="color: var(--color-text-main);">${escapeHtml(v.response_text)}</td>
                                    <td style="text-align: center; color: var(--color-text-muted); font-size: 12px;">${v.last_mention_at ? escapeHtml(v.last_mention_at) : '—'}</td>
                                    <td style="text-align: center; font-weight: 600; color: var(--color-success);">${v.match_count}</td>
                                    <td style="text-align: center;">
                                        <button class="btn danger small delete-variation-btn" data-id="${v.id}" style="padding: 4px 10px; font-size: 11px; margin: 0; background-color: var(--color-danger); border-color: var(--color-danger); color: #fff; cursor: pointer; border-radius: 6px;">
                                            Удалить
                                        </button>
                                    </td>
                                    <td style="text-align: center;">
                                        <span class="status-badge ${v.recognition_status === 'Да' ? 'status-yes' : v.recognition_status === 'Нет' ? 'status-no' : 'status-unknown'}">
                                            ${escapeHtml(v.recognition_status || 'Не распознаем')}
                                        </span>
                                    </td>
                                </tr>
                            `;
                        });
                    }
                });
            }

            html += `
                        </tbody>
                    </table>
                </div>
            `;
            container.innerHTML = html;

            // Навешиваем обработчики клика для раскрытия/скрытия
            container.querySelectorAll('.toggle-expand-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if (e.target.closest('.delete-command-btn') || e.target.closest('.delete-variation-btn') || e.target.closest('.recognition-status-select')) return;
                    
                    const parentRow = e.target.closest('.command-parent-row');
                    const cmdId = parentRow.getAttribute('data-command-id');
                    const isExpanded = parentRow.classList.toggle('expanded');
                    const icon = parentRow.querySelector('.expand-icon');
                    if (icon) {
                        icon.innerHTML = isExpanded ? '▼' : '▶';
                    }
                    
                    container.querySelectorAll(`.command-child-row[data-parent-id="${cmdId}"]`).forEach(childRow => {
                        if (isExpanded) {
                            childRow.classList.remove('hidden');
                        } else {
                            childRow.classList.add('hidden');
                        }
                    });
                });
            });


            // Навешиваем обработчики для кнопок удаления команд
            container.querySelectorAll('.delete-command-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const cmdId = btn.getAttribute('data-id');
                    if (!confirm('Вы действительно хотите удалить эту команду и все её накопленные ответы?')) return;
                    
                    try {
                        const res = await fetch(`/api/monitor/commands/${cmdId}`, {
                            method: 'DELETE'
                        });
                        if (res.ok) {
                            showToast('Команда удалена', 'success');
                            await fetchAndRenderMonitorVariations();
                        } else {
                            const err = await res.json();
                            showToast('Ошибка: ' + formatError(err), 'error');
                        }
                    } catch (err) {
                        console.error(err);
                        showToast('❌ Ошибка сети при удалении команды', 'error');
                    }
                });
            });

            // Навешиваем обработчики для кнопок удаления вариантов ответов
            container.querySelectorAll('.delete-variation-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const varId = btn.getAttribute('data-id');
                    if (!confirm('Вы действительно хотите удалить этот вариант ответа?')) return;
                    
                    try {
                        const res = await fetch(`/api/monitor/responses/${varId}`, {
                            method: 'DELETE'
                        });
                        if (res.ok) {
                            showToast('Вариант ответа удален', 'success');
                            await fetchAndRenderMonitorVariations();
                        } else {
                            const err = await res.json();
                            showToast('Ошибка: ' + formatError(err), 'error');
                        }
                    } catch (err) {
                        console.error(err);
                        showToast('❌ Ошибка сети при удалении варианта', 'error');
                    }
                });
            });

        } catch (error) {
            console.error('Ошибка рендеринга данных мониторинга:', error);
            container.innerHTML = `
                <div class="warning-text" style="padding: 24px; text-align: center;">
                    <strong>Ошибка:</strong> ${escapeHtml(error.message || 'Не удалось связаться с сервером')}
                </div>
            `;
        }
    }

    async function fetchAndRenderRecognitionRules() {
        const container = document.getElementById('recognition-accordion-container');
        if (!container) return;
        
        container.innerHTML = `
            <div class="loading-placeholder">
                <div class="spinner"></div>
                <p>Загрузка правил распознавания...</p>
            </div>
        `;
        
        try {
            const response = await fetch('/api/monitor/commands');
            if (!response.ok) throw new Error('Не удалось загрузить данные команд');
            const commands = await response.json();
            
            const recCommands = commands.filter(cmd => cmd.in_recognition === 1);
            
            if (recCommands.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; color: var(--color-text-muted); padding: 48px; font-style: italic; font-size: 13px;">
                        Нет команд в распознавании. Нажмите кнопку "Добавить команду" выше, чтобы добавить их.
                    </div>
                `;
                return;
            }
            
            let html = '';
            recCommands.forEach(cmd => {
                html += `
                    <div class="recognition-command-row" style="background: rgba(42, 27, 61, 0.2); border: 1px solid var(--border-glass); border-radius: 8px; overflow: hidden; margin-bottom: 8px;" data-cmd-id="${cmd.id}">
                        <div class="recognition-command-header" style="padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="rec-expand-icon" style="transition: transform 0.2s; display: inline-block;">▶</span>
                                <span style="font-weight: 600; color: var(--color-primary-hover); font-size: 14px;">${escapeHtml(cmd.command)}</span>
                            </div>
                            <button class="btn danger small delete-recognition-cmd-btn" data-id="${cmd.id}" style="padding: 4px 10px; font-size: 11px; margin: 0; background-color: var(--color-danger); border-color: var(--color-danger); color: #fff; cursor: pointer; border-radius: 6px;">
                                Удалить из распознавания
                            </button>
                        </div>
                        <div class="recognition-subcommands-container hidden" style="padding: 0 16px 16px 16px; border-top: 1px solid var(--border-glass); background: rgba(0, 0, 0, 0.15);" id="subcommands-container-${cmd.id}">
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
            
            container.querySelectorAll('.recognition-command-header').forEach(hdr => {
                hdr.addEventListener('click', (e) => {
                    if (e.target.closest('.delete-recognition-cmd-btn')) return;
                    
                    const parentRow = hdr.closest('.recognition-command-row');
                    const cmdId = parentRow.getAttribute('data-cmd-id');
                    const subContainer = document.getElementById(`subcommands-container-${cmdId}`);
                    const isHidden = subContainer.classList.toggle('hidden');
                    
                    const icon = hdr.querySelector('.rec-expand-icon');
                    if (icon) {
                        icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(90deg)';
                    }
                    
                    if (!isHidden) {
                        fetchAndRenderSubcommandsAndRules(cmdId, subContainer);
                    }
                });
            });
            
            container.querySelectorAll('.delete-recognition-cmd-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const cmdId = btn.getAttribute('data-id');
                    if (!confirm('Вы действительно хотите убрать эту команду из распознавания?')) return;
                    
                    try {
                        const res = await fetch(`/api/monitor/commands/${cmdId}/recognition/toggle`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ in_recognition: 0 })
                        });
                        if (res.ok) {
                            showToast('Команда убрана из распознавания', 'success');
                            await fetchAndRenderRecognitionRules();
                        } else {
                            const err = await res.json();
                            showToast('Ошибка: ' + formatError(err), 'error');
                        }
                    } catch (err) {
                        console.error(err);
                        showToast('❌ Ошибка сети', 'error');
                    }
                });
            });
            
        } catch (err) {
            console.error(err);
            container.innerHTML = `
                <div class="warning-text" style="padding: 24px; text-align: center;">
                    <strong>Ошибка:</strong> ${escapeHtml(err.message || 'Не удалось загрузить список')}
                </div>
            `;
        }
    }

    async function initTestTab() {
        const cmdInput = document.getElementById('test-command-input');
        const datalist = document.getElementById('test-commands-list');
        const btnRun = document.getElementById('btn-run-test');
        const responseTextarea = document.getElementById('test-response-text');
        const resultOutput = document.getElementById('test-result-output');
        const statusMsg = document.getElementById('test-status-msg');

        if (!cmdInput || !datalist || !btnRun || !responseTextarea || !resultOutput || !statusMsg) return;

        // Fetch recognition commands to populate datalist for autocomplete
        try {
            const res = await fetch('/api/monitor/commands');
            if (res.ok) {
                const commands = await res.json();
                // Filter only commands that are active in recognition (in_recognition == 1)
                const recognizedCommands = commands.filter(c => c.in_recognition === 1);
                
                datalist.innerHTML = '';
                recognizedCommands.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.command;
                    datalist.appendChild(opt);
                });
            }
        } catch (err) {
            console.error('Failed to load autocomplete commands:', err);
        }

        // Register action button click listener
        // Remove old listener to avoid duplicates if tab is clicked multiple times
        btnRun.onclick = async () => {
            const command = cmdInput.value.trim();
            const text = responseTextarea.value.trim();

            statusMsg.style.display = 'none';
            statusMsg.innerText = '';

            if (!command) {
                statusMsg.innerText = '⚠️ Введите название команды.';
                statusMsg.style.display = 'block';
                return;
            }
            if (!text) {
                statusMsg.innerText = '⚠️ Введите текст ответа для анализа.';
                statusMsg.style.display = 'block';
                return;
            }

            // Show loading placeholder
            resultOutput.innerHTML = `
                <div style="text-align: center; margin-top: 40px;">
                    <div class="spinner" style="margin: 0 auto 12px; border-top-color: var(--color-primary);"></div>
                    <p style="color: var(--color-text-muted);">Выполняется анализ ответа...</p>
                </div>
            `;

            try {
                const response = await fetch('/api/monitor/test-parse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command, text })
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    resultOutput.innerHTML = `
                        <div style="color: var(--color-danger); font-weight: 600; font-size: 14px; margin-bottom: 8px;">❌ Ошибка:</div>
                        <div style="background: rgba(244, 67, 54, 0.1); border: 1px solid rgba(244, 67, 54, 0.2); padding: 10px; border-radius: 6px; color: #ff8a80; font-size: 12px;">
                            ${escapeHtml(data.error || 'Не удалось распознать фразу.')}
                        </div>
                    `;
                    return;
                }

                // Render result details
                let html = '';

                // 1. Overall Status Badge
                const statusColor = data.recognized ? 'var(--color-success)' : 'var(--color-danger)';
                const statusShadow = data.recognized ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)';
                const statusText = data.recognized ? 'Да (Успешно)' : 'Нет (Ошибка)';
                
                html += `
                    <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px;">
                        <div style="font-size: 11px; color: var(--color-text-muted);">Команда: <strong style="color: var(--color-text-main);">${escapeHtml(data.command_name)}</strong></div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                            <span style="background: ${statusColor}; color: #fff; font-weight: bold; padding: 4px 12px; border-radius: 20px; font-size: 12px; box-shadow: 0 0 8px ${statusShadow};">
                                Распознано: ${statusText}
                            </span>
                        </div>
                    </div>
                `;

                // 2. Subcommands detail list
                html += `<div style="display: flex; flex-direction: column; gap: 10px;">`;
                
                data.subcommands.forEach(sub => {
                    const subIcon = sub.matched ? '✔️' : '❌';
                    const subColor = sub.matched ? 'var(--color-success)' : 'var(--color-danger)';
                    const bg = sub.matched ? 'rgba(76, 175, 80, 0.04)' : 'rgba(244, 67, 54, 0.04)';
                    const border = sub.matched ? 'rgba(76, 175, 80, 0.12)' : 'rgba(244, 67, 54, 0.12)';
                    
                    html += `
                        <div style="background: ${bg}; border: 1px solid ${border}; padding: 10px; border-radius: 6px; display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 12px;">
                                <span style="color: var(--color-text-main);">${escapeHtml(sub.subcommand_name)}</span>
                                <span style="color: ${subColor}; font-size: 12px; font-weight: bold; display: flex; align-items: center; gap: 4px;">
                                    <span>${subIcon}</span> ${sub.matched ? 'Совпало' : 'Не совпало'}
                                </span>
                            </div>
                    `;

                    if (sub.matched && sub.matched_rule) {
                        html += `
                            <div style="font-size: 11px; margin-top: 4px; color: var(--color-text-muted); display: flex; flex-direction: column; gap: 2px;">
                                <div><strong>Регулярное выражение:</strong> <code style="color: var(--color-primary-hover); font-size: 10px; font-family: monospace; word-break: break-all; background: rgba(0,0,0,0.15); padding: 1px 4px; border-radius: 3px;">${escapeHtml(sub.matched_rule.pattern)}</code></div>
                                <div><strong>Уникальное имя (тег):</strong> <span style="color: var(--color-primary-hover); font-weight: bold;">${escapeHtml(sub.matched_rule.variable_name)}</span></div>
                                <div><strong>Результат:</strong> <span style="color: var(--color-success); font-weight: 500;">${escapeHtml(sub.matched_rule.output_value)}</span></div>
                        `;

                        const groups = sub.matched_rule.captured_groups;
                        if (groups && Object.keys(groups).length > 0) {
                            html += `
                                <div style="margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 4px; font-size: 10px;">
                                    <strong>Переменные группы:</strong>
                                    <span style="font-family: monospace; background: rgba(0,0,0,0.2); padding: 1px 4px; border-radius: 3px; color: var(--color-text-main);">
                                        ${JSON.stringify(groups)}
                                    </span>
                                </div>
                            `;
                        }
                        html += `</div>`;
                    } else {
                        html += `
                            <div style="font-size: 11px; margin-top: 4px; color: #ff8a80; font-style: italic;">
                                Нет совпадений ни с одним правилом данного раздела.
                            </div>
                        `;
                    }

                    html += `</div>`;
                });

                html += `</div>`;
                resultOutput.innerHTML = html;

            } catch (err) {
                console.error('Test parse failed:', err);
                resultOutput.innerHTML = `
                    <div style="color: var(--color-danger); font-weight: 600; font-size: 14px; margin-bottom: 8px;">❌ Системная ошибка:</div>
                    <div style="background: rgba(244, 67, 54, 0.1); border: 1px solid rgba(244, 67, 54, 0.2); padding: 10px; border-radius: 6px; color: #ff8a80; font-size: 12px;">
                        ${escapeHtml(err.message || 'Произошла непредвиденная ошибка.')}
                    </div>
                `;
            }
        };
    }

    async function fetchAndRenderDebugUnrecognized() {
        const container = document.getElementById('debug-accordion-container');
        if (!container) return;
        
        container.innerHTML = `
            <div class="loading-placeholder">
                <div class="spinner"></div>
                <p>Загрузка отладочных данных...</p>
            </div>
        `;
        
        try {
            const response = await fetch('/api/monitor/debug/unrecognized');
            if (!response.ok) throw new Error('Не удалось загрузить отладочные данные');
            const data = await response.json();
            
            if (data.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; color: var(--color-text-muted); padding: 48px; font-style: italic; font-size: 13px;">
                        В отладке пусто. Все активные вариации распознаются успешно по правилам!
                    </div>
                `;
                return;
            }
            
            let html = '';
            data.forEach(cmd => {
                const variations = cmd.variations || [];
                html += `
                    <div class="debug-command-row" style="background: rgba(42, 27, 61, 0.2); border: 1px solid var(--border-glass); border-radius: 8px; overflow: hidden; margin-bottom: 8px;" data-cmd-id="${cmd.id}">
                        <div class="debug-command-header" style="padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="debug-expand-icon" style="transition: transform 0.2s; display: inline-block;">▶</span>
                                <span style="font-weight: 600; color: var(--color-primary-hover); font-size: 14px;">${escapeHtml(cmd.command)}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span class="badge" style="background: var(--color-danger); color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 10px;">
                                    Не распознано ответов: ${variations.length}
                                </span>
                                <button class="btn danger small delete-command-btn" data-id="${cmd.id}" style="padding: 4px 10px; font-size: 11px; margin: 0; background-color: var(--color-danger); border-color: var(--color-danger); color: #fff; cursor: pointer; border-radius: 6px;">
                                    Удалить
                                </button>
                            </div>
                        </div>
                        <div class="debug-variations-container hidden" style="padding: 12px 16px; border-top: 1px solid var(--border-glass); background: rgba(0, 0, 0, 0.15);" id="debug-variations-container-${cmd.id}">
                            <div style="overflow-x: auto; width: 100%;">
                                <table class="monitor-table" style="margin-top: 0; width: 100%;">
                                    <thead>
                                        <tr>
                                            <th style="width: 50px; text-align: center;"></th>
                                            <th style="text-align: left;">Текст ответа (последний)</th>
                                            <th style="width: 180px; text-align: center;">Дата</th>
                                            <th style="width: 100px; text-align: center;">Совпадений</th>
                                            <th style="width: 120px; text-align: center;">Действия</th>
                                            <th style="width: 150px; text-align: center;">Распознавание</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                `;
                
                variations.forEach((v, idx) => {
                    const failedBadges = v.failed_rules.map(fr => 
                        `<span class="badge" style="background: rgba(244, 67, 54, 0.15); border: 1px solid rgba(244, 67, 54, 0.3); color: #ff8a80; font-size: 10px; margin-right: 4px; padding: 2px 6px; border-radius: 4px;" title="Регулярное выражение: ${escapeHtml(fr.pattern)}">
                            ❌ ${escapeHtml(fr.subcommand_name)} -> ${escapeHtml(fr.variable_name)}
                        </span>`
                    ).join(' ');

                    html += `
                                        <tr>
                                            <td style="text-align: center; color: var(--color-text-muted); font-size: 11px;">#${idx + 1}</td>
                                            <td style="color: var(--color-text-main);">
                                                <div class="code-font" style="margin-bottom: 6px;">${escapeHtml(v.response_text)}</div>
                                                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;">
                                                    ${failedBadges}
                                                </div>
                                            </td>
                                            <td style="text-align: center; color: var(--color-text-muted); font-size: 12px;">${escapeHtml(v.last_mention_at || '—')}</td>
                                            <td style="text-align: center; font-weight: 600; color: var(--color-success);">${v.match_count}</td>
                                            <td style="text-align: center;">
                                                <button class="btn danger small delete-variation-btn" data-id="${v.id}" style="padding: 4px 10px; font-size: 11px; margin: 0; background-color: var(--color-danger); border-color: var(--color-danger); color: #fff; cursor: pointer; border-radius: 6px;">
                                                    Удалить
                                                </button>
                                            </td>
                                            <td style="text-align: center;">
                                                <span class="status-badge ${v.recognition_status === 'Да' ? 'status-yes' : v.recognition_status === 'Нет' ? 'status-no' : 'status-unknown'}">
                                                    ${escapeHtml(v.recognition_status || 'Не распознаем')}
                                                </span>
                                            </td>
                                        </tr>
                    `;
                });
                
                html += `
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
            
            // Навешиваем клики на заголовки аккордеона команд
            container.querySelectorAll('.debug-command-header').forEach(hdr => {
                hdr.addEventListener('click', (e) => {
                    if (e.target.closest('.delete-command-btn')) return;
                    
                    const parentRow = hdr.closest('.debug-command-row');
                    const cmdId = parentRow.getAttribute('data-cmd-id');
                    const varContainer = document.getElementById(`debug-variations-container-${cmdId}`);
                    const isHidden = varContainer.classList.toggle('hidden');
                    
                    const icon = hdr.querySelector('.debug-expand-icon');
                    if (icon) {
                        icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(90deg)';
                    }
                });
            });


            // Навешиваем клики на кнопки удаления команд в отладке
            container.querySelectorAll('.delete-command-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const cmdId = btn.getAttribute('data-id');
                    if (!confirm('Вы действительно хотите удалить эту команду и все её накопленные ответы?')) return;
                    
                    try {
                        const res = await fetch(`/api/monitor/commands/${cmdId}`, {
                            method: 'DELETE'
                        });
                        if (res.ok) {
                            showToast('Команда удалена', 'success');
                            await fetchFailedMonitorVariations();
                            await fetchAndRenderDebugUnrecognized();
                        } else {
                            const err = await res.json();
                            showToast('Ошибка: ' + formatError(err), 'error');
                        }
                    } catch (err) {
                        console.error(err);
                        showToast('❌ Ошибка сети при удалении команды', 'error');
                    }
                });
            });

            // Навешиваем клики на кнопки удаления вариантов ответа в отладке
            container.querySelectorAll('.delete-variation-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const varId = btn.getAttribute('data-id');
                    if (!confirm('Вы действительно хотите удалить этот вариант ответа?')) return;
                    
                    try {
                        const res = await fetch(`/api/monitor/responses/${varId}`, {
                            method: 'DELETE'
                        });
                        if (res.ok) {
                            showToast('Вариант ответа удален', 'success');
                            await fetchFailedMonitorVariations();
                            await fetchAndRenderDebugUnrecognized();
                        } else {
                            const err = await res.json();
                            showToast('Ошибка: ' + formatError(err), 'error');
                        }
                    } catch (err) {
                        console.error(err);
                        showToast('❌ Ошибка сети', 'error');
                    }
                });
            });
            
        } catch (err) {
            console.error(err);
            container.innerHTML = `
                <div class="warning-text" style="padding: 24px; text-align: center;">
                    <strong>Ошибка:</strong> ${escapeHtml(err.message || 'Не удалось загрузить список')}
                </div>
            `;
        }
    }

    async function fetchAndRenderSubcommandsAndRules(cmdId, container) {
        container.innerHTML = `
            <div style="padding: 12px 0; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--color-text-muted); font-size: 12px;">
                <div class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></div> Загрузка правил...
            </div>
        `;
        try {
            const res = await fetch(`/api/monitor/commands/${cmdId}/recognition/rules`);
            if (!res.ok) throw new Error('Не удалось загрузить правила');
            const subcommands = await res.json();
            
            if (!subcommands || subcommands.length === 0) {
                container.innerHTML = `
                    <div style="padding: 16px 0; color: var(--color-text-muted); text-align: center; font-style: italic; font-size: 12px;">
                        Для этой команды пока нет настроенных правил распознавания.
                    </div>
                `;
                return;
            }
            
            let html = '';
            subcommands.forEach(sub => {
                const SECTION_KEYS = {
                    "Работа": "work_info",
                    "Кормление": "feed_info",
                    "Откорм": "fattening",
                    "Подземелье": "dungeon_info",
                    "Арена": "arena_info",
                    "Туса": "party_info",
                    "Брак": "marriage_info",
                    "Ограбление": "robbery_info",
                    "Карта": "map_info",
                    "Имя жабы": "name",
                    "Уровень": "level",
                    "Сытость": "satiety",
                    "Статус": "status",
                    "Состояние": "state",
                    "Букашки": "bugs",
                    "Класс": "class",
                    "Настроение": "mood",
                    "Победы": "wins",
                    "Поражения": "losses",
                    "Арены": "arenas",
                    "Леденцы": "inv_lollipop",
                    "Аптечки": "inv_bandages",
                    "Пивас": "inv_beer",
                    "Стрекозюля удачи": "inv_dragonfly",
                    "Карта болота": "inv_map",
                    "Изолента": "inv_tape",
                    "Жабули для банды": "inv_gang_frogs",
                    "Капсула опыта": "inv_exp_capsule",
                    "Пропуск": "eq_pass",
                    "Отмычка": "eq_lockpick",
                    "Батарейка": "eq_battery",
                    "🧩": "cr_puzzle",
                    "🔗": "cr_link",
                    "🪨": "cr_stone",
                    "🎭": "cr_mask",
                    "📃": "cr_paper",
                    "⚡️": "cr_lightning",
                    "Партнер": "partner",
                    "Дни в браке": "marriage_days",
                    "Конфетки": "candies",
                    "Имя жабёнка": "froglet",
                    "Авторитет": "family_authority",
                    "Покормить через": "feed_in",
                    "Забрать через": "kindergarten",
                    "Махач через": "clash",
                    "Тип банды": "gang_type",
                    "Название банды": "gang_name",
                    "Верность банды": "gang_loyalty_cur",
                    "Урон банды": "gang_damage",
                    "Шанс срабатывания": "gang_chance",
                    "Кулон": "gang_pendant",
                    "Время кулона": "gang_pendant_duration",
                    "Брать на тусу": "gang_party"
                };
                const cleanSubName = sub.name.replace(" Вектор", "").trim();
                const key = SECTION_KEYS[cleanSubName] || "";
                const keyDisplay = key ? ` (${key})` : "";
                
                html += `
                    <div class="subcommand-accordion-item" style="margin-top: 12px; border: 1px solid rgba(255,255,255,0.05); border-radius: 6px; overflow: hidden; background: rgba(0,0,0,0.1);">
                        <div class="subcommand-header" style="padding: 8px 12px; background: rgba(255,255,255,0.02); display: flex; align-items: center; gap: 8px; cursor: pointer;" data-sub-id="${sub.id}">
                            <span class="sub-expand-icon" style="transition: transform 0.2s; display: inline-block;">▶</span>
                            <span style="font-weight: 600; color: var(--color-text-main); font-size: 13px;">${escapeHtml(cleanSubName)}${keyDisplay}</span>
                        </div>
                        <div class="subcommand-rules-table-container hidden" style="padding: 12px; border-top: 1px solid rgba(255,255,255,0.05);" id="rules-table-container-${sub.id}">
                `;
                
                const rules = sub.rules || [];
                if (rules.length === 0) {
                    html += `
                        <div style="color: var(--color-text-muted); text-align: center; font-style: italic; font-size: 11px; padding: 8px;">
                            В этом разделе нет правил.
                        </div>
                    `;
                } else {
                    html += `
                        <table class="monitor-table small-table" style="width: 100%; font-size: 11px;">
                            <thead>
                                <tr>
                                    <th style="text-align: left; width: 45%;">Вариант команды (Regex)</th>
                                    <th style="text-align: left; width: 35%;">Что распознаем</th>
                                    <th style="text-align: left; width: 20%;">Уникальное имя</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;
                    rules.forEach(rule => {
                        html += `
                            <tr>
                                <td class="code-font" style="color: var(--color-text-main); font-size: 11px; word-break: break-all;">${escapeHtml(rule.pattern)}</td>
                                <td style="color: var(--color-success); font-size: 11px;">${escapeHtml(rule.output_value)}</td>
                                <td style="color: var(--color-primary-hover); font-size: 11px;">${escapeHtml(rule.variable_name)}</td>
                            </tr>
                        `;
                    });
                    html += `
                            </tbody>
                        </table>
                    `;
                }
                
                html += `
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
            
            container.querySelectorAll('.subcommand-header').forEach(subHdr => {
                subHdr.addEventListener('click', () => {
                    const subId = subHdr.getAttribute('data-sub-id');
                    const tableContainer = document.getElementById(`rules-table-container-${subId}`);
                    const isHidden = tableContainer.classList.toggle('hidden');
                    const icon = subHdr.querySelector('.sub-expand-icon');
                    if (icon) {
                        icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(90deg)';
                    }
                });
            });
            
        } catch (err) {
            console.error(err);
            container.innerHTML = `
                <div class="warning-text" style="padding: 12px 0; text-align: center; font-size: 12px;">
                    <strong>Ошибка:</strong> ${escapeHtml(err.message || 'Не удалось загрузить правила')}
                </div>
            `;
        }
    }

    function formatCooldown(seconds) {
        if (!seconds) return "0";
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hrs > 0) {
            return mins > 0 ? `${hrs} ч. ${mins} мин.` : `${hrs} ч.`;
        }
        return `${mins} мин.`;
    }

    /**
     * Вычисляет оставшееся время кулдауна в реальном времени.
     *
     * Принципы (см. DATAFLOW.md § "Живые таймеры"):
     *  - Хранимое значение cooldown (в секундах) — это длительность кулдауна НА МОМЕНТ ПАРСА.
     *  - last_updated_iso — время парса (MSK). Вычисляем elapsed = now - last_updated.
     *  - Остаток = max(0, cooldown - elapsed). Если 0 — параметр готов.
     *  - UI только показывает уменьшение. Реальная смена статуса в БД происходит при новом парсе
     *    (команда приоритетнее расчётных данных) или фоновой задачей при обнулении.
     *
     * @returns {text, isReady, hasTimer}
     */
    function getLiveCooldownText(cooldownSec, lastUpdatedIso) {
        if (!cooldownSec || cooldownSec <= 0) {
            return { text: 'Готово', isReady: true, hasTimer: false };
        }
        // Если нет last_updated — показываем статичное значение (новые данные ещё не пришли)
        if (!lastUpdatedIso) {
            return { text: formatCooldown(cooldownSec), isReady: false, hasTimer: false };
        }
        const lastUpdated = new Date(lastUpdatedIso);
        const now = new Date();
        const elapsedSec = Math.floor((now - lastUpdated) / 1000);
        const remaining = cooldownSec - elapsedSec;
        if (remaining <= 0) {
            return { text: 'Готово', isReady: true, hasTimer: false };
        }
        // Формат с секундами для живого таймера
        const hrs = Math.floor(remaining / 3600);
        const mins = Math.floor((remaining % 3600) / 60);
        const secs = remaining % 60;
        let text;
        if (hrs > 0) {
            text = `${hrs}ч ${mins}м ${secs}с`;
        } else if (mins > 0) {
            text = `${mins}м ${secs}с`;
        } else {
            text = `${secs}с`;
        }
        return { text, isReady: false, hasTimer: true };
    }

    /**
     * Универсальный рендер строки кулдауна (работа/кормёжка/откорм/подземелье/арена).
     * Берёт данные из acc.toad_state: *_info (статус) + *_cooldown (секунды) + last_updated_iso.
     */
    function renderCooldownRow(elementId, acc, state, infoKey, cooldownKey, emoji, readyLabel, idleLabel, statusLabels) {
        const el = document.getElementById(elementId);
        if (!el) return;
        let val;
        if (acc.vk_id === 0) {
            const total = state.accounts.length;
            const active = state.accounts.filter(a => a.toad_state && a.toad_state[cooldownKey] > 0).length;
            val = total > 0 ? `${emoji} В кулдауне: ${active} / ${total}` : 'Нет аккаунтов';
        } else {
            const ts = acc.toad_state;
            const info = ts && ts[infoKey] ? ts[infoKey] : null;
            const cd = (ts && ts[cooldownKey]) ? ts[cooldownKey] : 0;
            if (cd > 0) {
                const live = getLiveCooldownText(cd, ts && ts.last_updated_iso ? ts.last_updated_iso : null);
                const prefix = (statusLabels && statusLabels[info]) ? statusLabels[info] : '';
                val = `${emoji} ${prefix}${prefix ? ' ' : ''}${live.text}`;
            } else if (info === 'ready' || (info === null && cd === 0)) {
                val = `${emoji} ${readyLabel}`;
            } else if (info) {
                val = `${emoji} ${info}`;
            } else {
                val = `${emoji} ${idleLabel}`;
            }
        }
        if (el.textContent !== val) el.textContent = val;
    }

    /**
     * Тик каждую секунду: перерисовывает только таймеры кулдаунов для выбранного аккаунта.
     * Не трогает остальные данные — они обновляются через fetchAccounts (каждые 3 сек).
     */
    function tickLiveTimers() {
        if (!state || !state.selectedAccountId) return;
        const acc = state.accounts.find(a => a.vk_id === state.selectedAccountId);
        if (!acc || !acc.toad_state) return;
        renderCooldownRow('stat-row-work-info', acc, state, 'work_info', 'work_cooldown', '💼', 'Можно работать', 'Не на работе', { cooldown: 'Работа через', working: 'На работе еще' });
        renderCooldownRow('stat-row-feed-info', acc, state, 'feed_info', 'feed_cooldown', '🍽️', 'Можно покормить', 'Не кормлена');
        renderCooldownRow('stat-row-fattening', acc, state, 'fattening', 'fattening_cooldown', '🐷', 'Можно откормить', 'Нет');
        renderCooldownRow('stat-row-dungeon', acc, state, 'dungeon_info', 'dungeon_cooldown', '👹', 'Доступно', 'Нет данных');
        renderCooldownRow('stat-row-arena', acc, state, 'arena_info', 'arena_cooldown', '⚔️', 'Можно на арену', 'Нет данных');
    }

    function startLiveTimers() {
        if (liveTimersInterval) return; // уже запущен
        liveTimersInterval = setInterval(tickLiveTimers, 1000);
    }

    function stopLiveTimers() {
        if (liveTimersInterval) {
            clearInterval(liveTimersInterval);
            liveTimersInterval = null;
        }
    }

    async function toggleAllAccountsActive(activeValue, resetStats = 0) {
        try {
            const response = await fetch(`/api/accounts/toggle_all`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: activeValue, reset_stats: resetStats })
            });
            
            if (!response.ok) throw new Error('Не удалось переключить статус всех аккаунтов');
            
            const data = await response.json();
            showToast(data.message, 'success');
            fetchAccounts(false);
        } catch (error) {
            console.error('Ошибка toggleAllAccountsActive:', error);
            showToast('❌ Ошибка массового переключения', 'error');
        }
    }

    async function handleConfirmDeleteSubmit() {
        if (!state.deletingAccountId) return;
        btnConfirmDelete.disabled = true;
        btnConfirmDelete.textContent = 'Удаление...';
        try {
            await deleteAccount(state.deletingAccountId);
        } finally {
            btnConfirmDelete.disabled = false;
            btnConfirmDelete.textContent = 'Удалить аккаунт';
            closeDeleteModal();
        }
    }

    // Получение аккаунтов от API
    async function fetchAccounts(selectFirst = false) {
        try {
            const response = await fetch('/api/accounts');
            if (response.status === 401) {
                window.location.reload(); 
                return;
            }
            if (!response.ok) throw new Error('Не удалось получить список аккаунтов');
            
            const accounts = await response.json();
            state.accounts = accounts;
            
            // Если аккаунтов нет или это первая загрузка / принудительный выбор, то по умолчанию выбираем "Общее" (vk_id = 0)
            if (state.accounts.length === 0) {
                state.selectedAccountId = 0;
            } 
            else if (selectFirst || state.selectedAccountId === null || (state.selectedAccountId !== 0 && !state.accounts.some(a => a.vk_id === state.selectedAccountId))) {
                state.selectedAccountId = 0; // По умолчанию всегда выбираем "Общее" в самом верху
            }
            
            renderSidebarAccounts();
            
            // Отрисовка деталей аккаунта: Полный рендер только при смене аккаунта, иначе - точечное обновление
            if (state.selectedAccountId !== null && state.selectedAccountId !== undefined) {
                let acc;
                if (state.selectedAccountId === 0) {
                    acc = {
                        vk_id: 0,
                        name: "Общее",
                        is_active: state.accounts.some(a => a.is_active === 1) ? 1 : 0,
                        status: state.accounts.some(a => a.is_active === 1 && a.status === 'working') ? 'working' : 'idle',
                        bugs: state.accounts.reduce((sum, a) => sum + (a.bugs || 0), 0),
                        mood: state.accounts.reduce((sum, a) => sum + (a.mood || 0), 0),
                        class_name: "Все классы",
                        class_level: state.accounts.reduce((sum, a) => sum + ((a.toad_state && a.toad_state.level) || a.class_level || 0), 0),
                        chat_id: null,
                        wins: state.accounts.reduce((sum, a) => sum + (a.wins || 0), 0),
                        losses: state.accounts.reduce((sum, a) => sum + (a.losses || 0), 0),
                        reserve_days: state.accounts.reduce((sum, a) => sum + (a.reserve_days || 0), 0),
                        work_info: state.accounts.filter(a => a.status === 'working').length + " на работе",
                        feed_info: state.accounts.filter(a => a.feed_info && (a.feed_info.includes('Покормлена') || a.feed_info === 'well-fed')).length + " покормлено",
                        fattening: state.accounts.filter(a => a.fattening === 'Да').length + " на откорме",
                        partner: state.accounts.filter(a => a.partner && a.partner !== 'Нет').length + " в браке",
                        marriage_days: state.accounts.reduce((sum, a) => sum + (a.marriage_days || 0), 0),
                        candies: state.accounts.reduce((sum, a) => sum + (a.candies || 0), 0),
                        froglet: state.accounts.filter(a => a.froglet && a.froglet !== 'Нет').length + " жабят",
                        family_level: state.accounts.reduce((sum, a) => sum + (a.family_level || 0), 0),
                        family_satiety: state.accounts.filter(a => a.family_satiety === 'Сыт').length + " сытых",
                        family_authority: state.accounts.reduce((sum, a) => sum + (a.family_authority || 0), 0),
                        family_mood: "Сводные",
                        kindergarten: state.accounts.filter(a => a.kindergarten && a.kindergarten !== 'Нет').length + " в садике",
                        clash: state.accounts.filter(a => a.clash === 'Доступен').length + " готовы",
                        feed_in: "Сводные",
                        arena_season: "Сводные",
                        arena_wins: state.accounts.reduce((sum, a) => sum + (a.arena_wins || 0), 0),
                        arena_losses: state.accounts.reduce((sum, a) => sum + (a.arena_losses || 0), 0),
                        arena_place: "Сводные",
                        arena_points: state.accounts.reduce((sum, a) => sum + (a.arena_points || 0), 0),
                        clan_name: "Сводные",
                        clan_members: "Сводные",
                        clan_offmap: "Сводные",
                        clan_cards: "Сводные",
                        clan_exp: "Сводные",
                        clan_level: state.accounts.reduce((sum, a) => sum + (a.clan_level || 0), 0),
                        clan_league: "Сводные",
                        clan_battles: state.accounts.reduce((sum, a) => sum + (a.clan_battles || 0), 0),
                        clan_points: state.accounts.reduce((sum, a) => sum + (a.clan_points || 0), 0),
                        clan_booster: "Сводные"
                    };
                } else {
                    acc = state.accounts.find(a => a.vk_id === state.selectedAccountId);
                }
                
                if (acc) {
                    if (state.renderedAccountId !== state.selectedAccountId) {
                        renderDetailPanel(); // Полный рендер при переключении
                    } else {
                        updateDetailPanelData(acc); // Бесшовное обновление данных
                    }
                    startLiveTimers();
                }
            } else {
                stopLiveTimers();
                renderDetailPanel(); // Отрендерит плейсхолдер
            }
            
            renderStats();
            renderSchedule();
        } catch (error) {
            console.error('Ошибка fetchAccounts:', error);
            renderConnectionError();
        }
    }

    // Вывод сообщения об отсутствии связи с сервером (вместо бесконечного спиннера)
    function renderConnectionError() {
        accountsListContainer.innerHTML = `
            <div class="sidebar-placeholder" style="color: var(--color-error); border-color: rgba(255, 23, 68, 0.3); background-color: rgba(255, 23, 68, 0.02);">
                ⚠️ Сервер не отвечает. Проверьте запуск бота.
            </div>
        `;
        dashboardDetailsLayout.innerHTML = `
            <div class="placeholder-view" style="border-color: rgba(255, 23, 68, 0.3); background-color: rgba(255, 23, 68, 0.01);">
                <div class="placeholder-icon" style="animation: none;">❌</div>
                <h3 class="placeholder-title" style="color: var(--color-error);">Нет подключения к бэкенду</h3>
                <p class="placeholder-desc" style="max-width: 400px; color: var(--color-text-muted);">
                    Не удалось установить соединение с сервером ToadBot. Запустите консольный фоновый процесс (через <b>run_minimized.bat</b> или <b>run_hidden.vbs</b>) и обновите страницу.
                </p>
            </div>
        `;
        accountsCountBadge.textContent = '0';
    }

    // Получение логов от API
    async function fetchLogs() {
        try {
            const response = await fetch('/api/logs?limit=70');
            if (!response.ok) throw new Error('Не удалось получить логи');
            
            const logs = await response.json();
            state.logs = logs;
            renderLogs();
        } catch (error) {
            console.error('Ошибка fetchLogs:', error);
            // Выводим ошибку логов при сбое связи во вкладке логов
            const tabLogsContainer = document.getElementById('tab-logs-container');
            if (tabLogsContainer && (tabLogsContainer.innerHTML === '' || tabLogsContainer.innerHTML.includes('Инициализация'))) {
                tabLogsContainer.innerHTML = '<div class="log-row error"><span class="time">[--:--:--]</span> <span class="msg">⚠️ Соединение с сервером логов потеряно...</span></div>';
            }
        }
    }

    function renderStats() {
        accountsCountBadge.textContent = state.accounts.length;
    }

    // Отрисовка логов (внутри вкладки выбранного аккаунта)
    function renderLogs() {
        const logsContainer = document.getElementById('tab-logs-container');
        if (!logsContainer || state.logs.length === 0) return;
        
        const sortedLogs = [...state.logs].sort((a, b) => a.id - b.id);
        
        // Фильтруем логи строго по выбранному в данный момент аккаунту (для "Общее" показываем все логи)
        const filteredLogs = state.selectedAccountId === 0 
            ? sortedLogs 
            : sortedLogs.filter(log => log.vk_id === state.selectedAccountId);
        
        const newLogs = filteredLogs.filter(log => log.id > state.lastLogId);
        
        if (newLogs.length > 0) {
            newLogs.forEach(log => {
                const row = document.createElement('div');
                row.className = `log-row ${log.action}`;
                
                const timeStr = log.timestamp ? log.timestamp.split(' ')[1] || log.timestamp : '--:--:--';
                const acc = state.accounts.find(a => a.vk_id === log.vk_id);
                const accName = acc ? acc.name : `#${log.vk_id}`;
                
                const showAccount = state.selectedAccountId === 0;
                
                if (log.action === 'command') {
                    let cleanCmdText = log.message;
                    if (log.message.startsWith("Вы отправили команду: ")) {
                        cleanCmdText = log.message.substring(22).trim();
                    } else if (log.message.startsWith("Отправлена команда: ")) {
                        cleanCmdText = log.message.substring(20).trim();
                    } else if (log.message.includes(": ")) {
                        const colonIndex = log.message.indexOf(": ");
                        if (log.message.toLowerCase().includes("команд")) {
                            cleanCmdText = log.message.substring(colonIndex + 2).trim();
                        }
                    }
                        
                    if (showAccount) {
                        row.innerHTML = `
                            <span class="time">[${timeStr}]</span>
                            <span class="account" style="color: var(--color-success); font-weight: bold; margin-right: 4px;">${accName}:</span>
                            <span class="msg" style="color: var(--color-warning);">${cleanCmdText}</span>
                        `;
                    } else {
                        row.innerHTML = `
                            <span class="time">[${timeStr}]</span>
                            <span class="account" style="color: var(--color-success); font-weight: bold; margin-right: 4px;">Вы:</span>
                            <span class="msg" style="color: var(--color-warning);">${cleanCmdText}</span>
                        `;
                    }
                } else if (log.action === 'system') {
                    let msgStyle = 'style="color: var(--color-text-main);"';
                    if (log.message.includes('успешно запущен') || 
                        log.message.includes('запущен в системе') || 
                        log.message.includes('остановлен') ||
                        log.message.includes('лимит запросов') ||
                        log.message.includes('режим ожидания') ||
                        log.message.includes('перезапуск') ||
                        log.message.startsWith('⚠️') ||
                        log.message.startsWith('🔄')) {
                        msgStyle = 'style="color: var(--color-error); font-weight: bold;"';
                    }
                    
                    if (showAccount) {
                        row.innerHTML = `
                            <span class="time">[${timeStr}]</span>
                            <span class="account" style="color: var(--color-success); font-weight: bold; margin-right: 4px;">Система (${accName}):</span>
                            <span class="msg" ${msgStyle}>${log.message}</span>
                        `;
                    } else {
                        row.innerHTML = `
                            <span class="time">[${timeStr}]</span>
                            <span class="account" style="color: var(--color-success); font-weight: bold; margin-right: 4px;">Система:</span>
                            <span class="msg" ${msgStyle}>${log.message}</span>
                        `;
                    }
                } else if (log.action === 'error') {
                    if (showAccount) {
                        row.innerHTML = `
                            <span class="time">[${timeStr}]</span>
                            <span class="account" style="color: var(--color-error); font-weight: bold; margin-right: 4px;">${accName} (Ошибка):</span>
                            <span class="msg" style="color: var(--color-error);">${log.message}</span>
                        `;
                    } else {
                        row.innerHTML = `
                            <span class="time">[${timeStr}]</span>
                            <span class="account" style="color: var(--color-error); font-weight: bold; margin-right: 4px;">Ошибка:</span>
                            <span class="msg" style="color: var(--color-error);">${log.message}</span>
                        `;
                    }
                } else {
                    row.innerHTML = `
                        <span class="time">[${timeStr}]</span>
                        ${showAccount ? `<span class="account" style="margin-right: 8px; color: #4dc3ff; font-weight: 500;">${accName}:</span>` : ''}
                        <span class="msg">${log.message}</span>
                    `;
                }
                
                logsContainer.appendChild(row);
            });
            
            state.lastLogId = newLogs[newLogs.length - 1].id;
            logsContainer.scrollTop = logsContainer.scrollHeight;
            // Короткая задержка, чтобы браузер успел отрисовать элементы и правильно рассчитал высоту контейнера
            setTimeout(() => {
                logsContainer.scrollTop = logsContainer.scrollHeight;
            }, 50);
        }
    }

    // Отрисовка списка аккаунтов в Сайдбаре (слева)
    function renderSidebarAccounts() {
        accountsListContainer.innerHTML = '';
        
        // 1. Рендерим виртуальный аккаунт "Общее" в самом верху
        const generalItem = document.createElement('div');
        generalItem.className = `sidebar-account-item ${state.selectedAccountId === 0 ? 'active' : ''}`;
        generalItem.dataset.vkid = 0;
        
        const hasActiveBots = state.accounts.some(a => a.is_active === 1);
        let generalStatusClass = hasActiveBots ? 'idle' : 'offline';
        if (state.accounts.some(a => a.is_active === 1 && a.status === 'working')) {
            generalStatusClass = 'working';
        }
        
        const activeCount = state.accounts.filter(a => a.is_active === 1).length;
        
        generalItem.innerHTML = `
            <div class="account-item-profile">
                <div class="sidebar-toggle-btn ${hasActiveBots ? 'active' : 'inactive'}" title="${hasActiveBots ? 'Отключить все аккаунты' : 'Запустить все аккаунты'}"></div>
                <div class="account-item-avatar" style="background: linear-gradient(135deg, #8227e3, #00b0ff); font-size: 16px;">🌐</div>
                <div class="account-item-info">
                    <h4>Общее</h4>
                    <span>Всего: ${state.accounts.length}, Активно: ${activeCount}</span>
                </div>
            </div>
            <div class="account-item-actions">
                <div class="status-indicator ${generalStatusClass}"></div>
            </div>
        `;
        
        generalItem.addEventListener('click', () => {
            if (state.selectedAccountId !== 0) {
                state.selectedAccountId = 0;
                document.querySelectorAll('.sidebar-account-item').forEach(i => i.classList.remove('active'));
                generalItem.classList.add('active');
                state.activeTab = 'stats';
                renderDetailPanel();
            }
        });
        
        // Клик по кнопке-переключателю в сайдбаре "Общее"
        const genToggleBtn = generalItem.querySelector('.sidebar-toggle-btn');
        if (genToggleBtn) {
            genToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Отменяем всплытие клика
                genToggleBtn.classList.add('pending');
                if (hasActiveBots) {
                    // При массовой остановке красим все кнопки в оранжевый цвет ожидания
                    document.querySelectorAll('.sidebar-toggle-btn').forEach(btn => btn.classList.add('pending'));
                    toggleAllAccountsActive(0, 0);
                } else {
                    showInitSessionModal(0, "Всех аккаунтов");
                }
            });
        }
        
        accountsListContainer.appendChild(generalItem);
        
        // 2. Рендерим подключенные реальные аккаунты
        state.accounts.forEach(acc => {
            const item = document.createElement('div');
            item.className = `sidebar-account-item ${acc.vk_id === state.selectedAccountId ? 'active' : ''}`;
            item.dataset.vkid = acc.vk_id;
            
            let statusClass = 'offline';
            if (acc.is_active === 1) {
                statusClass = acc.status === 'working' ? 'working' : 'idle';
            }
            
            // Вычисляем уровень жабы (берем сначала из toad_state, потом из class_level)
            const lvl = (acc.toad_state && acc.toad_state.level) ? acc.toad_state.level : (acc.class_level || '?');
            const lvlStr = String(lvl);
            let lvlFontSize = '15px';
            if (lvlStr.length >= 3) {
                lvlFontSize = '11px';
            } else if (lvlStr.length === 2) {
                lvlFontSize = '13px';
            }

            // Вычисляем размер шрифта для имени жабы, чтобы помещалось до 20 символов
            const nameVal = acc.name || `ID: ${acc.vk_id}`;
            let nameFontSize = '13.5px';
            if (nameVal.length > 18) {
                nameFontSize = '11px';
            } else if (nameVal.length > 14) {
                nameFontSize = '12px';
            }

            // Класс уровня аккаунта для обводки аватарки:
            // Classic — синяя, Premium/Premium+ — золотая
            const tierClass = acc.is_prime === 1 ? 'avatar-tier-premium' : 'avatar-tier-classic';

            item.innerHTML = `
                <div class="account-item-profile">
                    <div class="sidebar-toggle-btn ${acc.is_active === 1 ? 'active' : 'inactive'}" title="${acc.is_active === 1 ? 'Остановить бота' : 'Запустить бота'}"></div>
                    <div class="account-item-avatar ${tierClass}" style="font-size: ${lvlFontSize};">${lvl}</div>
                    <div class="account-item-info">
                        <h4 style="font-size: ${nameFontSize};">${escapeHtml(nameVal)}</h4>
                        <span>ID: ${acc.vk_id}</span>
                    </div>
                </div>
                <div class="account-item-actions">
                    <div class="status-indicator ${statusClass}"></div>
                    <button class="btn-delete-sidebar" data-vkid="${acc.vk_id}" data-name="${escapeHtml(nameVal)}" title="Удалить аккаунт">🗑️</button>
                </div>
            `;
            
            // Клик по самой плашке переключает детальный вид
            item.addEventListener('click', (e) => {
                if (state.selectedAccountId !== acc.vk_id) {
                    state.selectedAccountId = acc.vk_id;
                    
                    document.querySelectorAll('.sidebar-account-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    
                    // Сбрасываем выбранную вкладку на 'stats' при переключении аккаунта
                    state.activeTab = 'stats';
                    
                    renderDetailPanel();
                }
            });
            
            // Клик по кнопке-переключателю в сайдбаре реального аккаунта
            const toggleBtn = item.querySelector('.sidebar-toggle-btn');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Отменяем всплытие клика
                    toggleBtn.classList.add('pending');
                    if (acc.is_active === 1) {
                        toggleAccountActive(acc.vk_id, 0, 0);
                    } else {
                        showInitSessionModal(acc.vk_id, acc.name);
                    }
                });
            }
            
            // Клик по иконке корзины вызывает подтверждение удаления
            const deleteBtn = item.querySelector('.btn-delete-sidebar');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Отменяем всплытие, чтобы не переключаться на этот аккаунт
                const vkid = parseInt(deleteBtn.dataset.vkid);
                const name = deleteBtn.dataset.name;
                
                state.deletingAccountId = vkid;
                deleteAccountName.textContent = name;
                deleteAccountId.textContent = vkid;
                confirmDeleteModalOverlay.classList.add('active');
            });
            
            accountsListContainer.appendChild(item);
        });
    }

    // Отрисовка правой панели деталей аккаунта (вызывается при смене аккаунта)
    function renderDetailPanel() {
        if (state.selectedAccountId === null || state.selectedAccountId === undefined) {
            state.renderedAccountId = null;
            dashboardDetailsLayout.innerHTML = `
                <div class="placeholder-view">
                    <div class="placeholder-icon">🐸</div>
                    <h3 class="placeholder-title">Добро пожаловать в ToadBot!</h3>
                    <p class="placeholder-desc">Подключите VK-аккаунт с помощью кнопки в левом меню, чтобы запустить автоматическое участие в чат-игре.</p>
                </div>
            `;
            return;
        }

        let acc;
        if (state.selectedAccountId === 0) {
            acc = {
                vk_id: 0,
                name: "Общее",
                is_active: state.accounts.some(a => a.is_active === 1) ? 1 : 0,
                status: state.accounts.some(a => a.is_active === 1 && a.status === 'working') ? 'working' : 'idle',
                bugs: state.accounts.reduce((sum, a) => sum + (a.bugs || 0), 0),
                mood: state.accounts.reduce((sum, a) => sum + (a.mood || 0), 0),
                class_name: "Все классы",
                class_level: state.accounts.reduce((sum, a) => sum + ((a.toad_state && a.toad_state.level) || a.class_level || 0), 0),
                chat_id: null,
                auto_feed: 0,
                auto_work: 0,
                auto_arena: 0,
                auto_dungeon: 0,
                work_type: 'столовая',
                wins: state.accounts.reduce((sum, a) => sum + (a.wins || 0), 0),
                losses: state.accounts.reduce((sum, a) => sum + (a.losses || 0), 0),
                reserve_days: state.accounts.reduce((sum, a) => sum + (a.reserve_days || 0), 0),
                work_info: state.accounts.filter(a => a.status === 'working').length + " на работе",
                feed_info: state.accounts.filter(a => a.feed_info && (a.feed_info.includes('Покормлена') || a.feed_info === 'well-fed')).length + " покормлено",
                fattening: state.accounts.filter(a => a.fattening === 'Да').length + " на откорме",
                partner: state.accounts.filter(a => a.partner && a.partner !== 'Нет').length + " в браке",
                marriage_days: state.accounts.reduce((sum, a) => sum + (a.marriage_days || 0), 0),
                candies: state.accounts.reduce((sum, a) => sum + (a.candies || 0), 0),
                froglet: state.accounts.filter(a => a.froglet && a.froglet !== 'Нет').length + " жабят",
                family_level: state.accounts.reduce((sum, a) => sum + (a.family_level || 0), 0),
                family_satiety: state.accounts.filter(a => a.family_satiety === 'Сыт').length + " сытых",
                family_authority: state.accounts.reduce((sum, a) => sum + (a.family_authority || 0), 0),
                family_mood: "Сводные",
                kindergarten: state.accounts.filter(a => a.kindergarten && a.kindergarten !== 'Нет').length + " в садике",
                clash: state.accounts.filter(a => a.clash === 'Доступен').length + " готовы",
                feed_in: "Сводные",
                arena_season: "Сводные",
                arena_wins: state.accounts.reduce((sum, a) => sum + (a.arena_wins || 0), 0),
                arena_losses: state.accounts.reduce((sum, a) => sum + (a.arena_losses || 0), 0),
                arena_place: "Сводные",
                arena_points: state.accounts.reduce((sum, a) => sum + (a.arena_points || 0), 0),
                clan_name: "Сводные",
                clan_members: "Сводные",
                clan_offmap: "Сводные",
                clan_cards: "Сводные",
                clan_exp: "Сводные",
                clan_level: state.accounts.reduce((sum, a) => sum + (a.clan_level || 0), 0),
                clan_league: "Сводные",
                clan_battles: state.accounts.reduce((sum, a) => sum + (a.clan_battles || 0), 0),
                clan_points: state.accounts.reduce((sum, a) => sum + (a.clan_points || 0), 0),
                clan_booster: "Сводные"
            };
        } else {
            acc = state.accounts.find(a => a.vk_id === state.selectedAccountId);
        }

        if (!acc) return;

        state.renderedAccountId = acc.vk_id;
        const isOnline = acc.vk_id === 0 ? state.accounts.some(a => a.is_active === 1) : acc.is_active === 1;

        const maxMood = acc.vk_id === 0 ? Math.max(state.accounts.length * 500, 500) : 500;

        dashboardDetailsLayout.innerHTML = `
            <div class="detail-card">
                <!-- Вкладки (Tabs Navigation) -->
                <div class="detail-tabs">
                    <button class="tab-btn ${state.activeTab === 'schedule' ? 'active' : ''}" data-tab="schedule">📅 Расписание</button>
                    <button class="tab-btn ${state.activeTab === 'stats' ? 'active' : ''}" data-tab="stats">📊 Статистика</button>
                    <button class="tab-btn ${state.activeTab === 'logs' ? 'active' : ''}" data-tab="logs">📝 Лог</button>
                    <button class="tab-btn ${state.activeTab === 'settings' ? 'active' : ''}" data-tab="settings">⚙️ Настройки</button>
                    <button class="tab-btn monitor-tab-btn ${state.monitorHasFailed ? 'has-failed' : ''}" id="btn-open-monitor" style="margin-left: auto; margin-right: 8px; background: #4a5568; border: 1px solid #4a5568; color: #fff !important; font-weight: 600;">Мониторинг</button>
                </div>

                <!-- Содержимое вкладок -->
                <div class="tab-contents">
                    <!-- Вкладка: Расписание -->
                    <div class="tab-content ${state.activeTab === 'schedule' ? '' : 'hidden'}" id="tab-schedule">
                        <div class="schedule-container" id="schedule-tab-container" style="padding: 4px 0;">
                            <!-- Сюда вставляется динамическая таблица задач -->
                        </div>
                    </div>

                    <!-- Вкладка: Статистика -->
                    <div class="tab-content ${state.activeTab === 'stats' ? '' : 'hidden'}" id="tab-stats">
                        <!-- Подвкладки (Sub-Tabs Navigation) -->
                        <div class="sub-tabs">
                            <button class="sub-tab-btn ${state.activeSubTab === 'general' ? 'active' : ''}" data-subtab="general">Общее</button>
                            <button class="sub-tab-btn ${state.activeSubTab === 'toad' ? 'active' : ''}" data-subtab="toad">Жаба</button>
                            <button class="sub-tab-btn ${state.activeSubTab === 'family' ? 'active' : ''}" data-subtab="family">Семья</button>
                            <button class="sub-tab-btn ${state.activeSubTab === 'gang' ? 'active' : ''}" data-subtab="gang">Банда</button>
                            <button class="sub-tab-btn ${state.activeSubTab === 'arena' ? 'active' : ''}" data-subtab="arena">Арена</button>
                            <button class="sub-tab-btn ${state.activeSubTab === 'clan' ? 'active' : ''}" data-subtab="clan">Клан</button>
                            <button class="sub-tab-btn ${state.activeSubTab === 'inventory' ? 'active' : ''}" data-subtab="inventory">Инвентарь</button>
                        </div>

                        <!-- Содержимое подвкладок -->
                        <div class="sub-tab-contents">
                            <!-- Подвкладка: Общее (пуста) -->
                            <div class="sub-tab-content ${state.activeSubTab === 'general' ? '' : 'hidden'}" id="sub-tab-general"></div>

                            <!-- Подвкладка: Жаба -->
                            <div class="sub-tab-content ${state.activeSubTab === 'toad' ? '' : 'hidden'}" id="sub-tab-toad">
                                <div class="stats-columns-grid">
                                    <!-- Столбец 1: Основные статы -->
                                    <div class="stats-column-wrapper">
                                        <div class="column-timer" id="timer-column-satiety">
                                            <span class="dot"></span>
                                            <span>Проверено: загрузка...</span>
                                        </div>
                                        <div class="stats-column">
                                            <div class="stats-column-title">🟢 Характеристики</div>
                                            <div class="stat-row">
                                                <span class="stat-label">Сытость</span>
                                                <span class="stat-value" id="stat-row-satiety">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Состояние</span>
                                                <span class="stat-value" id="stat-row-status">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Букашки</span>
                                                <span class="stat-value" id="stat-row-bugs">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Класс</span>
                                                <span class="stat-value" id="stat-row-class">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Настроение</span>
                                                <span class="stat-value" id="stat-row-mood">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Работа</span>
                                                <span class="stat-value" id="stat-row-work-info">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Кормежка</span>
                                                <span class="stat-value" id="stat-row-feed-info">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Откорм</span>
                                                <span class="stat-value" id="stat-row-fattening">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Подземелье</span>
                                                <span class="stat-value" id="stat-row-dungeon">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Арена</span>
                                                <span class="stat-value" id="stat-row-arena">Загрузка...</span>
                                            </div>
                                        </div>
                                        <div class="stats-column" style="margin-top: 8px;">
                                            <div class="stats-column-title">⚔️ Сражения</div>
                                            <div class="stat-row">
                                                <span class="stat-label">Победы</span>
                                                <span class="stat-value" id="stat-row-wins">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Поражения</span>
                                                <span class="stat-value" id="stat-row-losses">Загрузка...</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Столбец 2: Боевая статистика -->
                                    <div class="stats-column-wrapper">
                                        <div class="column-timer" id="timer-column-battles">
                                            <span class="dot"></span>
                                            <span>Проверено: загрузка...</span>
                                        </div>
                                        <div class="stats-column" id="stats-column-equipment-wrapper">
                                            <div class="stats-column-title">🛡️ Снаряжение</div>
                                            <div class="stat-row">
                                                <span class="stat-label">🗡️ Ближний бой</span>
                                                <span class="stat-value" id="stat-row-eq-melee">-</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🏹 Дальний бой</span>
                                                <span class="stat-value" id="stat-row-eq-ranged">-</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🐸 Наголовник</span>
                                                <span class="stat-value" id="stat-row-eq-helmet">-</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🥼 Нагрудник</span>
                                                <span class="stat-value" id="stat-row-eq-chest">-</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🧤 Налапники</span>
                                                <span class="stat-value" id="stat-row-eq-paws">-</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🏋️ Банда</span>
                                                <span class="stat-value" id="stat-row-eq-gang">-</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🚀 Усилитель</span>
                                                <span class="stat-value" id="stat-row-eq-booster">-</span>
                                            </div>
                                            <div class="stat-row" style="align-items: flex-start; margin-bottom: 6px;">
                                                <span class="stat-label">✨ Эффекты</span>
                                                <span class="stat-value" id="stat-row-eq-buffs" style="text-align: right; white-space: pre-line;">-</span>
                                            </div>
                                            
                                            <!-- Разделитель: Компоненты -->
                                            <div style="margin-top: 6px; margin-bottom: 6px; border-bottom: 1px dashed rgba(255,255,255,0.08);"></div>
                                            <div class="stat-row">
                                                <span class="stat-label">⚙️ Оружейные кусочки</span>
                                                <span class="stat-value" id="stat-row-eq-parts-weapon">-</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🌿 Кусочки водорослей</span>
                                                <span class="stat-value" id="stat-row-eq-parts-algae">-</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🥬 Кусочки кувшинки</span>
                                                <span class="stat-value" id="stat-row-eq-parts-lily">-</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🦴 Кусочки клюва</span>
                                                <span class="stat-value" id="stat-row-eq-parts-beak">-</span>
                                            </div>
                                            <div class="stat-row" style="margin-bottom: 6px;">
                                                <span class="stat-label">💎 ЖабоГемы</span>
                                                <span class="stat-value" id="stat-row-eq-gems">-</span>
                                            </div>
                                            
                                            <!-- Разделитель: Характеристики боя -->
                                            <div style="margin-top: 6px; margin-bottom: 6px; border-bottom: 1px dashed rgba(255,255,255,0.08);"></div>
                                            <div class="stat-row">
                                                <span class="stat-label">❤️ Здоровье</span>
                                                <span class="stat-value" id="stat-row-eq-health">-</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">⚔️ Атака</span>
                                                <span class="stat-value" id="stat-row-eq-attack">-</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🛡️ Защита</span>
                                                <span class="stat-value" id="stat-row-eq-defense">-</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Столбец 3: Ежедневные задачи -->
                                    <div class="stats-column-wrapper">
                                        <div class="column-timer" id="timer-column-daily">
                                            <span class="dot"></span>
                                            <span>Проверено: загрузка...</span>
                                        </div>
                                        <div class="stats-column">
                                            <div class="stats-column-title">📅 Дейлики</div>
                                            <div class="stat-row">
                                                <span class="stat-label">Статус дейлика</span>
                                                <span class="stat-value" id="stat-row-daily-status">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Дней в запасе</span>
                                                <span class="stat-value" id="stat-row-reserve-days">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Выполнен сегодня?</span>
                                                <span class="stat-value" id="stat-row-daily-completed">Загрузка...</span>
                                            </div>
                                            <div class="stat-row-vertical" id="stat-row-daily-tasks-wrapper" style="display: flex; flex-direction: column; align-items: flex-start; padding: 4px 0; width: 100%;">
                                                <span class="stat-label" style="margin-bottom: 4px;">Задания</span>
                                                <span class="stat-value" id="stat-row-daily-tasks" style="text-align: left; white-space: pre-line; padding-left: 24px; width: 100%; box-sizing: border-box;">-</span>
                                            </div>
                                            <div class="stat-row-vertical" id="stat-row-daily-reward-wrapper" style="display: flex; flex-direction: column; align-items: flex-start; padding: 4px 0; width: 100%;">
                                                <span class="stat-label" style="margin-bottom: 4px;">Награда</span>
                                                <span class="stat-value" id="stat-row-daily-reward" style="text-align: left; white-space: pre-line; padding-left: 24px; width: 100%; box-sizing: border-box;">-</span>
                                            </div>
                                            <div class="stat-row-vertical" id="stat-row-daily-bonus-tasks-wrapper" style="display: flex; flex-direction: column; align-items: flex-start; padding: 4px 0; width: 100%;">
                                                <span class="stat-label" style="margin-bottom: 4px;">Доп. задания</span>
                                                <span class="stat-value" id="stat-row-daily-bonus-tasks" style="text-align: left; white-space: pre-line; padding-left: 24px; width: 100%; box-sizing: border-box;">-</span>
                                            </div>
                                            <div class="stat-row-vertical" id="stat-row-daily-bonus-reward-wrapper" style="display: flex; flex-direction: column; align-items: flex-start; padding: 4px 0; width: 100%;">
                                                <span class="stat-label" style="margin-bottom: 4px;">Доп. награда</span>
                                                <span class="stat-value" id="stat-row-daily-bonus-reward" style="text-align: left; white-space: pre-line; padding-left: 24px; width: 100%; box-sizing: border-box;">-</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Подвкладка: Семья -->
                            <div class="sub-tab-content ${state.activeSubTab === 'family' ? '' : 'hidden'}" id="sub-tab-family">
                                <div class="stats-columns-grid" style="grid-template-columns: 1fr; max-width: 480px; margin: 0;">
                                    <div class="stats-column-wrapper">
                                        <div class="column-timer" id="timer-column-family">
                                            <span class="dot"></span>
                                            <span>Проверено: загрузка...</span>
                                        </div>
                                        <div class="stats-column">
                                            <div class="stats-column-title">💍 Семейные узы</div>
                                            <div class="stat-row">
                                                <span class="stat-label">Партнер</span>
                                                <span class="stat-value" id="stat-row-family-partner">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Дней в браке</span>
                                                <span class="stat-value" id="stat-row-family-marriage-days">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Конфетки</span>
                                                <span class="stat-value" id="stat-row-family-candies">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Имя жабёнка</span>
                                                <span class="stat-value" id="stat-row-family-froglet">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Уровень</span>
                                                <span class="stat-value" id="stat-row-family-level">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Сытость</span>
                                                <span class="stat-value" id="stat-row-family-satiety">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Авторитет</span>
                                                <span class="stat-value" id="stat-row-family-authority">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Настроение</span>
                                                <span class="stat-value" id="stat-row-family-mood">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Покормить через</span>
                                                <span class="stat-value" id="stat-row-family-feed-in">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Забрать через</span>
                                                <span class="stat-value" id="stat-row-family-kindergarten">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Махач через</span>
                                                <span class="stat-value" id="stat-row-family-clash">Загрузка...</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Подвкладка: Банда -->
                            <div class="sub-tab-content ${state.activeSubTab === 'gang' ? '' : 'hidden'}" id="sub-tab-gang">
                                <div class="stats-columns-grid" style="grid-template-columns: 1fr; max-width: 480px; margin: 0;">
                                    <div class="stats-column-wrapper">
                                        <div class="column-timer" id="timer-column-gang">
                                            <span class="dot"></span>
                                            <span>Проверено: загрузка...</span>
                                        </div>
                                        <div class="stats-column">
                                            <div class="stats-column-title">🏋️ Банда</div>
                                            <div class="stat-row">
                                                <span class="stat-label">Тип банды</span>
                                                <span class="stat-value" id="stat-row-gang-type">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Название</span>
                                                <span class="stat-value" id="stat-row-gang-name">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Верность</span>
                                                <span class="stat-value" id="stat-row-gang-loyalty">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Урон</span>
                                                <span class="stat-value" id="stat-row-gang-damage">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Шанс срабатывания</span>
                                                <span class="stat-value" id="stat-row-gang-chance">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Кулон</span>
                                                <span class="stat-value" id="stat-row-gang-pendant">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Время кулона</span>
                                                <span class="stat-value" id="stat-row-gang-pendant-duration">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Брать на тусу</span>
                                                <span class="stat-value" id="stat-row-gang-party">Загрузка...</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Подвкладка: Арена -->
                            <div class="sub-tab-content ${state.activeSubTab === 'arena' ? '' : 'hidden'}" id="sub-tab-arena">
                                <div class="stats-columns-grid" style="grid-template-columns: 1fr; max-width: 480px; margin: 0;">
                                    <div class="stats-column-wrapper">
                                        <div class="column-timer" id="timer-column-arena">
                                            <span class="dot"></span>
                                            <span>Проверено: загрузка...</span>
                                        </div>
                                        <div class="stats-column">
                                            <div class="stats-column-title">⚔️ Сезонная арена</div>
                                            <div class="stat-row">
                                                <span class="stat-label">Сезон</span>
                                                <span class="stat-value" id="stat-row-arena-season">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Побед</span>
                                                <span class="stat-value" id="stat-row-arena-wins">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Поражений</span>
                                                <span class="stat-value" id="stat-row-arena-losses">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Место в сезоне</span>
                                                <span class="stat-value" id="stat-row-arena-place">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Очки</span>
                                                <span class="stat-value" id="stat-row-arena-points">Загрузка...</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Подвкладка: Клан -->
                            <div class="sub-tab-content ${state.activeSubTab === 'clan' ? '' : 'hidden'}" id="sub-tab-clan">
                                <div class="stats-columns-grid" style="grid-template-columns: repeat(2, 1fr); max-width: 720px; margin: 0;">
                                    <!-- Столбец 1: Клан -->
                                    <div class="stats-column-wrapper">
                                        <div class="column-timer" id="timer-column-clan">
                                            <span class="dot"></span>
                                            <span>Проверено: загрузка...</span>
                                        </div>
                                        <div class="stats-column">
                                            <div class="stats-column-title">🚩 Клан</div>
                                            <div class="stat-row">
                                                <span class="stat-label">Название</span>
                                                <span class="stat-value" id="stat-row-clan-name">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">За картой</span>
                                                <span class="stat-value" id="stat-row-clan-offmap">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Карт</span>
                                                <span class="stat-value" id="stat-row-clan-cards">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Опыт</span>
                                                <span class="stat-value" id="stat-row-clan-exp">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Уровень</span>
                                                <span class="stat-value" id="stat-row-clan-level">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Лига</span>
                                                <span class="stat-value" id="stat-row-clan-league">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Сражений за сезон</span>
                                                <span class="stat-value" id="stat-row-clan-battles">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Очков</span>
                                                <span class="stat-value" id="stat-row-clan-points">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Усилитель</span>
                                                <span class="stat-value" id="stat-row-clan-booster">Загрузка...</span>
                                            </div>
                                        </div>
                                    </div>
                                    <!-- Столбец 2: Состав -->
                                    <div class="stats-column-wrapper">
                                        <div class="column-timer" style="opacity: 0;">
                                            <span class="dot"></span>
                                            <span>Проверено: загрузка...</span>
                                        </div>
                                        <div class="stats-column">
                                            <div class="stats-column-title">👥 Состав</div>
                                            <div class="stat-row">
                                                <span class="stat-label">Состав</span>
                                                <span class="stat-value" id="stat-row-clan-members">Загрузка...</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Подвкладка: Инвентарь -->
                            <div class="sub-tab-content ${state.activeSubTab === 'inventory' ? '' : 'hidden'}" id="sub-tab-inventory">
                                <div class="stats-columns-grid">
                                    <!-- Столбец 1: Инвентарь -->
                                    <div class="stats-column-wrapper">
                                        <div class="column-timer" id="timer-column-inventory">
                                            <span class="dot"></span>
                                            <span>Проверено: загрузка...</span>
                                        </div>
                                        <div class="stats-column">
                                            <div class="stats-column-title">🎒 Инвентарь</div>
                                            <div class="stat-row">
                                                <span class="stat-label">🍭 Леденцы</span>
                                                <span class="stat-value" id="stat-row-inv-lollipop">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">💊 Аптечки</span>
                                                <span class="stat-value" id="stat-row-inv-bandages">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🍻 Пивас</span>
                                                <span class="stat-value" id="stat-row-inv-beer">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🦟 Стрекозюля удачи</span>
                                                <span class="stat-value" id="stat-row-inv-dragonfly">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🗺 Карта болота</span>
                                                <span class="stat-value" id="stat-row-inv-map">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🧿 Изолента</span>
                                                <span class="stat-value" id="stat-row-inv-tape">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🐸 Жабули для банды</span>
                                                <span class="stat-value" id="stat-row-inv-gang-frogs">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🔋 Капсула опыта</span>
                                                <span class="stat-value" id="stat-row-inv-exp-capsule">Загрузка...</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Столбец 2: Ограбление -->
                                    <div class="stats-column-wrapper">
                                        <div class="column-timer" id="timer-column-robbery-gear">
                                            <span class="dot"></span>
                                            <span>Проверено: загрузка...</span>
                                        </div>
                                        <div class="stats-column">
                                            <div class="stats-column-title">🥷 Ограбление</div>
                                            <div class="stat-row">
                                                <span class="stat-label">🔖 Пропуск</span>
                                                <span class="stat-value" id="stat-row-eq-pass">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🪛 Отмычка</span>
                                                <span class="stat-value" id="stat-row-eq-lockpick">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🔋 Батарейка</span>
                                                <span class="stat-value" id="stat-row-eq-battery">Загрузка...</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Столбец 3: Крафт -->
                                    <div class="stats-column-wrapper">
                                        <div class="column-timer" id="timer-column-craft">
                                            <span class="dot"></span>
                                            <span>Проверено: загрузка...</span>
                                        </div>
                                        <div class="stats-column">
                                            <div class="stats-column-title">🛠 Крафт</div>
                                            <div class="stat-row">
                                                <span class="stat-label">🧩</span>
                                                <span class="stat-value" id="stat-row-cr-puzzle">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🔗</span>
                                                <span class="stat-value" id="stat-row-cr-link">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🪨</span>
                                                <span class="stat-value" id="stat-row-cr-stone">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">🎭</span>
                                                <span class="stat-value" id="stat-row-cr-mask">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">📃</span>
                                                <span class="stat-value" id="stat-row-cr-paper">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">⚡️</span>
                                                <span class="stat-value" id="stat-row-cr-lightning">Загрузка...</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Вкладка: Лог -->
                    <div class="tab-content ${state.activeTab === 'logs' ? '' : 'hidden'}" id="tab-logs">
                        <div class="console-wrapper in-tab">
                            <div class="console-output" id="tab-logs-container">
                                <!-- Логи вставляются динамически -->
                            </div>
                        </div>
                        <div class="tab-logs-actions">
                            <button class="clear-btn" id="btn-clear-tab-logs">Очистить лог</button>
                        </div>
                    </div>

                    <!-- Вкладка: Настройки -->
                    <div class="tab-content ${state.activeTab === 'settings' ? '' : 'hidden'}" id="tab-settings">
                        ${acc.vk_id === 0 ? `
                        <div class="global-settings-grid">
                            <div class="auto-card-section" style="padding: 8px; gap: 4px;">
                                <div class="global-setting-row" style="display: flex; justify-content: flex-start; align-items: center; gap: 12px; padding: 4px 10px; margin-bottom: 4px;">
                                    <span class="label" style="width: 220px; flex-shrink: 0;">🚦 Фора начала работы</span>
                                    <input type="number" min="0" class="global-setting-input" id="global-work-start-grace" value="${state.globalSettings.work_start_grace !== undefined ? state.globalSettings.work_start_grace : 60}">
                                    <span class="desc" style="font-size: 11.5px; color: var(--color-text-muted); margin-left: 8px;">— фора команды пути («Работа» / «Отправиться»)</span>
                                </div>
                                
                                <div class="global-setting-row" style="display: flex; justify-content: flex-start; align-items: center; gap: 12px; padding: 4px 10px; margin-bottom: 4px;">
                                    <span class="label" style="width: 220px; flex-shrink: 0;">🏃 Фора после похода на работу</span>
                                    <input type="number" min="0" class="global-setting-input" id="global-work-travel-grace" value="${state.globalSettings.work_travel_grace !== undefined ? state.globalSettings.work_travel_grace : 60}">
                                    <span class="desc" style="font-size: 11.5px; color: var(--color-text-muted); margin-left: 8px;">— фора команды «Начать работу»</span>
                                </div>
                                
                                <div class="global-setting-row" style="display: flex; justify-content: flex-start; align-items: center; gap: 12px; padding: 4px 10px; margin-bottom: 4px;">
                                    <span class="label" style="width: 220px; flex-shrink: 0;">🏁 Фора завершения работы</span>
                                    <input type="number" min="0" class="global-setting-input" id="global-work-end-grace" value="${state.globalSettings.work_end_grace !== undefined ? state.globalSettings.work_end_grace : 60}">
                                    <span class="desc" style="font-size: 11.5px; color: var(--color-text-muted); margin-left: 8px;">— фора команды «Завершить работу»</span>
                                </div>

                                <div class="global-setting-row" style="display: flex; justify-content: flex-start; align-items: center; gap: 12px; padding: 4px 10px; margin-bottom: 4px;">
                                    <span class="label" style="width: 220px; flex-shrink: 0;">⏱️ Минимальная задержка</span>
                                    <input type="number" min="0" class="global-setting-input" id="global-min-command-delay" value="${state.globalSettings.min_command_delay !== undefined ? state.globalSettings.min_command_delay : 3}">
                                    <span class="desc" style="font-size: 11.5px; color: var(--color-text-muted); margin-left: 8px;">— минимальная задержка между командами (сек)</span>
                                </div>
                            </div>
                        </div>
                        ` : `
                        <div class="detail-automation-grid" style="gap: 12px;">
                            <div class="auto-card-section" style="padding: 10px; gap: 6px;">
                                <div class="auto-row" style="display: flex; justify-content: flex-start; align-items: center; margin-bottom: 6px; gap: 16px;">
                                    <span class="label" style="width: 220px; flex-shrink: 0;">🥩 Включить авто-кормление</span>
                                    <label class="switch">
                                        <input type="checkbox" class="toggle-setting" data-setting="auto_feed" ${acc.auto_feed === 1 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                </div>
                                
                                <div class="auto-row" style="display: flex; justify-content: flex-start; align-items: center; margin-bottom: 6px; gap: 16px;">
                                    <span class="label" style="width: 220px; flex-shrink: 0;">💼 Включить авто-работу</span>
                                    <label class="switch">
                                        <input type="checkbox" class="toggle-setting" data-setting="auto_work" ${acc.auto_work === 1 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                </div>

                                <div class="auto-row" style="display: flex; justify-content: flex-start; align-items: center; gap: 16px;">
                                    <span class="label" style="width: 220px; flex-shrink: 0;">⚔️ Включить авто-арену</span>
                                    <label class="switch">
                                        <input type="checkbox" class="toggle-setting" data-setting="auto_arena" ${acc.auto_arena === 1 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                </div>
                            </div>

                            <div class="auto-card-section" style="padding: 10px; gap: 6px;">
                                <div class="auto-row" style="display: flex; justify-content: flex-start; align-items: center; margin-bottom: 6px; gap: 16px;">
                                    <span class="label" style="width: 220px; flex-shrink: 0;">🕳️ Включить авто-подземелье</span>
                                    <label class="switch">
                                        <input type="checkbox" class="toggle-setting" data-setting="auto_dungeon" ${acc.auto_dungeon === 1 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                </div>

                                <div class="auto-row" style="display: flex; justify-content: flex-start; align-items: center; gap: 16px;">
                                    <span class="label" style="width: 220px; flex-shrink: 0;">🏢 Работа</span>
                                    <select class="work-select select-setting" data-setting="work_type" style="background-color: var(--bg-input); border: 1px solid var(--border-glass); border-radius: 8px; color: var(--color-text-main); padding: 4px 10px; font-size: 12px; outline: none; cursor: pointer; width: 180px;">
                                        <option value="Нет" ${(!acc.work_type || acc.work_type === 'Нет') ? 'selected' : ''}>Нет</option>
                                        <option value="Поход в столовую" ${acc.work_type === 'Поход в столовую' ? 'selected' : ''}>Поход в столовую</option>
                                        <option value="Работа крупье" ${acc.work_type === 'Работа крупье' ? 'selected' : ''}>Работа крупье</option>
                                        <option value="Работа грабитель" ${acc.work_type === 'Работа грабитель' ? 'selected' : ''}>Работа грабитель</option>
                                        <option value="Отправиться в кафетерий" ${acc.work_type === 'Отправиться в кафетерий' ? 'selected' : ''}>Отправиться в кафетерий</option>
                                        <option value="Отправиться в казино" ${acc.work_type === 'Отправиться в казино' ? 'selected' : ''}>Отправиться в казино</option>
                                        <option value="Отправиться в банк" ${acc.work_type === 'Отправиться в банк' ? 'selected' : ''}>Отправиться в банк</option>
                                    </select>
                                </div>
                            </div>

                            <div class="auto-card-section" style="padding: 10px; gap: 6px; grid-column: span 2;">
                                <div class="auto-row" style="display: flex; justify-content: space-between; align-items: center; gap: 16px;">
                                    <span class="label" style="flex-shrink: 0; font-weight: 600; font-size: 13px; color: var(--color-text-main);">❤️ Пролайкать группу vk.com/toadbot от имени сообщества</span>
                                    <button class="btn primary" id="btn-like-toadbot" style="padding: 6px 20px; font-size: 12px; font-weight: 600; border-radius: 8px; background-color: var(--color-success); border-color: var(--color-success); box-shadow: 0 4px 15px var(--color-success-glow);">Лайки</button>
                                </div>
                            </div>
                        </div>
                        `}
                    </div>
                </div>
            </div>
        `;

        bindDetailPanelEvents(acc.vk_id);

        // Принудительно рендерим логи для этого аккаунта при первом открытии
        state.lastLogId = 0;
        renderLogs();
        
        // Сразу заполняем подвкладки Статистики и Расписание актуальными значениями
        updateDetailPanelData(acc);
        renderSchedule();
        startLiveTimers();
    }

    // Привязка событий внутри панели деталей
    function bindDetailPanelEvents(vkId) {
        // Клик по вкладкам
        const tabButtons = dashboardDetailsLayout.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                state.activeTab = tabName;
                
                // Переключаем активный класс у кнопок
                tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Скрываем/показываем вкладки
                dashboardDetailsLayout.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.add('hidden');
                });
                const targetContent = dashboardDetailsLayout.querySelector(`#tab-${tabName}`);
                if (targetContent) {
                    targetContent.classList.remove('hidden');
                }
                
                // Если переключились на лог, перерисовываем его и скроллим вниз
                if (tabName === 'logs') {
                    const tabLogsContainer = document.getElementById('tab-logs-container');
                    if (tabLogsContainer) {
                        tabLogsContainer.innerHTML = '';
                    }
                    state.lastLogId = 0;
                    renderLogs();
                    // Дополнительный гарантированный скролл после переключения видимости вкладки
                    setTimeout(() => {
                        if (tabLogsContainer) {
                            tabLogsContainer.scrollTop = tabLogsContainer.scrollHeight;
                        }
                    }, 100);
                }

                // Если переключились на расписание, перерисовываем его
                if (tabName === 'schedule') {
                    renderSchedule();
                }
            });
        });

        // Клик по подвкладкам Статистики
        const subTabButtons = dashboardDetailsLayout.querySelectorAll('.sub-tab-btn');
        subTabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const subtabName = btn.dataset.subtab;
                state.activeSubTab = subtabName;
                
                // Переключаем активную кнопку подвкладки
                subTabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Переключаем контент подвкладки
                dashboardDetailsLayout.querySelectorAll('.sub-tab-content').forEach(c => {
                    c.classList.add('hidden');
                });
                const targetSubContent = dashboardDetailsLayout.querySelector(`#sub-tab-${subtabName}`);
                if (targetSubContent) {
                    targetSubContent.classList.remove('hidden');
                }
            });
        });

        // Автоматическое сохранение глобальных настроек
        const bindGlobalSettingInput = (id) => {
            const input = dashboardDetailsLayout.querySelector(`#${id}`);
            if (input) {
                input.addEventListener('change', async () => {
                    const workStartGrace = parseInt(dashboardDetailsLayout.querySelector('#global-work-start-grace').value) || 0;
                    const workTravelGrace = parseInt(dashboardDetailsLayout.querySelector('#global-work-travel-grace').value) || 0;
                    const workEndGrace = parseInt(dashboardDetailsLayout.querySelector('#global-work-end-grace').value) || 0;
                    const minCommandDelay = parseInt(dashboardDetailsLayout.querySelector('#global-min-command-delay').value) || 0;
                    
                    try {
                        const response = await fetch('/api/global/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                work_start_grace: workStartGrace,
                                work_travel_grace: workTravelGrace,
                                work_end_grace: workEndGrace,
                                min_command_delay: minCommandDelay
                            })
                        });
                        
                        if (!response.ok) throw new Error('Не удалось сохранить глобальные настройки');
                        
                        state.globalSettings = {
                            work_start_grace: workStartGrace,
                            work_travel_grace: workTravelGrace,
                            work_end_grace: workEndGrace,
                            min_command_delay: minCommandDelay
                        };
                        showToast('⚙️ Настройки сохранены автоматически', 'success');
                    } catch (error) {
                        console.error('Ошибка сохранения глобальных настроек:', error);
                        showToast('❌ Ошибка автоматического сохранения', 'error');
                    }
                });
            }
        };

        bindGlobalSettingInput('global-work-start-grace');
        bindGlobalSettingInput('global-work-travel-grace');
        bindGlobalSettingInput('global-work-end-grace');
        bindGlobalSettingInput('global-min-command-delay');

        // Настройки автоматизации
        dashboardDetailsLayout.querySelectorAll('.toggle-setting').forEach(input => {
            input.addEventListener('change', async (e) => {
                const setting = e.target.dataset.setting;
                const value = e.target.checked ? 1 : 0;
                await updateSetting(vkId, setting, value);
            });
        });

        const workSelect = dashboardDetailsLayout.querySelector('.work-select');
        if (workSelect) {
            workSelect.addEventListener('change', async (e) => {
                const value = e.target.value;
                await updateSetting(vkId, 'work_type', value);
            });
        }

        // Запуск/Остановка бота
        const toggleActiveBtn = dashboardDetailsLayout.querySelector('#btn-toggle-active');
        if (toggleActiveBtn) {
            toggleActiveBtn.addEventListener('click', async (e) => {
                const currentActive = parseInt(e.target.dataset.active);
                
                // Добавляем класс ожидания (pending) для оранжевой подсветки в сайдбаре
                if (vkId === 0) {
                    document.querySelectorAll('.sidebar-toggle-btn').forEach(btn => btn.classList.add('pending'));
                } else {
                    const sbItem = document.querySelector(`.sidebar-account-item[data-vkid="${vkId}"] .sidebar-toggle-btn`);
                    if (sbItem) sbItem.classList.add('pending');
                }
                
                if (currentActive === 1) {
                    if (vkId === 0) {
                        await toggleAllAccountsActive(0, 0);
                    } else {
                        await toggleAccountActive(vkId, 0, 0);
                    }
                } else {
                    if (vkId === 0) {
                        showInitSessionModal(0, "Всех аккаунтов");
                    } else {
                        const account = state.accounts.find(a => a.vk_id === vkId);
                        const name = account ? account.name : "Выбранного аккаунта";
                        showInitSessionModal(vkId, name);
                    }
                }
            });
        }

        // Очистить логи вкладки
        const btnClearTabLogs = dashboardDetailsLayout.querySelector('#btn-clear-tab-logs');
        if (btnClearTabLogs) {
            btnClearTabLogs.addEventListener('click', async () => {
                const targetVkId = vkId;
                const url = targetVkId > 0 ? `/api/logs/clear?vk_id=${targetVkId}` : '/api/logs/clear';
                
                try {
                    const response = await fetch(url, { method: 'POST' });
                    if (!response.ok) throw new Error('Не удалось очистить логи');
                    
                    const data = await response.json();
                    
                    // Очищаем DOM логов
                    const tabLogsContainer = document.getElementById('tab-logs-container');
                    if (tabLogsContainer) {
                        tabLogsContainer.innerHTML = '';
                    }
                    
                    // Вычищаем локальное состояние логов в памяти, чтобы они не восстанавливались
                    if (targetVkId > 0) {
                        state.logs = state.logs.filter(log => log.vk_id !== targetVkId);
                    } else {
                        state.logs = [];
                    }
                    
                    state.lastLogId = 0;
                    showToast(data.message, 'success');
                } catch (error) {
                    console.error('Ошибка при очистке логов:', error);
                    showToast('❌ Ошибка при очистке логов', 'error');
                }
            });
        }



        // Клик по кнопке Мониторинг
        const btnOpenMonitor = dashboardDetailsLayout.querySelector('#btn-open-monitor');
        if (btnOpenMonitor) {
            btnOpenMonitor.addEventListener('click', showMonitorModal);
        }

        // Клик по кнопке Лайки
        const btnLikeToadbot = dashboardDetailsLayout.querySelector('#btn-like-toadbot');
        if (btnLikeToadbot) {
            btnLikeToadbot.addEventListener('click', async () => {
                try {
                    const response = await fetch(`/api/accounts/${vkId}/like_group`, {
                        method: 'POST'
                    });
                    const data = await response.json();
                    if (response.ok) {
                        showToast('❤️ Задача лайков запущена', 'success');
                        showLikesProgressModal(vkId);
                    } else {
                        showToast(`❌ Ошибка: ${data.detail || 'Не удалось запустить'}`, 'error');
                    }
                } catch (error) {
                    console.error('Ошибка запуска задачи лайков:', error);
                    showToast('❌ Ошибка сети', 'error');
                }
            });
        }
    }


    // Быстрое и плавное обновление данных во вкладках без перезаписи innerHTML (без мерцания!)
    function updateDetailPanelData(acc) {
        // 1. Агрегируем время последней проверки для общего аккаунта
        if (acc.vk_id === 0) {
            let maxLastChecked = null;
            state.accounts.forEach(a => {
                if (a.last_checked) {
                    if (!maxLastChecked || new Date(a.last_checked) > new Date(maxLastChecked)) {
                        maxLastChecked = a.last_checked;
                    }
                }
            });
            acc.last_checked = maxLastChecked;
        }

        // Обновляем таймеры последнего обновления
        const ts = acc.toad_state;
        const timeAgoText = (acc.vk_id !== 0 && ts && ts.last_updated_iso) ? formatLastChecked(ts.last_updated_iso) : formatLastChecked(acc.last_checked);
        const timerSatiety = document.querySelector('#timer-column-satiety span:last-child');
        const dotSatiety = document.querySelector('#timer-column-satiety .dot');
        if (timerSatiety) {
            const fullText = `Проверено: ${timeAgoText}`;
            if (timerSatiety.textContent !== fullText) timerSatiety.textContent = fullText;
            if (dotSatiety) {
                if (acc.last_checked) {
                    dotSatiety.classList.remove('offline');
                } else {
                    dotSatiety.classList.add('offline');
                }
            }
        }
        
        const timerBattles = document.querySelector('#timer-column-battles span:last-child');
        const dotBattles = document.querySelector('#timer-column-battles .dot');
        if (timerBattles) {
            const fullText = `Проверено: ${timeAgoText}`;
            if (timerBattles.textContent !== fullText) timerBattles.textContent = fullText;
            if (dotBattles) {
                if (acc.last_checked) {
                    dotBattles.classList.remove('offline');
                } else {
                    dotBattles.classList.add('offline');
                }
            }
        }

        const timerDaily = document.querySelector('#timer-column-daily span:last-child');
        const dotDaily = document.querySelector('#timer-column-daily .dot');
        if (timerDaily) {
            const fullText = `Проверено: ${timeAgoText}`;
            if (timerDaily.textContent !== fullText) timerDaily.textContent = fullText;
            if (dotDaily) {
                if (acc.last_checked) {
                    dotDaily.classList.remove('offline');
                } else {
                    dotDaily.classList.add('offline');
                }
            }
        }

        const timerFamily = document.querySelector('#timer-column-family span:last-child');
        const dotFamily = document.querySelector('#timer-column-family .dot');
        if (timerFamily) {
            const fullText = `Проверено: ${timeAgoText}`;
            if (timerFamily.textContent !== fullText) timerFamily.textContent = fullText;
            if (dotFamily) {
                if (acc.last_checked) {
                    dotFamily.classList.remove('offline');
                } else {
                    dotFamily.classList.add('offline');
                }
            }
        }

        const timerArena = document.querySelector('#timer-column-arena span:last-child');
        const dotArena = document.querySelector('#timer-column-arena .dot');
        if (timerArena) {
            const fullText = `Проверено: ${timeAgoText}`;
            if (timerArena.textContent !== fullText) timerArena.textContent = fullText;
            if (dotArena) {
                if (acc.last_checked) {
                    dotArena.classList.remove('offline');
                } else {
                    dotArena.classList.add('offline');
                }
            }
        }

        const timerClan = document.querySelector('#timer-column-clan span:last-child');
        const dotClan = document.querySelector('#timer-column-clan .dot');
        if (timerClan) {
            const fullText = `Проверено: ${timeAgoText}`;
            if (timerClan.textContent !== fullText) timerClan.textContent = fullText;
            if (dotClan) {
                if (acc.last_checked) {
                    dotClan.classList.remove('offline');
                } else {
                    dotClan.classList.add('offline');
                }
            }
        }

        const timerGang = document.querySelector('#timer-column-gang span:last-child');
        const dotGang = document.querySelector('#timer-column-gang .dot');
        if (timerGang) {
            const fullText = `Проверено: ${timeAgoText}`;
            if (timerGang.textContent !== fullText) timerGang.textContent = fullText;
            if (dotGang) {
                if (acc.last_checked) {
                    dotGang.classList.remove('offline');
                } else {
                    dotGang.classList.add('offline');
                }
            }
        }

        // 2. Обновляем текстовые значения статистики в подвкладке «Жаба»
        const rowSatiety = document.getElementById('stat-row-satiety');
        if (rowSatiety) {
            let val;
            if (acc.vk_id === 0) {
                const total = state.accounts.length;
                const fed = state.accounts.filter(a => a.satiety && (a.satiety.includes('Сыта') || a.satiety === 'Сыта 🍏')).length;
                val = total > 0 ? `😋 Сытых: ${fed} / ${total}` : 'Нет аккаунтов';
            } else {
                val = acc.satiety || 'Сыта 🍏';
            }
            if (rowSatiety.textContent !== val) rowSatiety.textContent = val;
        }

        const rowStatus = document.getElementById('stat-row-status');
        if (rowStatus) {
            let val;
            if (acc.vk_id === 0) {
                const total = state.accounts.length;
                const alive = state.accounts.filter(a => a.toad_state && (a.toad_state.state === 'Живая' || a.toad_state.state === 'alive')).length;
                val = total > 0 ? `💚 Живых: ${alive} / ${total}` : 'Нет аккаунтов';
            } else {
                const toadState = (acc.toad_state && acc.toad_state.state) ? acc.toad_state.state : null;
                if (toadState === 'Живая' || toadState === 'alive') {
                    val = '💚 Живая';
                } else if (toadState === 'Нужна реанимация' || toadState === 'injured') {
                    val = '💔 Нужна реанимация';
                } else {
                    val = '❓ Неизвестно';
                }
            }
            if (rowStatus.textContent !== val) rowStatus.textContent = val;
        }

        const rowBugs = document.getElementById('stat-row-bugs');
        if (rowBugs) {
            const val = `🐞 ${acc.bugs || 0}`;
            if (rowBugs.textContent !== val) rowBugs.textContent = val;
        }

        const rowClass = document.getElementById('stat-row-class');
        if (rowClass) {
            const val = `🧙‍♂️ ${acc.vk_id === 0 ? 'Все классы' : (acc.class_name || 'Не выбран')}`;
            if (rowClass.textContent !== val) rowClass.textContent = val;
        }

        const rowMood = document.getElementById('stat-row-mood');
        if (rowMood) {
            const val = `👻 ${acc.mood || 0}`;
            if (rowMood.textContent !== val) rowMood.textContent = val;
        }

        // Живые таймеры кулдаунов (тик каждую секунду через liveTimersInterval)
        renderCooldownRow('stat-row-work-info', acc, state, 'work_info', 'work_cooldown', '💼', 'Можно работать', 'Не на работе', { cooldown: 'Работа через', working: 'На работе еще' });
        renderCooldownRow('stat-row-feed-info', acc, state, 'feed_info', 'feed_cooldown', '🍽️', 'Можно покормить', 'Не кормлена');
        renderCooldownRow('stat-row-fattening', acc, state, 'fattening', 'fattening_cooldown', '🐷', 'Можно откормить', 'Нет');
        renderCooldownRow('stat-row-dungeon', acc, state, 'dungeon_info', 'dungeon_cooldown', '👹', 'Доступно', 'Нет данных');
        renderCooldownRow('stat-row-arena', acc, state, 'arena_info', 'arena_cooldown', '⚔️', 'Можно на арену', 'Нет данных');

        const rowWins = document.getElementById('stat-row-wins');
        if (rowWins) {
            const val = `🏆 ${acc.wins || 0}`;
            if (rowWins.textContent !== val) rowWins.textContent = val;
        }

        const rowLosses = document.getElementById('stat-row-losses');
        if (rowLosses) {
            const val = `💀 ${acc.losses || 0}`;
            if (rowLosses.textContent !== val) rowLosses.textContent = val;
        }

        const wrapperEquipment = document.getElementById('stats-column-equipment-wrapper');
        const timerBattlesWrapper = document.getElementById('timer-column-battles');
        
        if (wrapperEquipment) {
            if (acc.vk_id === 0) {
                wrapperEquipment.classList.add('hidden');
                if (timerBattlesWrapper) timerBattlesWrapper.classList.add('hidden');
            } else {
                wrapperEquipment.classList.remove('hidden');
                if (timerBattlesWrapper) timerBattlesWrapper.classList.remove('hidden');
                
                const ts = acc.toad_state || {};
                
                const setEqVal = (id, val) => {
                    const el = document.getElementById(id);
                    if (el && el.textContent !== val) el.textContent = val;
                };
                
                // Get modifiers if present
                const helmetMod = ts.eq_helmet_mod && ts.eq_helmet_mod !== '-' ? ` (${ts.eq_helmet_mod})` : '';
                const chestMod = ts.eq_chest_mod && ts.eq_chest_mod !== '-' ? ` (${ts.eq_chest_mod})` : '';
                const pawsMod = ts.eq_paws_mod && ts.eq_paws_mod !== '-' ? ` (${ts.eq_paws_mod})` : '';
                
                setEqVal('stat-row-eq-melee', ts.eq_melee || '-');
                setEqVal('stat-row-eq-ranged', ts.eq_ranged || '-');
                setEqVal('stat-row-eq-helmet', ts.eq_helmet ? `${ts.eq_helmet}${helmetMod}` : '-');
                setEqVal('stat-row-eq-chest', ts.eq_chest ? `${ts.eq_chest}${chestMod}` : '-');
                setEqVal('stat-row-eq-paws', ts.eq_paws ? `${ts.eq_paws}${pawsMod}` : '-');
                setEqVal('stat-row-eq-gang', ts.eq_gang || '-');
                setEqVal('stat-row-eq-booster', ts.eq_booster || '-');
                setEqVal('stat-row-eq-buffs', ts.eq_buffs || '-');
                
                // Components
                setEqVal('stat-row-eq-parts-weapon', ts.eq_parts_weapon || '-');
                setEqVal('stat-row-eq-parts-algae', ts.eq_parts_algae || '-');
                setEqVal('stat-row-eq-parts-lily', ts.eq_parts_lily || '-');
                setEqVal('stat-row-eq-parts-beak', ts.eq_parts_beak || '-');
                
                // Extract only current gems count (e.g. "39" instead of "39/100")
                let gemsVal = ts.eq_gems || '-';
                if (gemsVal && gemsVal !== '-' && gemsVal.includes('/')) {
                    gemsVal = gemsVal.split('/')[0].trim();
                }
                setEqVal('stat-row-eq-gems', gemsVal);
                
                // Combat stats
                setEqVal('stat-row-eq-health', ts.eq_health || '-');
                setEqVal('stat-row-eq-attack', ts.eq_attack || '-');
                setEqVal('stat-row-eq-defense', ts.eq_defense || '-');
            }
        }

        const rowDailyStatus = document.getElementById('stat-row-daily-status');
        if (rowDailyStatus) {
            let val;
            if (acc.vk_id === 0) {
                const total = state.accounts.length;
                const active = state.accounts.filter(a => a.daily_status === 'Активен' || a.daily_status === 'Выполняется').length;
                val = total > 0 ? `🔔 Активных: ${active} / ${total}` : 'Не активен';
            } else {
                val = acc.daily_status || 'Не активен';
            }
            if (rowDailyStatus.textContent !== val) rowDailyStatus.textContent = val;
        }

        const rowReserveDays = document.getElementById('stat-row-reserve-days');
        if (rowReserveDays) {
            let val;
            if (acc.vk_id === 0) {
                val = `📅 ${acc.reserve_days || 0} дн. (всего)`;
            } else {
                val = `📅 ${acc.reserve_days || 0} дн.`;
            }
            if (rowReserveDays.textContent !== val) rowReserveDays.textContent = val;
        }

        const rowDailyCompleted = document.getElementById('stat-row-daily-completed');
        if (rowDailyCompleted) {
            let val;
            if (acc.vk_id === 0) {
                const total = state.accounts.length;
                const done = state.accounts.filter(a => a.daily_completed === 1 || a.daily_completed === 'Да' || a.daily_completed === '🟢 Да').length;
                val = total > 0 ? `🟢 Выполнено: ${done} / ${total}` : '🔴 Нет';
            } else {
                val = (acc.daily_completed === 1 || acc.daily_completed === 'Да' || acc.daily_completed === '🟢 Да') ? '🟢 Да' : '🔴 Нет';
            }
            if (rowDailyCompleted.textContent !== val) rowDailyCompleted.textContent = val;
        }

        // Подробная информация о дейликах для одного аккаунта
        const wrapperTasks = document.getElementById('stat-row-daily-tasks-wrapper');
        const wrapperReward = document.getElementById('stat-row-daily-reward-wrapper');
        const wrapperBonusTasks = document.getElementById('stat-row-daily-bonus-tasks-wrapper');
        const wrapperBonusReward = document.getElementById('stat-row-daily-bonus-reward-wrapper');
        const elTasks = document.getElementById('stat-row-daily-tasks');
        const elReward = document.getElementById('stat-row-daily-reward');
        const elBonusTasks = document.getElementById('stat-row-daily-bonus-tasks');
        const elBonusReward = document.getElementById('stat-row-daily-bonus-reward');

        if (acc.vk_id === 0) {
            if (wrapperTasks) wrapperTasks.classList.add('hidden');
            if (wrapperReward) wrapperReward.classList.add('hidden');
            if (wrapperBonusTasks) wrapperBonusTasks.classList.add('hidden');
            if (wrapperBonusReward) wrapperBonusReward.classList.add('hidden');
        } else {
            const ts = acc.toad_state || {};
            const tasksVal = acc.daily_tasks || ts.daily_tasks || '';
            const rewardVal = acc.daily_reward || ts.daily_reward || '';
            const bonusTasksVal = acc.daily_bonus_tasks || ts.daily_bonus_tasks || '';
            const bonusRewardVal = acc.daily_bonus_reward || ts.daily_bonus_reward || '';

            if (wrapperTasks) {
                if (tasksVal) {
                    wrapperTasks.classList.remove('hidden');
                    const formatted = tasksVal.split(' | ').join('\n');
                    if (elTasks.textContent !== formatted) elTasks.textContent = formatted;
                } else {
                    wrapperTasks.classList.add('hidden');
                }
            }

            if (wrapperReward) {
                if (rewardVal) {
                    wrapperReward.classList.remove('hidden');
                    const formatted = rewardVal.split(' | ').join('\n');
                    if (elReward.textContent !== formatted) elReward.textContent = formatted;
                } else {
                    wrapperReward.classList.add('hidden');
                }
            }

            if (wrapperBonusTasks) {
                if (bonusTasksVal) {
                    wrapperBonusTasks.classList.remove('hidden');
                    const formatted = bonusTasksVal.split(' | ').join('\n');
                    if (elBonusTasks.textContent !== formatted) elBonusTasks.textContent = formatted;
                } else {
                    wrapperBonusTasks.classList.add('hidden');
                }
            }

            if (wrapperBonusReward) {
                if (bonusRewardVal) {
                    wrapperBonusReward.classList.remove('hidden');
                    const formatted = bonusRewardVal.split(' | ').join('\n');
                    if (elBonusReward.textContent !== formatted) elBonusReward.textContent = formatted;
                } else {
                    wrapperBonusReward.classList.add('hidden');
                }
            }
        }

        // Характеристики Семьи:
        const rowFamilyPartner = document.getElementById('stat-row-family-partner');
        if (rowFamilyPartner) {
            const val = acc.partner || 'Нет';
            if (rowFamilyPartner.textContent !== val) rowFamilyPartner.textContent = val;
        }

        const rowFamilyMarriageDays = document.getElementById('stat-row-family-marriage-days');
        if (rowFamilyMarriageDays) {
            let val;
            if (acc.vk_id === 0) {
                val = `📅 ${acc.marriage_days || 0} дн. (всего)`;
            } else {
                val = `📅 ${acc.marriage_days || 0} дн.`;
            }
            if (rowFamilyMarriageDays.textContent !== val) rowFamilyMarriageDays.textContent = val;
        }

        const rowFamilyCandies = document.getElementById('stat-row-family-candies');
        if (rowFamilyCandies) {
            let val;
            if (acc.vk_id === 0) {
                val = `🍬 ${acc.candies || 0} (сумма)`;
            } else {
                val = `🍬 ${acc.candies || 0}`;
            }
            if (rowFamilyCandies.textContent !== val) rowFamilyCandies.textContent = val;
        }

        const rowFamilyFroglet = document.getElementById('stat-row-family-froglet');
        if (rowFamilyFroglet) {
            const val = acc.froglet || 'Нет';
            if (rowFamilyFroglet.textContent !== val) rowFamilyFroglet.textContent = val;
        }

        const rowFamilyLevel = document.getElementById('stat-row-family-level');
        if (rowFamilyLevel) {
            let val;
            if (acc.vk_id === 0) {
                val = `⭐ ${acc.family_level || 0} (сумма)`;
            } else {
                val = `⭐ ${acc.family_level || 1}`;
            }
            if (rowFamilyLevel.textContent !== val) rowFamilyLevel.textContent = val;
        }

        const rowFamilySatiety = document.getElementById('stat-row-family-satiety');
        if (rowFamilySatiety) {
            const val = acc.family_satiety || 'Сыт';
            if (rowFamilySatiety.textContent !== val) rowFamilySatiety.textContent = val;
        }

        const rowFamilyAuthority = document.getElementById('stat-row-family-authority');
        if (rowFamilyAuthority) {
            let val;
            if (acc.vk_id === 0) {
                val = `👑 ${acc.family_authority || 0} (сумма)`;
            } else {
                val = `👑 ${acc.family_authority || 0}`;
            }
            if (rowFamilyAuthority.textContent !== val) rowFamilyAuthority.textContent = val;
        }

        const rowFamilyMood = document.getElementById('stat-row-family-mood');
        if (rowFamilyMood) {
            const val = acc.family_mood || 'Спокойное';
            if (rowFamilyMood.textContent !== val) rowFamilyMood.textContent = val;
        }

        const rowFamilyFeedIn = document.getElementById('stat-row-family-feed-in');
        if (rowFamilyFeedIn) {
            const val = acc.feed_in || '—';
            if (rowFamilyFeedIn.textContent !== val) rowFamilyFeedIn.textContent = val;
        }

        const rowFamilyKindergarten = document.getElementById('stat-row-family-kindergarten');
        if (rowFamilyKindergarten) {
            const val = acc.kindergarten || '—';
            if (rowFamilyKindergarten.textContent !== val) rowFamilyKindergarten.textContent = val;
        }

        const rowFamilyClash = document.getElementById('stat-row-family-clash');
        if (rowFamilyClash) {
            const val = acc.clash || '—';
            if (rowFamilyClash.textContent !== val) rowFamilyClash.textContent = val;
        }

        // Сезонная арена:
        const rowArenaSeason = document.getElementById('stat-row-arena-season');
        if (rowArenaSeason) {
            const val = acc.arena_season || 'Загрузка...';
            if (rowArenaSeason.textContent !== val) rowArenaSeason.textContent = val;
        }

        const rowArenaWins = document.getElementById('stat-row-arena-wins');
        if (rowArenaWins) {
            const val = `🏆 ${acc.arena_wins || 0}`;
            if (rowArenaWins.textContent !== val) rowArenaWins.textContent = val;
        }

        const rowArenaLosses = document.getElementById('stat-row-arena-losses');
        if (rowArenaLosses) {
            const val = `💀 ${acc.arena_losses || 0}`;
            if (rowArenaLosses.textContent !== val) rowArenaLosses.textContent = val;
        }

        const rowArenaPlace = document.getElementById('stat-row-arena-place');
        if (rowArenaPlace) {
            const val = acc.arena_place || 'Нет';
            if (rowArenaPlace.textContent !== val) rowArenaPlace.textContent = val;
        }

        const rowArenaPoints = document.getElementById('stat-row-arena-points');
        if (rowArenaPoints) {
            const val = `⭐ ${acc.arena_points || 0}`;
            if (rowArenaPoints.textContent !== val) rowArenaPoints.textContent = val;
        }

        // Характеристики Банды:
        const rowGangType = document.getElementById('stat-row-gang-type');
        if (rowGangType) {
            const val = (!acc.has_gang || acc.gang_type === '-' || !acc.gang_type) ? '—' : acc.gang_type;
            if (rowGangType.textContent !== val) rowGangType.textContent = val;
        }

        const rowGangName = document.getElementById('stat-row-gang-name');
        if (rowGangName) {
            const val = (!acc.has_gang || acc.gang_name === '-' || !acc.gang_name) ? '—' : acc.gang_name;
            if (rowGangName.textContent !== val) rowGangName.textContent = val;
        }

        const rowGangLoyalty = document.getElementById('stat-row-gang-loyalty');
        if (rowGangLoyalty) {
            const val = (!acc.has_gang || acc.gang_loyalty_cur === undefined || acc.gang_loyalty_cur === null) ? '—' : `🤝 ${acc.gang_loyalty_cur}`;
            if (rowGangLoyalty.textContent !== val) rowGangLoyalty.textContent = val;
        }

        const rowGangDamage = document.getElementById('stat-row-gang-damage');
        if (rowGangDamage) {
            const val = (!acc.has_gang || acc.gang_damage === undefined || acc.gang_damage === null) ? '—' : `⚔️ ${acc.gang_damage}%`;
            if (rowGangDamage.textContent !== val) rowGangDamage.textContent = val;
        }

        const rowGangChance = document.getElementById('stat-row-gang-chance');
        if (rowGangChance) {
            const val = (!acc.has_gang || acc.gang_chance === undefined || acc.gang_chance === null) ? '—' : `🎯 ${acc.gang_chance}%`;
            if (rowGangChance.textContent !== val) rowGangChance.textContent = val;
        }

        const rowGangPendant = document.getElementById('stat-row-gang-pendant');
        if (rowGangPendant) {
            const val = (!acc.has_gang || acc.gang_pendant === '-' || !acc.gang_pendant) ? '—' : acc.gang_pendant;
            if (rowGangPendant.textContent !== val) rowGangPendant.textContent = val;
        }

        const rowGangPendantDuration = document.getElementById('stat-row-gang-pendant-duration');
        if (rowGangPendantDuration) {
            const val = (!acc.has_gang || acc.gang_pendant_duration === '-' || !acc.gang_pendant_duration) ? '—' : acc.gang_pendant_duration;
            if (rowGangPendantDuration.textContent !== val) rowGangPendantDuration.textContent = val;
        }

        const rowGangParty = document.getElementById('stat-row-gang-party');
        if (rowGangParty) {
            const val = (!acc.has_gang || acc.gang_party === '-' || !acc.gang_party) ? '—' : acc.gang_party;
            if (rowGangParty.textContent !== val) rowGangParty.textContent = val;
        }

        // Банда / Клан:
        const rowClanName = document.getElementById('stat-row-clan-name');
        if (rowClanName) {
            const val = acc.clan_name || 'Нет';
            if (rowClanName.textContent !== val) rowClanName.textContent = val;
        }

        const rowClanMembers = document.getElementById('stat-row-clan-members');
        if (rowClanMembers) {
            const val = acc.clan_members || '0';
            if (rowClanMembers.textContent !== val) rowClanMembers.textContent = val;
        }

        const rowClanOffmap = document.getElementById('stat-row-clan-offmap');
        if (rowClanOffmap) {
            const val = acc.clan_offmap || 'Нет';
            if (rowClanOffmap.textContent !== val) rowClanOffmap.textContent = val;
        }

        const rowClanCards = document.getElementById('stat-row-clan-cards');
        if (rowClanCards) {
            const val = acc.clan_cards || '0';
            if (rowClanCards.textContent !== val) rowClanCards.textContent = val;
        }

        const rowClanExp = document.getElementById('stat-row-clan-exp');
        if (rowClanExp) {
            const val = acc.clan_exp || '0';
            if (rowClanExp.textContent !== val) rowClanExp.textContent = val;
        }

        const rowClanLevel = document.getElementById('stat-row-clan-level');
        if (rowClanLevel) {
            let val;
            if (acc.vk_id === 0) {
                val = `⭐ ${acc.clan_level || 0} (сумма)`;
            } else {
                val = `⭐ ${acc.clan_level || 1}`;
            }
            if (rowClanLevel.textContent !== val) rowClanLevel.textContent = val;
        }

        const rowClanLeague = document.getElementById('stat-row-clan-league');
        if (rowClanLeague) {
            const val = acc.clan_league || 'Нет';
            if (rowClanLeague.textContent !== val) rowClanLeague.textContent = val;
        }

        const rowClanBattles = document.getElementById('stat-row-clan-battles');
        if (rowClanBattles) {
            let val;
            if (acc.vk_id === 0) {
                val = `⚔️ ${acc.clan_battles || 0} (сумма)`;
            } else {
                val = `⚔️ ${acc.clan_battles || 0}`;
            }
            if (rowClanBattles.textContent !== val) rowClanBattles.textContent = val;
        }

        const rowClanPoints = document.getElementById('stat-row-clan-points');
        if (rowClanPoints) {
            let val;
            if (acc.vk_id === 0) {
                val = `⭐ ${acc.clan_points || 0} (сумма)`;
            } else {
                val = `⭐ ${acc.clan_points || 0}`;
            }
            if (rowClanPoints.textContent !== val) rowClanPoints.textContent = val;
        }

        const rowClanBooster = document.getElementById('stat-row-clan-booster');
        if (rowClanBooster) {
            const val = acc.vk_id === 0 ? (acc.clan_booster || 'Нет') : '-';
            if (rowClanBooster.textContent !== val) rowClanBooster.textContent = val;
        }

        // Обновляем таймеры последнего обновления для инвентаря
        const timerInventory = document.querySelector('#timer-column-inventory span:last-child');
        const dotInventory = document.querySelector('#timer-column-inventory .dot');
        if (timerInventory) {
            const fullText = `Проверено: ${timeAgoText}`;
            if (timerInventory.textContent !== fullText) timerInventory.textContent = fullText;
            if (dotInventory) {
                if (acc.last_checked || (ts && ts.last_updated_iso)) {
                    dotInventory.classList.remove('offline');
                } else {
                    dotInventory.classList.add('offline');
                }
            }
        }
        const timerRobberyGear = document.querySelector('#timer-column-robbery-gear span:last-child');
        const dotRobberyGear = document.querySelector('#timer-column-robbery-gear .dot');
        if (timerRobberyGear) {
            const fullText = `Проверено: ${timeAgoText}`;
            if (timerRobberyGear.textContent !== fullText) timerRobberyGear.textContent = fullText;
            if (dotRobberyGear) {
                if (acc.last_checked || (ts && ts.last_updated_iso)) {
                    dotRobberyGear.classList.remove('offline');
                } else {
                    dotRobberyGear.classList.add('offline');
                }
            }
        }
        const timerCraft = document.querySelector('#timer-column-craft span:last-child');
        const dotCraft = document.querySelector('#timer-column-craft .dot');
        if (timerCraft) {
            const fullText = `Проверено: ${timeAgoText}`;
            if (timerCraft.textContent !== fullText) timerCraft.textContent = fullText;
            if (dotCraft) {
                if (acc.last_checked || (ts && ts.last_updated_iso)) {
                    dotCraft.classList.remove('offline');
                } else {
                    dotCraft.classList.add('offline');
                }
            }
        }

        // Обновляем значения инвентаря
        const inventoryFields = [
            { id: 'stat-row-inv-lollipop', field: 'inv_lollipop' },
            { id: 'stat-row-inv-bandages', field: 'inv_bandages' },
            { id: 'stat-row-inv-beer', field: 'inv_beer' },
            { id: 'stat-row-inv-dragonfly', field: 'inv_dragonfly' },
            { id: 'stat-row-inv-map', field: 'inv_map' },
            { id: 'stat-row-inv-tape', field: 'inv_tape' },
            { id: 'stat-row-inv-gang-frogs', field: 'inv_gang_frogs' },
            { id: 'stat-row-inv-exp-capsule', field: 'inv_exp_capsule' },
            { id: 'stat-row-eq-pass', field: 'eq_pass' },
            { id: 'stat-row-eq-lockpick', field: 'eq_lockpick' },
            { id: 'stat-row-eq-battery', field: 'eq_battery' },
            { id: 'stat-row-cr-puzzle', field: 'cr_puzzle' },
            { id: 'stat-row-cr-link', field: 'cr_link' },
            { id: 'stat-row-cr-stone', field: 'cr_stone' },
            { id: 'stat-row-cr-mask', field: 'cr_mask' },
            { id: 'stat-row-cr-paper', field: 'cr_paper' },
            { id: 'stat-row-cr-lightning', field: 'cr_lightning' }
        ];

        inventoryFields.forEach(({ id, field }) => {
            const el = document.getElementById(id);
            if (el) {
                let val = '-';
                if (acc.vk_id !== 0 && ts && ts[field] !== undefined && ts[field] !== null) {
                    const dbVal = ts[field];
                    if (dbVal !== '-') {
                        if (field === 'inv_map') {
                            if (typeof dbVal === 'string' && dbVal.includes('+🌌')) {
                                const parts = dbVal.split('+🌌');
                                const normal = parseInt(parts[0]) || 0;
                                const cosmic = parseInt(parts[1]) || 0;
                                if (cosmic > 0) {
                                    val = `${normal + cosmic} (${normal}+🌌${cosmic})`;
                                } else {
                                    val = `${normal}`;
                                }
                            } else {
                                val = dbVal;
                            }
                        } else if ([
                            'inv_gang_frogs', 'eq_lockpick', 'eq_battery', 
                            'cr_puzzle', 'cr_link', 'cr_stone', 'cr_mask', 'cr_paper', 'cr_lightning'
                        ].includes(field)) {
                            val = `${dbVal}/10`;
                        } else if (field === 'eq_pass') {
                            val = `${dbVal}/1`;
                        } else {
                            val = dbVal;
                        }
                    } else {
                        val = '-';
                    }
                }
                if (el.textContent !== val) el.textContent = val;
            }
        });

        // 3. Обновляем инпуты настроек (чтобы не сбивать фокус и состояние, сверяем значения) - только если это реальный аккаунт
        if (acc.vk_id !== 0) {
            dashboardDetailsLayout.querySelectorAll('.toggle-setting').forEach(input => {
                const setting = input.dataset.setting;
                const dbValue = acc[setting] === 1;
                if (input.checked !== dbValue) {
                    input.checked = dbValue;
                }
            });

            const workSelect = dashboardDetailsLayout.querySelector('.work-select');
            if (workSelect) {
                if (workSelect.value !== acc.work_type) {
                    workSelect.value = acc.work_type;
                }
            }

            // 4. Обновляем кнопку запуска/остановки
            const toggleActiveBtn = document.getElementById('btn-toggle-active');
            if (toggleActiveBtn) {
                const isOnline = acc.is_active === 1;
                const newText = isOnline ? '🔴 Остановить LongPoll-клиент' : '🟢 Запустить LongPoll-клиент';
                const newClass = `btn-card toggle-active ${isOnline ? 'active' : 'inactive'}`;
                
                if (toggleActiveBtn.textContent.trim() !== newText) {
                    toggleActiveBtn.textContent = newText;
                }
                if (toggleActiveBtn.className !== newClass) {
                    toggleActiveBtn.className = newClass;
                }
                toggleActiveBtn.dataset.active = acc.is_active;
            }
        }
    }

    // Сохранение настроек
    async function updateSetting(vkId, setting, value) {
        try {
            const body = {};
            body[setting] = value;
            
            const response = await fetch(`/api/accounts/${vkId}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            
            if (!response.ok) throw new Error('Не удалось обновить настройку');
            
            showToast('💾 Настройки сохранены', 'success');
            fetchAccounts(false);
        } catch (error) {
            console.error('Ошибка updateSetting:', error);
            showToast('❌ Ошибка сохранения настроек', 'error');
        }
    }

    // Запуск / Остановка LongPoll-клиента
    async function toggleAccountActive(vkId, activeValue, resetStats = 0) {
        try {
            const response = await fetch(`/api/accounts/${vkId}/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: activeValue, reset_stats: resetStats })
            });
            
            if (!response.ok) throw new Error('Не удалось изменить статус активности');
            
            const data = await response.json();
            showToast(data.message, data.status);
            fetchAccounts(false);
        } catch (error) {
            console.error('Ошибка toggleAccountActive:', error);
            showToast('❌ Ошибка изменения статуса', 'error');
        }
    }

    // Удаление аккаунта
    async function deleteAccount(vkId) {
        try {
            const response = await fetch(`/api/accounts/${vkId}/delete`, {
                method: 'POST'
            });
            
            if (!response.ok) throw new Error('Не удалось удалить аккаунт');
            
            showToast('🗑️ Аккаунт успешно удален', 'success');
            state.selectedAccountId = null;
            fetchAccounts(true);
        } catch (error) {
            console.error('Ошибка deleteAccount:', error);
            showToast('❌ Ошибка удаления аккаунта', 'error');
        }
    }

    // Шаг 1: Парсинг токена (нажатие "Далее" button)
    async function handleParseTokenSubmit() {
        const tokenInput = document.getElementById('acc-token-url');
        const raw_value = tokenInput.value.trim();
        
        if (!raw_value) {
            showToast('⚠️ Введите токен или ссылку авторизации!', 'warning');
            return;
        }
        
        // Показываем лоадер, скрываем Шаг 1
        modalStep1.classList.add('hidden');
        modalLoader.classList.remove('hidden');
        
        try {
            const response = await fetch('/api/accounts/parse_token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url_or_token: raw_value })
            });
            
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Не удалось проверить токен');
            }
            
            const data = await response.json();
            state.parsedAccount = data;
            
            parsedUserName.textContent = data.name;
            parsedUserId.textContent = `ID: ${data.vk_id}`;
            
            accChatSelect.innerHTML = '<option value="">-- Выберите чат для автоматизации --</option>';
            
            if (data.conversations && data.conversations.length > 0) {
                data.conversations.forEach(conv => {
                    const opt = document.createElement('option');
                    opt.value = conv.peer_id;
                    opt.textContent = `${conv.title} (ID: ${conv.peer_id})`;
                    accChatSelect.appendChild(opt);
                });
            } else {
                const opt = document.createElement('option');
                opt.value = "";
                opt.textContent = "Беседы не найдены (или нет доступа)";
                accChatSelect.appendChild(opt);
            }
            
            if (data.conversations_error) {
                chatAccessWarning.textContent = data.conversations_error;
                chatAccessWarning.classList.remove('hidden');
            } else {
                chatAccessWarning.classList.add('hidden');
            }
            
            modalLoader.classList.add('hidden');
            modalStep2.classList.remove('hidden');
            
        } catch (error) {
            console.error('Ошибка при проверке токена:', error);
            showToast(`❌ Ошибка проверки токена: ${error.message}`, 'error');
            
            modalLoader.classList.add('hidden');
            modalStep1.classList.remove('hidden');
        }
    }

    // Шаг 2: Финальное подключение (нажатие "Подключить аккаунт" button)
    async function handleAddAccountFinalSubmit() {
        if (!state.parsedAccount) return;
        
        const chat_id = parseInt(accChatSelect.value);
        if (!chat_id) {
            showToast('⚠️ Выберите чат из списка!', 'warning');
            return;
        }
        
        const is_prime = document.getElementById('acc-is-prime').checked ? 1 : 0;
        
        modalStep2.classList.add('hidden');
        modalLoader.classList.remove('hidden');
        
        try {
            const response = await fetch('/api/accounts/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vk_id: state.parsedAccount.vk_id,
                    name: state.parsedAccount.name,
                    token: state.parsedAccount.token,
                    chat_id: chat_id,
                    is_prime: is_prime
                })
            });
            
            if (!response.ok) throw new Error('Не удалось добавить аккаунт в базу');
            
            const data = await response.json();
            showToast(data.message, 'success');
            
            closeModal();
            state.selectedAccountId = state.parsedAccount.vk_id;
            fetchAccounts(false);
            
        } catch (error) {
            console.error('Ошибка финального добавления:', error);
            showToast('❌ Ошибка при добавлении аккаунта в систему', 'error');
            
            modalLoader.classList.add('hidden');
            modalStep2.classList.remove('hidden');
        }
    }

    // Хелпер
    function getCooldownProgress(lastActionStr, cooldownHours) {
        if (!lastActionStr) return { percent: 100, text: 'Готово', isReady: true };
        
        try {
            const lastAction = new Date(lastActionStr);
            const now = new Date();
            const totalMs = cooldownHours * 60 * 60 * 1000;
            const nextAction = new Date(lastAction.getTime() + totalMs);
            
            const diffMs = nextAction - now;
            if (diffMs <= 0) return { percent: 100, text: 'Готово', isReady: true };
            
            const elapsedMs = totalMs - diffMs;
            const percent = Math.min(Math.max((elapsedMs / totalMs) * 100, 0), 100);
            
            const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
            const diffMins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
            
            const text = `${diffHours.toString().padStart(2, '0')}:${diffMins.toString().padStart(2, '0')} ⏳`;
            return { percent, text, isReady: false };
        } catch (e) {
            return { percent: 0, text: 'Ошибка', isReady: false };
        }
    }

    // Хелпер для форматирования времени последней проверки данных через бота
    function formatLastChecked(lastCheckedStr) {
        if (!lastCheckedStr) return 'не проверялось 🔌';
        
        try {
            // Убираем символ Z или часовой пояс для корректного сравнения локальных времен
            const cleanStr = lastCheckedStr.includes('Z') ? lastCheckedStr.split('Z')[0] : lastCheckedStr;
            const lastChecked = new Date(cleanStr);
            const now = new Date();
            
            const diffMs = Math.max(0, now - lastChecked);
            const diffSecs = Math.floor(diffMs / 1000);
            
            if (diffSecs < 10) return 'только что ⚡';
            if (diffSecs < 60) return `${diffSecs} сек. назад`;
            
            const diffMins = Math.floor(diffSecs / 60);
            if (diffMins < 60) return `${diffMins} мин. назад`;
            
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) return `${diffHours} ч. назад`;
            
            const diffDays = Math.floor(diffHours / 24);
            return `${diffDays} дн. назад`;
        } catch (e) {
            return 'неизвестно 🤷';
        }
    }

    // Toast
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'error') icon = '❌';
        if (type === 'warning') icon = '⚠️';
        
        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'toast-in 0.3s reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // Отрисовка расписания автоматических задач
    function renderSchedule() {
        const scheduleContainer = document.getElementById('schedule-tab-container');
        if (!scheduleContainer) return;

        // Фильтруем только активные подключенные аккаунты (исключаем "Общее" с vk_id = 0)
        let targetAccounts = state.accounts.filter(a => a.vk_id > 0 && a.is_active === 1);

        // Если открыт конкретный аккаунт (не "Общее"), показываем расписание только для него
        if (state.selectedAccountId > 0) {
            targetAccounts = targetAccounts.filter(a => a.vk_id === state.selectedAccountId);
        }

        const scheduledTasks = [];

        targetAccounts.forEach(acc => {
            // 1. Авто-кормление
            if (acc.auto_feed === 1) {
                const cooldownHours = acc.is_prime === 1 ? 6 : 12;
                const nextTime = getNextActionTime(acc.last_fed, cooldownHours);
                scheduledTasks.push({
                    name: acc.name,
                    vk_id: acc.vk_id,
                    action: '🥩 Авто-кормление',
                    time: nextTime
                });
            }

            // 2. Авто-работа
            if (acc.auto_work === 1 && acc.work_type !== 'Нет') {
                const workTypeLabel = acc.work_type || 'столовая';
                
                // Задача 1: Завершить текущую работу (через 2 часа после last_worked)
                const timeToEnd = getNextActionTime(acc.last_worked, 2);
                if (!timeToEnd.isReady || acc.status === 'working') {
                    scheduledTasks.push({
                        name: acc.name,
                        vk_id: acc.vk_id,
                        action: `💼 Завершить работу (${workTypeLabel})`,
                        time: timeToEnd
                    });
                }
                
                // Задача 2: Новая смена (через 8 часов после last_worked = 2ч работа + 6ч отдых)
                const timeToStart = getNextActionTime(acc.last_worked, 8);
                scheduledTasks.push({
                    name: acc.name,
                    vk_id: acc.vk_id,
                    action: `💼 Новая смена: начало пути (${workTypeLabel})`,
                    time: timeToStart
                });
            }

            // 3. Авто-арена
            if (acc.auto_arena === 1) {
                const nextTime = getNextActionTime(acc.last_arena, 1);
                scheduledTasks.push({
                    name: acc.name,
                    vk_id: acc.vk_id,
                    action: '⚔️ Авто-арена',
                    time: nextTime
                });
            }

            // 4. Авто-подземелье
            if (acc.auto_dungeon === 1) {
                const nextTime = getNextActionTime(acc.last_dungeon, 2);
                scheduledTasks.push({
                    name: acc.name,
                    vk_id: acc.vk_id,
                    action: '🕳️ Авто-подземелье',
                    time: nextTime
                });
            }
        });

        // Сортируем задачи: сначала те, у которых время выполнения раньше всего
        scheduledTasks.sort((a, b) => a.time.date - b.time.date);

        if (scheduledTasks.length === 0) {
            scheduleContainer.innerHTML = `
                <div class="placeholder-view" style="min-height: 260px; border-style: solid; border-color: rgba(130, 39, 227, 0.2); background: rgba(130, 39, 227, 0.01); padding: 40px 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 16px;">
                    <div class="placeholder-icon" style="font-size: 54px; animation: float 3s ease-in-out infinite;">📅</div>
                    <h3 class="placeholder-title" style="font-size: 18px; font-weight: 700; color: var(--color-primary-hover);">Нет активных задач</h3>
                    <p class="placeholder-desc" style="max-width: 420px; font-size: 13px; line-height: 1.5; color: var(--color-text-muted);">
                        Включите авто-действия в разделе **«Настройки»** ваших аккаунтов, чтобы увидеть расписание будущих запусков.
                    </p>
                </div>
            `;
            return;
        }

        // Рендерим таблицу
        let tableHtml = `
            <div class="schedule-table-wrapper" style="overflow-x: auto; background: rgba(255, 255, 255, 0.01); border: 1px solid var(--border-glass); border-radius: 12px; box-shadow: var(--shadow-premium);">
                <table class="schedule-table" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--border-glass); background: rgba(130, 39, 227, 0.05); color: var(--color-primary-hover);">
                            <th style="padding: 12px 16px; font-weight: 600;">Имя аккаунта</th>
                            <th style="padding: 12px 16px; font-weight: 600;">Действие</th>
                            <th style="padding: 12px 16px; font-weight: 600;">Время</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        scheduledTasks.forEach(task => {
            const timeClass = task.time.isReady ? 'color: var(--color-success); font-weight: bold;' : 'color: var(--color-text-muted);';
            const timeLabel = task.time.isReady 
                ? '⚡ Готово к отправке' 
                : `⏳ ${task.time.formattedTime} (через ${task.time.timeLeft})`;

            tableHtml += `
                <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.02); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                    <td style="padding: 12px 16px; font-weight: 500; color: var(--color-text-main);">${task.name}</td>
                    <td style="padding: 12px 16px; color: var(--color-text-main);">${task.action}</td>
                    <td style="padding: 12px 16px; ${timeClass}">${timeLabel}</td>
                </tr>
            `;
        });

        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;

        scheduleContainer.innerHTML = tableHtml;
    }

    // Хелпер для расчета точного времени следующего шага
    function getNextActionTime(lastActionStr, cooldownHours) {
        if (!lastActionStr) return { date: new Date(0), formattedTime: '--:--:--', timeLeft: '0 сек', isReady: true };

        try {
            // Убираем букву Z для корректного локального разбора
            const cleanStr = lastActionStr.includes('Z') ? lastActionStr.split('Z')[0] : lastActionStr;
            const lastAction = new Date(cleanStr);
            const nextAction = new Date(lastAction.getTime() + cooldownHours * 60 * 60 * 1000);
            const now = new Date();

            const diffMs = nextAction - now;
            if (diffMs <= 0) {
                return { date: nextAction, formattedTime: '--:--:--', timeLeft: '0 сек', isReady: true };
            }

            const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
            const diffMins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
            const diffSecs = Math.floor((diffMs % (60 * 1000)) / 1000);

            let timeLeft = '';
            if (diffHours > 0) {
                timeLeft += `${diffHours} ч. ${diffMins} мин.`;
            } else if (diffMins > 0) {
                timeLeft += `${diffMins} мин. ${diffSecs} сек.`;
            } else {
                timeLeft += `${diffSecs} сек.`;
            }

            const formattedTime = nextAction.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            return {
                date: nextAction,
                formattedTime: formattedTime,
                timeLeft: timeLeft,
                isReady: false
            };
        } catch (e) {
            return { date: new Date(0), formattedTime: 'Ошибка', timeLeft: '--', isReady: false };
        }
    }

    init();
});