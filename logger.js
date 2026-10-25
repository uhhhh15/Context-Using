// logger.js —— 分级日志（默认零日志）
// 与 hide 的 Logger 分开：前缀不同，两个插件各自的日志一眼能分辨。
const PREFIX = '%c[上下文统计]';
const BASE_STYLE = 'font-weight: bold; padding: 2px 4px; border-radius: 3px; margin-right: 4px;';

const STYLES = {
    info:    `${BASE_STYLE} color: white; background-color: #17a2b8;`,
    success: `${BASE_STYLE} color: white; background-color: #28a745;`,
    warn:    `${BASE_STYLE} color: #333; background-color: #ffc107;`,
    error:   `${BASE_STYLE} color: white; background-color: #dc3545;`,
    debug:   `${BASE_STYLE} color: #6c757d; background-color: #f8f9fa; border: 1px solid #dee2e6;`,
};

const LogLevel = {
    NONE: 0,      // 零日志 - 无任何输出（默认）
    CORE: 1,      // 核心日志 - error + warn
    RUNTIME: 2,   // 运行日志 - error + warn + info + success
    FULL: 3,      // 完整日志 - 所有日志包括 debug
};

class Logger {
    static currentLevel = LogLevel.NONE;
    static logHistory = [];

    static pushToHistory(levelName, ...args) {
        if (this.currentLevel !== LogLevel.FULL) return;
        const timestamp = new Date().toLocaleString('zh-CN', { hour12: false });
        const message = args.map((arg) => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, (key, value) => {
                        if (key === 'parent' || key === 'dom' || key === 'collection') return '[已省略嵌套对象]';
                        return value;
                    });
                } catch (e) { return '[复杂对象/解析失败]'; }
            }
            return String(arg);
        }).join(' ');
        this.logHistory.push(`[${timestamp}] [${levelName}] ${message}`);
        if (this.logHistory.length > 500) this.logHistory.shift();
    }

    static exportLogs() {
        if (this.logHistory.length === 0) return false;
        const blob = new Blob([this.logHistory.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ContextUsing_DebugLog_${new Date().getTime()}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    }

    static setLogLevel(level) {
        if (level in LogLevel) this.currentLevel = LogLevel[level];
        else if (typeof level === 'number' && level >= 0 && level <= 3) this.currentLevel = level;
    }

    static getLogLevel() { return this.currentLevel; }

    static shouldLog(level) { return this.currentLevel >= level; }

    static error(...args) {
        this.pushToHistory('ERROR', ...args);
        if (this.shouldLog(LogLevel.CORE)) console.error(PREFIX, STYLES.error, ...args);
    }

    static warn(...args) {
        this.pushToHistory('WARN', ...args);
        if (this.shouldLog(LogLevel.CORE)) console.warn(PREFIX, STYLES.warn, ...args);
    }

    static info(...args) {
        this.pushToHistory('INFO', ...args);
        if (this.shouldLog(LogLevel.RUNTIME)) console.log(PREFIX, STYLES.info, ...args);
    }

    static success(...args) {
        this.pushToHistory('SUCCESS', ...args);
        if (this.shouldLog(LogLevel.RUNTIME)) console.log(PREFIX, STYLES.success, ...args);
    }

    static debug(...args) {
        this.pushToHistory('DEBUG', ...args);
        if (this.shouldLog(LogLevel.FULL)) console.debug(PREFIX, STYLES.debug, ...args);
    }
}

Logger.LogLevel = LogLevel;

export default Logger;
