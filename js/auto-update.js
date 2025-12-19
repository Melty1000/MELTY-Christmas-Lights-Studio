/**
 * Auto-Update Module
 * Checks GitHub for new commits and reloads if update available
 * 
 * Uses GitHub REST API to compare commit SHAs
 * Checks hourly to minimize API calls
 */

import { logInfo } from './debug.js';

const REPO_OWNER = 'Melty1000';
const REPO_NAME = 'MELTY-Christmas-Lights-Studio';
const CHECK_INTERVAL = 3600000; // 1 hour in milliseconds
const STORAGE_KEY = 'cl_last_commit_sha';
const ENABLED_KEY = 'cl_auto_update_enabled';

/**
 * Initialize the auto-update checker
 * Runs immediately on load, then every hour
 */
export function initAutoUpdate() {
    // Skip if running locally (file:// or localhost)
    if (window.location.protocol === 'file:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1') {
        logInfo('AutoUpdate', 'Disabled for local development');
        return;
    }

    // Check if auto-updates are disabled by user preference
    const userEnabled = localStorage.getItem(ENABLED_KEY);
    if (userEnabled === 'false') {
        logInfo('AutoUpdate', 'Disabled by user preference');
        return;
    }

    const lastHash = localStorage.getItem(STORAGE_KEY);

    async function checkForUpdates() {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/main`,
                {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    cache: 'no-store'
                }
            );

            if (!response.ok) {
                // Don't log errors for rate limiting or network issues
                return;
            }

            const data = await response.json();
            const currentHash = data.sha.substring(0, 7);

            if (lastHash && lastHash !== currentHash) {
                logInfo('AutoUpdate', 'Update available! Reloading...');
                localStorage.setItem(STORAGE_KEY, currentHash);
                // Small delay to ensure storage is written
                setTimeout(() => location.reload(), 100);
            } else if (!lastHash) {
                // First visit - just store the hash
                localStorage.setItem(STORAGE_KEY, currentHash);
                logInfo('AutoUpdate', 'Initialized');
            }
        } catch (e) {
            // Silently fail - user might be offline
        }
    }

    // Check immediately on load
    checkForUpdates();

    // Then check every hour
    setInterval(checkForUpdates, CHECK_INTERVAL);
}

/**
 * Enable or disable auto-updates
 * @param {boolean} enabled - Whether to enable auto-updates
 */
export function setAutoUpdateEnabled(enabled) {
    localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
    logInfo('AutoUpdate', enabled ? 'Enabled by user' : 'Disabled by user');
}

/**
 * Get current auto-update status
 * @returns {boolean}
 */
export function isAutoUpdateEnabled() {
    const value = localStorage.getItem(ENABLED_KEY);
    return value !== 'false'; // Default to true if not set
}
