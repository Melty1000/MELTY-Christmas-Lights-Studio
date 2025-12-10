// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                   SECTION 3: UTILITIES & HELPERS                          ║
// ║              Toast, getBulbPalette, HelixCurve, slider utils, modals      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { CONFIG } from './config.js';

// =========================================
//  SLIDER UTILITIES
// =========================================
export const updateSliderFill = (slider) => {
    if (!slider) return;
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const val = parseFloat(slider.value) || 0;
    const percentage = ((val - min) / (max - min)) * 100;
    slider.style.setProperty('--value', `${percentage}%`);
};

// =========================================
//  TOAST NOTIFICATION SYSTEM
// =========================================
export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // Icons
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Animate In
    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });

    // Auto Dismiss
    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('transitionend', () => {
            if (toast.parentElement) toast.remove();
        });
    }, duration);

    // Click to Dismiss
    toast.addEventListener('click', () => {
        toast.classList.add('hiding');
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 400);
    });
}

// =========================================
//  COLOR UTILITIES
// =========================================
export function getBulbPalette(hex) {
    const color = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    const isWhite = hsl.s < 0.2;
    const filament = new THREE.Color().setHSL(hsl.h, isWhite ? 0.0 : 0.2, 0.95);
    const core = new THREE.Color().setHSL(hsl.h, isWhite ? 0.0 : 1.0, 0.85);
    return { filament, core };
}

// =========================================
//  CURVE CLASSES
// =========================================
export class HelixCurve extends THREE.Curve {
    getPoint(t) {
        const turns = 6.0;
        const angle = t * Math.PI * 1.25 * turns;
        const radius = 0.2;
        const height = 1.25;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = (t * height) + 0.3;
        return new THREE.Vector3(x, y, z);
    }
}

// =========================================
// CUSTOM MODAL SYSTEM (OBS-COMPATIBLE)
// =========================================
export function showModal(title, message, options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        const modalTitle = document.getElementById('modal-title');
        const modalMessage = document.getElementById('modal-message');
        const modalInput = document.getElementById('modal-input');
        const modalTextarea = document.getElementById('modal-textarea');
        const modalInputContainer = document.getElementById('modal-input-container');
        const modalTextareaContainer = document.getElementById('modal-textarea-container');
        const okBtn = document.getElementById('modal-ok-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');

        // Set content
        modalTitle.textContent = title;
        modalMessage.textContent = message;

        // Configure input type
        if (options.input) {
            modalInputContainer.style.display = 'block';
            modalTextareaContainer.style.display = 'none';
            modalInput.placeholder = options.placeholder || '';
            modalInput.value = options.defaultValue || '';
            setTimeout(() => modalInput.focus(), 100);
        } else if (options.textarea) {
            modalInputContainer.style.display = 'none';
            modalTextareaContainer.style.display = 'block';
            modalTextarea.placeholder = options.placeholder || '';
            modalTextarea.value = options.defaultValue || '';
            setTimeout(() => modalTextarea.focus(), 100);
        } else {
            modalInputContainer.style.display = 'none';
            modalTextareaContainer.style.display = 'none';
        }

        // Show/hide cancel button
        if (options.alert) {
            cancelBtn.style.display = 'none';
            okBtn.textContent = 'OK';
        } else {
            cancelBtn.style.display = 'inline-block';
            okBtn.textContent = options.okText || 'OK';
        }

        // Show modal
        modal.classList.add('active');

        // Handle OK
        const handleOk = () => {
            const value = options.input ? modalInput.value :
                options.textarea ? modalTextarea.value :
                    true;
            cleanup();
            resolve(value);
        };

        // Handle Cancel
        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        // Cleanup function
        const cleanup = () => {
            modal.classList.remove('active');
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            modalInput.removeEventListener('keydown', handleInputKey);
            modalTextarea.removeEventListener('keydown', handleTextareaKey);
        };

        // Enter key in input
        const handleInputKey = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleOk();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        };

        // Ctrl+Enter in textarea
        const handleTextareaKey = (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                handleOk();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        };

        // Attach listeners
        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
        if (options.input) modalInput.addEventListener('keydown', handleInputKey);
        if (options.textarea) modalTextarea.addEventListener('keydown', handleTextareaKey);
    });
}

// Convenience functions
export async function customPrompt(message, placeholder = '', defaultValue = '') {
    return await showModal('Input Required', message, {
        input: true,
        placeholder,
        defaultValue
    });
}

export async function customTextarea(title, message, placeholder = '', defaultValue = '') {
    return await showModal(title, message, {
        textarea: true,
        placeholder,
        defaultValue
    });
}

export async function customAlert(title, message) {
    return await showModal(title, message, { alert: true });
}

export async function customConfirm(title, message) {
    return await showModal(title, message, { okText: 'Confirm' });
}
