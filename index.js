(function() {
    const MODULE_BASE = '/api/plugins/away-messages';
    let currentConfig = {};

    // Generate numeric structural assets for dropdown items
    function populateDropdowns() {
        const fillHours = (el, def) => {
            for(let i=1; i<=12; i++) {
                let opt = document.createElement('option');
                opt.value = i; opt.innerText = i;
                if(i === def) opt.selected = true;
                el.appendChild(opt);
            }
        };
        const fillMinutes = (el) => {
            ['00','15','30','45'].forEach(m => {
                let opt = document.createElement('option');
                opt.value = m; opt.innerText = m;
                el.appendChild(opt);
            });
        };
        fillHours(document.getElementById('am-work-start-h'), 9);
        fillMinutes(document.getElementById('am-work-start-m'));
        fillHours(document.getElementById('am-work-end-h'), 5);
        fillMinutes(document.getElementById('am-work-end-m'));
        document.getElementById('am-work-end-ap').value = 'PM';
    }

    async function loadSettings() {
        const response = await fetch(`${MODULE_BASE}/config`);
        currentConfig = await response.json();
        
        document.getElementById('am-enable').checked = currentConfig.enabled;
        document.getElementById('am-notifications').checked = currentConfig.notifications;
        document.getElementById('am-webhook').value = currentConfig.webhookUrl || '';
        document.getElementById('am-work-enable').checked = currentConfig.workHoursEnabled;
        document.getElementById('am-work-label').value = currentConfig.workLabel || 'School';
        
        // Check structural UI day elements
        Object.keys(currentConfig.workDays).forEach(day => {
            const cb = document.querySelector(`#am-work-days input[data-day="${day}"]`);
            if(cb) cb.checked = currentConfig.workDays[day];
        });

        await renderCharacterSchedules();
    }

    async function saveSettings() {
        currentConfig.enabled = document.getElementById('am-enable').checked;
        currentConfig.notifications = document.getElementById('am-notifications').checked;
        currentConfig.webhookUrl = document.getElementById('am-webhook').value;
        currentConfig.workHoursEnabled = document.getElementById('am-work-enable').checked;
        currentConfig.workLabel = document.getElementById('am-work-label').value;

        document.querySelectorAll('#am-work-days input').forEach(cb => {
            currentConfig.workDays[cb.getAttribute('data-day')] = cb.checked;
        });

        await fetch(`${MODULE_BASE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentConfig)
        });
    }

    async function renderCharacterSchedules() {
        const container = document.getElementById('am-character-container');
        container.innerHTML = '';
        
        // Grabbing characters registry using internal SillyTavern components
        const context = typeof window.SillyTavern !== 'undefined' ? window.SillyTavern.getContext() : null;
        if (!context || !context.characters) return;

        context.characters.forEach((char, idx) => {
            const name = char.name;
            if(!currentConfig.characters[name]) {
                currentConfig.characters[name] = {
                    enabled: false, rangeMin: 2, rangeMinUnit: 'minutes', rangeMax: 12, rangeMaxUnit: 'hours',
                    atWorkMultiplier: 0.0, onlineMultiplier: 0.0, enableAfterWork: false, greetingTime: '07:00 AM',
                    promptAway: 'The time is {{time}}. {{char}} decided to send a message to {{user}}. {{user}} has been idle for {{idle_duration}}.',
                    promptWork: 'The time is {{time}}. {{char}} decided to send a message to {{user}}. {{user}} has been idle for {{idle_duration}}. {{user}} is at {{work}} currently.',
                    weights: { earlyMorning: 0, morning: 0, lateMorning: 0, afternoon: 0, lateAfternoon: 0, evening: 0, night: 0, weeHours: 0 }
                };
            }

            const cData = currentConfig.characters[name];
            const charHtml = `
                <details class="am-char-details" style="margin-bottom: 10px; border: 1px solid #555; padding: 5px;">
                    <summary><b>${name}</b></summary>
                    <div style="margin-top: 10px; padding-left: 10px;">
                        <label><input type="checkbox" class="am-c-enable" data-name="${name}" ${cData.enabled?'checked':''}> Enable Away Messages for ${name}</label>
                        <h5>Timed based messaging weights</h5>
                        <label>Time range: 
                            <input type="number" class="am-c-min" data-name="${name}" value="${cData.rangeMin}" style="width:50px;"> 
                            <select class="am-c-min-u" data-name="${name}"><option>seconds</option><option>minutes</option><option>hours</option><option>days</option></select>
                            to
                            <input type="number" class="am-c-max" data-name="${name}" value="${cData.rangeMax}" style="width:50px;"> 
                            <select class="am-c-max-u" data-name="${name}"><option>seconds</option><option>minutes</option><option>hours</option><option>days</option></select>
                        </label>
                        
                        <div class="am-sliders" style="margin-top:10px;">
                            ${Object.keys(cData.weights).map(wKey => `
                                <label style="text-transform: capitalize;">${wKey.replace(/([A-Z])/g, ' $1')}: 
                                    <input type="range" class="am-c-weight" data-name="${name}" data-weight="${wKey}" min="0" max="1" step="0.01" value="${cData.weights[wKey]}">
                                </label><br>
                            `).join('')}
                        </div>

                        <label>Away messaging prompt:</label>
                        <textarea class="am-c-p-away" data-name="${name}" style="width:100%;">${cData.promptAway}</textarea>
                        
                        <label>Away messaging prompt (at work):</label>
                        <textarea class="am-c-p-work" data-name="${name}" style="width:100%;">${cData.promptWork}</textarea>
                        
                        <label>At work multiplier:</label>
                        <input type="range" class="am-c-mult-work" data-name="${name}" min="0" max="1" step="0.01" value="${cData.atWorkMultiplier}"><br>
                        
                        <label>Online multiplier:</label>
                        <input type="range" class="am-c-mult-online" data-name="${name}" min="0" max="4" step="0.01" value="${cData.onlineMultiplier}">
                        <p><small>Online multiplier will activate if you have a tab of SillyTavern open.</small></p>
                    </div>
                </details>
            `;
            container.insertAdjacentHTML('beforeend', charHtml);
            
            // Sync unit selections
            container.querySelector(`.am-c-min-u[data-name="${name}"]`).value = cData.rangeMinUnit;
            container.querySelector(`.am-c-max-u[data-name="${name}"]`).value = cData.rangeMaxUnit;
        });

        // Set dynamic change tracking event binds
        container.querySelectorAll('input, select, textarea').forEach(input => {
            input.addEventListener('change', () => {
                const charName = input.getAttribute('data-name');
                const char = currentConfig.characters[charName];
                
                if(input.classList.contains('am-c-enable')) char.enabled = input.checked;
                if(input.classList.contains('am-c-min')) char.rangeMin = parseFloat(input.value);
                if(input.classList.contains('am-c-max')) char.rangeMax = parseFloat(input.value);
                if(input.classList.contains('am-c-min-u')) char.rangeMinUnit = input.value;
                if(input.classList.contains('am-c-max-u')) char.rangeMaxUnit = input.value;
                if(input.classList.contains('am-c-p-away')) char.promptAway = input.value;
                if(input.classList.contains('am-c-p-work')) char.promptWork = input.value;
                if(input.classList.contains('am-c-mult-work')) char.atWorkMultiplier = parseFloat(input.value);
                if(input.classList.contains('am-c-mult-online')) char.onlineMultiplier = parseFloat(input.value);
                
                if(input.classList.contains('am-c-weight')) {
                    const wKey = input.getAttribute('data-weight');
                    char.weights[wKey] = parseFloat(input.value);
                }
                saveSettings();
            });
        });
    }

    // Ping the background process module that the tab session is open
    function startHeartbeat() {
        setInterval(() => {
            if(currentConfig.enabled) {
                fetch(`${MODULE_BASE}/heartbeat`, { method: 'POST' }).catch(()=>{});
            }
        }, 20000);
    }

    jQuery(async () => {
        const settingsHtml = await $.get(`${window.location.origin}/scripts/extensions/third-party/away-messages/settings.html`);
        $('#extensions_settings').append(settingsHtml);
        
        populateDropdowns();
        await loadSettings();
        startHeartbeat();

        $('#am-enable, #am-notifications, #am-webhook, #am-work-enable, #am-work-label, #am-work-days input').on('change', saveSettings);
    });
})();
