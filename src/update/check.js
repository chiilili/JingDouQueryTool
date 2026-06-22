'use strict';

// 自动检测插件版本更新：拉取代码托管页 → 解析最新版本号 → 与本地 manifest 版本对比。
const UPDATE_RELEASES_URL = 'http://xingyun.jd.com/codingRoot/donghao106/JingdouQueryTool/releases/';
const UPDATE_CHECK_TIMEOUT_MS = 8000;
const UPDATE_CHECK_THROTTLE_MS = 6 * 60 * 60 * 1000;

function getCurrentExtensionVersion() {
  try {
    return clean((chrome.runtime.getManifest() || {}).version || '');
  } catch (_err) {
    return '';
  }
}

function parseVersionToken(v) {
  return String(v || '').replace(/^v/i, '').trim();
}

function compareVersions(a, b) {
  const pa = parseVersionToken(a).split(/[.\-]/).map(s => parseInt(s, 10) || 0);
  const pb = parseVersionToken(b).split(/[.\-]/).map(s => parseInt(s, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

function extractLatestVersionFromText(text) {
  if (!text) return '';
  const tokens = text.match(/v?\d+\.\d+\.\d+(?:[.\-]\w+)?/gi) || [];
  if (!tokens.length) return '';
  const candidates = tokens.slice(0, 50).map(parseVersionToken).filter(Boolean);
  if (!candidates.length) return '';
  return candidates.reduce((max, v) => compareVersions(v, max) > 0 ? v : max, candidates[0]);
}

async function fetchLatestReleaseVersion() {
  try {
    const text = await requestText(UPDATE_RELEASES_URL, {
      timeoutMs: UPDATE_CHECK_TIMEOUT_MS,
      errorPrefix: '检查更新失败'
    });
    return extractLatestVersionFromText(text);
  } catch (err) {
    console.debug('[京豆查询工具] 检查更新失败', err);
    return '';
  }
}

function setUpdateLinkVisible(currentVersion) {
  if (!els || !els.updateLink) return;
  els.updateLink.href = UPDATE_RELEASES_URL;
  els.updateLink.textContent = '下载最新版';
  els.updateLink.title = currentVersion ? `当前版本 v${currentVersion}` : '前往代码托管页';
  if (els.updateBadge) els.updateBadge.classList.remove('hidden', 'has-update');
}

function setUpdateAvailable(currentVersion, latestVersion) {
  if (!els || !els.updateLink || !els.updateBadge) return;
  els.updateLink.href = UPDATE_RELEASES_URL;
  els.updateLink.textContent = `发现新版本 v${latestVersion}，点击下载`;
  els.updateLink.title = `当前版本 v${currentVersion}｜最新 v${latestVersion}`;
  els.updateBadge.classList.remove('hidden');
  els.updateBadge.classList.add('has-update');
}

async function checkUpdateAndNotify() {
  const current = getCurrentExtensionVersion();
  setUpdateLinkVisible(current);
  if (!current) return;
  if (!shouldRunUpdateCheckNow()) return;
  markUpdateCheckRan();
  const latest = await fetchLatestReleaseVersion();
  if (!latest) return;
  if (compareVersions(latest, current) > 0) {
    setUpdateAvailable(current, latest);
  }
}

function shouldRunUpdateCheckNow() {
  try {
    const last = Number(localStorage.getItem('__jdbean_update_check_at') || 0);
    if (!Number.isFinite(last) || last <= 0) return true;
    return Date.now() - last > UPDATE_CHECK_THROTTLE_MS;
  } catch (_err) {
    return true;
  }
}

function markUpdateCheckRan() {
  try {
    localStorage.setItem('__jdbean_update_check_at', String(Date.now()));
  } catch (_err) {}
}
