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
        activeSubTab: 'general',  // Активная подвкладка статистики ('general', 'toad', 'family', 'arena', 'clan')
        renderedAccountId: null,  // ID последнего отрендеренного аккаунта деталей
        globalSettings: {},       // Глобальные настройки (фора начала, похода и завершения работы)
        selectedStrangeId: null,  // ID выбранной в данный момент нераспознанной фразы
        monitorHasFailed: false   // Флаг наличия нераспознанных ответов в отладке
    };

    // Хранилище состояния модального окна инициализации
    let sessionInitState = {
        vkId: null,
        name: ""
    };

    // Состояние кастомного списка команд для отладки
    let allCommands = [];
    let selectedCommand = "";
    let monitorStatsInterval = null;
    let likesPollInterval = null;
    let isMonitorActive = false;


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
        fetchUnrecognizedPhrases();
        fetchFailedMonitorVariations();
        
        // Запуск интервалов опроса
        setInterval(fetchAccounts, 3000);
        setInterval(fetchLogs, 3000);
        setInterval(fetchUnrecognizedPhrases, 3000);
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

        // Листенеры модального окна отладки парсера
        const btnCloseDebugModal = document.getElementById('btn-close-debug-modal');
        const btnCancelDebug = document.getElementById('btn-cancel-debug');
        const btnRunDebug = document.getElementById('btn-run-debug');
        const debugModalOverlay = document.getElementById('debug-parser-modal-overlay');

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
                                    showToast('❌ Ошибка: ' + (err.detail || 'Не удалось добавить'), 'error');
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
                        showToast(`❌ Ошибка: ${err.detail || 'Не удалось добавить'}`, 'error');
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
                            showToast(`❌ Ошибка импорта: ${err.detail || 'Не удалось импортировать'}`, 'error');
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
                        showToast(`❌ Ошибка экспорта: ${err.detail || 'Не удалось сохранить отчет'}`, 'error');
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

        if (btnCloseDebugModal) {
            btnCloseDebugModal.addEventListener('click', closeDebugModal);
        }
        if (btnCancelDebug) {
            btnCancelDebug.addEventListener('click', closeDebugModal);
        }
        if (debugModalOverlay) {
            // Закрытие при клике по оверлею
            debugModalOverlay.addEventListener('click', (e) => {
                if (e.target === debugModalOverlay) {
                    closeDebugModal();
                }
            });
        }
        if (btnRunDebug) {
            btnRunDebug.addEventListener('click', handleRunDebugSubmit);
        }



        // Удаление выбранной странной фразы
        const btnDeleteSelectedStrange = document.getElementById('btn-delete-selected-strange');
        if (btnDeleteSelectedStrange) {
            btnDeleteSelectedStrange.addEventListener('click', async () => {
                if (!state.selectedStrangeId) return;
                try {
                    const res = await fetch(`/api/debug/unrecognized/${state.selectedStrangeId}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast('Удалено успешно', 'success');
                        state.selectedStrangeId = null;
                        
                        // Скроем контент и покажем плейсхолдер
                        const detailContent = document.getElementById('strange-detail-content');
                        const placeholder = document.getElementById('strange-detail-placeholder');
                        if (detailContent) detailContent.classList.add('hidden');
                        if (placeholder) placeholder.classList.remove('hidden');
                        
                        fetchUnrecognizedPhrases();
                    } else {
                        showToast('❌ Ошибка при удалении', 'error');
                    }
                } catch (err) {
                    console.error(err);
                    showToast('❌ Ошибка при удалении', 'error');
                }
            });
        }

        // Переключение вкладок в модальном окне отладки
        const tabInteractiveDebug = document.getElementById('tab-interactive-debug');
        const tabStrangePhrases = document.getElementById('tab-strange-phrases');
        const tabPhraseTesting = document.getElementById('tab-phrase-testing');
        const panelInteractiveDebug = document.getElementById('panel-interactive-debug');
        const panelStrangePhrases = document.getElementById('panel-strange-phrases');
        const panelPhraseTesting = document.getElementById('panel-phrase-testing');

        if (tabInteractiveDebug && tabStrangePhrases && tabPhraseTesting && panelInteractiveDebug && panelStrangePhrases && panelPhraseTesting) {
            tabInteractiveDebug.addEventListener('click', () => {
                tabInteractiveDebug.classList.add('active');
                tabStrangePhrases.classList.remove('active');
                tabPhraseTesting.classList.remove('active');
                panelInteractiveDebug.classList.remove('hidden');
                panelStrangePhrases.classList.add('hidden');
                panelPhraseTesting.classList.add('hidden');
                if (btnRunDebug) {
                    btnRunDebug.style.display = 'flex';
                    btnRunDebug.innerHTML = '🚀 Запустить разбор';
                }
            });

            tabStrangePhrases.addEventListener('click', () => {
                tabStrangePhrases.classList.add('active');
                tabInteractiveDebug.classList.remove('active');
                tabPhraseTesting.classList.remove('active');
                panelStrangePhrases.classList.remove('hidden');
                panelInteractiveDebug.classList.add('hidden');
                panelPhraseTesting.classList.add('hidden');
                if (btnRunDebug) btnRunDebug.style.display = 'none';
                fetchUnrecognizedPhrases();
            });

            tabPhraseTesting.addEventListener('click', () => {
                tabPhraseTesting.classList.add('active');
                tabInteractiveDebug.classList.remove('active');
                tabStrangePhrases.classList.remove('active');
                panelPhraseTesting.classList.remove('hidden');
                panelInteractiveDebug.classList.add('hidden');
                panelStrangePhrases.classList.add('hidden');
                if (btnRunDebug) {
                    btnRunDebug.style.display = 'flex';
                    btnRunDebug.innerHTML = '💬 Отправить и проверить ВК';
                }
                fillTestPhraseAccountsDropdown();
            });
        }

        // Кнопка очистки всех странных фраз
        const btnClearStrange = document.getElementById('btn-clear-strange');
        if (btnClearStrange) {
            btnClearStrange.addEventListener('click', async () => {
                try {
                    const res = await fetch('/api/debug/unrecognized/clear', { method: 'POST' });
                    if (res.ok) {
                        showToast('🗑️ Список странных фраз успешно очищен!', 'success');
                        state.selectedStrangeId = null;
                        
                        const detailContent = document.getElementById('strange-detail-content');
                        const placeholder = document.getElementById('strange-detail-placeholder');
                        if (detailContent) detailContent.classList.add('hidden');
                        if (placeholder) placeholder.classList.remove('hidden');
                        
                        fetchUnrecognizedPhrases();
                    } else {
                        showToast('❌ Не удалось очистить список', 'error');
                    }
                } catch (err) {
                    console.error(err);
                    showToast('❌ Ошибка при очистке', 'error');
                }
            });
        }


        // Настройка слушателей событий для кастомного выпадающего списка (Combobox)
        const comboboxInput = document.getElementById('debug-action-input');
        const comboboxDropdown = document.getElementById('debug-action-dropdown-list');

        if (comboboxInput && comboboxDropdown) {
            // Открываем список и фильтруем по фокусу или клику
            comboboxInput.addEventListener('focus', () => {
                filterCombobox(comboboxInput.value);
                comboboxDropdown.classList.add('active');
            });

            comboboxInput.addEventListener('click', () => {
                filterCombobox(comboboxInput.value);
                comboboxDropdown.classList.add('active');
            });

            // Фильтруем динамически при наборе текста
            comboboxInput.addEventListener('input', (e) => {
                const query = e.target.value;
                filterCombobox(query);
                comboboxDropdown.classList.add('active');
            });

            // Закрываем при клике вне области комбобокса
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.custom-combobox')) {
                    comboboxDropdown.classList.remove('active');
                }
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

    async function fetchUnrecognizedPhrases() {
        try {
            const res = await fetch('/api/debug/unrecognized');
            if (!res.ok) return;
            const phrases = await res.json();
            
            // Рендерим список, если открыта вкладка Странные фразы
            const panelStrangePhrases = document.getElementById('panel-strange-phrases');
            if (panelStrangePhrases && !panelStrangePhrases.classList.contains('hidden')) {
                renderStrangePhrases(phrases);
            }

            // Обновляем счетчик
            const badge = document.getElementById('strange-phrases-count');
            if (badge) {
                if (phrases.length > 0) {
                    badge.innerText = phrases.length;
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }

            // Обновляем класс на кнопке отладки
            const btnOpenDebug = document.getElementById('btn-open-debug');
            if (btnOpenDebug) {
                if (phrases.length > 0) {
                    btnOpenDebug.classList.add('has-strange');
                } else {
                    btnOpenDebug.classList.remove('has-strange');
                }
            }
        } catch (err) {
            console.error('Ошибка fetchUnrecognizedPhrases:', err);
        }
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

    function generateExplanation(command, response) {
        if (!response) {
            return `<div style="color: var(--color-danger); padding: 4px 0;">⚠️ Ошибка: пустой ответ от Жабабота.</div>`;
        }

        const cmdClean = command.trim().toLowerCase();
        let html = '';

        // Помощник для форматирования проверок
        const renderCheck = (label, exists, detail = '') => {
            const icon = exists ? '✅' : '❌';
            const color = exists ? 'var(--color-success)' : 'var(--color-danger)';
            return `
                <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; font-size: 12px;">
                    <span>${icon}</span>
                    <div>
                        <b style="color: ${color};">${label}</b>
                        ${detail ? `<span style="color: var(--color-text-muted); font-size: 11px;"> — ${detail}</span>` : ''}
                    </div>
                </div>
            `;
        };

        if (cmdClean === 'жаба инфо') {
            const hasTitle = /жаба\s+инфо/i.test(response);
            const hasWork = /💼|работа/i.test(response);
            const hasFood = /🍰|покормить|сытость/i.test(response);
            const hasParty = /💃|туса|тусе|тусовка/i.test(response);
            const hasDungeon = /👹|подземелье/i.test(response);
            const hasMarriage = /💍|брак|свадьба/i.test(response);

            html += `
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="font-weight: 600; color: var(--color-primary-hover); margin-bottom: 6px;">📋 Команда «Жаба инфо» ожидает сводку статуса:</div>
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); border-radius: 8px; padding: 10px; margin-bottom: 6px;">
            `;

            html += renderCheck('Заголовок "Жаба Инфо"', hasTitle, 'обязательный маркер для распознавания начала сообщения');
            html += renderCheck('Иконка работы (💼)', hasWork, 'определяет статус занятости жабы');
            html += renderCheck('Иконка еды (🍰)', hasFood, 'определяет готовность к кормлению');
            html += renderCheck('Иконка тусы (💃)', hasParty, 'определяет нахождение на вечеринке');
            html += renderCheck('Иконка подземелья (👹)', hasDungeon, 'определяет нахождение в подземелье');
            html += renderCheck('Иконка брака (💍)', hasMarriage, 'информация о семейном положении (опционально)');

            html += `
                    </div>
                    <div style="font-size: 12px; color: var(--color-text-main); line-height: 1.5; margin-top: 4px;">
            `;

            if (!hasTitle) {
                html += `⚠️ <b style="color: var(--color-warning);">Критическая ошибка:</b> Бот не смог найти фразу <b>"Жаба Инфо"</b>. Наш парсер использует регулярное выражение <code>/Жаба\\s+Инфо/i</code>, поэтому без этого заголовка сообщение полностью игнорируется.<br><br>`;
            } else {
                html += `✔️ Заголовок распознан успешно! Однако, возможно, структура сообщения Жабабота изменилась или в нём отсутствуют ожидаемые статусы, из-за чего парсер не смог обновить внутренние таймеры.<br><br>`;
            }

            html += `💡 <b>Рекомендация:</b> Убедитесь, что это сообщение действительно является ответом от официального Жабабота и содержит актуальную информацию о Вашей жабе. Регулярные выражения имеют 90% гибкость к пробелам и символам, но структура данных должна сохраняться.</div>
                </div>
            `;

        } else if (cmdClean === 'моя жаба') {
            const hasToadEmoji = /🐸/.test(response);
            const hasLevel = /Уровень/i.test(response);
            const hasFullness = /Сытость/i.test(response);
            const hasBugs = /Букашек/i.test(response);
            const hasAttack = /Атака|Сила/i.test(response);
            const hasHealth = /Здоровье/i.test(response);

            html += `
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="font-weight: 600; color: var(--color-primary-hover); margin-bottom: 6px;">🐸 Команда «Моя жаба» ожидает анкету жабы:</div>
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); border-radius: 8px; padding: 10px; margin-bottom: 6px;">
            `;

            html += renderCheck('Эмодзи жабы (🐸)', hasToadEmoji, 'обязательный начальный символ анкеты');
            html += renderCheck('Параметр "Уровень"', hasLevel, 'показывает текущий уровень жабы');
            html += renderCheck('Параметр "Сытость"', hasFullness, 'показывает шкалу голода');
            html += renderCheck('Параметр "Букашек"', hasBugs, 'количество букашек (валюты)');
            html += renderCheck('Параметр "Атака / Сила"', hasAttack, 'боевая характеристика');
            html += renderCheck('Параметр "Здоровье"', hasHealth, 'запас здоровья жабы');

            html += `
                    </div>
                    <div style="font-size: 12px; color: var(--color-text-main); line-height: 1.5; margin-top: 4px;">
            `;

            const missingAny = !hasToadEmoji || !hasLevel || !hasFullness || !hasBugs;
            if (missingAny) {
                html += `⚠️ <b style="color: var(--color-warning);">Критическая ошибка:</b> В тексте отсутствуют обязательные поля анкеты. Наш парсер ищет шаблон: <code>🐸[\\s\\S]*?(?:Уровень|Сытость|Атака|Здоровье|Букашек)</code>. <br>Не найденные поля мешают боту считать характеристики Вашей жабки.<br><br>`;
            } else {
                html += `✔️ Основные маркеры анкеты найдены! Возможно, значения параметров содержат некорректные символы, либо числовой формат отличается от стандартного.<br><br>`;
            }

            html += `💡 <b>Рекомендация:</b> Проверьте, не применил ли Жабабот какой-либо временный эффект или тему оформления, которая скрывает или переименовывает ключевые поля анкеты.</div>
                </div>
            `;

        } else if (['поход в столовую', 'работа крупье', 'работа грабитель', 'отправиться в кафетерий', 'отправиться в казино', 'отправиться в банк', 'начать работу', 'завершить работу'].includes(cmdClean)) {
            // Команда работы
            const isWorking = /отправилась|пошла|уже\s+работает/i.test(response);
            const isCooldown = /устала|отдыхает|трудового\s+дня/i.test(response);
            const isDungeon = /подземелье/i.test(response);
            const isParty = /тусе|тусовке/i.test(response);

            html += `
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="font-weight: 600; color: var(--color-primary-hover); margin-bottom: 6px;">💼 Команда работы ожидает один из стандартных статусов:</div>
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); border-radius: 8px; padding: 10px; margin-bottom: 6px;">
            `;

            html += renderCheck('Статус работы ("отправилась" / "уже работает")', isWorking, 'жаба успешно трудится');
            html += renderCheck('Статус кулдауна ("устала" / "отдыхает")', isCooldown, 'жаба отдыхает после работы');
            html += renderCheck('Статус подземелья ("подземелье")', isDungeon, 'жаба находится в подземелье');
            html += renderCheck('Статус тусы ("на тусе")', isParty, 'жаба отдыхает на тусовке');

            html += `
                    </div>
                    <div style="font-size: 12px; color: var(--color-text-main); line-height: 1.5; margin-top: 4px;">
            `;

            if (!isWorking && !isCooldown && !isDungeon && !isParty) {
                html += `⚠️ <b style="color: var(--color-warning);">Нераспознанный ответ:</b> Текст сообщения не совпал ни с одним из известных шаблонов работы. Бот ожидает фразы вроде: <i>"жаба отправилась на работу в..."</i>, <i>"твоя жабуля устала..."</i> или <i>"ваша жабка находится в подземелье"</i>.<br><br>`;
            } else {
                html += `✔️ Обнаружены признаки статуса, но детальный разбор (время, место) завершился сбоем. Возможно, время указано в непривычном формате (например, без минут или секунд), либо название работы не поддерживается нашей базой данных.<br><br>`;
            }

            html += `💡 <b>Рекомендация:</b> Проверьте, соответствуют ли текстовые формулировки стандартным ответам Жабабота. Из-за поддержки точности совпадения в 90% небольшие изменения смайликов допускаются, но ключевая грамматика должна быть сохранена.</div>
                </div>
            `;

        } else {
            // Общий случай
            html += `
                <div style="display: flex; flex-direction: column; gap: 8px; height: 100%;">
                    <div style="font-weight: 600; color: var(--color-primary-hover); margin-bottom: 4px;">❓ Команда «${escapeHtml(command)}»:</div>
                    <div style="font-size: 12.5px; color: var(--color-text-main); line-height: 1.6;">
                        Этот ответ Жабабота не совпал с зарегистрированными шаблонами в нашей Базе Знаний. <br><br>
                        ⚙️ <b>Как работает распознавание:</b>
                        <ul style="padding-left: 20px; margin: 8px 0;">
                            <li style="margin-bottom: 4px;">Бот использует гибкое сопоставление с точностью <b>90%</b>. Это позволяет игнорировать отсутствие некоторых смайликов, знаков препинания или небольшие изменения окончаний слов.</li>
                            <li style="margin-bottom: 4px;">Если ответ Жабабота содержит критически измененный синтаксис (например, новое имя бота, системное объявление от администрации или ошибку), сопоставление завершается ошибкой.</li>
                            <li style="margin-bottom: 4px;">Сообщение сохраняется сюда в отладку, чтобы Вы могли понять причину и, если необходимо, скорректировать шаблоны или сообщить разработчикам.</li>
                        </ul>
                    </div>
                </div>
            `;
        }

        return html;
    }

    function renderStrangePhrases(phrases) {
        const sidebar = document.getElementById('strange-sidebar');
        if (!sidebar) return;

        if (!phrases || phrases.length === 0) {
            sidebar.innerHTML = `
                <div class="sidebar-placeholder" style="padding: 20px; text-align: center; color: var(--color-text-muted); font-size: 12px;">
                    ✨ Нет странных фраз.
                </div>
            `;
            // Сбрасываем выбранный ID и скрываем детальный вид
            state.selectedStrangeId = null;
            const detailContent = document.getElementById('strange-detail-content');
            const placeholder = document.getElementById('strange-detail-placeholder');
            if (detailContent) detailContent.classList.add('hidden');
            if (placeholder) placeholder.classList.remove('hidden');
            return;
        }

        // Рендерим список в сайдбар
        sidebar.innerHTML = phrases.map((p, idx) => {
            const isActive = state.selectedStrangeId === p.id;
            const accName = p.account_name || `ID ${p.vk_id}`;
            const dateStr = new Date(p.created_at + 'Z').toLocaleString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            return `
                <button class="strange-sidebar-item${isActive ? ' active' : ''}" data-id="${p.id}" style="width: 100%; text-align: left; background: ${isActive ? 'var(--color-primary-glow)' : 'rgba(255, 255, 255, 0.02)'}; border: 1px solid ${isActive ? 'var(--color-primary)' : 'var(--border-glass)'}; border-radius: 8px; padding: 10px; color: var(--color-text-main); cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; gap: 4px; outline: none; position: relative; margin-bottom: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <span class="strange-sidebar-num" style="font-weight: 700; color: var(--color-primary-hover); font-size: 11px;">#${idx + 1}</span>
                        <span style="color: var(--color-text-muted); font-size: 10px;">${dateStr}</span>
                    </div>
                    <div style="font-weight: 600; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">💬 ${escapeHtml(p.command)}</div>
                    <div style="font-size: 10px; color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">🐸 ${escapeHtml(accName)}</div>
                </button>
            `;
        }).join('');

        // Навешиваем клик на элементы сайдбара
        sidebar.querySelectorAll('.strange-sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                const phraseId = parseInt(item.dataset.id, 10);
                const phrase = phrases.find(p => p.id === phraseId);
                if (!phrase) return;

                // Снимаем active со всех
                sidebar.querySelectorAll('.strange-sidebar-item').forEach(el => el.classList.remove('active'));
                // Добавляем active на текущий
                item.classList.add('active');

                // Сохраняем выбранный ID
                state.selectedStrangeId = phrase.id;

                // Отображаем детальный вид
                const detailContent = document.getElementById('strange-detail-content');
                const placeholder = document.getElementById('strange-detail-placeholder');
                if (detailContent) detailContent.classList.remove('hidden');
                if (placeholder) placeholder.classList.add('hidden');

                // Заполняем сырой ответ
                const rawResponseEl = document.getElementById('strange-raw-response');
                if (rawResponseEl) {
                    rawResponseEl.textContent = phrase.response;
                }

                // Заполняем объяснение
                const explanationBoxEl = document.getElementById('strange-explanation-box');
                if (explanationBoxEl) {
                    explanationBoxEl.innerHTML = generateExplanation(phrase.command, phrase.response);
                }
            });
        });

        // Если у нас уже был выбран ID и он есть в списке, обновим отображение (например, при авто-обновлении)
        if (state.selectedStrangeId) {
            const stillExists = phrases.some(p => p.id === state.selectedStrangeId);
            if (stillExists) {
                const selectedPhrase = phrases.find(p => p.id === state.selectedStrangeId);
                const activeItem = sidebar.querySelector(`.strange-sidebar-item[data-id="${state.selectedStrangeId}"]`);
                if (activeItem) {
                    activeItem.classList.add('active');
                }
                
                // Заполняем на всякий случай
                const rawResponseEl = document.getElementById('strange-raw-response');
                if (rawResponseEl) rawResponseEl.textContent = selectedPhrase.response;

                const explanationBoxEl = document.getElementById('strange-explanation-box');
                if (explanationBoxEl) {
                    explanationBoxEl.innerHTML = generateExplanation(selectedPhrase.command, selectedPhrase.response);
                }
            } else {
                state.selectedStrangeId = null;
                const detailContent = document.getElementById('strange-detail-content');
                const placeholder = document.getElementById('strange-detail-placeholder');
                if (detailContent) detailContent.classList.add('hidden');
                if (placeholder) placeholder.classList.remove('hidden');
            }
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

    async function showDebugModal() {
        const modal = document.getElementById('debug-parser-modal-overlay');
        if (modal) {
            modal.classList.add('active');
        }
        
        // Синхронизируем статус и счетчики монитора
        syncMonitorStatus();
        fetchMonitorStats();
        
        // Запускаем периодический опрос статистики (раз в 3 секунды)
        if (monitorStatsInterval) clearInterval(monitorStatsInterval);
        monitorStatsInterval = setInterval(fetchMonitorStats, 3000);
        
        // Запрашиваем список всех литеральных команд с бэкенда при открытии
        try {
            const res = await fetch('/api/debug/commands');
            if (res.ok) {
                allCommands = await res.json();
                renderComboboxDropdown(allCommands);
            }
        } catch (err) {
            console.error('Ошибка загрузки списка команд для отладки:', err);
        }

        // Обновляем список нераспознанных фраз при открытии модального окна
        fetchUnrecognizedPhrases();
    }

    function renderComboboxDropdown(list) {
        const dropdown = document.getElementById('debug-action-dropdown-list');
        if (!dropdown) return;
        
        dropdown.innerHTML = "";
        
        // Добавляем элемент для автоопределения
        const autoItem = document.createElement('div');
        autoItem.className = 'combobox-dropdown-item';
        if (!selectedCommand) autoItem.classList.add('selected');
        autoItem.innerText = "-- Автоопределение по тексту --";
        autoItem.dataset.value = "";
        autoItem.addEventListener('click', () => selectComboboxValue("", "-- Автоопределение по тексту --"));
        dropdown.appendChild(autoItem);
        
        list.forEach(cmd => {
            const item = document.createElement('div');
            item.className = 'combobox-dropdown-item';
            if (selectedCommand === cmd) item.classList.add('selected');
            item.innerText = cmd;
            item.dataset.value = cmd;
            item.addEventListener('click', () => selectComboboxValue(cmd, cmd));
            dropdown.appendChild(item);
        });
    }

    function selectComboboxValue(value, label) {
        const input = document.getElementById('debug-action-input');
        const dropdown = document.getElementById('debug-action-dropdown-list');
        if (input) {
            input.value = label === "-- Автоопределение по тексту --" ? "" : label;
        }
        selectedCommand = value;
        if (dropdown) {
            dropdown.classList.remove('active');
        }
    }

    function filterCombobox(query) {
        const cleanQuery = query.trim().toLowerCase();
        
        // Фильтруем команды
        const filtered = allCommands.filter(cmd => cmd.toLowerCase().includes(cleanQuery));
        
        // Перерисовываем список с отфильтрованными командами
        renderComboboxDropdown(filtered);
    }

    function closeDebugModal() {
        // Останавливаем опрос статистики монитора
        if (monitorStatsInterval) {
            clearInterval(monitorStatsInterval);
            monitorStatsInterval = null;
        }

        const modal = document.getElementById('debug-parser-modal-overlay');
        if (modal) {
            modal.classList.remove('active');
        }
        const actionInput = document.getElementById('debug-action-input');
        const responseTextarea = document.getElementById('debug-response-text');
        const resultOutput = document.getElementById('debug-result-output');
        const dropdown = document.getElementById('debug-action-dropdown-list');
        
        selectedCommand = "";
        if (actionInput) actionInput.value = "";
        if (responseTextarea) responseTextarea.value = "";
        if (resultOutput) resultOutput.innerHTML = "Готов к работе. Заполните поля 1 и 2 и нажмите кнопку «Запустить разбор».";
        if (dropdown) dropdown.classList.remove('active');

        // Сброс вкладок
        const tabInteractiveDebug = document.getElementById('tab-interactive-debug');
        const tabStrangePhrases = document.getElementById('tab-strange-phrases');
        const tabPhraseTesting = document.getElementById('tab-phrase-testing');
        const panelInteractiveDebug = document.getElementById('panel-interactive-debug');
        const panelStrangePhrases = document.getElementById('panel-strange-phrases');
        const panelPhraseTesting = document.getElementById('panel-phrase-testing');
        const btnRunDebug = document.getElementById('btn-run-debug');
        
        if (tabInteractiveDebug && tabStrangePhrases && tabPhraseTesting && panelInteractiveDebug && panelStrangePhrases && panelPhraseTesting && btnRunDebug) {
            tabInteractiveDebug.classList.add('active');
            tabStrangePhrases.classList.remove('active');
            tabPhraseTesting.classList.remove('active');
            panelInteractiveDebug.classList.remove('hidden');
            panelStrangePhrases.classList.add('hidden');
            panelPhraseTesting.classList.add('hidden');
            btnRunDebug.style.display = 'flex';
            btnRunDebug.innerHTML = '🚀 Запустить разбор';
        }
        
        // Сброс полей теста фраз
        const accountSelect = document.getElementById('test-phrase-account-select');
        const phraseInput = document.getElementById('test-phrase-input');
        const rawResponseEl = document.getElementById('test-phrase-raw-response');
        const analysisBoxEl = document.getElementById('test-phrase-analysis-box');
        if (accountSelect) accountSelect.value = "";
        if (phraseInput) phraseInput.value = "";
        if (rawResponseEl) rawResponseEl.textContent = "";
        if (analysisBoxEl) analysisBoxEl.innerHTML = "Ожидание отправки команды ВК...";
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
                            showToast('❌ Ошибка: ' + (err.detail || 'Не удалось удалить'), 'error');
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
                            showToast('❌ Ошибка: ' + (err.detail || 'Не удалось удалить'), 'error');
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
                            showToast('❌ Ошибка: ' + (err.detail || 'Не удалось убрать команду'), 'error');
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
                            showToast('❌ Ошибка: ' + (err.detail || 'Не удалось удалить'), 'error');
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
                            showToast('❌ Ошибка: ' + (err.detail || 'Не удалось удалить'), 'error');
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
                    "Арены": "arenas"
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

    function fillTestPhraseAccountsDropdown() {
        const select = document.getElementById('test-phrase-account-select');
        if (!select) return;

        // Фильтруем запущенные (is_active === 1) аккаунты, исключая виртуальный общий с vk_id = 0
        const activeAccs = state.accounts.filter(a => a.is_active === 1 && a.vk_id !== 0);

        select.innerHTML = '<option value="">-- Выберите запущенный аккаунт --</option>';
        if (activeAccs.length === 0) {
            select.innerHTML += '<option value="" disabled style="color: var(--color-danger);">⚠️ Нет активных (запущенных) аккаунтов в сети</option>';
            return;
        }

        activeAccs.forEach(acc => {
            const opt = document.createElement('option');
            opt.value = acc.vk_id;
            opt.innerText = `🐸 ${acc.name} (ID: ${acc.vk_id})`;
            select.appendChild(opt);
        });
    }

    async function handlePhraseTestingSubmit() {
        const accountSelect = document.getElementById('test-phrase-account-select');
        const phraseInput = document.getElementById('test-phrase-input');
        const rawResponseEl = document.getElementById('test-phrase-raw-response');
        const analysisBoxEl = document.getElementById('test-phrase-analysis-box');
        const btnRunDebug = document.getElementById('btn-run-debug');

        if (!accountSelect || !phraseInput || !rawResponseEl || !analysisBoxEl) return;

        const vkIdVal = accountSelect.value;
        const phrase = phraseInput.value.trim();

        if (!vkIdVal) {
            showToast('⚠️ Пожалуйста, выберите активный аккаунт', 'error');
            return;
        }
        if (!phrase) {
            showToast('⚠️ Пожалуйста, введите фразу для отправки', 'error');
            return;
        }

        // Блокируем кнопку на время теста
        if (btnRunDebug) {
            btnRunDebug.disabled = true;
            btnRunDebug.innerHTML = '⏳ Ожидаем ответ Жабабота...';
        }

        rawResponseEl.textContent = 'Отправка команды в чат ВК и ожидание ответа от Жабабота...';
        analysisBoxEl.innerHTML = `<div style="color: var(--color-text-muted);">Бот отправил команду и слушает входящий LongPoll поток. Это займет несколько секунд...</div>`;

        try {
            const response = await fetch('/api/debug/test_phrase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vk_id: parseInt(vkIdVal, 10),
                    message: phrase
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Не удалось выполнить тест фразы');
            }

            const data = await response.json();

            if (data.success === false) {
                // Превышено время ожидания ответа
                rawResponseEl.textContent = '❌ Ответ от Жабабота не получен.';
                analysisBoxEl.innerHTML = `<div style="color: var(--color-danger); font-weight: bold; margin-bottom: 8px;">⚠️ Ошибка: ${escapeHtml(data.error)}</div>
                <div style="font-size: 11.5px; color: var(--color-text-muted); line-height: 1.4;">Возможные причины:
                <br>• Жабабот завис или временно недоступен в ВК.
                <br>• Выбранный аккаунт не имеет доступа к чату или чат-ID настроен неверно.
                <br>• Команда была проигнорирована Жабаботом (например, из-за кулдауна на его стороне).
                <br>• На аккаунте превышен лимит запросов в ВК.</div>`;
                return;
            }

            // Выводим сырой ответ Жабабота
            rawResponseEl.textContent = data.response;

            // Выводим детальный анализ
            let html = '';
            if (data.matched) {
                html += `
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <div style="color: var(--color-success); font-weight: bold; font-size: 13px;">✅ Фраза успешно распознана!</div>
                        <div style="font-size: 12px; color: var(--color-text-main); line-height: 1.4;">
                            Действие: <b style="color: var(--color-primary-hover);">${escapeHtml(data.action_type)}</b><br>
                            <div style="white-space: pre-wrap; font-family: sans-serif; font-size: 12px; line-height: 1.5; margin-top: 6px; padding: 8px; background: rgba(255,255,255,0.01); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">${escapeHtml(data.explanation)}</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); border-radius: 6px; padding: 8px; margin-top: 4px;">
                            <b style="font-size: 11px; color: var(--color-warning);">Спарсенные параметры для БД:</b>
                            <pre style="margin: 4px 0 0 0; font-family: monospace; font-size: 11px; color: #00e676; overflow-x: auto;">${escapeHtml(JSON.stringify(data.parsed_fields, null, 2))}</pre>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <div style="color: var(--color-danger); font-weight: bold; font-size: 13px;">❌ Фраза не распознана шаблонами Базы Знаний</div>
                        <div style="font-size: 12px; color: var(--color-text-main); line-height: 1.4;">
                            <div style="white-space: pre-wrap; font-family: sans-serif; font-size: 12px; line-height: 1.5; margin-top: 6px; padding: 8px; background: rgba(255,255,255,0.01); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">${escapeHtml(data.explanation)}</div>
                        </div>
                        <div style="background: rgba(130, 39, 227, 0.04); border: 1px dashed rgba(130, 39, 227, 0.3); border-radius: 6px; padding: 8px; margin-top: 4px;">
                            <span style="font-size: 11px; color: var(--color-text-muted);">💡 <b>Как исправить:</b> Вы можете перейти во вкладку <b>«Странные фразы»</b>, где эта запись уже появилась, и прочитать подробный разбор того, каких полей или эмодзи не хватило парсеру для этой команды.</span>
                        </div>
                    </div>
                `;
                // Обновим список странных фраз в бэкграунде
                fetchUnrecognizedPhrases();
            }

            analysisBoxEl.innerHTML = html;
            showToast('Тест фразы завершен', 'success');

        } catch (err) {
            console.error(err);
            rawResponseEl.textContent = '❌ Ошибка при выполнении теста.';
            analysisBoxEl.innerHTML = `<div style="color: var(--color-danger); font-weight: bold;">⚠️ Исключение бэкенда: ${escapeHtml(err.message)}</div>`;
            showToast('❌ Ошибка при выполнении теста', 'error');
        } finally {
            if (btnRunDebug) {
                btnRunDebug.disabled = false;
                btnRunDebug.innerHTML = '💬 Отправить и проверить ВК';
            }
        }
    }

    // Отправка формы отладки парсера ответов
    async function handleRunDebugSubmit() {
        const tabPhraseTesting = document.getElementById('tab-phrase-testing');
        if (tabPhraseTesting && tabPhraseTesting.classList.contains('active')) {
            handlePhraseTestingSubmit();
            return;
        }

        const actionInput = document.getElementById('debug-action-input');
        const responseTextarea = document.getElementById('debug-response-text');
        const resultOutput = document.getElementById('debug-result-output');
        
        if (!responseTextarea || !resultOutput) return;
        
        const text = responseTextarea.value.trim();
        // Используем либо выбранное из комбобокса, либо введенный вручную текст
        const overrideAction = selectedCommand || (actionInput ? actionInput.value.trim() : "");
        
        if (!text) {
            showToast('⚠️ Пожалуйста, введите текст ответа бота', 'error');
            return;
        }
        
        resultOutput.innerHTML = `<span style="color: var(--color-text-muted);">Выполняется разбор...</span>`;
        
        try {
            const response = await fetch('/api/debug/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    override_action: overrideAction
                })
            });
            
            if (!response.ok) throw new Error('Не удалось выполнить разбор');
            
            const data = await response.json();
            
            // Форматируем красивый JSON-вывод с цветной подсветкой
            let outputHtml = '';
            
            if (data.matched) {
                outputHtml += `<span style="color: var(--color-success); font-weight: bold;">✅ Успешное совпадение шаблона!</span>\n`;
                outputHtml += `<span style="color: var(--color-primary-hover);">Определенное действие (action):</span> <strong style="color: var(--color-text-main);">${data.effective_action || 'Не определено'}</strong>\n`;
                if (data.matched_pattern_action && data.matched_pattern_action !== data.effective_action) {
                    outputHtml += `<span style="color: var(--color-text-muted);">Совпавший паттерн KB:</span> <strong style="color: var(--color-text-main);">${data.matched_pattern_action}</strong>\n`;
                }
                
                outputHtml += `\n<span style="color: var(--color-warning); font-weight: bold;">📝 Поля, которые обновятся в БД:</span>\n`;
                if (data.parsed_fields && Object.keys(data.parsed_fields).length > 0) {
                    for (const [key, value] of Object.entries(data.parsed_fields)) {
                        outputHtml += `  • <span style="color: #00e676;">${key}</span>: <span style="color: var(--color-text-main);">${JSON.stringify(value)}</span>\n`;
                    }
                } else {
                    outputHtml += `  <span style="color: var(--color-text-muted);">[Нет полей для обновления в БД]</span>\n`;
                }
                
                if (data.regex_groups && Object.keys(data.regex_groups).length > 0) {
                    outputHtml += `\n<span style="color: #00b0ff; font-weight: bold;">🔍 Захваченные регулярные группы (regex groups):</span>\n`;
                    for (const [key, value] of Object.entries(data.regex_groups)) {
                        outputHtml += `  • <span style="color: #82b1ff;">${key}</span>: <span style="color: var(--color-text-main);">${JSON.stringify(value)}</span>\n`;
                    }
                }
            } else {
                outputHtml += `<span style="color: var(--color-error); font-weight: bold;">❌ Ни один шаблон из Базы Знаний не совпал.</span>\n`;
                outputHtml += `<span style="color: var(--color-text-muted);">Парсер не среагирует на это сообщение в чате.</span>\n`;
            }
            
            resultOutput.innerHTML = outputHtml;
        } catch (error) {
            console.error('Ошибка отладки парсера:', error);
            resultOutput.innerHTML = `<span style="color: var(--color-error); font-weight: bold;">❌ Ошибка при отправке запроса разбора.</span>\n<span style="color: var(--color-text-muted);">${error.message}</span>`;
            showToast('❌ Ошибка связи с сервером', 'error');
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
                        class_level: state.accounts.reduce((sum, a) => sum + (a.class_level || 0), 0),
                        chat_id: null,
                        wins: state.accounts.reduce((sum, a) => sum + (a.wins || 0), 0),
                        losses: state.accounts.reduce((sum, a) => sum + (a.losses || 0), 0),
                        reserve_days: state.accounts.reduce((sum, a) => sum + (a.reserve_days || 0), 0),
                        work_info: state.accounts.filter(a => a.status === 'working').length + " на работе",
                        feed_info: state.accounts.filter(a => a.feed_info && (a.feed_info.includes('Покормлена') || a.feed_info === 'well-fed')).length + " покормлено",
                        fattening: state.accounts.filter(a => a.fattening === 'Да').length + " на откорме",
                        positions: "Сводные",
                        partner: state.accounts.filter(a => a.partner && a.partner !== 'Нет').length + " в браке",
                        marriage_days: state.accounts.reduce((sum, a) => sum + (a.marriage_days || 0), 0),
                        froglet: state.accounts.filter(a => a.froglet && a.froglet !== 'Нет').length + " жабят",
                        family_level: state.accounts.reduce((sum, a) => sum + (a.family_level || 0), 0),
                        family_satiety: state.accounts.filter(a => a.family_satiety === 'Сыт').length + " сытых",
                        family_authority: state.accounts.reduce((sum, a) => sum + (a.family_authority || 0), 0),
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
                }
            } else {
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
            
            item.innerHTML = `
                <div class="account-item-profile">
                    <div class="sidebar-toggle-btn ${acc.is_active === 1 ? 'active' : 'inactive'}" title="${acc.is_active === 1 ? 'Остановить бота' : 'Запустить бота'}"></div>
                    <div class="account-item-avatar">${acc.name.charAt(0)}</div>
                    <div class="account-item-info">
                        <h4>${acc.name}</h4>
                        <span>ID: ${acc.vk_id}</span>
                    </div>
                </div>
                <div class="account-item-actions">
                    <div class="status-indicator ${statusClass}"></div>
                    <button class="btn-delete-sidebar" data-vkid="${acc.vk_id}" data-name="${acc.name}" title="Удалить аккаунт">🗑️</button>
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
                class_level: state.accounts.reduce((sum, a) => sum + (a.class_level || 0), 0),
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
                positions: "Сводные",
                partner: state.accounts.filter(a => a.partner && a.partner !== 'Нет').length + " в браке",
                marriage_days: state.accounts.reduce((sum, a) => sum + (a.marriage_days || 0), 0),
                froglet: state.accounts.filter(a => a.froglet && a.froglet !== 'Нет').length + " жабят",
                family_level: state.accounts.reduce((sum, a) => sum + (a.family_level || 0), 0),
                family_satiety: state.accounts.filter(a => a.family_satiety === 'Сыт').length + " сытых",
                family_authority: state.accounts.reduce((sum, a) => sum + (a.family_authority || 0), 0),
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
                    <button class="tab-btn debug-btn" id="btn-open-debug">Отладка</button>
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
                            <button class="sub-tab-btn ${state.activeSubTab === 'arena' ? 'active' : ''}" data-subtab="arena">Арена</button>
                            <button class="sub-tab-btn ${state.activeSubTab === 'clan' ? 'active' : ''}" data-subtab="clan">Клан</button>
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
                                                <span class="stat-label">Должности</span>
                                                <span class="stat-value" id="stat-row-positions">Загрузка...</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Столбец 2: Боевая статистика -->
                                    <div class="stats-column-wrapper">
                                        <div class="column-timer" id="timer-column-battles">
                                            <span class="dot"></span>
                                            <span>Проверено: загрузка...</span>
                                        </div>
                                        <div class="stats-column">
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
                                                <span class="stat-label">Жабенок</span>
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
                                                <span class="stat-label">Садик</span>
                                                <span class="stat-value" id="stat-row-family-kindergarten">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Махач</span>
                                                <span class="stat-value" id="stat-row-family-clash">Загрузка...</span>
                                            </div>
                                            <div class="stat-row">
                                                <span class="stat-label">Покормить через</span>
                                                <span class="stat-value" id="stat-row-family-feed-in">Загрузка...</span>
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

        // Клик по кнопке Отладка
        const btnOpenDebug = dashboardDetailsLayout.querySelector('#btn-open-debug');
        if (btnOpenDebug) {
            btnOpenDebug.addEventListener('click', showDebugModal);
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
        const timeAgoText = formatLastChecked(acc.last_checked);
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
                const active = state.accounts.filter(a => a.is_active === 1).length;
                val = total > 0 ? `🔌 Активно: ${active} / ${total}` : 'Нет аккаунтов';
            } else {
                val = acc.status === 'working' ? '💼 Работает' : (acc.status === 'offline' ? '🔴 Оффлайн' : '💤 Отдыхает');
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
            let val;
            if (acc.vk_id === 0) {
                const maxMood = Math.max(state.accounts.length * 500, 500);
                val = `👻 ${acc.mood || 0} / ${maxMood}`;
            } else {
                val = `👻 ${acc.mood || 0} / 500`;
            }
            if (rowMood.textContent !== val) rowMood.textContent = val;
        }

        // Новые характеристики в Жабе:
        const rowWorkInfo = document.getElementById('stat-row-work-info');
        if (rowWorkInfo) {
            const val = acc.work_info || 'Не на работе';
            if (rowWorkInfo.textContent !== val) rowWorkInfo.textContent = val;
        }

        const rowFeedInfo = document.getElementById('stat-row-feed-info');
        if (rowFeedInfo) {
            let val = acc.feed_info || 'Не кормлена';
            if (val === 'well-fed' && acc.next_feed_time) {
                const nextFeed = new Date(acc.next_feed_time);
                const now = new Date();
                const diffMs = nextFeed - now;
                if (diffMs > 0) {
                    const diffMins = Math.floor(diffMs / 1000 / 60);
                    const hours = Math.floor(diffMins / 60);
                    const mins = diffMins % 60;
                    val = `well-fed (через ${hours} ч. ${mins} мин.)`;
                } else {
                    val = 'hungry (хочет кушать!)';
                }
            } else if (val === 'hungry') {
                val = 'hungry (хочет кушать!)';
            }
            if (rowFeedInfo.textContent !== val) rowFeedInfo.textContent = val;
        }

        const rowFattening = document.getElementById('stat-row-fattening');
        if (rowFattening) {
            const val = acc.fattening || 'Нет';
            if (rowFattening.textContent !== val) rowFattening.textContent = val;
        }

        const rowPositions = document.getElementById('stat-row-positions');
        if (rowPositions) {
            const val = acc.positions || 'Рядовой';
            if (rowPositions.textContent !== val) rowPositions.textContent = val;
        }

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

        const rowFamilyKindergarten = document.getElementById('stat-row-family-kindergarten');
        if (rowFamilyKindergarten) {
            const val = acc.kindergarten || 'Нет';
            if (rowFamilyKindergarten.textContent !== val) rowFamilyKindergarten.textContent = val;
        }

        const rowFamilyClash = document.getElementById('stat-row-family-clash');
        if (rowFamilyClash) {
            const val = acc.clash || 'Доступен';
            if (rowFamilyClash.textContent !== val) rowFamilyClash.textContent = val;
        }

        const rowFamilyFeedIn = document.getElementById('stat-row-family-feed-in');
        if (rowFamilyFeedIn) {
            const val = acc.feed_in || 'Готово';
            if (rowFamilyFeedIn.textContent !== val) rowFamilyFeedIn.textContent = val;
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
            const val = acc.clan_booster || 'Нет';
            if (rowClanBooster.textContent !== val) rowClanBooster.textContent = val;
        }

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