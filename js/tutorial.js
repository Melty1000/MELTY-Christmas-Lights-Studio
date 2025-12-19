// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                        WELCOME TUTORIAL SYSTEM                            ║
// ╠═══════════════════════════════════════════════════════════════════════════╣
// ║  SECTION 1: Tutorial Steps Data (TUTORIAL_STEPS) ......... Lines 22-150  ║
// ║  SECTION 2: Tutorial Logic (start/next/end/highlight) .... Lines 153-600 ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { CONFIG } from './config.js';
import { showToast, safeSetItem } from './utils.js';
import { logInfo, logUser, logWarn } from './debug.js';

// ─────────────────────────────────────────────────────────────────────────
//  TUTORIAL STATE VARIABLES
// ─────────────────────────────────────────────────────────────────────────
let currentStep = 0;
let tutorialActive = false;
let isTransitioning = false; // Prevent spam clicking
let overlayEl = null;
let bubbleEl = null;
let highlightEl = null;
let savedBackgroundState = null; // Saved CONFIG.BACKGROUND_ENABLED before tutorial

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 1: TUTORIAL STEPS DATA (Consolidated - one modal per column)
// ═══════════════════════════════════════════════════════════════════════════════
const TUTORIAL_STEPS = [
    // Phase 1: Welcome
    {
        target: null,
        title: "Welcome!",
        message: "Hi! 👋 I'm Melty! Welcome to the Christmas Lights Studio. This quick tour will show you the essentials. Click anywhere to continue...",
        action: null
    },

    // Phase 2: Enable Background
    {
        target: '#background-check',
        title: "Enable Background",
        message: "First, let's turn the **background ON** so you can see your lights better! *(We'll turn it off at the end for streaming.)*",
        action: { type: 'setCheckbox', id: 'background-check', value: true }
    },

    // Phase 3: Quick Presets
    {
        target: '.preset-bar',
        title: "Quick Presets",
        message: "**Quick Presets** load complete setups instantly. Try them anytime!",
        action: null
    },

    // Phase 4: Theme & Colors Panel (consolidated)
    {
        target: '.theme-card',
        title: "Theme & Colors",
        message: "The **Theme & Colors** panel has:\\n• **Bulb Theme** - color palette\\n• **Wire Theme** - wire color\\n• **Socket Color** - socket finish\\n• **Twinkle Style** - animation type",
        action: null
    },

    // Phase 5: Tab Overview
    {
        target: '.card-header-tabs',
        title: "Configuration Tabs",
        message: "There are **4 tabs**: Bulb Config, Wire Config, Extras, and Settings. Let's explore each!",
        action: null
    },

    // Phase 6: Bulb Config Tab
    {
        target: '[data-card-tab="bulb-config"]',
        title: "Bulb Configuration",
        message: "Starting with **Bulb Configuration**!",
        action: { type: 'clickTab', tab: 'bulb-config' }
    },
    {
        target: '#bulb-config .column:nth-child(1)',
        title: "Material Column",
        message: "**Material** controls the glass:\\n• **Size** - bulb scale\\n• **Opacity** - glass transparency\\n• **Roughness** - frosted vs shiny",
        action: null
    },
    {
        target: '#bulb-config .column:nth-child(2)',
        title: "Bloom Glow Column",
        message: "**Bloom Glow** creates light halos:\\n• **Intensity/Strength** - glow power\\n• **Radius** - how far it spreads\\n• **Emission** - inner glow\\n• **Threshold** - brightness trigger",
        action: null
    },
    {
        target: '#bulb-config .column:nth-child(3)',
        title: "Lighting Column",
        message: "**Lighting** handles twinkle:\\n• **Ambient Fill** - scene brightness\\n• **Twinkle Speed** - how fast\\n• **Brightness Min/Max** - intensity range",
        action: null
    },

    // Phase 7: Wire Config Tab
    {
        target: '[data-card-tab="wire-config"]',
        title: "Wire Configuration",
        message: "Next: **Wire Configuration**!",
        action: { type: 'clickTab', tab: 'wire-config' }
    },
    {
        target: '#wire-config .column:nth-child(1)',
        title: "Geometry Column",
        message: "**Geometry** shapes the wire:\\n• **Pin Points** - wire segments ⚠️\\n• **Wire Sag** - droop amount\\n• **Tension** - curve shape\\n• **Lights/Span** - bulbs per section ⚠️\\n\\n⚠️ = may impact performance",
        action: null
    },
    {
        target: '#wire-config .column:nth-child(2)',
        title: "Appearance Column",
        message: "**Appearance** styles the wire:\\n• **Twists** - helix pattern\\n• **Thickness** - wire diameter\\n• **Separation** - gap between wires",
        action: null
    },
    {
        target: '#wire-config .column:nth-child(3)',
        title: "Physics Column",
        message: "**Physics & Motion**:\\n• **Time Speed** - animation rate\\n• **Sway X/Z** - wind movement ⚠️\\n*(Sway requires geometry baking!)*\\n\\n⚠️ = may impact performance",
        action: null
    },

    // Phase 8: Extras Tab
    {
        target: '[data-card-tab="extras-config"]',
        title: "Extras",
        message: "**Extras** has snow and stars!",
        action: { type: 'clickTab', tab: 'extras-config' }
    },
    {
        target: '#extras-config .column:nth-child(1)',
        title: "Snow System",
        message: "**Snow System**:\\n• Toggle snow on/off\\n• Count, Speed, Size, Drift sliders\\n\\n⚠️ = may impact performance",
        action: null
    },
    {
        target: '#extras-config .column:nth-child(2)',
        title: "Star Field",
        message: "**Star Field**:\\n• Toggle stars on/off\\n• Count, Size, Opacity, Twinkle Speed",
        action: null
    },

    // Phase 9: Settings Tab
    {
        target: '[data-card-tab="sys-config"]',
        title: "Settings",
        message: "Finally, **Settings**!",
        action: { type: 'clickTab', tab: 'sys-config' }
    },
    {
        target: '#sys-config .column:nth-child(1)',
        title: "Camera Position",
        message: "**Camera Position**:\\n• Distance (zoom)\\n• Height (up/down)\\n• Pan (left/right)",
        action: null
    },
    {
        target: '#sys-config .column:nth-child(2)',
        title: "System & Render",
        message: "**System & Render**:\\n• **Quality** - affects GPU ⚠️\\n• **Reflections** - point lights ⚠️\\n• **Background** - toggle for OBS\\n\\n⚠️ = may impact performance",
        action: null
    },

    // Phase 10: Save/Export
    {
        target: '#save-preset-btn',
        title: "Save & Export",
        message: "**Save** your preset, or use **Export** to share codes with friends!",
        action: null
    },

    // Phase 11: Hide UI
    {
        target: '#toggle-ui-btn',
        title: "Hide UI",
        message: "**Hide UI** removes everything for clean OBS captures!",
        action: null
    },

    // Phase 12: Finish
    {
        target: null,
        title: "All Done! 🎄",
        message: "That's it! 🎄 Background is now OFF for streaming. Click the Melty icon anytime for a refresher. Have fun!",
        action: { type: 'endTutorialWithCleanup' }
    }
];

// =========================================
//  CORE FUNCTIONS
// =========================================

export function startTutorial() {
    if (tutorialActive) return;

    tutorialActive = true;
    currentStep = 0;

    // Save original background state before tutorial changes it
    savedBackgroundState = CONFIG.BACKGROUND_ENABLED;

    // Create overlay
    createOverlay();

    // Add tutorial-active class to body
    document.body.classList.add('tutorial-active');

    // Show first step
    showStep(currentStep);
}

export function nextStep() {
    if (!tutorialActive) {
        return;
    }

    // Prevent spam clicking - ignore clicks while transitioning
    if (isTransitioning) {
        return;
    }

    isTransitioning = true;

    currentStep++;

    if (currentStep >= TUTORIAL_STEPS.length) {
        endTutorial();
        return;
    }

    showStep(currentStep);

    // Re-enable clicks after step transition completes (match showStep delays)
    setTimeout(() => {
        isTransitioning = false;
    }, 500);
}

export function endTutorial() {
    tutorialActive = false;

    // Remove overlay and bubble
    if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
    }
    if (bubbleEl) {
        bubbleEl.remove();
        bubbleEl = null;
    }

    // Remove any highlights
    clearHighlight();

    // Remove tutorial-active class
    document.body.classList.remove('tutorial-active');

    // Delete the Tutorial preset
    deletePreset('Tutorial');

    // Mark as completed
    localStorage.setItem('christmas_lights_tutorial_completed', 'true');

    // Restore original background state (fixes tutorial skip leaving background ON)
    if (savedBackgroundState !== null) {
        CONFIG.BACKGROUND_ENABLED = savedBackgroundState;
        const bgCheckbox = document.getElementById('background-check');
        if (bgCheckbox) {
            bgCheckbox.checked = savedBackgroundState;
            bgCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
        savedBackgroundState = null;
    }

    showToast('Tutorial complete! 🎄', 'success');
}

function showStep(stepIndex) {
    const step = TUTORIAL_STEPS[stepIndex];
    if (!step) {
        return;
    }

    // Fade out current highlight and bubble
    if (highlightEl) {
        highlightEl.classList.add('fading-out');
    }
    if (bubbleEl) {
        bubbleEl.classList.add('fading-out');
    }

    // Wait for fade out, then show new step
    setTimeout(() => {
        // Clear previous highlight
        clearHighlight();

        // Execute action if present
        if (step.action) {
            executeAction(step.action);
        }

        // Longer delay for tab switches to let content render
        const delay = step.action && step.action.type === 'clickTab' ? 400 : 150;

        // Small delay before showing highlight (let action take effect)
        setTimeout(() => {
            // Highlight target element
            if (step.target) {
                highlightElement(step.target);
            }

            // Show speech bubble with fade in
            showBubble(step.title, step.message, stepIndex);
        }, delay);
    }, 300); // 300ms fade out
}

// =========================================
//  UI HELPERS
// =========================================

function createOverlay() {
    if (overlayEl) return;

    overlayEl = document.createElement('div');
    overlayEl.className = 'tutorial-overlay';
    overlayEl.addEventListener('click', nextStep);
    document.body.appendChild(overlayEl);
}

function highlightElement(selector) {
    let el = document.querySelector(selector);
    if (!el) {
        logWarn('Tutorial', `Element not found for selector: ${selector}`);
        return;
    }

    // For individual controls (selects, inputs, checkboxes), find the parent setting-group
    // This ensures the label and control are both highlighted together
    const settingGroup = el.closest('.setting-group') || el.closest('.toggle-label');
    if (settingGroup && (el.tagName === 'SELECT' || el.tagName === 'INPUT')) {
        el = settingGroup;
    }

    // DON'T scroll - it moves the UI panel which is bad UX

    // Create highlight ring
    if (!highlightEl) {
        highlightEl = document.createElement('div');
        highlightEl.className = 'tutorial-highlight';
        document.body.appendChild(highlightEl);
    } else {
        // Remove fading class so highlight is visible
        highlightEl.classList.remove('fading-out');
    }

    // Position highlight using fixed positioning
    const rect = el.getBoundingClientRect();
    const padding = 8;

    highlightEl.style.left = `${rect.left - padding}px`;
    highlightEl.style.top = `${rect.top - padding}px`;
    highlightEl.style.width = `${rect.width + padding * 2}px`;
    highlightEl.style.height = `${rect.height + padding * 2}px`;
    highlightEl.style.display = 'block';

    // Just add class - CSS handles z-index
    el.classList.add('tutorial-highlighted');
}

function clearHighlight() {
    // Remove highlight ring (properly remove from DOM, not just hide)
    if (highlightEl) {
        highlightEl.remove();
        highlightEl = null;
    }

    // Remove highlight class from all elements
    document.querySelectorAll('.tutorial-highlighted').forEach(el => {
        el.classList.remove('tutorial-highlighted');
    });
}

function showBubble(title, message, stepIndex) {
    if (!bubbleEl) {
        bubbleEl = document.createElement('div');
        bubbleEl.className = 'tutorial-bubble';
        document.body.appendChild(bubbleEl);
    } else {
        // Remove fading class so bubble is visible
        bubbleEl.classList.remove('fading-out');
    }

    // Convert markdown-style bold to HTML and newlines to <br>
    let formattedMessage = message.replace(/\\n/g, '<br>');
    formattedMessage = formattedMessage.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    const progress = `${stepIndex + 1}/${TUTORIAL_STEPS.length}`;
    const isLastStep = stepIndex === TUTORIAL_STEPS.length - 1;
    const hintText = isLastStep ? 'Click anywhere to finish!' : 'Click anywhere to continue';
    const skipBtn = isLastStep ? '' : '<button class="bubble-skip" onclick="window.tutorialSkip()">Skip Tutorial</button>';

    bubbleEl.innerHTML = `
        <div class="bubble-header">
            <span class="bubble-title">${title}</span>
        </div>
        <div class="bubble-message">${formattedMessage}</div>
        <div class="bubble-footer">
            <span class="bubble-hint">${hintText}</span>
            ${skipBtn}
        </div>
    `;

    // Position bubble ABOVE the UI panel (in the canvas/header area)
    const settingsPanel = document.querySelector('#settings-panel');

    if (settingsPanel) {
        const panelRect = settingsPanel.getBoundingClientRect();

        // Center horizontally, position above panel with some margin
        bubbleEl.style.left = '50%';
        bubbleEl.style.transform = 'translateX(-50%)';
        bubbleEl.style.top = `${Math.max(60, panelRect.top - 180)}px`;
    } else {
        // Fallback: top center of screen
        bubbleEl.style.left = '50%';
        bubbleEl.style.transform = 'translateX(-50%)';
        bubbleEl.style.top = '60px';
    }
}

// =========================================
//  ACTION EXECUTORS
// =========================================

function executeAction(action) {
    switch (action.type) {
        case 'setSlider':
            setSliderRandom(action.id, action.min, action.max);
            break;
        case 'setCheckbox':
            setCheckbox(action.id, action.value);
            break;
        case 'selectRandom':
            selectRandomOption(action.id);
            break;
        case 'clickTab':
            clickTab(action.tab);
            break;
        case 'savePreset':
            savePreset(action.name);
            break;
        case 'demoReflections':
            demoReflections();
            break;
        case 'endTutorial':
            // Will be handled after bubble is shown
            setTimeout(() => endTutorial(), 100);
            break;
        case 'endTutorialWithCleanup':
            // Disable background for streaming (don't call endTutorial - user click does that)
            setTimeout(() => {
                const bgCheck = document.getElementById('background-check');
                if (bgCheck && bgCheck.checked) {
                    bgCheck.checked = false;
                    bgCheck.dispatchEvent(new Event('change', { bubbles: true }));
                }
                // Tutorial ends when user clicks and nextStep sees we're past the last step
            }, 100);
            break;
    }
}

function setSliderRandom(id, min, max) {
    const slider = document.getElementById(id);
    if (!slider) return;

    const value = min + Math.random() * (max - min);
    slider.value = value;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
}

function setCheckbox(id, value) {
    const checkbox = document.getElementById(id);
    if (!checkbox) return;

    checkbox.checked = value;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
}

function selectRandomOption(id) {
    const select = document.getElementById(id);
    if (!select) {
        return;
    }

    const options = select.options;
    if (options.length === 0) return;

    const randomIndex = Math.floor(Math.random() * options.length);

    // Check if there's a custom dropdown for this select
    const dropdown = window.dropdowns && window.dropdowns[id];

    if (dropdown && dropdown.menu) {
        // Step 1: Open the dropdown
        dropdown.open();

        // Step 2: Wait, then select
        setTimeout(() => {
            dropdown.select(options[randomIndex].value);
        }, 500);
    } else {
        // Fallback for native select
        select.selectedIndex = randomIndex;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

function clickTab(tabName) {
    const tabBtn = document.querySelector(`[data-card-tab="${tabName}"]`);
    if (tabBtn) {
        tabBtn.click();
    }
}

function demoReflections() {
    const checkbox = document.getElementById('point-lights-check');
    if (!checkbox) return;

    // Enable reflections
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    showToast('Reflections enabled - watch the bulbs!', 'info');

    // After 10 seconds, disable for performance
    setTimeout(() => {
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        showToast('Reflections disabled for better performance', 'info');
    }, 10000);
}

function savePreset(name) {
    // Get current custom presets
    let customPresets = {};
    try {
        customPresets = JSON.parse(localStorage.getItem('custom_presets') || '{}');
    } catch (e) {
        customPresets = {};
    }

    // Save current config as preset
    const presetConfig = { ...CONFIG };
    delete presetConfig.THEMES; // Don't save theme definitions
    delete presetConfig.WIRE_THEMES;
    delete presetConfig.SOCKET_THEMES;

    customPresets[name] = presetConfig;
    localStorage.setItem('custom_presets', JSON.stringify(customPresets));

    // Trigger preset reload if function exists
    if (window.loadCustomPresets) {
        window.loadCustomPresets();
    }
}

function deletePreset(name) {
    let customPresets = {};
    try {
        customPresets = JSON.parse(localStorage.getItem('custom_presets') || '{}');
    } catch (e) {
        return;
    }

    if (customPresets[name]) {
        delete customPresets[name];
        localStorage.setItem('custom_presets', JSON.stringify(customPresets));

        // Trigger preset reload if function exists
        if (window.loadCustomPresets) {
            window.loadCustomPresets();
        }
    }
}

// =========================================
//  INITIALIZATION
// =========================================

export function checkFirstVisit() {
    const completed = localStorage.getItem('christmas_lights_tutorial_completed');
    if (!completed) {
        // Wait for UI to fully load
        setTimeout(() => startTutorial(), 1500);
    }
}

export function initTutorial() {
    // Clean up any orphaned "Tutorial" preset from interrupted sessions
    deletePreset('Tutorial');

    // Expose skip function globally for the skip button
    window.tutorialSkip = () => {
        endTutorial();
    };

    // Add logo click listener
    const logo = document.querySelector('.header-title');
    if (logo) {
        logo.style.cursor = 'pointer';
        logo.addEventListener('click', (e) => {
            if (!tutorialActive) {
                e.preventDefault();
                startTutorial();
            }
        });
    }

    // Check if first visit
    checkFirstVisit();
}
