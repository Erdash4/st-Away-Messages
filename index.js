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
        characters: {} // will be populated dynamically
    };

    let settings = {};
    let characterList = []; // updated from server

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
        // Ensure characters object exists
        if (!settings.characters) settings.characters = {};
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

    // Fetch characters from the server (via the plugin's API endpoint)
    async function refreshCharacterList() {
        try {
            const response = await fetch('/api/plugins/AwayMessages/characters');
            if (response.ok) {
                characterList = await response.json();
                // Ensure all existing characters have settings entries
                for (const char of characterList) {
                    buildCharacterSettings(char.name);
                }
            }
        } catch (e) {
            console.warn('AwayMessages: Could not fetch character list, using existing settings.');
        }
    }

    function renderSettingsUI() {
        const html = `
        <div class="AwayMessages-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Away Messages</b>
                    <span class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></span>
                </div>
                <div class="inline-drawer-content">
                    <p><i>Learn how to setup Away Messages properly <a href="#">here</a>. You'll need the complementary plugin to run this.</i></p>
                    <p>Hours: early morning 3am–6am, morning 6am–9am, late morning 9am–12pm, afternoon 12pm–3pm, late afternoon 3pm–6pm, evening 6pm–9pm, night 9pm–12am, wee hours 12am–3am.</p>
                    
                    <label class="checkbox_label">
                        <input type="checkbox" id="AwayMessages_enabled" ${settings.enabled ? 'checked' : ''}>
                        <span>Enable</span>
                    </label>
                    <label class="checkbox_label">
                        <input type="checkbox" id="AwayMessages_notifications" ${settings.notifications ? 'checked' : ''}>
                        <span>Notifications</span>
                    </label>
                    <label>Notifying Discord webhook:
                        <input type="text" id="AwayMessages_webhookUrl" value="${settings.webhookUrl}">
                    </label>
                    <p><small>Notifications from Away Messages will be sent to your webhook URL. Enabling push notifications is also recommended.</small></p>
                    
                    <label class="checkbox_label">
                        <input type="checkbox" id="AwayMessages_workHoursEnabled" ${settings.workHoursEnabled ? 'checked' : ''}>
                        <span>Enable work hours</span>
                    </label>
                    <div id="AwayMessages_workHoursFields" style="${settings.workHoursEnabled ? '' : 'display:none'}">
                        <label>Work label: <input type="text" id="AwayMessages_workLabel" value="${settings.workLabel}"></label>
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
                        <div>${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => 
                            `<label class="checkbox_label"><input type="checkbox" class="AwayMessages_workDay" data-day="${d}" ${settings.workDays[d] ? 'checked' : ''}> ${d}</label>`
                        ).join(' ')}</div>
                    </div>

                    <h3>Character Settings</h3>
                    <div id="AwayMessages_characterSettings">
                        ${characterList.map(char => {
                            buildCharacterSettings(char.name);
                            const cs = settings.characters[char.name];
                            return `
                            <div class="inline-drawer">
                                <div class="inline-drawer-toggle inline-drawer-header">
                                    <b>${char.name}</b>
                                    <span class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></span>
                                </div>
                                <div class="inline-drawer-content">
                                    <label class="checkbox_label">
                                        <input type="checkbox" class="AwayMessages_charEnabled" data-char="${char.name}" ${cs.enabled ? 'checked' : ''}>
                                        <span>Enable Away Messages for ${char.name}</span>
                                    </label>
                                    <div>
                                        <b>Timed based messaging weights</b><br>
                                        Time range: 
                                        <input type="number" class="AwayMessages_charRangeMin" data-char="${char.name}" value="${cs.timeRangeMin}" min="1" style="width:50px">
                                        <select class="AwayMessages_charRangeMinUnit" data-char="${char.name}">
                                            <option value="seconds" ${cs.timeRangeMinUnit === 'seconds' ? 'selected' : ''}>seconds</option>
                                            <option value="minutes" ${cs.timeRangeMinUnit === 'minutes' ? 'selected' : ''}>minutes</option>
                                            <option value="hours" ${cs.timeRangeMinUnit === 'hours' ? 'selected' : ''}>hours</option>
                                            <option value="days" ${cs.timeRangeMinUnit === 'days' ? 'selected' : ''}>days</option>
                                        </select>
                                        to 
                                        <input type="number" class="AwayMessages_charRangeMax" data-char="${char.name}" value="${cs.timeRangeMax}" min="1" style="width:50px">
                                        <select class="AwayMessages_charRangeMaxUnit" data-char="${char.name}">
                                            <option value="seconds" ${cs.timeRangeMaxUnit === 'seconds' ? 'selected' : ''}>seconds</option>
                                            <option value="minutes" ${cs.timeRangeMaxUnit === 'minutes' ? 'selected' : ''}>minutes</option>
                                            <option value="hours" ${cs.timeRangeMaxUnit === 'hours' ? 'selected' : ''}>hours</option>
                                            <option value="days" ${cs.timeRangeMaxUnit === 'days' ? 'selected' : ''}>days</option>
                                        </select>
                                        <table>
                                            <tr><td>Early morning</td><td><input type="range" class="AwayMessages_charWeight" data-char="${char.name}" data-period="early_morning" min="0.0" max="1.0" step="0.01" value="${cs.weights.early_morning}"></td><td>${cs.weights.early_morning}</td></tr>
                                            <tr><td>Morning</td><td><input type="range" class="AwayMessages_charWeight" data-char="${char.name}" data-period="morning" min="0.0" max="1.0" step="0.01" value="${cs.weights.morning}"></td><td>${cs.weights.morning}</td></tr>
                                            <tr><td>Late morning</td><td><input type="range" class="AwayMessages_charWeight" data-char="${char.name}" data-period="late_morning" min="0.0" max="1.0" step="0.01" value="${cs.weights.late_morning}"></td><td>${cs.weights.late_morning}</td></tr>
                                            <tr><td>Afternoon</td><td><input type="range" class="AwayMessages_charWeight" data-char="${char.name}" data-period="afternoon" min="0.0" max="1.0" step="0.01" value="${cs.weights.afternoon}"></td><td>${cs.weights.afternoon}</td></tr>
                                            <tr><td>Late afternoon</td><td><input type="range" class="AwayMessages_charWeight" data-char="${char.name}" data-period="late_afternoon" min="0.0" max="1.0" step="0.01" value="${cs.weights.late_afternoon}"></td><td>${cs.weights.late_afternoon}</td></tr>
                                            <tr><td>Evening</td><td><input type="range" class="AwayMessages_charWeight" data-char="${char.name}" data-period="evening" min="0.0" max="1.0" step="0.01" value="${cs.weights.evening}"></td><td>${cs.weights.evening}</td></tr>
                                            <tr><td>Night</td><td><input type="range" class="AwayMessages_charWeight" data-char="${char.name}" data-period="night" min="0.0" max="1.0" step="0.01" value="${cs.weights.night}"></td><td>${cs.weights.night}</td></tr>
                                            <tr><td>Wee hours</td><td><input type="range" class="AwayMessages_charWeight" data-char="${char.name}" data-period="wee_hours" min="0.0" max="1.0" step="0.01" value="${cs.weights.wee_hours}"></td><td>${cs.weights.wee_hours}</td></tr>
                                        </table>
                                        <label>Away messaging prompt:<br><textarea class="AwayMessages_charPrompt" data-char="${char.name}" rows="3">${cs.prompt}</textarea></label><br>
                                        <label>Away messaging prompt (at work):<br><textarea class="AwayMessages_charPromptAtWork" data-char="${char.name}" rows="3">${cs.promptAtWork}</textarea></label><br>
                                        <label>At work multiplier: <input type="range" class="AwayMessages_charWorkMultiplier" data-char="${char.name}" min="0.0" max="1.0" step="0.01" value="${cs.workMultiplier}"> <span>${cs.workMultiplier}</span></label><br>
                                        <label>Online multiplier: <input type="range" class="AwayMessages_charOnlineMultiplier" data-char="${char.name}" min="0.0" max="4.0" step="0.01" value="${cs.onlineMultiplier}"> <span>${cs.onlineMultiplier}</span></label>
                                        <p><small>Online multiplier will activate if you have a tab of SillyTavern open.</small></p>
                                        
                                        <label class="checkbox_label">
                                            <input type="checkbox" class="AwayMessages_charAfterWorkEnabled" data-char="${char.name}" ${cs.afterWorkEnabled ? 'checked' : ''}>
                                            <span>Enable after work message</span>
                                        </label>
                                        <div class="AwayMessages_afterWorkFields" style="${cs.afterWorkEnabled ? '' : 'display:none'}">
                                            <label>After work message:<br><textarea class="AwayMessages_charAfterWorkMessage" data-char="${char.name}" rows="3">${cs.afterWorkMessage}</textarea></label><br>
                                            <div>Random offset: 
                                                -<input type="number" class="AwayMessages_charAfterWorkOffsetNeg" data-char="${char.name}" value="${cs.afterWorkOffsetNeg}" min="0" style="width:50px">
                                                <select class="AwayMessages_charAfterWorkOffsetNegUnit" data-char="${char.name}">
                                                    <option value="seconds" ${cs.afterWorkOffsetNegUnit === 'seconds' ? 'selected' : ''}>seconds</option>
                                                    <option value="minutes" ${cs.afterWorkOffsetNegUnit === 'minutes' ? 'selected' : ''}>minutes</option>
                                                    <option value="hours" ${cs.afterWorkOffsetNegUnit === 'hours' ? 'selected' : ''}>hours</option>
                                                </select>
                                                to +
                                                <input type="number" class="AwayMessages_charAfterWorkOffsetPos" data-char="${char.name}" value="${cs.afterWorkOffsetPos}" min="0" style="width:50px">
                                                <select class="AwayMessages_charAfterWorkOffsetPosUnit" data-char="${char.name}">
                                                    <option value="seconds" ${cs.afterWorkOffsetPosUnit === 'seconds' ? 'selected' : ''}>seconds</option>
                                                    <option value="minutes" ${cs.afterWorkOffsetPosUnit === 'minutes' ? 'selected' : ''}>minutes</option>
                                                    <option value="hours" ${cs.afterWorkOffsetPosUnit === 'hours' ? 'selected' : ''}>hours</option>
                                                </select>
                                            </div>
                                        </div>

                                        <label class="checkbox_label">
                                            <input type="checkbox" class="AwayMessages_charGreetingsEnabled" data-char="${char.name}" ${cs.greetingsEnabled ? 'checked' : ''}>
                                            <span>Enable greetings</span>
                                        </label>
                                        <div class="AwayMessages_greetingsFields" style="${cs.greetingsEnabled ? '' : 'display:none'}">
                                            <label>Greeting time: 
                                                <input type="number" class="AwayMessages_charGreetingHour" data-char="${char.name}" min="1" max="12" value="${cs.greetingHour}" style="width:50px">:
                                                <input type="number" class="AwayMessages_charGreetingMinute" data-char="${char.name}" min="0" max="59" value="${cs.greetingMinute}" style="width:50px">
                                                <select class="AwayMessages_charGreetingAmPm" data-char="${char.name}">
                                                    <option value="AM" ${cs.greetingAmPm === 'AM' ? 'selected' : ''}>AM</option>
                                                    <option value="PM" ${cs.greetingAmPm === 'PM' ? 'selected' : ''}>PM</option>
                                                </select>
                                            </label><br>
                                            <label>Greeting prompt (sent as user, supports macros):<br><textarea class="AwayMessages_charGreetingPrompt" data-char="${char.name}" rows="3">${cs.greetingPrompt}</textarea></label><br>
                                            <div>Random offset: 
                                                -<input type="number" class="AwayMessages_charGreetingOffsetNeg" data-char="${char.name}" value="${cs.greetingOffsetNeg}" min="0" style="width:50px">
                                                <select class="AwayMessages_charGreetingOffsetNegUnit" data-char="${char.name}">
                                                    <option value="seconds" ${cs.greetingOffsetNegUnit === 'seconds' ? 'selected' : ''}>seconds</option>
                                                    <option value="minutes" ${cs.greetingOffsetNegUnit === 'minutes' ? 'selected' : ''}>minutes</option>
                                                    <option value="hours" ${cs.greetingOffsetNegUnit === 'hours' ? 'selected' : ''}>hours</option>
                                                </select>
                                                to +
                                                <input type="number" class="AwayMessages_charGreetingOffsetPos" data-char="${char.name}" value="${cs.greetingOffsetPos}" min="0" style="width:50px">
                                                <select class="AwayMessages_charGreetingOffsetPosUnit" data-char="${char.name}">
                                                    <option value="seconds" ${cs.greetingOffsetPosUnit === 'seconds' ? 'selected' : ''}>seconds</option>
                                                    <option value="minutes" ${cs.greetingOffsetPosUnit === 'minutes' ? 'selected' : ''}>minutes</option>
                                                    <option value="hours" ${cs.greetingOffsetPosUnit === 'hours' ? 'selected' : ''}>hours</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            </div>
        </div>`;

        $('#extensions_settings .AwayMessages-settings').remove();
        $('#extensions_settings').append(html);
        bindEvents();
    }

    function bindEvents() {
        // Top-level toggles
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
        // Work hours fields
        ['workLabel','workFromHour','workFromMinute','workFromAmPm','workToHour','workToMinute','workToAmPm'].forEach(id => {
            $(`#AwayMessages_${id}`).on('change input', function() {
                const val = $(this).val();
                const key = id.replace('AwayMessages_', '');
                if (typeof settings[key] === 'number') {
                    settings[key] = Number(val);
                } else {
                    settings[key] = val;
                }
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

        // Character-specific bindings
        $(document).on('change', '.AwayMessages_charEnabled', function() {
            const charName = $(this).data('char');
            settings.characters[charName].enabled = this.checked;
            saveSettings();
            sendSettingsToServer();
        });
        $(document).on('change input', '.AwayMessages_charRangeMin', function() {
            settings.characters[$(this).data('char')].timeRangeMin = Number(this.value);
            saveSettings();
            sendSettingsToServer();
        });
        // ... similar for all character inputs (abbreviated for clarity; full code would include all fields)
        // Use generic handler:
        $(document).on('change input', 'input, select, textarea', function(e) {
            if ($(this).closest('#AwayMessages_characterSettings').length) {
                // Determine which setting to update based on class and data-char
                updateCharacterSettingFromElement(this);
            }
        });

        // Collapsible drawers
        $(document).on('click', '.inline-drawer-toggle', function() {
            $(this).next('.inline-drawer-content').slideToggle(200);
            $(this).find('.inline-drawer-icon').toggleClass('down');
        });
    }

    function updateCharacterSettingFromElement(el) {
        const $el = $(el);
        const charName = $el.data('char');
        if (!charName || !settings.characters[charName]) return;
        const cs = settings.characters[charName];
        const val = $el.is(':checkbox') ? $el.prop('checked') : (Number($el.val()) || $el.val());
        if ($el.hasClass('AwayMessages_charEnabled')) cs.enabled = val;
        else if ($el.hasClass('AwayMessages_charRangeMin')) cs.timeRangeMin = Number(val);
        else if ($el.hasClass('AwayMessages_charRangeMinUnit')) cs.timeRangeMinUnit = val;
        else if ($el.hasClass('AwayMessages_charRangeMax')) cs.timeRangeMax = Number(val);
        else if ($el.hasClass('AwayMessages_charRangeMaxUnit')) cs.timeRangeMaxUnit = val;
        else if ($el.hasClass('AwayMessages_charWeight')) cs.weights[$el.data('period')] = parseFloat(val);
        else if ($el.hasClass('AwayMessages_charPrompt')) cs.prompt = val;
        else if ($el.hasClass('AwayMessages_charPromptAtWork')) cs.promptAtWork = val;
        else if ($el.hasClass('AwayMessages_charWorkMultiplier')) cs.workMultiplier = parseFloat(val);
        else if ($el.hasClass('AwayMessages_charOnlineMultiplier')) cs.onlineMultiplier = parseFloat(val);
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
            if (context && context.socket) {
                context.socket.emit('AwayMessages_settings', settings);
            }
        }
    }

    // Idle detection: send a heartbeat to server when user is active
    let lastActivity = Date.now();
    function updateActivity() {
        lastActivity = Date.now();
        if (typeof SillyTavern !== 'undefined') {
            const context = SillyTavern.getContext();
            if (context && context.socket) {
                context.socket.emit('AwayMessages_heartbeat', { lastActivity });
            }
        }
    }

    // Attach activity listeners
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, updateActivity, { passive: true });
    });

    // Initialize
    loadSettings();
    refreshCharacterList().then(() => {
        renderSettingsUI();
        // Send initial settings to server
        sendSettingsToServer();
        // Heartbeat every 10 seconds
        setInterval(updateActivity, 10000);
    });
});
