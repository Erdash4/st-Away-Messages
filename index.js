// File: public/scripts/extensions/AwayMessages.js
jQuery(() => {
    const extensionName = 'AwayMessages';
    const settingsKey = 'AwayMessages_settings';
    const defaultSettings = {
        enabled: false,
        notifications: false,
        webhookUrl: 'https://discord.com/api/webhooks/your_webhook_here',
        workHoursEnabled: false,
        workLabel: 'School',
        workFromHour: 9,
        workFromMinute: 0,
        workFromAmPm: 'AM',
        workToHour: 5,
        workToMinute: 0,
        workToAmPm: 'PM',
        workDays: {
            Monday: false, Tuesday: false, Wednesday: false,
            Thursday: false, Friday: false, Saturday: false, Sunday: false
        },
        characters: {},
        userName: 'User' // Add default userName
    };

    let settings = {};
    let characterList = [];
    let uiRendered = false;

    function loadSettings() {
        const saved = localStorage.getItem(settingsKey);
        if (saved) {
            try {
                settings = JSON.parse(saved);
            } catch (e) {
                settings = JSON.parse(JSON.stringify(defaultSettings));
            }
        } else {
            settings = JSON.parse(JSON.stringify(defaultSettings));
        }
        if (!settings.characters) settings.characters = {};
        if (!settings.userName) settings.userName = defaultSettings.userName;
    }

    function saveSettings() {
        localStorage.setItem(settingsKey, JSON.stringify(settings));
    }

    function getCharacterDefaults(characterName) {
        return {
            enabled: false,
            timeRangeMin: 2,
            timeRangeMinUnit: 'minutes',
            timeRangeMax: 12,
            timeRangeMaxUnit: 'hours',
            weights: {
                early_morning: 0.0,
                morning: 0.0,
                late_morning: 0.0,
                afternoon: 0.0,
                late_afternoon: 0.0,
                evening: 0.0,
                night: 0.0,
                wee_hours: 0.0
            },
            prompt: 'The time is {{time}}. {{char}} decided to send a message to {{user}}. {{user}} has been idle for {{idle_duration}}.',
            promptAtWork: 'The time is {{time}}. {{char}} decided to send a message to {{user}}. {{user}} has been idle for {{idle_duration}}. {{user}} is at {{work}} currently.',
            workMultiplier: 0.5,
            onlineMultiplier: 1.0,
            afterWorkEnabled: false,
            afterWorkMessage: 'The time is {{time}}. {{char}} decided to send a message to {{user}}, because this is when they get off {{work}}. {{user}} has been idle for {{idle_duration}}.',
            afterWorkOffsetNeg: 40,
            afterWorkOffsetNegUnit: 'minutes',
            afterWorkOffsetPos: 12,
            afterWorkOffsetPosUnit: 'minutes',
            greetingsEnabled: false,
            greetingHour: 7,
            greetingMinute: 0,
            greetingAmPm: 'AM',
            greetingPrompt: 'The time is {{time}}. Say good morning to {{user}}.',
            greetingOffsetNeg: 40,
            greetingOffsetNegUnit: 'minutes',
            greetingOffsetPos: 12,
            greetingOffsetPosUnit: 'minutes'
        };
    }

    function buildCharacterSettings(characterName) {
        if (!settings.characters[characterName]) {
            settings.characters[characterName] = getCharacterDefaults(characterName);
        }
    }

    // PATCHED: Extract character name from TavernCard v2 format
    function extractCharacterName(charData) {
        return charData.data?.name || charData.name || charData.avatar?.replace('.png', '') || 'Unknown';
    }

    // PATCHED: Fetch characters using the proper SillyTavern API endpoint
    async function refreshCharacterList() {
        try {
            // Use POST method as required by /api/characters/all
            const response = await fetch('/api/characters/all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}) // Empty body - endpoint doesn't require parameters
            });
            
            if (response.ok) {
                const rawData = await response.json();
                
                // Filter and map to consistent format
                characterList = rawData
                    .filter(char => char?.name || char?.data?.name) // Remove invalid entries
                    .map(char => ({
                        name: extractCharacterName(char),
                        avatar: char.avatar, // filename.png - used as unique identifier
                        tags: char.data?.tags || char.tags || [],
                        fav: char.data?.extensions?.fav || char.fav || false
                    }));
                
                // Ensure settings exist for all characters
                for (const char of characterList) {
                    buildCharacterSettings(char.name);
                }

                // If UI already exists, only add missing character drawers
                if (uiRendered) {
                    const existingChars = new Set();
                    $('#AwayMessages_characterSettings .inline-drawer').each(function() {
                        const name = $(this).find('.inline-drawer-header b').text();
                        existingChars.add(name);
                    });
                    for (const char of characterList) {
                        if (!existingChars.has(char.name)) {
                            addCharacterDrawer(char.name);
                        }
                    }
                }
                return true;
            } else {
                console.warn(`AwayMessages: API returned ${response.status}`);
                return false;
            }
        } catch (e) {
            console.warn('AwayMessages: Could not fetch character list:', e.message);
            return false;
        }
    }

    // Append a drawer for a single character to the existing DOM
    function addCharacterDrawer(characterName) {
        const cs = settings.characters[characterName];
        if (!cs) return;

        const drawerHtml = `
            <div class="inline-drawer" data-character="${escapeHtml(characterName)}">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>${escapeHtml(characterName)}</b>
                    <span class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></span>
                </div>
                <div class="inline-drawer-content" style="display: none;">
                    <label class="checkbox_label">
                        <input type="checkbox" class="AwayMessages_charEnabled" data-char="${escapeHtml(characterName)}" ${cs.enabled ? 'checked' : ''}>
                        <span>Enable Away Messages for ${escapeHtml(characterName)}</span>
                    </label>
                    <div>
                        <b>Time-based messaging weights</b><br>
                        Time range: 
                        <input type="number" class="AwayMessages_charRangeMin" data-char="${escapeHtml(characterName)}" value="${cs.timeRangeMin}" min="1" style="width:50px">
                        <select class="AwayMessages_charRangeMinUnit" data-char="${escapeHtml(characterName)}">
                            ${makeUnitOptions(cs.timeRangeMinUnit)}
                        </select>
                        to 
                        <input type="number" class="AwayMessages_charRangeMax" data-char="${escapeHtml(characterName)}" value="${cs.timeRangeMax}" min="1" style="width:50px">
                        <select class="AwayMessages_charRangeMaxUnit" data-char="${escapeHtml(characterName)}">
                            ${makeUnitOptions(cs.timeRangeMaxUnit)}
                        </select>
                        <table class="AwayMessages_weightsTable">
                        ${makeWeightRows(characterName, cs.weights)}
                        </table>
                        <label>Away messaging prompt:<br><textarea class="AwayMessages_charPrompt" data-char="${escapeHtml(characterName)}" rows="3">${escapeHtml(cs.prompt)}</textarea></label><br>
                        <label>Away messaging prompt (at work):<br><textarea class="AwayMessages_charPromptAtWork" data-char="${escapeHtml(characterName)}" rows="3">${escapeHtml(cs.promptAtWork)}</textarea></label><br>
                        <label>At work multiplier: <input type="range" class="AwayMessages_charWorkMultiplier" data-char="${escapeHtml(characterName)}" min="0.0" max="1.0" step="0.01" value="${cs.workMultiplier}"> <span class="AwayMessages_workMultiplierValue">${cs.workMultiplier}</span></label><br>
                        <label>Online multiplier: <input type="range" class="AwayMessages_charOnlineMultiplier" data-char="${escapeHtml(characterName)}" min="0.0" max="4.0" step="0.01" value="${cs.onlineMultiplier}"> <span class="AwayMessages_onlineMultiplierValue">${cs.onlineMultiplier}</span></label>
                        <p><small>Online multiplier will activate if you have a tab of SillyTavern open.</small></p>
                        
                        <label class="checkbox_label">
                            <input type="checkbox" class="AwayMessages_charAfterWorkEnabled" data-char="${escapeHtml(characterName)}" ${cs.afterWorkEnabled ? 'checked' : ''}>
                            <span>Enable after work message</span>
                        </label>
                        <div class="AwayMessages_afterWorkFields" style="${cs.afterWorkEnabled ? '' : 'display:none'}">
                            <label>After work message:<br><textarea class="AwayMessages_charAfterWorkMessage" data-char="${escapeHtml(characterName)}" rows="3">${escapeHtml(cs.afterWorkMessage)}</textarea></label><br>
                            <div>Random offset: 
                                -<input type="number" class="AwayMessages_charAfterWorkOffsetNeg" data-char="${escapeHtml(characterName)}" value="${cs.afterWorkOffsetNeg}" min="0" style="width:50px">
                                <select class="AwayMessages_charAfterWorkOffsetNegUnit" data-char="${escapeHtml(characterName)}">
                                    ${makeUnitOptions(cs.afterWorkOffsetNegUnit)}
                                </select>
                                to +
                                <input type="number" class="AwayMessages_charAfterWorkOffsetPos" data-char="${escapeHtml(characterName)}" value="${cs.afterWorkOffsetPos}" min="0" style="width:50px">
                                <select class="AwayMessages_charAfterWorkOffsetPosUnit" data-char="${escapeHtml(characterName)}">
                                    ${makeUnitOptions(cs.afterWorkOffsetPosUnit)}
                                </select>
                            </div>
                        </div>

                        <label class="checkbox_label">
                            <input type="checkbox" class="AwayMessages_charGreetingsEnabled" data-char="${escapeHtml(characterName)}" ${cs.greetingsEnabled ? 'checked' : ''}>
                            <span>Enable greetings</span>
                        </label>
                        <div class="AwayMessages_greetingsFields" style="${cs.greetingsEnabled ? '' : 'display:none'}">
                            <label>Greeting time: 
                                <input type="number" class="AwayMessages_charGreetingHour" data-char="${escapeHtml(characterName)}" min="1" max="12" value="${cs.greetingHour}" style="width:50px">:
                                <input type="number" class="AwayMessages_charGreetingMinute" data-char="${escapeHtml(characterName)}" min="0" max="59" value="${cs.greetingMinute}" style="width:50px">
                                <select class="AwayMessages_charGreetingAmPm" data-char="${escapeHtml(characterName)}">
                                    <option value="AM" ${cs.greetingAmPm === 'AM' ? 'selected' : ''}>AM</option>
                                    <option value="PM" ${cs.greetingAmPm === 'PM' ? 'selected' : ''}>PM</option>
                                </select>
                            </label><br>
                            <label>Greeting prompt (sent as user, supports macros):<br><textarea class="AwayMessages_charGreetingPrompt" data-char="${escapeHtml(characterName)}" rows="3">${escapeHtml(cs.greetingPrompt)}</textarea></label><br>
                            <div>Random offset: 
                                -<input type="number" class="AwayMessages_charGreetingOffsetNeg" data-char="${escapeHtml(characterName)}" value="${cs.greetingOffsetNeg}" min="0" style="width:50px">
                                <select class="AwayMessages_charGreetingOffsetNegUnit" data-char="${escapeHtml(characterName)}">
                                    ${makeUnitOptions(cs.greetingOffsetNegUnit)}
                                </select>
                                to +
                                <input type="number" class="AwayMessages_charGreetingOffsetPos" data-char="${escapeHtml(characterName)}" value="${cs.greetingOffsetPos}" min="0" style="width:50px">
                                <select class="AwayMessages_charGreetingOffsetPosUnit" data-char="${escapeHtml(characterName)}">
                                    ${makeUnitOptions(cs.greetingOffsetPosUnit)}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        $('#AwayMessages_characterSettings').append(drawerHtml);
        bindCharacterEvents(characterName);
    }

    function makeUnitOptions(selected) {
        const units = ['seconds', 'minutes', 'hours', 'days'];
        return units.map(u => `<option value="${u}" ${selected === u ? 'selected' : ''}>${u}</option>`).join('');
    }

    function makeWeightRows(charName, weights) {
        const periods = [
            { id: 'early_morning', label: 'Early morning' },
            { id: 'morning', label: 'Morning' },
            { id: 'late_morning', label: 'Late morning' },
            { id: 'afternoon', label: 'Afternoon' },
            { id: 'late_afternoon', label: 'Late afternoon' },
            { id: 'evening', label: 'Evening' },
            { id: 'night', label: 'Night' },
            { id: 'wee_hours', label: 'Wee hours' }
        ];
        return periods.map(p => `
            <tr>
                <td>${p.label}</td>
                <td><input type="range" class="AwayMessages_charWeight" data-char="${escapeHtml(charName)}" data-period="${p.id}" min="0.0" max="1.0" step="0.01" value="${weights[p.id]}"></td>
                <td class="AwayMessages_weightValue">${weights[p.id]}</td>
            </tr>
        `).join('');
    }

    function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, function(m) {
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
            return map[m] || m;
        });
    }

function bindCharacterEvents(characterName) {
    const container = $(`#AwayMessages_characterSettings .inline-drawer[data-character="${CSS.escape(characterName)}"]`);
    
    // Update display values for range inputs
    container.find('input[type="range"]').on('input', function() {
        const $span = $(this).next('span');
        if ($span.length) $span.text(parseFloat($(this).val()).toFixed(2));
    });
    
    // Update weight display values
    container.find('.AwayMessages_charWeight').on('input', function() {
        $(this).closest('tr').find('.AwayMessages_weightValue').text(parseFloat($(this).val()).toFixed(2));
    });

    container.find('input, select, textarea').on('change input', function(e) {
        updateCharacterSettingFromElement(this);
    });
    
    // FIXED: Proper drawer toggle with preventDefault and stopPropagation
    const $toggle = container.find('.inline-drawer-toggle');
    const $content = container.find('.inline-drawer-content');
    const $icon = container.find('.inline-drawer-icon');
    
    // Remove any existing handlers first to prevent duplicate bindings
    $toggle.off('click.AwayMessages');
    
    $toggle.on('click.AwayMessages', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Toggle the content visibility with animation
        if ($content.is(':visible')) {
            $content.slideUp(200);
            $icon.removeClass('down');
        } else {
            $content.slideDown(200);
            $icon.addClass('down');
        }
        return false;
    });
}

    function renderSettingsUI() {
        if (uiRendered) return;

        const html = `
        <div class="AwayMessages-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Away Messages</b>
                    <span class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></span>
                </div>
                <div class="inline-drawer-content">
                    <p><i>Learn how to setup Away Messages properly <a href="https://github.com/SillyTavern/SillyTavern" target="_blank">here</a>. You'll need the complementary plugin to run this.</i></p>
                    <p><small>Hours: early morning 3am–6am, morning 6am–9am, late morning 9am–12pm, afternoon 12pm–3pm, late afternoon 3pm–6pm, evening 6pm–9pm, night 9pm–12am, wee hours 12am–3am.</small></p>
                    
                    <label class="checkbox_label">
                        <input type="checkbox" id="AwayMessages_enabled" ${settings.enabled ? 'checked' : ''}>
                        <span>Enable</span>
                    </label>
                    <label class="checkbox_label">
                        <input type="checkbox" id="AwayMessages_notifications" ${settings.notifications ? 'checked' : ''}>
                        <span>Notifications</span>
                    </label>
                    <label>Notifying Discord webhook:
                        <input type="text" id="AwayMessages_webhookUrl" value="${escapeHtml(settings.webhookUrl)}" placeholder="https://discord.com/api/webhooks/...">
                    </label>
                    <p><small>Notifications from Away Messages will be sent to your webhook URL. Enabling push notifications is also recommended.</small></p>
                    
                    <label class="checkbox_label">
                        <input type="checkbox" id="AwayMessages_workHoursEnabled" ${settings.workHoursEnabled ? 'checked' : ''}>
                        <span>Enable work hours</span>
                    </label>
                    <div id="AwayMessages_workHoursFields" style="${settings.workHoursEnabled ? '' : 'display:none'}">
                        <label>Work label: <input type="text" id="AwayMessages_workLabel" value="${escapeHtml(settings.workLabel)}" placeholder="e.g., School, Work"></label>
                        <div>Work hours: from 
                            <input type="number" id="AwayMessages_workFromHour" min="1" max="12" value="${settings.workFromHour}" style="width:50px">:
                            <input type="number" id="AwayMessages_workFromMinute" min="0" max="59" value="${settings.workFromMinute}" style="width:50px">
                            <select id="AwayMessages_workFromAmPm">
                                <option value="AM" ${settings.workFromAmPm === 'AM' ? 'selected' : ''}>AM</option>
                                <option value="PM" ${settings.workFromAmPm === 'PM' ? 'selected' : ''}>PM</option>
                            </select>
                            to 
                            <input type="number" id="AwayMessages_workToHour" min="1" max="12" value="${settings.workToHour}" style="width:50px">:
                            <input type="number" id="AwayMessages_workToMinute" min="0" max="59" value="${settings.workToMinute}" style="width:50px">
                            <select id="AwayMessages_workToAmPm">
                                <option value="AM" ${settings.workToAmPm === 'AM' ? 'selected' : ''}>AM</option>
                                <option value="PM" ${settings.workToAmPm === 'PM' ? 'selected' : ''}>PM</option>
                            </select>
                        </div>
                        <div class="AwayMessages_workDays">
                            ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => 
                                `<label class="checkbox_label"><input type="checkbox" class="AwayMessages_workDay" data-day="${d}" ${settings.workDays[d] ? 'checked' : ''}> ${d}</label>`
                            ).join(' ')}</div>
                    </div>

                    <h3>Character Settings</h3>
                    <div id="AwayMessages_characterSettings"></div>
                </div>
            </div>
        </div>`;

        $('#extensions_settings .AwayMessages-settings').remove();
        $('#extensions_settings').append(html);
        bindGlobalEvents();

        // Add character drawers
        for (const char of characterList) {
            addCharacterDrawer(char.name);
        }

        uiRendered = true;
    }

    function bindGlobalEvents() {
        $('#AwayMessages_enabled').on('change', function() {
            settings.enabled = this.checked;
            saveSettings();
            sendSettingsToServer();
        });
        $('#AwayMessages_notifications').on('change', function() {
            settings.notifications = this.checked;
            saveSettings();
            sendSettingsToServer();
        });
        $('#AwayMessages_webhookUrl').on('input', function() {
            settings.webhookUrl = this.value;
            saveSettings();
            sendSettingsToServer();
        });
        $('#AwayMessages_workHoursEnabled').on('change', function() {
            settings.workHoursEnabled = this.checked;
            $('#AwayMessages_workHoursFields').toggle(this.checked);
            saveSettings();
            sendSettingsToServer();
        });
        $('#AwayMessages_workLabel').on('input', function() {
            settings.workLabel = this.value;
            saveSettings();
            sendSettingsToServer();
        });
        ['workFromHour','workFromMinute','workFromAmPm','workToHour','workToMinute','workToAmPm'].forEach(id => {
            $(`#AwayMessages_${id}`).on('change input', function() {
                const val = $(this).val();
                const key = id.replace('AwayMessages_', '');
                settings[key] = key.includes('Hour') || key.includes('Minute') ? Number(val) : val;
                saveSettings();
                sendSettingsToServer();
            });
        });
        $('.AwayMessages_workDay').on('change', function() {
            const day = $(this).data('day');
            settings.workDays[day] = this.checked;
            saveSettings();
            sendSettingsToServer();
        });
    }

    function updateCharacterSettingFromElement(el) {
        const $el = $(el);
        const charName = $el.data('char');
        if (!charName || !settings.characters[charName]) return;
        const cs = settings.characters[charName];
        
        let val = $el.is(':checkbox') ? $el.prop('checked') : $el.val();
        if ($el.attr('type') === 'number' && val !== '') val = Number(val);
        if ($el.is('input[type="range"]')) val = parseFloat(val);

        if ($el.hasClass('AwayMessages_charEnabled')) cs.enabled = val;
        else if ($el.hasClass('AwayMessages_charRangeMin')) cs.timeRangeMin = Number(val);
        else if ($el.hasClass('AwayMessages_charRangeMinUnit')) cs.timeRangeMinUnit = val;
        else if ($el.hasClass('AwayMessages_charRangeMax')) cs.timeRangeMax = Number(val);
        else if ($el.hasClass('AwayMessages_charRangeMaxUnit')) cs.timeRangeMaxUnit = val;
        else if ($el.hasClass('AwayMessages_charWeight')) {
            cs.weights[$el.data('period')] = parseFloat(val);
            $el.closest('tr').find('.AwayMessages_weightValue').text(parseFloat(val).toFixed(2));
        }
        else if ($el.hasClass('AwayMessages_charPrompt')) cs.prompt = val;
        else if ($el.hasClass('AwayMessages_charPromptAtWork')) cs.promptAtWork = val;
        else if ($el.hasClass('AwayMessages_charWorkMultiplier')) {
            cs.workMultiplier = parseFloat(val);
            $el.next('span').text(parseFloat(val).toFixed(2));
        }
        else if ($el.hasClass('AwayMessages_charOnlineMultiplier')) {
            cs.onlineMultiplier = parseFloat(val);
            $el.next('span').text(parseFloat(val).toFixed(2));
        }
        else if ($el.hasClass('AwayMessages_charAfterWorkEnabled')) {
            cs.afterWorkEnabled = val;
            $el.closest('.inline-drawer-content').find('.AwayMessages_afterWorkFields').toggle(val);
        }
        else if ($el.hasClass('AwayMessages_charAfterWorkMessage')) cs.afterWorkMessage = val;
        else if ($el.hasClass('AwayMessages_charAfterWorkOffsetNeg')) cs.afterWorkOffsetNeg = Number(val);
        else if ($el.hasClass('AwayMessages_charAfterWorkOffsetNegUnit')) cs.afterWorkOffsetNegUnit = val;
        else if ($el.hasClass('AwayMessages_charAfterWorkOffsetPos')) cs.afterWorkOffsetPos = Number(val);
        else if ($el.hasClass('AwayMessages_charAfterWorkOffsetPosUnit')) cs.afterWorkOffsetPosUnit = val;
        else if ($el.hasClass('AwayMessages_charGreetingsEnabled')) {
            cs.greetingsEnabled = val;
            $el.closest('.inline-drawer-content').find('.AwayMessages_greetingsFields').toggle(val);
        }
        else if ($el.hasClass('AwayMessages_charGreetingHour')) cs.greetingHour = Number(val);
        else if ($el.hasClass('AwayMessages_charGreetingMinute')) cs.greetingMinute = Number(val);
        else if ($el.hasClass('AwayMessages_charGreetingAmPm')) cs.greetingAmPm = val;
        else if ($el.hasClass('AwayMessages_charGreetingPrompt')) cs.greetingPrompt = val;
        else if ($el.hasClass('AwayMessages_charGreetingOffsetNeg')) cs.greetingOffsetNeg = Number(val);
        else if ($el.hasClass('AwayMessages_charGreetingOffsetNegUnit')) cs.greetingOffsetNegUnit = val;
        else if ($el.hasClass('AwayMessages_charGreetingOffsetPos')) cs.greetingOffsetPos = Number(val);
        else if ($el.hasClass('AwayMessages_charGreetingOffsetPosUnit')) cs.greetingOffsetPosUnit = val;
        
        saveSettings();
        sendSettingsToServer();
    }

    function sendSettingsToServer() {
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            const context = SillyTavern.getContext();
            if (context?.socket) {
                context.socket.emit('AwayMessages_settings', settings);
            }
        }
    }

    let lastActivity = Date.now();
    function updateActivity() {
        lastActivity = Date.now();
        if (typeof SillyTavern !== 'undefined') {
            const context = SillyTavern.getContext();
            if (context?.socket) {
                context.socket.emit('AwayMessages_heartbeat', { lastActivity });
            }
        }
    }

    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, updateActivity, { passive: true });
    });

    // PATCHED: Refresh button for manual character list reload
    function addRefreshButton() {
        const $refreshBtn = $('<button class="menu_button" style="margin-left:10px" title="Refresh character list">🔄 Refresh</button>');
        $refreshBtn.on('click', async function() {
            $refreshBtn.prop('disabled', true).text('Loading...');
            const success = await refreshCharacterList();
            $refreshBtn.prop('disabled', false).text('🔄 Refresh');
            if (success) {
                // Re-render only the character settings section
                $('#AwayMessages_characterSettings').empty();
                for (const char of characterList) {
                    addCharacterDrawer(char.name);
                }
                console.log('AwayMessages: Character list refreshed');
            }
        });
        // Insert after the "Character Settings" header
        $('#extensions_settings h3:contains("Character Settings")').after($refreshBtn);
    }

    // Initialization
    async function init() {
        loadSettings();
        
        // Try to fetch characters, with fallback to settings-only mode
        const charsLoaded = await refreshCharacterList();
        if (!charsLoaded && Object.keys(settings.characters).length === 0) {
            console.warn('AwayMessages: No characters available. Please ensure SillyTavern is running and characters exist.');
        }
        
        renderSettingsUI();
        addRefreshButton(); // Add manual refresh button
        sendSettingsToServer();
        setInterval(updateActivity, 10000);
        
        console.log(`${extensionName}: Initialized with ${characterList.length} characters`);
    }
    
    init();
});
