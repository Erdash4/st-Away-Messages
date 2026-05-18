/**
 * Away Messages – SillyTavern Client Extension
 * Communicates with the Away Messages server plugin at /api/plugins/away-messages/
 */

import { extension_settings, saveSettingsDebounced } from '../../../extensions.js';
import { characters, getRequestHeaders } from '../../../../script.js';

const EXT_NAME = 'away_messages';
const API_BASE = '/api/plugins/away-messages';

// ─── Default settings ──────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
    enabled: false,
    notifications: {
        enabled: false,
        discordWebhook: 'https://discord.com/api/webhooks/your_webhook_here',
    },
    workHours: {
        enabled: false,
        label: 'School',
        from: { hour: 9, minute: 0, period: 'AM' },
        to:   { hour: 5, minute: 0, period: 'PM' },
        days: {
            monday: false, tuesday: false, wednesday: false,
            thursday: false, friday: false, saturday: false, sunday: false,
        },
    },
    characters: {},
};

const DEFAULT_CHARACTER_SETTINGS = {
    enabled: false,
    timeRange: {
        min: { value: 2,  unit: 'minutes' },
        max: { value: 12, unit: 'hours'   },
    },
    timeWeights: {
        earlyMorning:  0.0,
        morning:       0.0,
        lateMorning:   0.0,
        afternoon:     0.0,
        lateAfternoon: 0.0,
        evening:       0.0,
        night:         0.0,
        weeHours:      0.0,
    },
    awayPrompt:     'The time is {{time}}. {{char}} decided to send a message to {{user}}. {{user}} has been idle for {{idle_duration}}.',
    awayPromptWork: 'The time is {{time}}. {{char}} decided to send a message to {{user}}. {{user}} has been idle for {{idle_duration}}. {{user}} is at {{work}} currently.',
    atWorkMultiplier:  0.0,
    onlineMultiplier:  0.0,
    afterWork: {
        enabled: false,
        prompt:  'The time is {{time}}. {{char}} decided to send a message to {{user}}, because this is when they get off {{work}}. {{user}} has been idle for {{idle_duration}}.',
        offsetMinus: { value: 40, unit: 'minutes' },
        offsetPlus:  { value: 12, unit: 'minutes' },
    },
    greetings: {
        enabled: false,
        hour: 7, minute: 0, period: 'AM',
        prompt: 'The time is {{time}}. Say good morning to {{user}}.',
        offsetMinus: { value: 40, unit: 'minutes' },
        offsetPlus:  { value: 12, unit: 'minutes' },
    },
};

// ─── Settings helpers ──────────────────────────────────────────────────────────

function getSettings() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    return extension_settings[EXT_NAME];
}

function getCharSettings(charName) {
    const s = getSettings();
    if (!s.characters[charName]) {
        s.characters[charName] = structuredClone(DEFAULT_CHARACTER_SETTINGS);
    }
    return s.characters[charName];
}

function save() {
    saveSettingsDebounced();
    pushSettingsToServer();
}

// ─── Server communication ──────────────────────────────────────────────────────

async function pushSettingsToServer() {
    try {
        await fetch(`${API_BASE}/settings`, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(getSettings()),
        });
    } catch (e) {
        console.warn('[Away Messages] Could not push settings to server plugin:', e);
    }
}

async function pullSettingsFromServer() {
    try {
        const res = await fetch(`${API_BASE}/settings`, { headers: getRequestHeaders() });
        if (res.ok) {
            const data = await res.json();
            Object.assign(extension_settings[EXT_NAME], data);
        }
    } catch (e) {
        console.warn('[Away Messages] Could not pull settings from server plugin:', e);
    }
}

// ─── Heartbeat & activity tracking ────────────────────────────────────────────

setInterval(async () => {
    try {
        await fetch(`${API_BASE}/heartbeat`, {
            method: 'POST',
            headers: getRequestHeaders(),
        });
    } catch { /* server not running */ }
}, 20_000);

let activityDebounce = null;
function onUserActivity() {
    clearTimeout(activityDebounce);
    activityDebounce = setTimeout(async () => {
        try {
            await fetch(`${API_BASE}/activity`, {
                method: 'POST',
                headers: getRequestHeaders(),
            });
        } catch { /* server not running */ }
    }, 500);
}

['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt =>
    document.addEventListener(evt, onUserActivity, { passive: true })
);

// ─── UI Builders ───────────────────────────────────────────────────────────────

function makeCheckbox(id, label, checked, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'away-msg-checkbox';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.checked = !!checked;
    cb.addEventListener('change', () => onChange(cb.checked));
    wrap.appendChild(cb);
    wrap.appendChild(document.createTextNode(' ' + label));
    return wrap;
}

function makeNumberInput(value, min, max, onChange) {
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'away-msg-number';
    inp.value = value;
    if (min !== undefined) inp.min = min;
    if (max !== undefined) inp.max = max;
    inp.addEventListener('change', () => onChange(Number(inp.value)));
    return inp;
}

function makeTextInput(value, placeholder, onChange) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'away-msg-text';
    inp.value = value || '';
    inp.placeholder = placeholder || '';
    inp.addEventListener('input', () => onChange(inp.value));
    return inp;
}

function makeTextarea(value, onChange) {
    const ta = document.createElement('textarea');
    ta.className = 'away-msg-textarea';
    ta.value = value || '';
    ta.rows = 3;
    ta.addEventListener('input', () => onChange(ta.value));
    return ta;
}

function makeSelect(options, selected, onChange) {
    const sel = document.createElement('select');
    sel.className = 'away-msg-select';
    options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (opt === selected) o.selected = true;
        sel.appendChild(o);
    });
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
}

function makeSlider(value, min, max, step, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'away-msg-slider-wrap';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'away-msg-slider';
    slider.min = min; slider.max = max; slider.step = step;
    slider.value = value;

    const readout = document.createElement('span');
    readout.className = 'away-msg-slider-val';
    readout.textContent = Number(value).toFixed(2);

    slider.addEventListener('input', () => {
        readout.textContent = Number(slider.value).toFixed(2);
        onChange(Number(slider.value));
    });

    wrap.appendChild(slider);
    wrap.appendChild(readout);
    return wrap;
}

function makeLabel(text) {
    const span = document.createElement('span');
    span.className = 'away-msg-label';
    span.textContent = text;
    return span;
}

function makeRow(...children) {
    const row = document.createElement('div');
    row.className = 'away-msg-row';
    children.forEach(c => row.appendChild(c));
    return row;
}

function makeSection(content) {
    const div = document.createElement('div');
    div.className = 'away-msg-section';
    if (Array.isArray(content)) content.forEach(c => div.appendChild(c));
    else div.appendChild(content);
    return div;
}

function makeNote(text) {
    const p = document.createElement('p');
    p.className = 'away-msg-note';
    p.textContent = text;
    return p;
}

function makeIndented(...children) {
    const div = document.createElement('div');
    div.className = 'away-msg-indented';
    children.forEach(c => div.appendChild(c));
    return div;
}

// ─── Top-level settings panel ──────────────────────────────────────────────────

function buildTopLevel(container) {
    const s = getSettings();

    // Link
    const link = document.createElement('p');
    link.className = 'away-msg-note';
    const a = document.createElement('a');
    a.href = 'https://github.com/Erdash4/st-Away-Messages';
    a.target = '_blank';
    a.textContent = 'Learn how to setup Away Messages properly here.';
    link.appendChild(a);
    link.appendChild(document.createTextNode(" You'll need the complementary plugin to run this."));
    container.appendChild(link);

    // Enable checkbox
    const enableCb = makeCheckbox('away-msg-enabled', 'Enable', s.enabled, val => {
        getSettings().enabled = val;
        innerWrap.style.display = val ? '' : 'none';
        save();
    });
    container.appendChild(enableCb);

    const innerWrap = document.createElement('div');
    innerWrap.className = 'away-msg-indented';
    innerWrap.style.display = s.enabled ? '' : 'none';
    container.appendChild(innerWrap);

    buildNotifications(innerWrap);
    buildWorkHours(innerWrap);
    buildCharacters(innerWrap);
}

// ─── Notifications ─────────────────────────────────────────────────────────────

function buildNotifications(parent) {
    const s = getSettings();
    const section = makeSection([]);
    section.className = 'away-msg-section away-msg-card';

    const notifCb = makeCheckbox('away-msg-notif', 'Notifications', s.notifications.enabled, val => {
        getSettings().notifications.enabled = val;
        notifInner.style.display = val ? '' : 'none';
        save();
    });
    section.appendChild(notifCb);

    const notifInner = makeIndented(
        makeRow(makeLabel('Notifying Discord webhook:'),
            makeTextInput(s.notifications.discordWebhook,
                'https://discord.com/api/webhooks/your_webhook_here',
                val => { getSettings().notifications.discordWebhook = val; save(); })
        ),
        makeNote('Notifications from Away Messages will be sent to your webhook URL. Enabling push notifications is also recommended.')
    );
    notifInner.style.display = s.notifications.enabled ? '' : 'none';
    section.appendChild(notifInner);

    parent.appendChild(section);
}

// ─── Work Hours ────────────────────────────────────────────────────────────────

function buildWorkHours(parent) {
    const s = getSettings();
    const wh = s.workHours;
    const section = makeSection([]);
    section.className = 'away-msg-section away-msg-card';

    const whCb = makeCheckbox('away-msg-workhours', 'Enable work hours', wh.enabled, val => {
        getSettings().workHours.enabled = val;
        whInner.style.display = val ? '' : 'none';
        save();
    });
    section.appendChild(whCb);

    const dayNames = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

    const dayRow = document.createElement('div');
    dayRow.className = 'away-msg-day-row';
    dayNames.forEach(day => {
        dayRow.appendChild(makeCheckbox(`away-wh-${day}`,
            day.charAt(0).toUpperCase() + day.slice(1),
            wh.days[day],
            val => { getSettings().workHours.days[day] = val; save(); }
        ));
    });

    const whInner = makeIndented(
        makeRow(makeLabel('Work label:'),
            makeTextInput(wh.label, 'School', val => { getSettings().workHours.label = val; save(); })
        ),
        makeRow(
            makeLabel('Work hours: from'),
            makeNumberInput(wh.from.hour, 1, 12, val => { getSettings().workHours.from.hour = val; save(); }),
            makeLabel(':'),
            makeNumberInput(String(wh.from.minute).padStart(2,'0'), 0, 59, val => { getSettings().workHours.from.minute = val; save(); }),
            makeSelect(['AM','PM'], wh.from.period, val => { getSettings().workHours.from.period = val; save(); }),
            makeLabel('to'),
            makeNumberInput(wh.to.hour, 1, 12, val => { getSettings().workHours.to.hour = val; save(); }),
            makeLabel(':'),
            makeNumberInput(String(wh.to.minute).padStart(2,'0'), 0, 59, val => { getSettings().workHours.to.minute = val; save(); }),
            makeSelect(['AM','PM'], wh.to.period, val => { getSettings().workHours.to.period = val; save(); }),
        ),
        dayRow,
    );
    whInner.style.display = wh.enabled ? '' : 'none';
    section.appendChild(whInner);

    parent.appendChild(section);
}

// ─── Per-character sections ────────────────────────────────────────────────────

function buildCharacters(parent) {
    const charsHeader = document.createElement('h4');
    charsHeader.className = 'away-msg-chars-header';
    charsHeader.textContent = 'Characters';
    parent.appendChild(charsHeader);

    if (!characters || characters.length === 0) {
        parent.appendChild(makeNote('No characters loaded. Load a character to configure away messages.'));
        return;
    }

    characters.forEach(char => {
        const name = char.name;
        buildCharacterSection(parent, name);
    });
}

function buildCharacterSection(parent, name) {
    const cs = getCharSettings(name);
    const card = document.createElement('div');
    card.className = 'away-msg-card away-msg-char-card';

    // Collapsible header
    const header = document.createElement('div');
    header.className = 'away-msg-char-header';

    const arrow = document.createElement('span');
    arrow.className = 'away-msg-arrow';
    arrow.textContent = '▶';

    const title = document.createElement('span');
    title.textContent = ` ${name}`;

    header.appendChild(arrow);
    header.appendChild(title);
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'away-msg-char-body';
    body.style.display = 'none';
    card.appendChild(body);

    header.addEventListener('click', () => {
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : '';
        arrow.textContent = open ? '▶' : '▼';
    });

    // Enable checkbox
    const enableCb = makeCheckbox(`away-char-${name}-enabled`,
        `Enable Away Messages for ${name}`,
        cs.enabled,
        val => { getCharSettings(name).enabled = val; charInner.style.display = val ? '' : 'none'; save(); }
    );
    body.appendChild(enableCb);

    const charInner = makeIndented();
    charInner.style.display = cs.enabled ? '' : 'none';
    body.appendChild(charInner);

    buildCharBody(charInner, name);
    parent.appendChild(card);
}

const TIME_BUCKETS = [
    ['earlyMorning',  'Early morning',  '3am–6am'],
    ['morning',       'Morning',        '6am–9am'],
    ['lateMorning',   'Late morning',   '9am–12pm'],
    ['afternoon',     'Afternoon',      '12pm–3pm'],
    ['lateAfternoon', 'Late afternoon', '3pm–6pm'],
    ['evening',       'Evening',        '6pm–9pm'],
    ['night',         'Night',          '9pm–12am'],
    ['weeHours',      'Wee hours',      '12am–3am'],
];

const TIME_UNITS = ['seconds', 'minutes', 'hours', 'days'];
const OFFSET_UNITS = ['seconds', 'minutes', 'hours'];

function buildCharBody(container, name) {
    const cs = getCharSettings(name);

    // ── Time-based messaging weights ──
    const weightsHeader = document.createElement('p');
    weightsHeader.className = 'away-msg-subheader';
    weightsHeader.textContent = '─── Time-based messaging weights ───';
    container.appendChild(weightsHeader);

    // Time range
    container.appendChild(makeRow(
        makeLabel('Time range:'),
        makeNumberInput(cs.timeRange.min.value, 0, undefined,
            val => { getCharSettings(name).timeRange.min.value = val; save(); }),
        makeSelect(TIME_UNITS, cs.timeRange.min.unit,
            val => { getCharSettings(name).timeRange.min.unit = val; save(); }),
        makeLabel('to'),
        makeNumberInput(cs.timeRange.max.value, 0, undefined,
            val => { getCharSettings(name).timeRange.max.value = val; save(); }),
        makeSelect(TIME_UNITS, cs.timeRange.max.unit,
            val => { getCharSettings(name).timeRange.max.unit = val; save(); }),
    ));

    // Sliders
    TIME_BUCKETS.forEach(([key, label, range]) => {
        const row = document.createElement('div');
        row.className = 'away-msg-weight-row';
        const lbl = document.createElement('span');
        lbl.className = 'away-msg-weight-label';
        lbl.textContent = label;
        const rangeLbl = document.createElement('span');
        rangeLbl.className = 'away-msg-range-note';
        rangeLbl.textContent = range;
        row.appendChild(lbl);
        row.appendChild(makeSlider(cs.timeWeights[key], 0, 1, 0.01,
            val => { getCharSettings(name).timeWeights[key] = val; save(); }));
        row.appendChild(rangeLbl);
        container.appendChild(row);
    });

    // Prompts
    container.appendChild(makeLabel('Away messaging prompt:'));
    container.appendChild(makeTextarea(cs.awayPrompt,
        val => { getCharSettings(name).awayPrompt = val; save(); }));

    container.appendChild(makeLabel('Away messaging prompt (at work):'));
    container.appendChild(makeTextarea(cs.awayPromptWork,
        val => { getCharSettings(name).awayPromptWork = val; save(); }));

    // Multipliers
    container.appendChild(makeRow(makeLabel('At work multiplier:'),
        makeSlider(cs.atWorkMultiplier, 0, 1, 0.01,
            val => { getCharSettings(name).atWorkMultiplier = val; save(); })
    ));

    container.appendChild(makeRow(makeLabel('Online multiplier:'),
        makeSlider(cs.onlineMultiplier, 0, 4, 0.01,
            val => { getCharSettings(name).onlineMultiplier = val; save(); })
    ));
    container.appendChild(makeNote('Online multiplier activates if you have a tab of SillyTavern open.'));

    // ── After Work ──
    buildAfterWork(container, name);

    // ── Greetings ──
    buildGreetings(container, name);
}

function buildAfterWork(container, name) {
    const cs = getCharSettings(name);
    const aw = cs.afterWork;

    const awCb = makeCheckbox(`away-char-${name}-afterwork`, 'Enable after work message', aw.enabled,
        val => { getCharSettings(name).afterWork.enabled = val; awInner.style.display = val ? '' : 'none'; save(); }
    );
    container.appendChild(awCb);

    const awInner = makeIndented(
        makeLabel('After work message:'),
        makeTextarea(aw.prompt,
            val => { getCharSettings(name).afterWork.prompt = val; save(); }),
        makeRow(
            makeLabel('Random offset: -'),
            makeNumberInput(aw.offsetMinus.value, 0, undefined,
                val => { getCharSettings(name).afterWork.offsetMinus.value = val; save(); }),
            makeSelect(OFFSET_UNITS, aw.offsetMinus.unit,
                val => { getCharSettings(name).afterWork.offsetMinus.unit = val; save(); }),
            makeLabel('to +'),
            makeNumberInput(aw.offsetPlus.value, 0, undefined,
                val => { getCharSettings(name).afterWork.offsetPlus.value = val; save(); }),
            makeSelect(OFFSET_UNITS, aw.offsetPlus.unit,
                val => { getCharSettings(name).afterWork.offsetPlus.unit = val; save(); }),
        ),
    );
    awInner.style.display = aw.enabled ? '' : 'none';
    container.appendChild(awInner);
}

function buildGreetings(container, name) {
    const cs = getCharSettings(name);
    const gr = cs.greetings;

    const grCb = makeCheckbox(`away-char-${name}-greetings`, 'Enable greetings', gr.enabled,
        val => { getCharSettings(name).greetings.enabled = val; grInner.style.display = val ? '' : 'none'; save(); }
    );
    container.appendChild(grCb);

    const grInner = makeIndented(
        makeRow(
            makeLabel('Greeting time:'),
            makeNumberInput(gr.hour, 1, 12,
                val => { getCharSettings(name).greetings.hour = val; save(); }),
            makeLabel(':'),
            makeNumberInput(String(gr.minute).padStart(2,'0'), 0, 59,
                val => { getCharSettings(name).greetings.minute = val; save(); }),
            makeSelect(['AM','PM'], gr.period,
                val => { getCharSettings(name).greetings.period = val; save(); }),
        ),
        makeLabel('Greeting prompt (sent as user, supports macros):'),
        makeTextarea(gr.prompt,
            val => { getCharSettings(name).greetings.prompt = val; save(); }),
        makeRow(
            makeLabel('Random offset: -'),
            makeNumberInput(gr.offsetMinus.value, 0, undefined,
                val => { getCharSettings(name).greetings.offsetMinus.value = val; save(); }),
            makeSelect(OFFSET_UNITS, gr.offsetMinus.unit,
                val => { getCharSettings(name).greetings.offsetMinus.unit = val; save(); }),
            makeLabel('to +'),
            makeNumberInput(gr.offsetPlus.value, 0, undefined,
                val => { getCharSettings(name).greetings.offsetPlus.value = val; save(); }),
            makeSelect(OFFSET_UNITS, gr.offsetPlus.unit,
                val => { getCharSettings(name).greetings.offsetPlus.unit = val; save(); }),
        ),
    );
    grInner.style.display = gr.enabled ? '' : 'none';
    container.appendChild(grInner);
}

// ─── Init ──────────────────────────────────────────────────────────────────────

jQuery(async () => {
    // Merge defaults so new fields are always present
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = structuredClone(DEFAULT_SETTINGS);
    } else {
        // Deep-merge missing top-level keys
        const s = extension_settings[EXT_NAME];
        if (!s.notifications) s.notifications = structuredClone(DEFAULT_SETTINGS.notifications);
        if (!s.workHours)     s.workHours     = structuredClone(DEFAULT_SETTINGS.workHours);
        if (!s.characters)    s.characters    = {};
    }

    // Pull latest from server (non-blocking)
    await pullSettingsFromServer();

    // Build UI
    const container = document.createElement('div');
    container.id = 'away-messages-settings';
    container.className = 'away-msg-root';
    buildTopLevel(container);

    // Inject into ST extension settings area
    const settingsPanel = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (settingsPanel) settingsPanel.appendChild(container);

    // Push initial state to server
    pushSettingsToServer();
});
