// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                        PRESETS MODULE                                      ║
// ║         Save, import, export, and load custom presets                      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { CONFIG, presetPreferences, savePresetPreferences, saveConfig } from './config.js';
import { showModal, customPrompt, customTextarea, customAlert, showToast } from './utils.js';
import { initScene } from './renderer.js';

// Note: This is a simplified presets module.
// Full implementation requires extraction of preset handlers from setupUI in original main.js
// For now, providing stub versions to allow compilation

export async function handleSave() {
    const presetName = await customPrompt('Enter preset name:', 'My Preset');
    if (!presetName) return;

    const customPresets = JSON.parse(localStorage.getItem('customPresets') || '{}');
    customPresets[presetName] = { ...CONFIG };
    localStorage.setItem('customPresets', JSON.stringify(customPresets));
    showToast(`Preset "${presetName}" saved!`, 'success');
    loadCustomPresets();
}

export async function handleImport() {
    const jsonStr = await customTextarea('Import Configuration', 'Paste JSON below:', 'Paste configuration JSON here');
    if (!jsonStr) return;

    try {
        const imported = JSON.parse(jsonStr);
        Object.assign(CONFIG, imported);
        saveConfig();
        initScene();
        showToast('Configuration imported!', 'success');
    } catch (e) {
        await customAlert('Import Error', `Invalid JSON: ${e.message}`);
    }
}

export async function handleExport() {
    const jsonStr = JSON.stringify(CONFIG, null, 2);
    await customTextarea('Export Configuration', 'Copy the JSON below:', '', jsonStr);
}

export function loadCustomPresets() {
    const customPresets = JSON.parse(localStorage.getItem('customPresets') || '{}');
    const presetSelect = document.getElementById('preset-select');
    if (!presetSelect) return;

    // Clear custom options
    Array.from(presetSelect.options).forEach(opt => {
        if (opt.value.startsWith('custom_')) {
            opt.remove();
        }
    });

    // Add custom presets
    Object.keys(customPresets).forEach(name => {
        const option = document.createElement('option');
        option.value = `custom_${name}`;
        option.textContent = `📌 ${name}`;
        presetSelect.appendChild(option);
    });
}

export function applyPreset(presetName) {
    // Preset application logic
    // This would contain the full preset data and application
    // Simplified for initial ES6 split
    console.log(`Applying preset: ${presetName}`);
}
