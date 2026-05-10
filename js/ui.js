// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                     SECTION 6: UI & EVENT HANDLERS                        ║
// ║       CustomDropdown, setupUI, presets, event listeners                   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { CONFIG, THEMES, WIRE_THEMES, saveConfig, resetConfig, presetPreferences, savePresetPreferences, getCurrentPresetName } from './config.js';
import { updateSliderFill, showToast, customPrompt, customTextarea, customAlert, customConfirm } from './utils.js';
import { initScene } from './renderer.js';

// ===================================
// CUSTOM DROPDOWN CLASS (OBS-COMPATIBLE)
// ===================================
export class CustomDropdown {
    constructor(selectElement, onChange) {
        this.selectElement = selectElement;
        this.onChange = onChange;
        this.isOpen = false;
        this.selectedValue = selectElement.value;
        this.options = Array.from(selectElement.options).map(opt => ({
            value: opt.value,
            label: opt.textContent
        }));

        // Create custom dropdown
        this.container = document.createElement('div');
        this.container.className = 'custom-dropdown';

        this.button = document.createElement('button');
        this.button.className = 'custom-dropdown-button';
        this.button.type = 'button';

        this.menu = document.createElement('div');
        this.menu.className = 'custom-dropdown-menu';

        this.container.appendChild(this.button);
        this.container.appendChild(this.menu);

        this.attachEvents();
        this.render();

        // Replace original select
        selectElement.style.display = 'none';
        selectElement.parentNode.insertBefore(this.container, selectElement);
    }

    render() {
        const selectedOption = this.options.find(opt => opt.value === this.selectedValue);
        this.button.textContent = selectedOption ? selectedOption.label : 'Select...';

        this.menu.innerHTML = '';
        this.options.forEach(option => {
            const item = document.createElement('div');
            item.className = 'custom-dropdown-item';
            if (option.value === this.selectedValue) {
                item.classList.add('selected');
            }
            item.textContent = option.label;
            item.dataset.value = option.value;

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.select(option.value);
            });

            this.menu.appendChild(item);
        });
    }

    attachEvents() {
        this.button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.container.contains(e.target)) {
                this.close();
            }
        });

        this.button.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.toggle();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const currentIndex = this.options.findIndex(opt => opt.value === this.selectedValue);
                const nextIndex = Math.min(currentIndex + 1, this.options.length - 1);
                this.select(this.options[nextIndex].value);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const currentIndex = this.options.findIndex(opt => opt.value === this.selectedValue);
                const prevIndex = Math.max(currentIndex - 1, 0);
                this.select(this.options[prevIndex].value);
            } else if (e.key === 'Escape') {
                this.close();
            }
        });
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        const buttonRect = this.button.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - buttonRect.bottom - 20;

        const dynamicMaxHeight = Math.max(100, Math.min(spaceBelow, 400));
        this.menu.style.maxHeight = `${dynamicMaxHeight}px`;

        this.isOpen = true;
        this.container.classList.add('open');
    }

    close() {
        this.isOpen = false;
        this.container.classList.remove('open');
    }

    select(value) {
        this.selectedValue = value;
        this.selectElement.value = value;
        this.render();

        if (this.onChange) this.onChange(value);

        const event = new Event('change', { bubbles: true });
        this.selectElement.dispatchEvent(event);

        this.close();
    }

    setValue(value) {
        this.select(value);
    }
}

// =========================================
//  UI BINDING & CONTROLS  
// =========================================

let uiInitialized = false;
let themeDropdown, wireDropdown, qualityDropdown;
let currentPresetName = null;

export function setupUI() {
    if (uiInitialized) {
        console.warn('⚠️ setupUI() already called, skipping duplicate initialization');
        return;
    }

    if (document.body.dataset.uiInitialized === 'true') {
        console.error('❌ setupUI() called but body already marked as initialized!');
        return;
    }

    console.log('✅ Initializing UI for the first time');
    uiInitialized = true;
    document.body.dataset.uiInitialized = 'true';

    const themeSelect = document.getElementById('theme-select');
    const wireSelect = document.getElementById('wire-select');
    const qualitySelect = document.getElementById('quality-select');

    // Populate dropdowns
    Object.keys(THEMES).forEach(key => {
        const option = new Option(key.replace(/_/g, ' '), key);
        themeSelect.add(option);
        if (key === CONFIG.ACTIVE_THEME) option.selected = true;
    });

    Object.keys(WIRE_THEMES).forEach(key => {
        const option = new Option(key.replace(/_/g, ' '), key);
        wireSelect.add(option);
        if (key === CONFIG.WIRE_THEME) option.selected = true;
    });

    // Theme Select
    if (themeSelect) {
        themeDropdown = new CustomDropdown(themeSelect, (value) => {
            CONFIG.ACTIVE_THEME = value;
            console.log('Theme changed to:', value);
        });
        console.log('✅ Theme custom dropdown initialized');
    }

    // Wire Select
    if (wireSelect) {
        wireDropdown = new CustomDropdown(wireSelect, (value) => {
            CONFIG.WIRE_THEME = value;
            console.log('Wire theme changed to:', value);
        });
        console.log('✅ Wire theme custom dropdown initialized');
    }

    // Quality Slider
    const qualitySlider = document.getElementById('quality-slider');
    const qualityLabel = document.getElementById('quality-label-text');
    const qualityMap = ['low', 'medium', 'high', 'ultra'];
    const qualityDisplayMap = ['Low', 'Medium', 'High', 'Ultra High'];

    if (qualitySlider) {
        const currentIdx = qualityMap.indexOf(CONFIG.QUALITY);
        qualitySlider.value = currentIdx !== -1 ? currentIdx : 2;
        if (qualityLabel && currentIdx !== -1) qualityLabel.textContent = qualityDisplayMap[currentIdx];
        if (qualityLabel && currentIdx === -1) qualityLabel.textContent = 'High';

        updateSliderFill(qualitySlider);

        qualitySlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            const qualityStr = qualityMap[val];

            if (qualityStr === 'ultra' && CONFIG.QUALITY !== 'ultra') {
                showToast('Ultra Mode Enabled: High GPU Usage', 'warning', 5000);
            }

            CONFIG.QUALITY = qualityStr;
            console.log('Quality changed to:', qualityStr);

            if (qualityLabel) {
                qualityLabel.textContent = qualityDisplayMap[val];
            }
            updateSliderFill(e.target);
        });
        console.log('✅ Quality slider initialized');
    }

    // All UI mappings
    const mappings = [
        { id: 'theme-select', key: 'ACTIVE_THEME' },
        { id: 'wire-select', key: 'WIRE_THEME' },
        { id: 'cycling-check', key: 'COLOR_CYCLING_ENABLED', type: 'check' },
        { id: 'stars-check', key: 'STARS_ENABLED', type: 'check' },
        { id: 'snow-check', key: 'SNOW_ENABLED', type: 'check' },
        { id: 'background-check', key: 'BACKGROUND_ENABLED', type: 'check' },
        { id: 'avoid-adjacent-check', key: 'AVOID_ADJACENT_COLORS', type: 'check' },
        { id: 'shadows-check', key: 'SHADOWS_ENABLED', type: 'check' },
        { id: 'pins-slider', key: 'NUM_PINS', type: 'int' },
        { id: 'sag-slider', key: 'SAG_AMPLITUDE' },
        { id: 'bulb-size-slider', key: 'BULB_SCALE' },
        { id: 'lights-slider', key: 'LIGHTS_PER_SEGMENT', type: 'int' },
        { id: 'twists-slider', key: 'WIRE_TWISTS', type: 'int' },
        { id: 'thickness-slider', key: 'WIRE_THICKNESS' },
        { id: 'twinkle-speed-slider', key: 'TWINKLE_SPEED' },
        { id: 'min-brightness-slider', key: 'TWINKLE_MIN_INTENSITY' },
        { id: 'randomness-slider', key: 'TWINKLE_RANDOMNESS' },

        { id: 'glass-opacity-slider', key: 'GLASS_OPACITY' },
        { id: 'glass-roughness-slider', key: 'GLASS_ROUGHNESS' },
        { id: 'emissive-slider', key: 'EMISSIVE_INTENSITY' },
        { id: 'ior-slider', key: 'GLASS_IOR' },
        { id: 'speed-slider', key: 'ANIMATION_SPEED' },
        { id: 'sway-x-slider', key: 'SWAY_X' },
        { id: 'sway-z-slider', key: 'SWAY_Z' },
        { id: 'zoom-slider', key: 'CAMERA_DISTANCE' },
        { id: 'height-slider', key: 'CAMERA_HEIGHT' },
        { id: 'tension-slider', key: 'TENSION' },
        { id: 'wire-separation-slider', key: 'WIRE_SEPARATION' },
        { id: 'ambient-slider', key: 'AMBIENT_INTENSITY' },
        { id: 'postfx-enabled-check', key: 'POSTFX_ENABLED', type: 'check' },
        { id: 'bloom-strength-slider', key: 'BLOOM_STRENGTH' },
        { id: 'bloom-radius-slider', key: 'BLOOM_RADIUS' },
        { id: 'bloom-threshold-slider', key: 'BLOOM_THRESHOLD' },
        { id: 'bloom-intensity-slider', key: 'BLOOM_INTENSITY_COMPOSITE' },
        { id: 'snow-count-slider', key: 'SNOW_COUNT', type: 'int' },
        { id: 'snow-speed-slider', key: 'SNOW_SPEED' },
        { id: 'snow-size-slider', key: 'SNOW_SIZE' },
        { id: 'drift-slider', key: 'SNOW_DRIFT' },
        { id: 'stars-count-slider', key: 'STARS_COUNT', type: 'int' },
        { id: 'stars-size-slider', key: 'STARS_SIZE' },
        { id: 'stars-opacity-slider', key: 'STARS_OPACITY' },
        { id: 'stars-twinkle-slider', key: 'STARS_TWINKLE_SPEED' },
        { id: 'camera-x-slider', key: 'CAMERA_X' }
    ];

    // Set initial values
    mappings.forEach(m => {
        const el = document.getElementById(m.id);
        if (!el) return;

        if (m.type === 'check') {
            el.checked = CONFIG[m.key];
        } else if (m.key === 'ACTIVE_THEME' || m.key === 'WIRE_THEME' || m.key === 'QUALITY') {
            el.value = CONFIG[m.key];
        } else {
            el.value = CONFIG[m.key];
        }

        if (el.type === 'range') {
            const inlineValue = el.parentElement.querySelector('.inline-value');
            if (inlineValue) {
                inlineValue.textContent = el.value;
            }
        }
    });

    // Update UI from CONFIG
    function updateUIFromConfig() {
        mappings.forEach(m => {
            const el = document.getElementById(m.id);
            if (!el) return;

            if (m.type === 'check') {
                el.checked = CONFIG[m.key];
            } else {
                el.value = CONFIG[m.key];
            }

            if (el.type === 'range') {
                const inlineValue = el.parentElement.querySelector('.inline-value');
                if (inlineValue) {
                    inlineValue.textContent = el.value;
                }
                updateSliderFill(el);
            }
        });

        if (themeDropdown) themeDropdown.setValue(CONFIG.ACTIVE_THEME);
        if (wireDropdown) wireDropdown.setValue(CONFIG.WIRE_THEME);

        const snowCheck = document.getElementById('snow-check');
        const starsCheck = document.getElementById('stars-check');
        if (snowCheck) {
            snowCheck.checked = CONFIG.SNOW_ENABLED || false;
            snowCheck.dispatchEvent(new Event('change', { bubbles: false }));
        }
        if (starsCheck) {
            starsCheck.checked = CONFIG.STARS_ENABLED || false;
            starsCheck.dispatchEvent(new Event('change', { bubbles: false }));
        }
    }

    // Apply changes function
    function applyChanges() {
        console.log('Applying changes...');
        mappings.forEach(m => {
            const el = document.getElementById(m.id);
            if (!el) return;

            if (m.type === 'check') {
                CONFIG[m.key] = el.checked;
            } else if (m.type === 'int') {
                CONFIG[m.key] = parseInt(el.value, 10);
            } else if (m.key === 'ACTIVE_THEME' || m.key === 'WIRE_THEME' || m.key === 'QUALITY') {
                CONFIG[m.key] = el.value;
            } else {
                CONFIG[m.key] = parseFloat(el.value);
            }
        });

        console.log('Saving config and rebuilding scene...');
        saveConfig();
        initScene();
    }

    // TAB SWITCHING
    const tabBtns = document.querySelectorAll('.card-tab-btn');
    const tabContents = document.querySelectorAll('.card-tab-content');

    tabBtns.forEach(btn => {
        if (btn.dataset.listenerAdded === 'true') {
            console.warn('Tab button already has listener, skipping');
            return;
        }
        btn.dataset.listenerAdded = 'true';

        btn.addEventListener('click', () => {
            const targetId = btn.dataset.cardTab;

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
            } else {
                console.error(`Tab content not found for ID: ${targetId}`);
            }
        });
    });

    // SNOW/STAR TOGGLE HANDLERS
    const snowCheck = document.getElementById('snow-check');
    const snowSettings = document.getElementById('snow-settings');
    if (snowCheck && snowSettings) {
        snowCheck.addEventListener('change', (e) => {
            CONFIG.SNOW_ENABLED = e.target.checked;

            if (e.target.checked) {
                if (window.stagedSnowValues) {
                    CONFIG.SNOW_COUNT = window.stagedSnowValues.count;
                    CONFIG.SNOW_SPEED = window.stagedSnowValues.speed;
                    CONFIG.SNOW_SIZE = window.stagedSnowValues.size;
                    CONFIG.SNOW_DRIFT = window.stagedSnowValues.drift;
                }
                snowSettings.classList.remove('disabled');

                const currentPreset = getCurrentPresetName();
                if (currentPreset && presetPreferences[currentPreset] !== undefined) {
                    presetPreferences[currentPreset].snowEnabled = true;
                    savePresetPreferences();
                    showToast(`Snow will now be enabled when you load the "${currentPreset}" preset.`, 'success', 4000);
                }
            } else {
                CONFIG.SNOW_COUNT = 100;
                CONFIG.SNOW_SPEED = 0.005;
                CONFIG.SNOW_SIZE = 0.01;
                CONFIG.SNOW_DRIFT = 0.0;
                snowSettings.classList.add('disabled');

                const currentPreset = getCurrentPresetName();
                if (currentPreset && presetPreferences[currentPreset] !== undefined) {
                    presetPreferences[currentPreset].snowEnabled = false;
                    savePresetPreferences();
                }
            }

            const snowCountSlider = document.getElementById('snow-count-slider');
            const snowSizeSlider = document.getElementById('snow-size-slider');
            const snowSpeedSlider = document.getElementById('snow-speed-slider');
            const driftSlider = document.getElementById('drift-slider');

            if (snowCountSlider) {
                snowCountSlider.value = CONFIG.SNOW_COUNT;
                const label = snowCountSlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.SNOW_COUNT;
            }
            if (snowSizeSlider) {
                snowSizeSlider.value = CONFIG.SNOW_SIZE;
                const label = snowSizeSlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.SNOW_SIZE.toFixed(2);
            }
            if (snowSpeedSlider) {
                snowSpeedSlider.value = CONFIG.SNOW_SPEED;
                const label = snowSpeedSlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.SNOW_SPEED.toFixed(3);
            }
            if (driftSlider) {
                driftSlider.value = CONFIG.SNOW_DRIFT;
                const label = driftSlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.SNOW_DRIFT.toFixed(2);
            }

            document.querySelectorAll('#snow-settings input[type="range"]').forEach(s => {
                s.dispatchEvent(new Event('input', { bubbles: true }));
            });

            saveConfig();
            applyChanges();
        });

        if (!CONFIG.SNOW_ENABLED) {
            snowSettings.classList.add('disabled');
        }
    }

    // Star toggle handler
    const starsCheck = document.getElementById('stars-check');
    const starSettings = document.getElementById('star-settings');
    if (starsCheck && starSettings) {
        starsCheck.addEventListener('change', (e) => {
            CONFIG.STARS_ENABLED = e.target.checked;

            if (e.target.checked) {
                if (window.stagedStarValues) {
                    CONFIG.STARS_COUNT = window.stagedStarValues.count;
                    CONFIG.STARS_SIZE = window.stagedStarValues.size;
                    CONFIG.STARS_OPACITY = window.stagedStarValues.opacity;
                    CONFIG.STARS_TWINKLE_SPEED = window.stagedStarValues.twinkle;
                }
                starSettings.classList.remove('disabled');

                const currentPreset = getCurrentPresetName();
                if (currentPreset && presetPreferences[currentPreset] !== undefined) {
                    presetPreferences[currentPreset].starsEnabled = true;
                    savePresetPreferences();
                    showToast(`Stars will now be enabled when you load the "${currentPreset}" preset.`, 'success', 4000);
                }
            } else {
                CONFIG.STARS_COUNT = 100;
                CONFIG.STARS_SIZE = 0.1;
                CONFIG.STARS_OPACITY = 0.1;
                CONFIG.STARS_TWINKLE_SPEED = 0.0;
                starSettings.classList.add('disabled');

                const currentPreset = getCurrentPresetName();
                if (currentPreset && presetPreferences[currentPreset] !== undefined) {
                    presetPreferences[currentPreset].starsEnabled = false;
                    savePresetPreferences();
                }
            }

            const starsCountSlider = document.getElementById('stars-count-slider');
            const starsSizeSlider = document.getElementById('stars-size-slider');
            const starsOpacitySlider = document.getElementById('stars-opacity-slider');
            const starsTwinkleSlider = document.getElementById('stars-twinkle-slider');

            if (starsCountSlider) {
                starsCountSlider.value = CONFIG.STARS_COUNT;
                const label = starsCountSlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.STARS_COUNT;
            }
            if (starsSizeSlider) {
                starsSizeSlider.value = CONFIG.STARS_SIZE;
                const label = starsSizeSlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.STARS_SIZE.toFixed(1);
            }
            if (starsOpacitySlider) {
                starsOpacitySlider.value = CONFIG.STARS_OPACITY;
                const label = starsOpacitySlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.STARS_OPACITY.toFixed(1);
            }
            if (starsTwinkleSlider) {
                starsTwinkleSlider.value = CONFIG.STARS_TWINKLE_SPEED;
                const label = starsTwinkleSlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.STARS_TWINKLE_SPEED.toFixed(1);
            }

            document.querySelectorAll('#star-settings input[type="range"]').forEach(s => {
                s.dispatchEvent(new Event('input', { bubbles: true }));
            });

            saveConfig();
            applyChanges();
        });

        if (!CONFIG.STARS_ENABLED) {
            starSettings.classList.add('disabled');
        }
    }

    // HEADER BUTTONS
    const toggleUIBtn = document.getElementById('toggle-ui-btn');
    const floatingUIBtn = document.getElementById('show-ui-btn');
    const saveBtn = document.getElementById('save-preset-btn');
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');

    // Toggle UI visibility
    function toggleUI() {
        const panel = document.getElementById('settings-panel');
        const isHidden = panel.classList.toggle('hidden');

        if (isHidden) {
            if (floatingUIBtn) floatingUIBtn.classList.remove('hidden');
        } else {
            if (floatingUIBtn) floatingUIBtn.classList.add('hidden');
        }

        localStorage.setItem('christmas_lights_ui_visible', isHidden ? 'false' : 'true');
    }

    // Restore UI State on Init
    const savedUiState = localStorage.getItem('christmas_lights_ui_visible');
    if (savedUiState === 'false') {
        const panel = document.getElementById('settings-panel');
        if (panel) panel.classList.add('hidden');
        if (floatingUIBtn) floatingUIBtn.classList.remove('hidden');
    }

    if (toggleUIBtn) {
        toggleUIBtn.addEventListener('click', toggleUI);
        toggleUIBtn.addEventListener('mousedown', (e) => {
            console.log('Toggle UI mousedown detected');
        });
        toggleUIBtn.addEventListener('touchstart', toggleUI, { passive: true });
        console.log('✅ Toggle UI button handlers attached');
    }

    if (floatingUIBtn) {
        floatingUIBtn.addEventListener('click', toggleUI);
        floatingUIBtn.addEventListener('mousedown', (e) => {
            console.log('Floating UI mousedown detected');
        });
        floatingUIBtn.addEventListener('touchstart', toggleUI, { passive: true });
        console.log('✅ Floating UI button handlers attached');
    }

    // Keyboard shortcut: H key to toggle UI
    document.addEventListener('keydown', (e) => {
        if (e.key === 'h' || e.key === 'H') {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            toggleUI();
        }
    });

    // Save preset
    if (saveBtn) {
        const handleSave = async () => {
            console.log('✅ Save Preset button triggered');

            saveBtn.style.opacity = '0.7';

            mappings.forEach(m => {
                const el = document.getElementById(m.id);
                if (!el) return;

                if (m.type === 'check') {
                    CONFIG[m.key] = el.checked;
                } else if (m.type === 'int') {
                    CONFIG[m.key] = parseInt(el.value, 10);
                } else if (m.key === 'ACTIVE_THEME' || m.key === 'WIRE_THEME' || m.key === 'QUALITY') {
                    CONFIG[m.key] = el.value;
                } else {
                    CONFIG[m.key] = parseFloat(el.value);
                }
            });

            const presetName = await customPrompt('Name your custom preset:', 'My Custom Preset');

            if (presetName && presetName.trim()) {
                const customPresets = JSON.parse(localStorage.getItem('custom_presets') || '{}');
                customPresets[presetName.trim()] = { ...CONFIG };
                localStorage.setItem('custom_presets', JSON.stringify(customPresets));

                showToast(`Preset "${presetName}" saved!`, 'success');

                loadCustomPresets();
            }

            saveBtn.style.opacity = '1';
        };

        saveBtn.addEventListener('click', handleSave);
        saveBtn.addEventListener('mousedown', (e) => {
            console.log('Save Preset mousedown detected');
        });
        saveBtn.addEventListener('touchstart', handleSave, { passive: true });

        console.log('✅ Save Preset button handlers attached');
    }

    // Export preset
    if (exportBtn) {
        const handleExport = async () => {
            console.log('✅ Export button triggered');

            exportBtn.style.opacity = '0.7';

            mappings.forEach(m => {
                const el = document.getElementById(m.id);
                if (!el) return;

                if (m.type === 'check') {
                    CONFIG[m.key] = el.checked;
                } else if (m.type === 'int') {
                    CONFIG[m.key] = parseInt(el.value, 10);
                } else if (m.key === 'ACTIVE_THEME' || m.key === 'WIRE_THEME' || m.key === 'QUALITY') {
                    CONFIG[m.key] = el.value;
                } else {
                    CONFIG[m.key] = parseFloat(el.value);
                }
            });

            const exportData = btoa(JSON.stringify(CONFIG));
            const exportString = `XMAS:${exportData}`;

            let clipboardSuccess = false;
            try {
                await navigator.clipboard.writeText(exportString);
                clipboardSuccess = true;
            } catch (e) {
                console.log('Clipboard API failed, using textarea');
            }

            if (clipboardSuccess) {
                await customAlert('Exported!', 'Preset code copied to clipboard!\n\nShare this code with others or save it for later.');
            } else {
                await customTextarea(
                    'Export Preset',
                    'Copy this code (Ctrl+A, Ctrl+C):',
                    '',
                    exportString
                );
            }

            exportBtn.style.opacity = '1';
        };

        exportBtn.addEventListener('click', handleExport);
        exportBtn.addEventListener('mousedown', (e) => {
            console.log('Export mousedown detected');
        });
        exportBtn.addEventListener('touchstart', handleExport, { passive: true });

        console.log('✅ Export button handlers attached');
    }

    // Import preset
    if (importBtn) {
        const handleImport = async () => {
            console.log('✅ Import button triggered');

            importBtn.style.opacity = '0.7';

            const importString = await customTextarea(
                'Import Preset',
                'Paste your preset code below (Ctrl+V):',
                'XMAS:...'
            );

            if (!importString || !importString.trim()) {
                importBtn.style.opacity = '1';
                return;
            }

            try {
                if (!importString.startsWith('XMAS:')) {
                    throw new Error('Invalid preset code format');
                }

                const encodedData = importString.substring(5);
                const importedConfig = JSON.parse(atob(encodedData));

                const presetName = await customPrompt(
                    'Name this imported preset (leave blank to apply without saving):',
                    'Imported Preset'
                );

                if (!presetName || !presetName.trim()) {
                    Object.assign(CONFIG, importedConfig);
                    updateUIFromConfig();
                    applyChanges();
                    await customAlert('Applied!', 'Preset applied (not saved)');
                    importBtn.style.opacity = '1';
                    return;
                }

                const customPresets = JSON.parse(localStorage.getItem('custom_presets') || '{}');
                customPresets[presetName.trim()] = importedConfig;
                localStorage.setItem('custom_presets', JSON.stringify(customPresets));

                Object.assign(CONFIG, importedConfig);
                updateUIFromConfig();
                applyChanges();

                loadCustomPresets();

                showToast(`Preset "${presetName}" imported!`, 'success');
                importBtn.style.opacity = '1';

            } catch (e) {
                console.error('Import failed:', e);
                await customAlert('Error', 'Invalid preset code!\n\nPlease check the code and try again.');
                importBtn.style.opacity = '1';
            }
        };

        importBtn.addEventListener('click', handleImport);
        importBtn.addEventListener('mousedown', (e) => {
            console.log('Import mousedown detected');
        });
        importBtn.addEventListener('touchstart', handleImport, { passive: true });

        console.log('✅ Import button handlers attached');
    }

    // Load custom presets
    function loadCustomPresets() {
        const customPresets = JSON.parse(localStorage.getItem('custom_presets') || '{}');
        const presetBar = document.querySelector('.preset-bar');
        const divider = document.querySelector('.custom-divider');

        presetBar.querySelectorAll('.custom-preset-btn').forEach(btn => btn.remove());

        const presetNames = Object.keys(customPresets);

        if (divider) {
            if (presetNames.length > 0) {
                divider.classList.remove('hidden');
            } else {
                divider.classList.add('hidden');
            }
        }

        presetNames.forEach(presetName => {
            const btn = document.createElement('button');
            btn.className = 'preset-btn custom-preset-btn';
            btn.textContent = presetName;
            btn.dataset.preset = presetName;

            btn.addEventListener('click', () => {
                Object.assign(CONFIG, customPresets[presetName]);
                updateUIFromConfig();
                applyChanges();
            });

            btn.addEventListener('contextmenu', async (e) => {
                e.preventDefault();

                const confirmed = await customConfirm(
                    'Delete Preset',
                    `Delete preset "${presetName}"?\n\nThis cannot be undone.`
                );

                if (confirmed) {
                    delete customPresets[presetName];
                    localStorage.setItem('custom_presets', JSON.stringify(customPresets));
                    loadCustomPresets();
                    showToast('Preset deleted', 'error');
                }
            });

            presetBar.appendChild(btn);
        });
    }

    loadCustomPresets();

    // PRESET SYSTEM
    const presets = {
        classic: {
            ACTIVE_THEME: 'CHRISTMAS',
            WIRE_THEME: 'CHRISTMAS_PAIR',
            COLOR_CYCLING_ENABLED: true,
            AVOID_ADJACENT_COLORS: false,
            NUM_PINS: 7,
            SAG_AMPLITUDE: 0.5,
            TENSION: 0.0,
            LIGHTS_PER_SEGMENT: 10,
            BULB_SCALE: 0.08,
            EMISSIVE_INTENSITY: 0.0,
            POSTFX_ENABLED: true,
            BLOOM_STRENGTH: 1.0,
            BLOOM_RADIUS: 0.5,
            BLOOM_THRESHOLD: 0.5,
            BLOOM_INTENSITY_COMPOSITE: 0.9,
            GLASS_OPACITY: 0.25,
            GLASS_ROUGHNESS: 1.0,
            GLASS_IOR: 2.5,
            WIRE_TWISTS: 120,
            WIRE_THICKNESS: 0.017,
            WIRE_OFFSET: 0.02,
            WIRE_SEPARATION: 0.02,
            ANIMATION_SPEED: 0.6,
            SWAY_X: 0.05,
            SWAY_Z: 0.1,
            TWINKLE_SPEED: 0.03,
            TWINKLE_MIN_INTENSITY: 0.4,
            TWINKLE_RANDOMNESS: 0.3,
            SNOW_ENABLED: false,
            SNOW_COUNT: 800,
            SNOW_SPEED: 0.012,
            SNOW_SIZE: 0.025,
            SNOW_DRIFT: 0.015,
            STARS_ENABLED: false,
            STARS_COUNT: 500,
            STARS_SIZE: 1.0,
            STARS_OPACITY: 0.8,
            STARS_TWINKLE_SPEED: 1.0,
            BACKGROUND_ENABLED: true,
            AMBIENT_INTENSITY: 0.5,
            SHADOWS_ENABLED: true,
            CAMERA_DISTANCE: 16,
            CAMERA_HEIGHT: 1,
            QUALITY: 'medium'
        },
        party: {
            ACTIVE_THEME: 'RAINBOW',
            WIRE_THEME: 'RAINBOW',
            COLOR_CYCLING_ENABLED: true,
            AVOID_ADJACENT_COLORS: false,
            NUM_PINS: 8,
            SAG_AMPLITUDE: 1.0,
            TENSION: 0.3,
            LIGHTS_PER_SEGMENT: 20,
            BULB_SCALE: 0.09,
            EMISSIVE_INTENSITY: 2.0,
            POSTFX_ENABLED: true,
            BLOOM_STRENGTH: 1.8,
            BLOOM_RADIUS: 0.8,
            BLOOM_THRESHOLD: 0.3,
            BLOOM_INTENSITY_COMPOSITE: 1.2,
            GLASS_OPACITY: 0.4,
            GLASS_ROUGHNESS: 0.1,
            GLASS_IOR: 1.7,
            WIRE_TWISTS: 120,
            WIRE_THICKNESS: 0.02,
            WIRE_SEPARATION: 0.05,
            ANIMATION_SPEED: 1.5,
            SWAY_X: 0.05,
            SWAY_Z: 0.25,
            TWINKLE_SPEED: 0.1,
            TWINKLE_MIN_INTENSITY: 0.0,
            TWINKLE_RANDOMNESS: 1.5,
            SNOW_ENABLED: false,
            SNOW_COUNT: 1500,
            SNOW_SPEED: 0.025,
            SNOW_SIZE: 0.02,
            SNOW_DRIFT: 0.04,
            STARS_ENABLED: false,
            STARS_COUNT: 800,
            STARS_SIZE: 1.5,
            STARS_OPACITY: 0.7,
            STARS_TWINKLE_SPEED: 1.2,
            BACKGROUND_ENABLED: false,
            AMBIENT_INTENSITY: 0.7,
            SHADOWS_ENABLED: true,
            CAMERA_DISTANCE: 14,
            CAMERA_HEIGHT: 0,
            QUALITY: 'high'
        },
        neon: {
            ACTIVE_THEME: 'NEON_NIGHTS',
            WIRE_THEME: 'BLACK_PAIR',
            COLOR_CYCLING_ENABLED: true,
            AVOID_ADJACENT_COLORS: true,
            NUM_PINS: 9,
            SAG_AMPLITUDE: 0.3,
            TENSION: 0.5,
            LIGHTS_PER_SEGMENT: 15,
            BULB_SCALE: 0.07,
            EMISSIVE_INTENSITY: 3.5,
            POSTFX_ENABLED: true,
            BLOOM_STRENGTH: 2.0,
            BLOOM_RADIUS: 1.0,
            BLOOM_THRESHOLD: 0.2,
            BLOOM_INTENSITY_COMPOSITE: 1.5,
            GLASS_OPACITY: 0.6,
            GLASS_ROUGHNESS: 0.05,
            GLASS_IOR: 1.5,
            WIRE_TWISTS: 100,
            WIRE_THICKNESS: 0.015,
            WIRE_OFFSET: 0.015,
            WIRE_SEPARATION: 0.03,
            ANIMATION_SPEED: 2.0,
            SWAY_X: 0.02,
            SWAY_Z: 0.15,
            TWINKLE_SPEED: 0.15,
            TWINKLE_MIN_INTENSITY: 0.2,
            TWINKLE_RANDOMNESS: 2.5,
            SNOW_ENABLED: false,
            SNOW_COUNT: 500,
            SNOW_SPEED: 0.008,
            SNOW_SIZE: 0.015,
            SNOW_DRIFT: 0.01,
            STARS_ENABLED: false,
            STARS_COUNT: 1200,
            STARS_SIZE: 2.0,
            STARS_OPACITY: 0.9,
            STARS_TWINKLE_SPEED: 1.5,
            BACKGROUND_ENABLED: false,
            AMBIENT_INTENSITY: 0.3,
            SHADOWS_ENABLED: false,
            CAMERA_DISTANCE: 15,
            CAMERA_HEIGHT: 0.5,
            QUALITY: 'high'
        },
        vintage: {
            ACTIVE_THEME: 'VINTAGE',
            WIRE_THEME: 'BROWN',
            COLOR_CYCLING_ENABLED: false,
            AVOID_ADJACENT_COLORS: false,
            NUM_PINS: 6,
            SAG_AMPLITUDE: 0.8,
            TENSION: 0.1,
            LIGHTS_PER_SEGMENT: 8,
            BULB_SCALE: 0.1,
            EMISSIVE_INTENSITY: 0.5,
            POSTFX_ENABLED: true,
            BLOOM_STRENGTH: 0.8,
            BLOOM_RADIUS: 0.4,
            BLOOM_THRESHOLD: 0.6,
            BLOOM_INTENSITY_COMPOSITE: 0.7,
            GLASS_OPACITY: 0.15,
            GLASS_ROUGHNESS: 0.8,
            GLASS_IOR: 2.0,
            WIRE_TWISTS: 80,
            WIRE_THICKNESS: 0.02,
            WIRE_OFFSET: 0.025,
            WIRE_SEPARATION: 0.025,
            ANIMATION_SPEED: 0.3,
            SWAY_X: 0.08,
            SWAY_Z: 0.05,
            TWINKLE_SPEED: 0.02,
            TWINKLE_MIN_INTENSITY: 0.6,
            TWINKLE_RANDOMNESS: 0.2,
            SNOW_ENABLED: false,
            SNOW_COUNT: 600,
            SNOW_SPEED: 0.01,
            SNOW_SIZE: 0.03,
            SNOW_DRIFT: 0.012,
            STARS_ENABLED: false,
            STARS_COUNT: 300,
            STARS_SIZE: 0.8,
            STARS_OPACITY: 0.6,
            STARS_TWINKLE_SPEED: 0.8,
            BACKGROUND_ENABLED: true,
            AMBIENT_INTENSITY: 0.6,
            SHADOWS_ENABLED: true,
            CAMERA_DISTANCE: 17,
            CAMERA_HEIGHT: 1.5,
            QUALITY: 'medium'
        },
        winter: {
            ACTIVE_THEME: 'ARCTIC',
            WIRE_THEME: 'SILVER_PAIR',
            COLOR_CYCLING_ENABLED: false,
            AVOID_ADJACENT_COLORS: false,
            NUM_PINS: 7,
            SAG_AMPLITUDE: 0.4,
            TENSION: 0.2,
            LIGHTS_PER_SEGMENT: 12,
            BULB_SCALE: 0.075,
            EMISSIVE_INTENSITY: 1.0,
            POSTFX_ENABLED: true,
            BLOOM_STRENGTH: 1.2,
            BLOOM_RADIUS: 0.6,
            BLOOM_THRESHOLD: 0.4,
            BLOOM_INTENSITY_COMPOSITE: 1.0,
            GLASS_OPACITY: 0.3,
            GLASS_ROUGHNESS: 0.3,
            GLASS_IOR: 2.2,
            WIRE_TWISTS: 110,
            WIRE_THICKNESS: 0.018,
            WIRE_OFFSET: 0.02,
            WIRE_SEPARATION: 0.022,
            ANIMATION_SPEED: 0.8,
            SWAY_X: 0.03,
            SWAY_Z: 0.12,
            TWINKLE_SPEED: 0.05,
            TWINKLE_MIN_INTENSITY: 0.3,
            TWINKLE_RANDOMNESS: 0.8,
            SNOW_ENABLED: true,
            SNOW_COUNT: 2000,
            SNOW_SPEED: 0.015,
            SNOW_SIZE: 0.03,
            SNOW_DRIFT: 0.02,
            STARS_ENABLED: true,
            STARS_COUNT: 600,
            STARS_SIZE: 1.2,
            STARS_OPACITY: 0.85,
            STARS_TWINKLE_SPEED: 1.1,
            BACKGROUND_ENABLED: true,
            AMBIENT_INTENSITY: 0.55,
            SHADOWS_ENABLED: true,
            CAMERA_DISTANCE: 15,
            CAMERA_HEIGHT: 0.8,
            QUALITY: 'high'
        }
    };

    // Built-in preset buttons
    document.querySelectorAll('.preset-btn:not(.custom-preset-btn)').forEach(btn => {
        btn.addEventListener('click', () => {
            const presetName = btn.dataset.preset;

            if (presetName === 'random') {
                const themeKeys = Object.keys(THEMES);
                const wireKeys = Object.keys(WIRE_THEMES);

                CONFIG.ACTIVE_THEME = themeKeys[Math.floor(Math.random() * themeKeys.length)];
                CONFIG.WIRE_THEME = wireKeys[Math.floor(Math.random() * wireKeys.length)];

                CONFIG.COLOR_CYCLING_ENABLED = Math.random() > 0.5;
                CONFIG.AVOID_ADJACENT_COLORS = Math.random() > 0.5;
                CONFIG.SNOW_ENABLED = Math.random() > 0.6;
                CONFIG.BACKGROUND_ENABLED = Math.random() > 0.5;
                CONFIG.STARS_ENABLED = Math.random() > 0.5;

                CONFIG.NUM_PINS = Math.floor(Math.random() * 15) + 3;
                CONFIG.SAG_AMPLITUDE = Math.random() * 8;
                CONFIG.TENSION = Math.random() * 1.5;
                CONFIG.LIGHTS_PER_SEGMENT = Math.floor(Math.random() * 25) + 1;

                CONFIG.BULB_SCALE = 0.05 + Math.random() * 0.3;
                CONFIG.BLOOM_STRENGTH = 0.5 + Math.random() * 2.0;
                CONFIG.BLOOM_RADIUS = 0.2 + Math.random() * 1.0;
                CONFIG.BLOOM_THRESHOLD = Math.random() * 0.8;
                CONFIG.BLOOM_INTENSITY_COMPOSITE = 0.5 + Math.random() * 1.5;
                CONFIG.EMISSIVE_INTENSITY = Math.random() * 2.5;

                CONFIG.GLASS_OPACITY = 0.1 + Math.random() * 0.7;
                CONFIG.GLASS_ROUGHNESS = Math.random();
                CONFIG.GLASS_IOR = 1.0 + Math.random() * 1.3;

                CONFIG.WIRE_TWISTS = Math.floor(Math.random() * 200);
                CONFIG.WIRE_THICKNESS = 0.005 + Math.random() * 0.05;
                CONFIG.WIRE_SEPARATION = 0.005 + Math.random() * 0.08;

                CONFIG.ANIMATION_SPEED = Math.random() * 1.5;
                CONFIG.SWAY_Z = Math.random() * 0.4;
                CONFIG.SWAY_X = CONFIG.SWAY_Z * 0.2;

                CONFIG.TWINKLE_SPEED = Math.random() * 0.12;
                CONFIG.TWINKLE_MIN_INTENSITY = Math.random() * 0.4;
                CONFIG.TWINKLE_RANDOMNESS = Math.random() * 1.8;

                if (CONFIG.SNOW_ENABLED) {
                    CONFIG.SNOW_COUNT = Math.floor(Math.random() * 2500) + 500;
                    CONFIG.SNOW_SPEED = 0.005 + Math.random() * 0.03;
                    CONFIG.SNOW_SIZE = 0.01 + Math.random() * 0.05;
                    CONFIG.SNOW_DRIFT = Math.random() * 0.06;
                }

                CONFIG.AMBIENT_INTENSITY = 0.2 + Math.random() * 0.7;

                CONFIG.CAMERA_DISTANCE = 8 + Math.random() * 25;
                CONFIG.CAMERA_HEIGHT = -5 + Math.random() * 15;

                console.log('🎲 Surprise! Generated random configuration');
            } else if (presets[presetName]) {
                currentPresetName = presetName;

                const presetData = presets[presetName];

                const userPref = presetPreferences[presetName] || { snowEnabled: false, starsEnabled: false };

                window.stagedSnowValues = {
                    count: presetData.SNOW_COUNT || 100,
                    speed: presetData.SNOW_SPEED || 0.005,
                    size: presetData.SNOW_SIZE || 0.01,
                    drift: presetData.SNOW_DRIFT || 0.0
                };

                window.stagedStarValues = {
                    count: presetData.STARS_COUNT || 100,
                    size: presetData.STARS_SIZE || 0.1,
                    opacity: presetData.STARS_OPACITY || 0.1,
                    twinkle: presetData.STARS_TWINKLE_SPEED || 0.0
                };

                Object.assign(CONFIG, presetData);

                CONFIG.SNOW_ENABLED = userPref.snowEnabled || false;
                CONFIG.STARS_ENABLED = userPref.starsEnabled || false;

                if (!CONFIG.SNOW_ENABLED) {
                    CONFIG.SNOW_COUNT = 100;
                    CONFIG.SNOW_SPEED = 0.005;
                    CONFIG.SNOW_SIZE = 0.01;
                    CONFIG.SNOW_DRIFT = 0.0;
                }

                if (!CONFIG.STARS_ENABLED) {
                    CONFIG.STARS_COUNT = 100;
                    CONFIG.STARS_SIZE = 0.1;
                    CONFIG.STARS_OPACITY = 0.1;
                    CONFIG.STARS_TWINKLE_SPEED = 0.0;
                }

                const hasSnow = window.stagedSnowValues.count > 100;
                const hasStars = window.stagedStarValues.count > 100;

                const needsSnowToast = hasSnow && !userPref.snowEnabled;
                const needsStarsToast = hasStars && !userPref.starsEnabled;

                if (needsSnowToast && needsStarsToast) {
                    showToast('This preset contains settings for snow and stars. Enable them in the Extras tab to see them.', 'info', 5000);
                } else if (needsSnowToast) {
                    showToast('This preset contains settings for snow. Enable it in the Extras tab to see it.', 'info', 5000);
                } else if (needsStarsToast) {
                    showToast('This preset contains settings for stars. Enable it in the Extras tab to see it.', 'info', 5000);
                }
            }

            updateUIFromConfig();
            applyChanges();
        });
    });

    // INLINE VALUE UPDATES & VISUAL FILL
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        updateSliderFill(slider);

        slider.addEventListener('input', () => {
            if (slider.id === 'quality-slider') return;

            const inlineValue = slider.parentElement.querySelector('.inline-value');
            if (inlineValue) {
                inlineValue.textContent = slider.value;
            }
            updateSliderFill(slider);
        });
    });

    // LIVE UPDATES
    let updateTimeout = null;

    function triggerLiveUpdate() {
        if (updateTimeout) {
            clearTimeout(updateTimeout);
        }

        updateTimeout = setTimeout(() => {
            applyChanges();
        }, 300);
    }

    document.querySelectorAll('input[type="range"]').forEach(slider => {
        slider.addEventListener('input', () => {
            triggerLiveUpdate();
        });
    });

    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            applyChanges();
        });
    });

    document.querySelectorAll('select').forEach(select => {
        select.addEventListener('change', () => {
            applyChanges();
        });
    });

    console.log('✅ Live updates enabled - changes apply automatically');

    // Apply button
    const applyBtn = document.getElementById('apply-btn');
    if (applyBtn) {
        const handleApply = () => {
            console.log('✅ Apply button triggered');

            applyBtn.style.transform = 'scale(0.95)';
            applyBtn.textContent = 'Applying...';

            setTimeout(() => {
                applyChanges();
                applyBtn.textContent = 'Applied!';
                applyBtn.style.transform = 'scale(1)';

                setTimeout(() => {
                    applyBtn.textContent = 'Apply Changes';
                }, 1000);
            }, 100);
        };

        applyBtn.addEventListener('click', handleApply);
        applyBtn.addEventListener('mousedown', (e) => {
            console.log('Apply mousedown detected');
        });
        applyBtn.addEventListener('touchstart', handleApply, { passive: true });

        applyBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleApply();
            }
        });

        console.log('✅ Apply button handlers attached');
    } else {
        console.error('❌ Apply button not found!');
    }

    // Reset button
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            const confirmed = await customConfirm(
                'Reset Settings',
                'Reset all settings to defaults?\n\nThis cannot be undone.'
            );

            if (confirmed) {
                console.log('Reset confirmed');
                resetConfig();
                updateUIFromConfig();
                applyChanges();
                showToast('Settings reset to defaults', 'info');
            }
        });
        console.log('✅ Reset button handlers attached');
    }

    console.log('🎄 UI fully initialized');
}

export function updateUIFromConfig() {
    // This function is exported for external use if needed
    console.log('UpdateUIFromConfig called');
}
