'use strict';

async function runBatchKfuad() {
  if (state.running) return;
  if (state.crmData) syncCrmSelectionForRun();
  if (state.rows.length === 0) return;

  state.running = true;
  state.stopped = false;
  state.results = [];
  if (!state.beanQueryCache) state.beanQueryCache = new Map();
  clearResultsView();
  resetStats();

  const rowsForRun = (state.rows || []).slice();
  state.stats.total = rowsForRun.length;
  renderStats(true);
  updateButtons();

  const accountCol = els.accountCol.value;
  const eventCol = els.eventCol.value;
  const keyword = DEFAULT_KEYWORD;
  let timeRange;
  try {
    timeRange = getSelectedTimeRange();
  } catch (err) {
    alert(err.message || String(err));
    state.running = false;
    updateButtons();
    return;
  }
  if (!timeRange.start || !timeRange.end) {
    alert('kfuad（新接口）必须同时指定开始时间与截止时间。');
    state.running = false;
    updateButtons();
    return;
  }
  const uniqueAccounts = countUniqueRunnableAccounts(rowsForRun, accountCol);
  log(`开始查询(kfuad)：${state.sourceContext ? formatSourceContextForLog(state.sourceContext) : `${rowsForRun.length} 条`}｜账号 ${uniqueAccounts} 个｜并发 ${BEAN_QUERY_CONCURRENCY}`);

  let renderedSinceYield = 0;
  const processRow = async (inputRow) => {
    if (state.stopped) return;
    const account = clean(inputRow[accountCol]);
    const eventNo = clean(inputRow[eventCol]);
    const trackerName = getTrackerNameFromRow(inputRow);
    const trackerErp = getTrackerErpFromRow(inputRow);
    const creator = getRowValueByCandidates(inputRow, CREATOR_COL_CANDIDATES);

    if (shouldIgnoreCreator(creator)) {
      state.stats.skipped++;
      renderStats();
      appendResult({ status: '跳过', eventNo, trackerName, trackerErp, account, beanCreateTime: '', detail: '无需查询' });
      await yieldAfterResultBatch(++renderedSinceYield);
      return;
    }
    if (!account) {
      state.stats.skipped++;
      renderStats();
      appendResult({ status: '跳过', eventNo, trackerName, trackerErp, account, beanCreateTime: '', detail: '客户账户为空' });
      await yieldAfterResultBatch(++renderedSinceYield);
      return;
    }

    try {
      log(`查询中(kfuad)：${Math.min(state.stats.done + state.stats.skipped + state.stats.error + 1, rowsForRun.length)}/${rowsForRun.length}`);
      const matches = await queryAllKfuadPagesCached(account, keyword, timeRange);
      if (state.stopped) return;
      state.stats.done++;
      if (matches.length) {
        state.stats.hit += matches.length;
        for (const m of matches) {
          appendResult({
            status: '命中',
            eventNo,
            trackerName, trackerErp,
            account,
            beanCreateTime: m.createTime,
            beanAmount: m.amount,
            businessNo: m.businessNo,
            businessNo1: m.businessNo1,
            activityId: m.activityId,
            activityName: m.activityName,
            detail: m.detail,
            sourceLink: m.sourceLink
          });
        }
      } else {
        state.stats.noHit++;
        appendResult({ status: '未命中', eventNo, trackerName, trackerErp, account, beanCreateTime: '', detail: NO_BEAN_RECORD_DETAIL });
      }
    } catch (err) {
      state.stats.done++;
      state.stats.error++;
      appendResult({ status: '异常', eventNo, trackerName, trackerErp, account, beanCreateTime: '', detail: err.message || String(err) });
      console.debug('[京豆查询工具] kfuad 查询异常：', account, err);
    }
    renderStats();
    await yieldAfterResultBatch(++renderedSinceYield);
  };

  try {
    await runConcurrentTasks(rowsForRun, BEAN_QUERY_CONCURRENCY, processRow);
  } finally {
    flushResultsNow();
    await yieldToBrowser();
    state.running = false;
    renderStats(true);
    updateButtons();
    els.exportBtn.disabled = state.results.filter(r => r.status === '命中').length === 0;
    const finalText = state.stopped ? '已停止' : '查询完成';
    log(`${finalText}(kfuad)：命中 ${state.stats.hit}，未命中 ${state.stats.noHit}，异常 ${state.stats.error}，跳过 ${state.stats.skipped}。`);
  }
}

function buildKfuadCacheKey(account, keyword, timeRange) {
  const start = timeRange?.start ? timeRange.start.getTime() : '';
  const end = timeRange?.end ? timeRange.end.getTime() : '';
  return `kfuad|${clean(account)}|${clean(keyword)}|${start}|${end}`;
}

async function queryAllKfuadPagesCached(account, keyword, timeRange) {
  if (!state.beanQueryCache) state.beanQueryCache = new Map();
  const key = buildKfuadCacheKey(account, keyword, timeRange);
  if (state.beanQueryCache.has(key)) return state.beanQueryCache.get(key);
  const promise = queryAllKfuadPages(account, keyword, timeRange);
  promise.catch(() => {
    if (state.beanQueryCache.get(key) === promise) state.beanQueryCache.delete(key);
  });
  state.beanQueryCache.set(key, promise);
  return promise;
}

async function queryAllKfuadPages(account, keyword, timeRange) {
  const matches = [];
  const beginMs = timeRange.start.getTime();
  const endMs = timeRange.end.getTime();
  const maxPages = KFUAD_QUERY_MAX_PAGES;
  let page = 1;
  while (page <= maxPages) {
    if (state.stopped) break;
    const payload = await queryKfuadDetailBeans(account, beginMs, endMs, page, KFUAD_QUERY_PAGE_SIZE);
    const content = Array.isArray(payload?.content) ? payload.content : [];
    let earlyStop = false;
    for (const item of content) {
      const createMs = Number(item?.createDate || 0);
      const inRange = createMs >= beginMs && createMs <= endMs;
      if (!inRange) {
        if (createMs > 0 && createMs < beginMs) earlyStop = true;
        continue;
      }
      const userVisibleInfo = clean(item?.userVisibleInfo);
      const memo = clean(item?.memo);
      if (!matchesBeanKeyword(userVisibleInfo, keyword) && !matchesBeanKeyword(memo, keyword)) continue;
      matches.push(buildKfuadMatch(item));
    }
    const totalPages = Number(payload?.totalPages || 0);
    const isLast = Boolean(payload?.last) || content.length < KFUAD_QUERY_PAGE_SIZE;
    if (earlyStop || isLast) break;
    if (totalPages > 0 && page >= totalPages) break;
    page++;
    await yieldToBrowser();
  }
  if (page > maxPages) console.debug('[京豆查询工具] kfuad 页数过多，已限制查询：', account, maxPages);
  return matches;
}

function buildKfuadMatch(item) {
  const createTime = formatKfuadTimestamp(item?.createDate);
  const userVisibleInfo = clean(item?.userVisibleInfo);
  const memo = clean(item?.memo);
  const detail = userVisibleInfo || memo;
  return {
    businessNo: clean(item?.businessBill1),
    businessNo1: clean(item?.businessBill2),
    createTime,
    amount: item?.amount != null ? String(item.amount) : '',
    activityId: clean(item?.topBusinessId),
    activityName: clean(item?.secondBusinessId),
    detail,
    sourceLink: ''
  };
}

function formatKfuadTimestamp(ms) {
  const n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n);
  if (!Number.isFinite(d.getTime())) return '';
  return formatDateTimeSeconds(d);
}

async function queryKfuadDetailBeans(account, beginMs, endMs, pageNo, pageSize) {
  const bodyObj = {
    pin: account,
    dataSource: '1',
    detailType: null,
    beginDate: beginMs,
    endDate: endMs,
    pageNo,
    pageSize
  };
  const body = JSON.stringify(bodyObj);
  return runWithRetry(async () => {
    const resp = await sendRuntimeMessageSafe({
      type: 'JD_BEAN_TOOL_FETCH_TEXT',
      url: KFUAD_DETAIL_BEANS_URL,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Accept': 'application/json, text/plain, */*'
        },
        body,
        credentials: 'include',
        timeoutMs: 30000
      }
    }, 30000);
    if (!resp || !resp.ok) {
      const err = new Error(resp?.error || `kfuad 请求失败 HTTP ${resp?.status || 'unknown'}`);
      throw err;
    }
    const text = resp.text || '';
    let json;
    try {
      json = JSON.parse(text);
    } catch (_err) {
      if (looksLikeLoginPage(text)) throw new Error('kfuad 登录态失效，请先在浏览器打开 kfuad.jd.com 完成登录。');
      throw new Error('kfuad 返回内容无法解析为 JSON。');
    }
    if (json && Number(json.code) !== 200) {
      const msg = clean(json.message) || `code ${json.code}`;
      if (/login|登录|未登录/i.test(msg)) throw new Error('kfuad 登录态失效，请先在浏览器打开 kfuad.jd.com 完成登录。');
      throw new Error(`kfuad 接口返回错误：${msg}`);
    }
    return json && json.result ? json.result : { content: [], totalPages: 0, last: true };
  });
}
