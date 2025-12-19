// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                   SECTION 3: UTILITIES & HELPERS                          ║
// ║              Toast, getBulbPalette, HelixCurve, slider utils, modals      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { CONFIG } from './config.js';
import * as THREE from 'three';
import { logInfo, logWarn } from './debug.js';

// =========================================
//  OBS BROWSER DETECTION
// =========================================
// Detect if running in OBS Browser Source (CEF)
export function isOBSBrowser() {
    const ua = navigator.userAgent.toLowerCase();
    // OBS uses CEF which includes "obs" in UA, or check for specific OBS behaviors
    return ua.includes('obs') ||
        ua.includes('cef') ||
        (typeof window.obsstudio !== 'undefined');
}

// Cache detection result
export const IS_OBS = isOBSBrowser();

// =========================================
//  SAFE LOCALSTORAGE HELPER
// =========================================
/**
 * Safely write to localStorage with quota protection
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @returns {boolean} - True if successful, false if failed
 */
export function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        // QuotaExceededError or SecurityError
        logWarn('Storage', `localStorage.setItem failed for "${key}": ${e.message}`);
        return false;
    }
}


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
// Track active toasts to prevent duplicates
const activeToasts = new Map();
let toastIdCounter = 0;

export function showToast(message, type = 'info', duration = 3000, options = {}) {
    logInfo(`showToast called: "${message}" (type=${type}, persistent=${options.persistent || false})`);
    const container = document.getElementById('toast-container');
    if (!container) return null;

    // Deduplication: if same message is already showing, don't create another
    if (activeToasts.has(message) && !options.allowDuplicate) {
        return activeToasts.get(message).id;
    }

    const toastId = ++toastIdCounter;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.dataset.toastId = toastId;

    // Icons
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'error') icon = '❌';
    if (type === 'progress') icon = '⏳';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
        ${options.progress !== undefined ? `<span class="toast-progress">${options.progress}%</span>` : ''}
    `;

    container.appendChild(toast);
    activeToasts.set(message, { id: toastId, element: toast });
    logInfo(`Toast created with id=${toastId}`);

    // Animate In
    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });

    // Auto Dismiss (unless persistent)
    if (!options.persistent) {
        setTimeout(() => {
            dismissToastElement(toast, message);
        }, duration);
    }

    // Click to Dismiss
    toast.addEventListener('click', () => {
        dismissToastElement(toast, message);
    });

    return toastId;
}

function dismissToastElement(toast, message) {
    logInfo(`dismissToast: "${message}"`);
    toast.classList.add('hiding');
    activeToasts.delete(message);
    toast.addEventListener('transitionend', () => {
        if (toast.parentElement) toast.remove();
    });
}

export function dismissToast(toastId) {
    for (const [message, data] of activeToasts.entries()) {
        if (data.id === toastId) {
            dismissToastElement(data.element, message);
            return true;
        }
    }
    return false;
}

export function updateToastProgress(toastId, progress, newMessage = null) {
    logInfo(`updateToastProgress: id=${toastId}, progress=${Math.round(progress)}%${newMessage ? `, newMsg="${newMessage}"` : ''}`);
    for (const [message, data] of activeToasts.entries()) {
        if (data.id === toastId) {
            const progressEl = data.element.querySelector('.toast-progress');
            if (progressEl) {
                progressEl.textContent = `${Math.round(progress)}%`;
            }
            if (newMessage) {
                const msgEl = data.element.querySelector('.toast-message');
                if (msgEl) msgEl.textContent = newMessage;
                // Update map key
                activeToasts.delete(message);
                activeToasts.set(newMessage, data);
            }
            return true;
        }
    }
    logWarn(`updateToastProgress: toast id=${toastId} NOT FOUND!`);
    return false;
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
    getPoint(t, optionalTarget = new THREE.Vector3()) {
        const turns = 6.0;
        const angle = t * Math.PI * 1.25 * turns;
        const radius = 0.2;
        const height = 1.25;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = (t * height) + 0.3;
        return optionalTarget.set(x, y, z);
    }
}

// =========================================
// CUSTOM MODAL SYSTEM (OBS-COMPATIBLE)
// =========================================
// Cache modal elements (lazy initialized on first use)
let _modalCache = null;
function getModalElements() {
    if (!_modalCache) {
        _modalCache = {
            modal: document.getElementById('custom-modal'),
            title: document.getElementById('modal-title'),
            message: document.getElementById('modal-message'),
            input: document.getElementById('modal-input'),
            textarea: document.getElementById('modal-textarea'),
            inputContainer: document.getElementById('modal-input-container'),
            textareaContainer: document.getElementById('modal-textarea-container'),
            okBtn: document.getElementById('modal-ok-btn'),
            cancelBtn: document.getElementById('modal-cancel-btn')
        };
    }
    return _modalCache;
}

export function showModal(title, message, options = {}) {
    return new Promise((resolve) => {
        const { modal, title: modalTitle, message: modalMessage, input: modalInput,
            textarea: modalTextarea, inputContainer: modalInputContainer,
            textareaContainer: modalTextareaContainer, okBtn, cancelBtn } = getModalElements();

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

// =========================================
//  PROXIMITY HOVER EFFECT
// =========================================
export function initProximityHover() {
    const container = document.getElementById('title-container');
    const textEl = document.getElementById('title-text');
    const emojiEl = container?.querySelector('.emoji');

    if (!container || !textEl) return;

    // Split text into individual character spans
    const text = textEl.textContent;
    textEl.innerHTML = text.split('').map((char, i) =>
        char === ' '
            ? `<span class="title-char" data-index="${i}">&nbsp;</span>`
            : `<span class="title-char" data-index="${i}">${char}</span>`
    ).join('');

    const chars = textEl.querySelectorAll('.title-char');
    const proximityRadius = 80; // pixels

    // Store current and target values for smooth interpolation
    const state = {
        emoji: { scale: 1, y: 0, glow: 0 },
        chars: Array.from(chars).map(() => ({ y: 0, glow: 0 }))
    };
    const targets = {
        emoji: { scale: 1, y: 0, glow: 0 },
        chars: Array.from(chars).map(() => ({ y: 0, glow: 0 }))
    };

    // Cache bounding rects to avoid per-mousemove getBoundingClientRect calls
    let cachedRects = { emoji: null, chars: [] };
    function updateCachedRects() {
        if (emojiEl) cachedRects.emoji = emojiEl.getBoundingClientRect();
        cachedRects.chars = Array.from(chars).map(char => char.getBoundingClientRect());
    }
    updateCachedRects();
    window.addEventListener('resize', updateCachedRects);

    let animating = false;

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function animate() {
        const speed = 0.18;
        let needsMore = false;

        // Animate emoji
        state.emoji.scale = lerp(state.emoji.scale, targets.emoji.scale, speed);
        state.emoji.y = lerp(state.emoji.y, targets.emoji.y, speed);
        state.emoji.glow = lerp(state.emoji.glow, targets.emoji.glow, speed);

        if (emojiEl) {
            emojiEl.style.transform = `scale(${state.emoji.scale}) translateY(${state.emoji.y}px)`;
            emojiEl.style.boxShadow = state.emoji.glow > 0.01
                ? `0 0 ${8 + state.emoji.glow * 12}px ${state.emoji.glow * 4}px rgba(255, 170, 0, ${state.emoji.glow * 0.5})`
                : 'none';
        }

        if (Math.abs(state.emoji.scale - targets.emoji.scale) > 0.001) needsMore = true;

        // Animate characters
        chars.forEach((char, i) => {
            state.chars[i].y = lerp(state.chars[i].y, targets.chars[i].y, speed);
            state.chars[i].glow = lerp(state.chars[i].glow, targets.chars[i].glow, speed);

            char.style.transform = `translateY(${state.chars[i].y}px)`;
            char.style.filter = state.chars[i].glow > 0.01
                ? `drop-shadow(0 0 ${6 + state.chars[i].glow * 14}px rgba(255, 170, 0, ${state.chars[i].glow}))`
                : 'none';

            if (Math.abs(state.chars[i].y - targets.chars[i].y) > 0.01) needsMore = true;
            if (Math.abs(state.chars[i].glow - targets.chars[i].glow) > 0.01) needsMore = true;
        });

        if (needsMore) {
            requestAnimationFrame(animate);
        } else {
            animating = false;
        }
    }

    function startAnimate() {
        if (!animating) {
            animating = true;
            requestAnimationFrame(animate);
        }
    }

    function updateProximity(e) {
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // Update emoji targets (use cached rect)
        if (emojiEl && cachedRects.emoji) {
            const emojiRect = cachedRects.emoji;
            const emojiCenterX = emojiRect.left + emojiRect.width / 2;
            const emojiCenterY = emojiRect.top + emojiRect.height / 2;
            const emojiDist = Math.sqrt(
                Math.pow(mouseX - emojiCenterX, 2) +
                Math.pow(mouseY - emojiCenterY, 2)
            );
            const intensity = Math.max(0, 1 - (emojiDist / proximityRadius));

            targets.emoji.scale = 1 + intensity * 0.12;
            targets.emoji.y = -intensity * 5;
            targets.emoji.glow = intensity;
        }

        // Update character targets (use cached rects)
        chars.forEach((char, i) => {
            const rect = cachedRects.chars[i];
            if (!rect) return;
            const charCenterX = rect.left + rect.width / 2;
            const charCenterY = rect.top + rect.height / 2;
            const distance = Math.sqrt(
                Math.pow(mouseX - charCenterX, 2) +
                Math.pow(mouseY - charCenterY, 2)
            );

            const intensity = Math.max(0, 1 - (distance / proximityRadius));
            targets.chars[i].y = -intensity * 6;
            targets.chars[i].glow = intensity;
        });

        startAnimate();
    }

    function resetEffects() {
        targets.emoji.scale = 1;
        targets.emoji.y = 0;
        targets.emoji.glow = 0;

        targets.chars.forEach(c => {
            c.y = 0;
            c.glow = 0;
        });

        startAnimate();
    }

    container.addEventListener('mousemove', updateProximity);
    container.addEventListener('mouseleave', resetEffects);
}
