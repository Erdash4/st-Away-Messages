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
        quietHoursEnabled: false,
        quietHoursFromHour: 11,
        quietHoursFromMinute: 0,
        quietHoursFromAmPm: 'PM',
        quietHoursToHour: 7,
        quietHoursToMinute: 0,
        quietHoursToAmPm: 'AM',
        characters: {},
        userName: 'User'
    };

    let settings = {};
    let characterList = [];
    let uiRendered = false;

    // ─── Toast ────────────────────────────────────────────────────────────────
    function showToast(message, type = 'success') {
        const bg = type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3';
        const $toast = $(`<div style="
            position:fixed;bottom:28px;right:24px;
            background:${bg};color:#fff;
            padding:10px 18px;border-radius:7px;
            z-index:99999;font-size:14px;
            box-shadow:0 3px 12px rgba(0,0,0,0.35);
            pointer-events:none;opacity:0;transition:opacity 0.2s;
        ">${escapeHtml(message)}</div>`);
        $('body').append($toast);
        requestAnimationFrame(() => $toast.css('opacity', 1));
        setTimeout(() => $toast.css('opacity', 0), 2200);
        setTimeout(() => $toast.remove(), 2500);
    }

    // ─── Settings persistence ─────────────────────────────────────────────────
    function loadSettings() {
        const saved = localStorage.getItem(settingsKey);
        if (saved) {
            try { settings = JSON.parse(saved); }
            catch (e) { settings = JSON.parse(JSON.stringify(defaultSettings)); }
        } else {
            settings = JSON.parse(JSON.stringify(defaultSettings));
        }
        // Merge missing keys from defaults
        for (const key of Object.keys(defaultSettings)) {
            if (settings[key] === undefined) settings[key] = defaultSettings[key];
        }
        if (!settings.characters) settings.characters = {};
        if (!settings.userName) settings.userName = defaultSettings.userName;
    }

    function saveSettings() {
        localStorage.setItem(settingsKey, JSON.stringify(settings));
        showToast('Settings saved');
    }

    // ─── Export / Import ──────────────────────────────────────────────────────
    function exportSettings() {
        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'AwayMessages_settings.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Settings exported');
    }

    function importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    const imported = JSON.parse(ev.target.result);
                    settings = imported;
                    if (!settings.characters) settings.characters = {};
                    saveSettings();
                    sendSettingsToServer();
                    // Re-render UI
                    uiRendered = false;
                    $('#extensions_settings .AwayMessages-settings').remove();
                    renderSettingsUI();
                    addToolbarButtons();
                    showToast('Settings imported successfully', 'info');
                } catch (err) {
                    showToast('Failed to import: invalid JSON', 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    // ─── ETA calculation ──────────────────────────────────────────────────────
    function toMinutes(val, unit) {
        switch (unit) {
            case 'seconds': return val / 60;
            case 'minutes': return val;
            case 'hours':   return val * 60;
            case 'days':    return val * 1440;
            default:        return val;
        }
    }

    const PERIODS = [
        { id: 'early_morning',  label: 'Early morning',  hours: '3–6 AM'  },
        { id: 'morning',        label: 'Morning',         hours: '6–9 AM'  },
        { id: 'late_morning',   label: 'Late morning',    hours: '9–12 PM' },
        { id: 'afternoon',      label: 'Afternoon',       hours: '12–3 PM' },
        { id: 'late_afternoon', label: 'Late afternoon',  hours: '3–6 PM'  },
        { id: 'evening',        label: 'Evening',         hours: '6–9 PM'  },
        { id: 'night',          label: 'Night',           hours: '9 PM–12' },
        { id: 'wee_hours',      label: 'Wee hours',       hours: '12–3 AM' },
    ];
    const BUCKET_MINUTES = 180; // each period is 3 hours

    function calcEta(cs) {
        const minMin = toMinutes(cs.timeRangeMin, cs.timeRangeMinUnit);
        const maxMin = toMinutes(cs.timeRangeMax, cs.timeRangeMaxUnit);
        const avgMin = (minMin + maxMin) / 2;
        if (avgMin <= 0) return { perBucket: {}, total: 0 };

        let total = 0;
        const perBucket = {};
        for (const p of PERIODS) {
            const weight = cs.weights[p.id] || 0;
            const eta = (BUCKET_MINUTES / avgMin) * weight;
            perBucket[p.id] = eta;
            total += eta;
        }
        return { perBucket, total };
    }

    function formatEta(n) {
        if (n < 0.01) return '~0';
        if (n < 1) return `~${n.toFixed(2)}`;
        return `~${n.toFixed(1)}`;
    }

    function refreshEtaDisplay(characterName) {
        const cs = settings.characters[characterName];
        if (!cs) return;
        const { perBucket, total } = calcEta(cs);
        const container = $(`#AwayMessages_characterSettings .inline-drawer[data-character="${CSS.escape(characterName)}"]`);
        container.find('.AwayMessages_charWeight').each(function() {
            const period = $(this).data('period');
            $(this).closest('tr').find('.AwayMessages_etaValue').text(`ETA ${formatEta(perBucket[period])}/day`);
        });
        container.find('.AwayMessages_dailyEta').text(`Est. daily messages: ${formatEta(total)}`);
    }

    // ─── Character defaults ───────────────────────────────────────────────────
    function getCharacterDefaults() {
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
            settings.characters[characterName] = getCharacterDefaults();
        }
    }

    // ─── Fetch characters ─────────────────────────────────────────────────────
    function extractCharacterName(charData) {
        return charData.data?.name || charData.name || charData.avatar?.replace('.png', '') || 'Unknown';
    }

    async function refreshCharacterList() {
        try {
            const response = await fetch('/api/characters/all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (response.ok) {
                const rawData = await response.json();
                characterList = rawData
                    .filter(char => char?.name || char?.data?.name)
                    .map(char => ({
                        name: extractCharacterName(char),
                        avatar: char.avatar,
                        tags: char.data?.tags || char.tags || [],
                        fav: char.data?.extensions?.fav || char.fav || false
                    }));
                for (const char of characterList) {
                    buildCharacterSettings(char.name);
                }
                if (uiRendered) {
                    const existingChars = new Set();
                    $('#AwayMessages_characterSettings .inline-drawer').each(function() {
                        existingChars.add($(this).find('.inline-drawer-header b').text());
                    });
                    for (const char of characterList) {
                        if (!existingChars.has(char.name)) addCharacterDrawer(char.name);
                    }
                }
                return true;
            }
        } catch (e) {
            console.warn('AwayMessages: Could not fetch character list:', e.message);
        }
        return false;
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, m =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
    }

    function makeUnitOptions(selected) {
        return ['seconds', 'minutes', 'hours', 'days']
            .map(u => `<option value="${u}" ${selected === u ? 'selected' : ''}>${u}</option>`)
            .join('');
    }

    function padMinute(val) {
        return String(Number(val) || 0).padStart(2, '0');
    }

    function makeWeightRows(charName, weights) {
        return PERIODS.map(p => `
            <tr>
                <td style="width:110px">${p.label}<br><small style="opacity:.55">${p.hours}</small></td>
                <td><input type="range" class="AwayMessages_charWeight"
                    data-char="${escapeHtml(charName)}" data-period="${p.id}"
                    min="0" max="1" step="0.01" value="${weights[p.id]}"></td>
                <td class="AwayMessages_weightValue" style="width:36px">${Number(weights[p.id]).toFixed(2)}</td>
                <td class="AwayMessages_etaValue" style="width:90px;font-size:11px;opacity:.7">ETA …</td>
            </tr>`).join('');
    }

    // ─── Character drawer HTML ────────────────────────────────────────────────
    function addCharacterDrawer(characterName) {
        const cs = settings.characters[characterName];
        if (!cs) return;
        const n = escapeHtml(characterName);

        const drawerHtml = `
        <div class="inline-drawer" data-character="${n}">
            <div class="inline-drawer-toggle inline-drawer-header" style="display:flex;align-items:center;gap:8px">
                <b style="flex:1">${n}</b>
                <button class="menu_button AwayMessages_triggerNow" data-char="${n}"
                    title="Send an away message from this character right now"
                    style="font-size:12px;padding:2px 8px;margin:0">▶ Trigger now</button>
                <span class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></span>
            </div>
            <div class="inline-drawer-content" style="display:none">

                <label class="checkbox_label">
                    <input type="checkbox" class="AwayMessages_charEnabled" data-char="${n}" ${cs.enabled ? 'checked' : ''}>
                    <span>Enable Away Messages for ${n}</span>
                </label>

                <div style="margin:10px 0 4px"><b>Time-based messaging weights</b></div>
                <div>Time range:
                    <input type="number" class="AwayMessages_charRangeMin" data-char="${n}"
                        value="${cs.timeRangeMin}" min="1" style="width:52px">
                    <select class="AwayMessages_charRangeMinUnit" data-char="${n}">${makeUnitOptions(cs.timeRangeMinUnit)}</select>
                    to
                    <input type="number" class="AwayMessages_charRangeMax" data-char="${n}"
                        value="${cs.timeRangeMax}" min="1" style="width:52px">
                    <select class="AwayMessages_charRangeMaxUnit" data-char="${n}">${makeUnitOptions(cs.timeRangeMaxUnit)}</select>
                </div>

                <div class="AwayMessages_dailyEta" style="font-size:12px;opacity:.7;margin:4px 0">Est. daily messages: …</div>

                <table class="AwayMessages_weightsTable" style="width:100%;border-collapse:collapse">
                    ${makeWeightRows(characterName, cs.weights)}
                </table>

                <label>Away messaging prompt:<br>
                    <textarea class="AwayMessages_charPrompt" data-char="${n}" rows="3">${escapeHtml(cs.prompt)}</textarea>
                </label><br>
                <label>Away messaging prompt (at work):<br>
                    <textarea class="AwayMessages_charPromptAtWork" data-char="${n}" rows="3">${escapeHtml(cs.promptAtWork)}</textarea>
                </label><br>

                <label>At work multiplier:
                    <input type="range" class="AwayMessages_charWorkMultiplier" data-char="${n}"
                        min="0" max="1" step="0.01" value="${cs.workMultiplier}">
                    <span class="AwayMessages_workMultiplierValue">${Number(cs.workMultiplier).toFixed(2)}</span>
                </label><br>
                <label>Online multiplier:
                    <input type="range" class="AwayMessages_charOnlineMultiplier" data-char="${n}"
                        min="0" max="4" step="0.01" value="${cs.onlineMultiplier}">
                    <span class="AwayMessages_onlineMultiplierValue">${Number(cs.onlineMultiplier).toFixed(2)}</span>
                </label>
                <p><small>Online multiplier activates if you have a SillyTavern tab open.</small></p>

                <!-- After-work message -->
                <label class="checkbox_label">
                    <input type="checkbox" class="AwayMessages_charAfterWorkEnabled" data-char="${n}" ${cs.afterWorkEnabled ? 'checked' : ''}>
                    <span>Enable after-work message</span>
                </label>
                <div class="AwayMessages_afterWorkFields" style="${cs.afterWorkEnabled ? '' : 'display:none'}">
                    <label>After-work message:<br>
                        <textarea class="AwayMessages_charAfterWorkMessage" data-char="${n}" rows="3">${escapeHtml(cs.afterWorkMessage)}</textarea>
                    </label><br>
                    <div>Random offset:
                        −<input type="number" class="AwayMessages_charAfterWorkOffsetNeg" data-char="${n}"
                            value="${cs.afterWorkOffsetNeg}" min="0" style="width:50px">
                        <select class="AwayMessages_charAfterWorkOffsetNegUnit" data-char="${n}">${makeUnitOptions(cs.afterWorkOffsetNegUnit)}</select>
                        to +
                        <input type="number" class="AwayMessages_charAfterWorkOffsetPos" data-char="${n}"
                            value="${cs.afterWorkOffsetPos}" min="0" style="width:50px">
                        <select class="AwayMessages_charAfterWorkOffsetPosUnit" data-char="${n}">${makeUnitOptions(cs.afterWorkOffsetPosUnit)}</select>
                    </div>
                </div>

                <!-- Greetings -->
                <label class="checkbox_label">
                    <input type="checkbox" class="AwayMessages_charGreetingsEnabled" data-char="${n}" ${cs.greetingsEnabled ? 'checked' : ''}>
                    <span>Enable greetings</span>
                </label>
                <div class="AwayMessages_greetingsFields" style="${cs.greetingsEnabled ? '' : 'display:none'}">
                    <label>Greeting time:
                        <input type="number" class="AwayMessages_charGreetingHour" data-char="${n}"
                            min="1" max="12" value="${cs.greetingHour}" style="width:50px">:
                        <input type="text" inputmode="numeric" class="AwayMessages_charGreetingMinute AwayMessages_minuteField"
                            data-char="${n}" value="${padMinute(cs.greetingMinute)}" style="width:36px">
                        <select class="AwayMessages_charGreetingAmPm" data-char="${n}">
                            <option value="AM" ${cs.greetingAmPm === 'AM' ? 'selected' : ''}>AM</option>
                            <option value="PM" ${cs.greetingAmPm === 'PM' ? 'selected' : ''}>PM</option>
                        </select>
                    </label><br>
                    <label>Greeting prompt (supports macros):<br>
                        <textarea class="AwayMessages_charGreetingPrompt" data-char="${n}" rows="3">${escapeHtml(cs.greetingPrompt)}</textarea>
                    </label><br>
                    <div>Random offset:
                        −<input type="number" class="AwayMessages_charGreetingOffsetNeg" data-char="${n}"
                            value="${cs.greetingOffsetNeg}" min="0" style="width:50px">
                        <select class="AwayMessages_charGreetingOffsetNegUnit" data-char="${n}">${makeUnitOptions(cs.greetingOffsetNegUnit)}</select>
                        to +
                        <input type="number" class="AwayMessages_charGreetingOffsetPos" data-char="${n}"
                            value="${cs.greetingOffsetPos}" min="0" style="width:50px">
                        <select class="AwayMessages_charGreetingOffsetPosUnit" data-char="${n}">${makeUnitOptions(cs.greetingOffsetPosUnit)}</select>
                    </div>
                </div>

            </div>
        </div>`;

        $('#AwayMessages_characterSettings').append(drawerHtml);
        bindCharacterEvents(characterName);
        refreshEtaDisplay(characterName);
    }

    // ─── Bind character events ────────────────────────────────────────────────
    function bindCharacterEvents(characterName) {
        const container = $(`#AwayMessages_characterSettings .inline-drawer[data-character="${CSS.escape(characterName)}"]`);

        // Drawer toggle
        const $toggle  = container.find('.inline-drawer-toggle');
        const $content = container.find('.inline-drawer-content');
        const $icon    = container.find('.inline-drawer-icon');
        $toggle.off('click.AwayMessages').on('click.AwayMessages', function(e) {
            // Don't toggle when clicking "Trigger now"
            if ($(e.target).hasClass('AwayMessages_triggerNow')) return;
            e.preventDefault(); e.stopPropagation();
            if ($content.is(':visible')) {
                $content.slideUp(200); $icon.removeClass('down');
            } else {
                $content.slideDown(200); $icon.addClass('down');
            }
        });

        // Trigger now
        container.find('.AwayMessages_triggerNow').off('click.AwayMessages').on('click.AwayMessages', function(e) {
            e.stopPropagation();
            triggerNow(characterName);
        });

        // Weight sliders – live display + ETA refresh
        container.find('.AwayMessages_charWeight').on('input', function() {
            const $tr = $(this).closest('tr');
            $tr.find('.AwayMessages_weightValue').text(parseFloat($(this).val()).toFixed(2));
            updateCharacterSettingFromElement(this);
            refreshEtaDisplay(characterName);
        });

        // Range inputs that affect ETA
        container.find('.AwayMessages_charRangeMin, .AwayMessages_charRangeMax,' +
                        '.AwayMessages_charRangeMinUnit, .AwayMessages_charRangeMaxUnit')
            .on('change input', function() {
                updateCharacterSettingFromElement(this);
                refreshEtaDisplay(characterName);
            });

        // Multiplier sliders
        container.find('.AwayMessages_charWorkMultiplier').on('input', function() {
            $(this).next('span').text(parseFloat($(this).val()).toFixed(2));
        });
        container.find('.AwayMessages_charOnlineMultiplier').on('input', function() {
            $(this).next('span').text(parseFloat($(this).val()).toFixed(2));
        });

        // Minute field padding on blur
        container.find('.AwayMessages_minuteField').on('blur', function() {
            let v = parseInt($(this).val(), 10);
            if (isNaN(v) || v < 0) v = 0;
            if (v > 59) v = 59;
            $(this).val(padMinute(v));
        }).on('input', function() {
            // Allow only digits while typing
            $(this).val($(this).val().replace(/\D/g, ''));
        });

        // Clamp hour inputs (1–12)
        container.find('.AwayMessages_charGreetingHour').on('blur', function() {
            let v = parseInt($(this).val(), 10);
            if (isNaN(v) || v < 1) v = 1;
            if (v > 12) v = 12;
            $(this).val(v);
        });

        // Clamp positive range inputs (min 1)
        container.find('.AwayMessages_charRangeMin, .AwayMessages_charRangeMax,' +
                        '.AwayMessages_charAfterWorkOffsetNeg,.AwayMessages_charAfterWorkOffsetPos,' +
                        '.AwayMessages_charGreetingOffsetNeg,.AwayMessages_charGreetingOffsetPos').on('blur', function() {
            let v = parseFloat($(this).val());
            if (isNaN(v) || v < 0) { $(this).val(0); }
        });

        // After-work / greetings toggles
        container.find('.AwayMessages_charAfterWorkEnabled').on('change', function() {
            container.find('.AwayMessages_afterWorkFields').toggle(this.checked);
        });
        container.find('.AwayMessages_charGreetingsEnabled').on('change', function() {
            container.find('.AwayMessages_greetingsFields').toggle(this.checked);
        });

        // Catch-all change handler for saving
        container.find('input, select, textarea').on('change input', function(e) {
            // Weight sliders are handled above; avoid double-firing for them
            if (!$(e.target).hasClass('AwayMessages_charWeight')) {
                updateCharacterSettingFromElement(this);
            }
        });
    }

    // ─── Trigger now ─────────────────────────────────────────────────────────
    function triggerNow(characterName) {
        showToast(`Triggering message for ${characterName}…`, 'info');
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            const ctx = SillyTavern.getContext();
            if (ctx?.socket) {
                ctx.socket.emit('AwayMessages_triggerNow', { character: characterName });
                return;
            }
        }
        // Fallback: HTTP call
        fetch('/api/plugins/AwayMessages/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ character: characterName })
        }).then(r => {
            if (r.ok) showToast(`Message triggered for ${characterName}`, 'success');
            else showToast(`Trigger failed (HTTP ${r.status})`, 'error');
        }).catch(() => showToast('Trigger failed – server unreachable', 'error'));
    }

    // ─── Test webhook ─────────────────────────────────────────────────────────
    async function testWebhook() {
        const url = settings.webhookUrl;
        if (!url || url.includes('your_webhook_here')) {
            showToast('Please enter a valid webhook URL first', 'error'); return;
        }
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: '✅ AwayMessages test – webhook is working!' })
            });
            if (res.ok) showToast('Webhook test succeeded!', 'success');
            else showToast(`Webhook returned ${res.status}`, 'error');
        } catch (e) {
            showToast('Webhook request failed (check URL / CORS)', 'error');
        }
    }

    // ─── Render main UI ───────────────────────────────────────────────────────
    function renderSettingsUI() {
        if (uiRendered) return;

        const wMin = padMinute(settings.workFromMinute);
        const wMaxMin = padMinute(settings.workToMinute);
        const qFromMin = padMinute(settings.quietHoursFromMinute);
        const qToMin   = padMinute(settings.quietHoursToMinute);

        const html = `
        <div class="AwayMessages-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Away Messages</b>
                <span class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></span>
            </div>
            <div class="inline-drawer-content">
                <p><i>Learn how to set up Away Messages <a href="https://github.com/SillyTavern/SillyTavern" target="_blank">here</a>. You need the complementary plugin to run this.</i></p>
                <p><small>Hours: early morning 3–6 AM · morning 6–9 AM · late morning 9–12 PM · afternoon 12–3 PM · late afternoon 3–6 PM · evening 6–9 PM · night 9 PM–12 AM · wee hours 12–3 AM.</small></p>

                <label class="checkbox_label">
                    <input type="checkbox" id="AwayMessages_enabled" ${settings.enabled ? 'checked' : ''}>
                    <span>Enable</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="AwayMessages_notifications" ${settings.notifications ? 'checked' : ''}>
                    <span>Notifications</span>
                </label>

                <label>Notifying Discord webhook:
                    <div style="display:flex;gap:6px;align-items:center;margin-top:4px">
                        <input type="text" id="AwayMessages_webhookUrl" value="${escapeHtml(settings.webhookUrl)}"
                            placeholder="https://discord.com/api/webhooks/..." style="flex:1">
                        <button class="menu_button" id="AwayMessages_testWebhook" title="Send a test message to the webhook">Test</button>
                    </div>
                </label>
                <p><small>Notifications from Away Messages will be sent to your webhook URL. Enabling push notifications is also recommended.</small></p>

                <!-- Work hours -->
                <label class="checkbox_label">
                    <input type="checkbox" id="AwayMessages_workHoursEnabled" ${settings.workHoursEnabled ? 'checked' : ''}>
                    <span>Enable work hours</span>
                </label>
                <div id="AwayMessages_workHoursFields" style="${settings.workHoursEnabled ? '' : 'display:none'}">
                    <label>Work label: <input type="text" id="AwayMessages_workLabel" value="${escapeHtml(settings.workLabel)}" placeholder="e.g., School, Work"></label>
                    <div>Work hours: from
                        <input type="number" id="AwayMessages_workFromHour" min="1" max="12" value="${settings.workFromHour}" style="width:50px">:
                        <input type="text"   id="AwayMessages_workFromMinute" inputmode="numeric" class="AwayMessages_minuteField" value="${wMin}" style="width:36px">
                        <select id="AwayMessages_workFromAmPm">
                            <option value="AM" ${settings.workFromAmPm === 'AM' ? 'selected' : ''}>AM</option>
                            <option value="PM" ${settings.workFromAmPm === 'PM' ? 'selected' : ''}>PM</option>
                        </select>
                        to
                        <input type="number" id="AwayMessages_workToHour" min="1" max="12" value="${settings.workToHour}" style="width:50px">:
                        <input type="text"   id="AwayMessages_workToMinute" inputmode="numeric" class="AwayMessages_minuteField" value="${wMaxMin}" style="width:36px">
                        <select id="AwayMessages_workToAmPm">
                            <option value="AM" ${settings.workToAmPm === 'AM' ? 'selected' : ''}>AM</option>
                            <option value="PM" ${settings.workToAmPm === 'PM' ? 'selected' : ''}>PM</option>
                        </select>
                    </div>
                    <div class="AwayMessages_workDays" style="margin-top:6px">
                        ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d =>
                            `<label class="checkbox_label"><input type="checkbox" class="AwayMessages_workDay" data-day="${d}" ${settings.workDays[d] ? 'checked' : ''}> ${d}</label>`
                        ).join(' ')}
                    </div>
                </div>

                <!-- Quiet hours -->
                <label class="checkbox_label" style="margin-top:10px">
                    <input type="checkbox" id="AwayMessages_quietHoursEnabled" ${settings.quietHoursEnabled ? 'checked' : ''}>
                    <span>Enable quiet hours <small>(never message between these times)</small></span>
                </label>
                <div id="AwayMessages_quietHoursFields" style="${settings.quietHoursEnabled ? '' : 'display:none'}">
                    <div>Quiet from
                        <input type="number" id="AwayMessages_quietHoursFromHour" min="1" max="12" value="${settings.quietHoursFromHour}" style="width:50px">:
                        <input type="text"   id="AwayMessages_quietHoursFromMinute" inputmode="numeric" class="AwayMessages_minuteField" value="${qFromMin}" style="width:36px">
                        <select id="AwayMessages_quietHoursFromAmPm">
                            <option value="AM" ${settings.quietHoursFromAmPm === 'AM' ? 'selected' : ''}>AM</option>
                            <option value="PM" ${settings.quietHoursFromAmPm === 'PM' ? 'selected' : ''}>PM</option>
                        </select>
                        to
                        <input type="number" id="AwayMessages_quietHoursToHour" min="1" max="12" value="${settings.quietHoursToHour}" style="width:50px">:
                        <input type="text"   id="AwayMessages_quietHoursToMinute" inputmode="numeric" class="AwayMessages_minuteField" value="${qToMin}" style="width:36px">
                        <select id="AwayMessages_quietHoursToAmPm">
                            <option value="AM" ${settings.quietHoursToAmPm === 'AM' ? 'selected' : ''}>AM</option>
                            <option value="PM" ${settings.quietHoursToAmPm === 'PM' ? 'selected' : ''}>PM</option>
                        </select>
                    </div>
                    <p><small>Ranges that cross midnight are supported (e.g. 11 PM to 7 AM).</small></p>
                </div>

                <h3>Character Settings</h3>
                <div id="AwayMessages_characterSettings"></div>
            </div>
        </div>
        </div>`;

        $('#extensions_settings .AwayMessages-settings').remove();
        $('#extensions_settings').append(html);

        // Global minute-field padding
        bindGlobalMinuteFields();
        bindGlobalEvents();

        for (const char of characterList) addCharacterDrawer(char.name);
        uiRendered = true;
    }

    function bindGlobalMinuteFields() {
        // For minute fields outside character drawers (work hours, quiet hours)
        $(document).on('blur', '.AwayMessages-settings .AwayMessages_minuteField', function() {
            let v = parseInt($(this).val(), 10);
            if (isNaN(v) || v < 0) v = 0;
            if (v > 59) v = 59;
            $(this).val(padMinute(v));
        }).on('input', '.AwayMessages-settings .AwayMessages_minuteField', function() {
            $(this).val($(this).val().replace(/\D/g, ''));
        });
    }

    function bindGlobalEvents() {
        $('#AwayMessages_enabled').on('change', function() {
            settings.enabled = this.checked; saveSettings(); sendSettingsToServer();
        });
        $('#AwayMessages_notifications').on('change', function() {
            settings.notifications = this.checked; saveSettings(); sendSettingsToServer();
        });
        $('#AwayMessages_webhookUrl').on('input', function() {
            settings.webhookUrl = this.value; saveSettings(); sendSettingsToServer();
        });
        $('#AwayMessages_testWebhook').on('click', testWebhook);

        // Work hours
        $('#AwayMessages_workHoursEnabled').on('change', function() {
            settings.workHoursEnabled = this.checked;
            $('#AwayMessages_workHoursFields').toggle(this.checked);
            saveSettings(); sendSettingsToServer();
        });
        $('#AwayMessages_workLabel').on('input', function() {
            settings.workLabel = this.value; saveSettings(); sendSettingsToServer();
        });
        ['workFromHour','workFromMinute','workFromAmPm','workToHour','workToMinute','workToAmPm'].forEach(id => {
            $(`#AwayMessages_${id}`).on('change input', function() {
                const val = $(this).val();
                settings[id] = (id.includes('Hour') || id.includes('Minute')) ? Number(val) : val;
                saveSettings(); sendSettingsToServer();
            });
        });
        // Hour clamping for work fields
        $('#AwayMessages_workFromHour, #AwayMessages_workToHour').on('blur', function() {
            let v = parseInt($(this).val(), 10);
            if (isNaN(v) || v < 1) v = 1;
            if (v > 12) v = 12;
            $(this).val(v);
        });
        $(document).on('change', '.AwayMessages_workDay', function() {
            const day = $(this).data('day');
            settings.workDays[day] = this.checked;
            saveSettings(); sendSettingsToServer();
        });

        // Quiet hours
        $('#AwayMessages_quietHoursEnabled').on('change', function() {
            settings.quietHoursEnabled = this.checked;
            $('#AwayMessages_quietHoursFields').toggle(this.checked);
            saveSettings(); sendSettingsToServer();
        });
        ['quietHoursFromHour','quietHoursFromMinute','quietHoursFromAmPm',
         'quietHoursToHour','quietHoursToMinute','quietHoursToAmPm'].forEach(id => {
            $(`#AwayMessages_${id}`).on('change input', function() {
                const val = $(this).val();
                settings[id] = (id.includes('Hour') || id.includes('Minute')) ? Number(val) : val;
                saveSettings(); sendSettingsToServer();
            });
        });
        $('#AwayMessages_quietHoursFromHour, #AwayMessages_quietHoursToHour').on('blur', function() {
            let v = parseInt($(this).val(), 10);
            if (isNaN(v) || v < 1) v = 1;
            if (v > 12) v = 12;
            $(this).val(v);
        });
    }

    // ─── Update character setting from element ────────────────────────────────
    function updateCharacterSettingFromElement(el) {
        const $el = $(el);
        const charName = $el.data('char');
        if (!charName || !settings.characters[charName]) return;
        const cs = settings.characters[charName];

        let val = $el.is(':checkbox') ? $el.prop('checked') : $el.val();
        if ($el.attr('type') === 'number') val = Number(val);
        if ($el.is('input[type="range"]')) val = parseFloat(val);

        if      ($el.hasClass('AwayMessages_charEnabled'))               cs.enabled = val;
        else if ($el.hasClass('AwayMessages_charRangeMin'))              cs.timeRangeMin = Number(val);
        else if ($el.hasClass('AwayMessages_charRangeMinUnit'))          cs.timeRangeMinUnit = val;
        else if ($el.hasClass('AwayMessages_charRangeMax'))              cs.timeRangeMax = Number(val);
        else if ($el.hasClass('AwayMessages_charRangeMaxUnit'))          cs.timeRangeMaxUnit = val;
        else if ($el.hasClass('AwayMessages_charWeight')) {
            cs.weights[$el.data('period')] = parseFloat(val);
            $el.closest('tr').find('.AwayMessages_weightValue').text(parseFloat(val).toFixed(2));
        }
        else if ($el.hasClass('AwayMessages_charPrompt'))                cs.prompt = val;
        else if ($el.hasClass('AwayMessages_charPromptAtWork'))          cs.promptAtWork = val;
        else if ($el.hasClass('AwayMessages_charWorkMultiplier'))        { cs.workMultiplier = parseFloat(val); $el.next('span').text(parseFloat(val).toFixed(2)); }
        else if ($el.hasClass('AwayMessages_charOnlineMultiplier'))      { cs.onlineMultiplier = parseFloat(val); $el.next('span').text(parseFloat(val).toFixed(2)); }
        else if ($el.hasClass('AwayMessages_charAfterWorkEnabled'))      cs.afterWorkEnabled = val;
        else if ($el.hasClass('AwayMessages_charAfterWorkMessage'))      cs.afterWorkMessage = val;
        else if ($el.hasClass('AwayMessages_charAfterWorkOffsetNeg'))    cs.afterWorkOffsetNeg = Number(val);
        else if ($el.hasClass('AwayMessages_charAfterWorkOffsetNegUnit'))cs.afterWorkOffsetNegUnit = val;
        else if ($el.hasClass('AwayMessages_charAfterWorkOffsetPos'))    cs.afterWorkOffsetPos = Number(val);
        else if ($el.hasClass('AwayMessages_charAfterWorkOffsetPosUnit'))cs.afterWorkOffsetPosUnit = val;
        else if ($el.hasClass('AwayMessages_charGreetingsEnabled'))      cs.greetingsEnabled = val;
        else if ($el.hasClass('AwayMessages_charGreetingHour'))          cs.greetingHour = Number(val);
        else if ($el.hasClass('AwayMessages_charGreetingMinute'))        cs.greetingMinute = Number(val);
        else if ($el.hasClass('AwayMessages_charGreetingAmPm'))          cs.greetingAmPm = val;
        else if ($el.hasClass('AwayMessages_charGreetingPrompt'))        cs.greetingPrompt = val;
        else if ($el.hasClass('AwayMessages_charGreetingOffsetNeg'))     cs.greetingOffsetNeg = Number(val);
        else if ($el.hasClass('AwayMessages_charGreetingOffsetNegUnit')) cs.greetingOffsetNegUnit = val;
        else if ($el.hasClass('AwayMessages_charGreetingOffsetPos'))     cs.greetingOffsetPos = Number(val);
        else if ($el.hasClass('AwayMessages_charGreetingOffsetPosUnit')) cs.greetingOffsetPosUnit = val;

        saveSettings();
        sendSettingsToServer();
    }

    // ─── Server sync ──────────────────────────────────────────────────────────
    function sendSettingsToServer() {
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            const ctx = SillyTavern.getContext();
            if (ctx?.socket) ctx.socket.emit('AwayMessages_settings', settings);
        }
    }

    // ─── Toolbar buttons (Refresh / Export / Import) ──────────────────────────
    function addToolbarButtons() {
        const $h3 = $('#extensions_settings h3:contains("Character Settings")');
        if (!$h3.length) return;

        $h3.nextAll('.AwayMessages_toolbar').remove();

        const $toolbar = $(`<div class="AwayMessages_toolbar" style="display:flex;gap:6px;margin:6px 0 10px"></div>`);

        const $refresh = $('<button class="menu_button" title="Reload character list from server">🔄 Refresh</button>');
        $refresh.on('click', async () => {
            $refresh.prop('disabled', true).text('Loading…');
            const ok = await refreshCharacterList();
            $refresh.prop('disabled', false).text('🔄 Refresh');
            if (ok) {
                $('#AwayMessages_characterSettings').empty();
                for (const char of characterList) addCharacterDrawer(char.name);
                showToast('Character list refreshed');
            } else {
                showToast('Refresh failed', 'error');
            }
        });

        const $export = $('<button class="menu_button" title="Export settings to JSON file">⬇ Export</button>');
        $export.on('click', exportSettings);

        const $import = $('<button class="menu_button" title="Import settings from JSON file">⬆ Import</button>');
        $import.on('click', importSettings);

        $toolbar.append($refresh, $export, $import);
        $h3.after($toolbar);
    }

    // ─── Activity tracking ────────────────────────────────────────────────────
    let lastActivity = Date.now();
    function updateActivity() {
        lastActivity = Date.now();
        if (typeof SillyTavern !== 'undefined') {
            const ctx = SillyTavern.getContext();
            if (ctx?.socket) ctx.socket.emit('AwayMessages_heartbeat', { lastActivity });
        }
    }
    ['mousemove','keydown','click','scroll','touchstart'].forEach(evt =>
        document.addEventListener(evt, updateActivity, { passive: true }));

    // ─── Init ─────────────────────────────────────────────────────────────────
    async function init() {
        loadSettings();
        const charsLoaded = await refreshCharacterList();
        if (!charsLoaded && Object.keys(settings.characters).length === 0) {
            console.warn('AwayMessages: No characters available.');
        }
        renderSettingsUI();
        addToolbarButtons();
        sendSettingsToServer();
        setInterval(updateActivity, 10000);
        console.log(`${extensionName}: Initialized with ${characterList.length} characters`);
    }

    init();
});
