// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                         DEBUG LOGGING SYSTEM                               ║
// ║  Comprehensive logging for performance analysis and debugging              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// Debug log storage
const debugLogs = [];
const MAX_LOGS = 5000;
let debugStartTime = performance.now();

// Performance timers
const pendingTimers = new Map();

/**
 * Debug configuration - set to true to enable logging
 */
export const debug = {
    enabled: true,           // Master switch
    console: true,           // Also output to console
    actions: true,           // Log slider changes, button clicks
    init: true,              // Log scene initialization steps
    geometry: true,          // Log geometry computation
    animation: false,        // Log animation events (peak/min/color)
    bulbs: null,             // Array of bulb indices to log, or null for all (e.g., [0, 1, 5])
    performance: true,       // Log timing data
    config: true,            // Log config changes

    // Help command - displays all available debug options
    get help() {
        console.log(`
%c╔═══════════════════════════════════════════════════════════════════════════╗
║                         DEBUG COMMANDS REFERENCE                           ║
╚═══════════════════════════════════════════════════════════════════════════╝%c

%c━━━ MASTER SWITCHES ━━━%c
  debug.enabled = true/false        Master switch for all logging
  debug.console = true/false        Output logs to console

%c━━━ LOG CATEGORIES ━━━%c
  debug.actions = true/false        Slider changes, button clicks
  debug.init = true/false           Scene initialization steps
  debug.geometry = true/false       Geometry computation progress
  debug.performance = true/false    Timing data
  debug.config = true/false         Config changes

%c━━━ ANIMATION LOGGING ━━━%c
  debug.animation = true/false      Animation events (peak/min/color)
  debug.bulbs = null                Log ALL bulbs (can be spammy!)
  debug.bulbs = [0,1,5]             Log only specific bulb indices

%c━━━ UTILITY FUNCTIONS ━━━%c
  downloadDebugLogs()               Export all logs to a file
  debug.help                        Show this help message

%c━━━ PERSISTENCE (survives refresh) ━━━%c
  debug.save()                      Save current settings to localStorage
  debug.load()                      Load settings from localStorage
  debug.clear()                     Clear saved settings

%c━━━ QUICK EXAMPLES ━━━%c
  // Enable animation logging for bulbs 0 and 5
  debug.animation = true;
  debug.bulbs = [0, 5];

  // Disable all logging
  debug.enabled = false;

  // Check current settings
  console.log(debug);
`,
            'color: #00ff88; font-weight: bold; font-size: 12px;', '',
            'color: #ffaa00; font-weight: bold;', '',
            'color: #ffaa00; font-weight: bold;', '',
            'color: #ffaa00; font-weight: bold;', '',
            'color: #ffaa00; font-weight: bold;', '',
            'color: #88ffaa; font-weight: bold;', '',
            'color: #00aaff; font-weight: bold;', ''
        );
        return '📚 Help displayed above';
    },

    // Save current settings to localStorage (persists across refreshes)
    save() {
        const settings = {
            enabled: this.enabled,
            console: this.console,
            actions: this.actions,
            init: this.init,
            geometry: this.geometry,
            animation: this.animation,
            bulbs: this.bulbs,
            performance: this.performance,
            config: this.config
        };
        localStorage.setItem('DEBUG_SETTINGS', JSON.stringify(settings));
        console.log('%c✅ Debug settings saved! Will persist across refreshes.', 'color: #00ff88');
        return settings;
    },

    // Load settings from localStorage
    load() {
        try {
            const saved = localStorage.getItem('DEBUG_SETTINGS');
            if (saved) {
                const settings = JSON.parse(saved);
                Object.assign(this, settings);
                console.log('%c✅ Debug settings loaded from localStorage', 'color: #00ff88');
                return settings;
            }
            return null;
        } catch (e) {
            console.warn('Failed to load debug settings:', e);
            return null;
        }
    },

    // Clear saved settings
    clear() {
        localStorage.removeItem('DEBUG_SETTINGS');
        console.log('%c🗑️ Saved debug settings cleared', 'color: #ffaa00');
        return 'Settings cleared';
    }
};

// Auto-load saved debug settings on startup
debug.load();
/**
 * Log levels with colors for console
 */
const LOG_LEVELS = {
    INFO: { color: '#00aaff', icon: 'ℹ️' },
    WARN: { color: '#ffaa00', icon: '⚠️' },
    ERROR: { color: '#ff4444', icon: '❌' },
    PERF: { color: '#00ff88', icon: '⏱️' },
    USER: { color: '#ff88ff', icon: '👤' },
    INIT: { color: '#88ff88', icon: '🚀' },
    GEOM: { color: '#ffff00', icon: '📐' },
};

/**
 * Get elapsed time since page load
 */
function getElapsed() {
    return ((performance.now() - debugStartTime) / 1000).toFixed(3);
}

/**
 * Core logging function
 */
export function debugLog(level, category, message, data = null) {
    if (!debug.enabled) return;

    const timestamp = getElapsed();
    const entry = {
        time: timestamp,
        level,
        category,
        message,
        data: data ? JSON.stringify(data) : null
    };

    // Store in array
    debugLogs.push(entry);
    if (debugLogs.length > MAX_LOGS) {
        debugLogs.shift();
    }

    // Console output
    if (debug.console) {
        const style = LOG_LEVELS[level] || LOG_LEVELS.INFO;
        const prefix = `${style.icon} [${timestamp}s] [${category}]`;
        if (data) {
            console.log(`%c${prefix} ${message}`, `color: ${style.color}`, data);
        } else {
            console.log(`%c${prefix} ${message}`, `color: ${style.color}`);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function logInfo(category, message, data = null) {
    debugLog('INFO', category, message, data);
}

export function logWarn(category, message, data = null) {
    debugLog('WARN', category, message, data);
}

export function logError(category, message, data = null) {
    debugLog('ERROR', category, message, data);
}

export function logPerf(category, message, data = null) {
    if (debug.performance) {
        debugLog('PERF', category, message, data);
    }
}

export function logUser(action, details = null) {
    if (debug.actions) {
        debugLog('USER', 'Action', action, details);
    }
}

export function logInit(message, data = null) {
    if (debug.init) {
        debugLog('INIT', 'Scene', message, data);
    }
}

export function logGeom(message, data = null) {
    if (debug.geometry) {
        debugLog('GEOM', 'Geometry', message, data);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  TIMING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start a performance timer
 */
export function startTimer(name) {
    pendingTimers.set(name, performance.now());
    logPerf('Timer', `⏱️ START: ${name}`);
}

/**
 * End a performance timer and log the duration
 */
export function endTimer(name) {
    const startTime = pendingTimers.get(name);
    if (startTime) {
        const duration = performance.now() - startTime;
        pendingTimers.delete(name);
        logPerf('Timer', `⏱️ END: ${name}`, { durationMs: duration.toFixed(2) });
        return duration;
    }
    return 0;
}


// ═══════════════════════════════════════════════════════════════════════════
//  LOG EXPORT/DISPLAY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all logs as formatted string
 */
export function getDebugLogs() {
    return debugLogs.map(entry => {
        const dataStr = entry.data ? ` | ${entry.data}` : '';
        return `[${entry.time}s] [${entry.level}] [${entry.category}] ${entry.message}${dataStr}`;
    }).join('\n');
}

/**
 * Download logs as text file
 */
export function downloadDebugLogs() {
    const content = getDebugLogs();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    logInfo('Debug', 'Logs downloaded');
}

/**
 * Clear all logs
 */
export function clearDebugLogs() {
    debugLogs.length = 0;
    debugStartTime = performance.now();
    logInfo('Debug', 'Logs cleared');
}

/**
 * Print summary of logs by category
 */
export function printLogSummary() {
    const categories = {};
    debugLogs.forEach(entry => {
        const key = `${entry.level}:${entry.category}`;
        categories[key] = (categories[key] || 0) + 1;
    });
    console.table(categories);
}

// ═══════════════════════════════════════════════════════════════════════════
//  GLOBAL ACCESS
// ═══════════════════════════════════════════════════════════════════════════

// Make debug functions available globally for console access
if (typeof window !== 'undefined') {
    window.debug = debug;
    window.getDebugLogs = getDebugLogs;
    window.downloadDebugLogs = downloadDebugLogs;
    window.clearDebugLogs = clearDebugLogs;
    window.printLogSummary = printLogSummary;

    logInfo('Debug', '🔧 Debug system initialized. Use downloadDebugLogs() to export.');
}
