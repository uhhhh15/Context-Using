// update.js —— 自动检测更新（远端 manifest.json + CHANGELOG.md）
// 仓库还没建：地址集中在 REPO_ROOT 一处，建仓后改这一行即可。
import Logger from './logger.js';
import { getRequestHeaders } from '../../../../script.js';

// ── 远端仓库配置 ─────────────────────────────────────────────────────────────
// 远端文件布局：<REPO_ROOT>/manifest.json、<REPO_ROOT>/CHANGELOG.md
const REPO_ROOT = 'https://raw.githubusercontent.com/uhhhh15/Context-Using/main';
const MANIFEST_URL = `${REPO_ROOT}/manifest.json`;
const CHANGELOG_URL = `${REPO_ROOT}/CHANGELOG.md`;

// 本插件的目录名（third-party 下的文件夹名），用于后端 update API
const FOLDER_NAME = 'Context-Using';
const DISPLAY_NAME = '上下文统计';

const extensionName = 'Context-Using';
const KEY_LAST_CHECK = `${extensionName}_last_update_check`;
const KEY_UPDATE_INFO = `${extensionName}_update_info`;

/**
 * 从 /api/extensions/discover 找出本插件在磁盘上的实际名字。
 * 三种命中方式：manifest.display_name 匹配、目录名匹配、目录名以 /Context-Using 结尾。
 */
async function findLocalExtension() {
    const discoverResponse = await fetch('/api/extensions/discover');
    if (!discoverResponse.ok) return null;
    const installed = await discoverResponse.json();
    const manifests = await Promise.all(installed.map(async (ext) => {
        try {
            const res = await fetch(`/scripts/extensions/${ext.name}/manifest.json`);
            if (!res.ok) return null;
            return { manifest: await res.json(), folderPath: ext.name, type: ext.type };
        } catch (e) { return null; }
    }));
    const valid = manifests.filter(Boolean);
    const target = valid.find((item) => {
        const folder = item.folderPath || '';
        if (item.manifest.display_name === DISPLAY_NAME) return true;
        return folder === FOLDER_NAME || folder.endsWith(`/${FOLDER_NAME}`);
    });
    return target || null;
}

/** 本地版本（读磁盘上的 manifest.json） */
async function getLocalVersion() {
    try {
        const target = await findLocalExtension();
        if (target) {
            Logger.info(`发现本地插件: ${target.folderPath}, 版本: ${target.manifest.version}`);
            return target.manifest.version || 'No Version';
        }
        return 'Unknown';
    } catch (error) {
        Logger.error('本地版本检查失败:', error);
        return 'Error';
    }
}

/** 版本比较：1 = v1 更新，-1 = v2 更新，0 = 相同 */
function compareVersions(v1, v2) {
    if (!v1 || !v2) return 0;
    const p1 = String(v1).replace(/^v/, '').split('.').map(Number);
    const p2 = String(v2).replace(/^v/, '').split('.').map(Number);
    const len = Math.max(p1.length, p2.length);
    for (let i = 0; i < len; i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
}

/** 远端版本（读 GitHub 上的 manifest.json） */
async function getRemoteVersion() {
    try {
        const response = await fetch(`${MANIFEST_URL}?t=${Date.now()}`);
        if (!response.ok) return null;
        const data = await response.json();
        return data.version || null;
    } catch (error) {
        // 仓库还没建时这里必然 404 / 网络错误 —— 属常态，只记 debug
        Logger.debug('获取远程版本失败（仓库可能尚未创建）:', error?.message || error);
        return null;
    }
}

/**
 * 检查更新。
 * @param {boolean} force 是否忽略 24h 缓存
 * @returns {Promise<{hasUpdate:boolean, latestVersion:string, localVersion:string, checkedAt:number}>}
 */
export async function checkForUpdates(force = false) {
    const now = Date.now();
    const lastCheck = Number(localStorage.getItem(KEY_LAST_CHECK) || 0);

    const localVer = await getLocalVersion();

    let remoteVer = null;
    let usedCache = false;

    if (!force && lastCheck && (now - lastCheck < 86400000)) {
        const cachedStr = localStorage.getItem(KEY_UPDATE_INFO);
        if (cachedStr) {
            try {
                const cachedObj = JSON.parse(cachedStr);
                if (cachedObj?.latestVersion && cachedObj.latestVersion !== 'Check Failed') {
                    remoteVer = cachedObj.latestVersion;
                    usedCache = true;
                }
            } catch (e) { /* 缓存损坏则忽略 */ }
        }
    }

    if (!remoteVer) {
        remoteVer = await getRemoteVersion();
        if (remoteVer) localStorage.setItem(KEY_LAST_CHECK, String(now));
    }

    const hasUpdate = !!remoteVer
        && localVer !== 'Unknown'
        && localVer !== 'Error'
        && compareVersions(remoteVer, localVer) > 0;

    const result = {
        hasUpdate,
        latestVersion: remoteVer || 'Check Failed',
        localVersion: localVer,
        checkedAt: usedCache ? lastCheck : now,
    };

    if (remoteVer) localStorage.setItem(KEY_UPDATE_INFO, JSON.stringify(result));
    return result;
}

/** 更新日志（拿不到就返回说明文本，UI 不会空白） */
export async function getChangelog() {
    try {
        const response = await fetch(`${CHANGELOG_URL}?t=${Date.now()}`);
        if (!response.ok) return `暂时无法获取更新日志（HTTP ${response.status}）。`;
        return await response.text();
    } catch (e) {
        Logger.debug('获取更新日志失败:', e?.message || e);
        return '暂时无法获取更新日志（远端仓库可能尚未创建）。';
    }
}

/** 执行更新（走 ST 后端的扩展更新接口） */
export async function performUpdate() {
    try {
        const target = await findLocalExtension();
        if (!target) {
            Logger.error('未找到扩展文件夹，无法更新');
            return { ok: false };
        }
        Logger.info(`正在更新扩展: ${target.folderPath}`);
        // 后端要的是剥掉 third-party/ 前缀的短名 + 显式 global 参数
        const shortName = target.folderPath.replace(/^third-party\//, '');
        const isGlobal = target.type === 'global';
        return await fetch('/api/extensions/update', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ extensionName: shortName, global: isGlobal }),
        });
    } catch (e) {
        Logger.error('更新失败:', e);
        return { ok: false };
    }
}

/** 页面加载时静默检测一次 */
export async function initUpdateCheck() {
    try {
        return await checkForUpdates(false);
    } catch (e) {
        Logger.error('初始化更新检测失败:', e);
        return null;
    }
}
