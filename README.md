# 京豆查询工具

Chrome 浏览器扩展（Manifest V3），用于在京东内部系统批量查询、汇总并导出"满意度调研发放京豆"相关数据。

- 版本：v3.0.0
- 仓库：[github.com/chiilili/JingDouQueryTool](https://github.com/chiilili/JingDouQueryTool)

## 作用域

| 页面 | 功能 |
| --- | --- |
| `http://newadmin.jpos.jd.com/tool/beanList*` | JPOS 京豆批量查询面板：识别页面或本地表格中的创建人/追踪人，按账号批量查询京豆发放记录 |
| `https://crm.jd.com/monitor/monitorCaseInfo/monitorDetail*` | CRM 监控详情：本地数据采集与导出 |

## 主要功能

- **批量查询**：默认关键字 `满意度调研发放京豆`，可识别 `创建人 / 追踪人` 等多种列名候选
- **双数据源**：支持 JPOS（`newadmin.jpos.jd.com`）与 KFUAD（`kfuad.jd.com`）两套接口，可切换
- **本地表格导入**：从 CRM 页面或本地导入 CRM 数据后进行匹配查询
- **结果筛选**：按列过滤、按结果状态（命中 / 未命中 / 错误 / 跳过）查看
- **CSV 导出**：查询结果一键导出为 CSV
- **并发控制**：默认 6 路并发查询、4 路分页并发，可在 `src/config.js` 调整
- **自动更新检测**：每 6 小时拉取代码托管页（`xingyun.jd.com/.../releases/`）比对最新版本

## 目录结构

```
v3.0.0/
├── manifest.json                插件清单（MV3）
├── background.js                Service Worker 入口，加载 fetch 代理
├── content.js                   内容脚本入口，按页面分发
└── src/
    ├── config.js                全局配置 / 关键字 / 字段候选 / 并发参数
    ├── background/
    │   └── fetch-proxy.js       后台请求代理（跨源 fetch）
    ├── common/
    │   ├── runtime.js           运行时错误守卫
    │   └── utils.js             通用工具方法
    ├── crm/
    │   ├── local-exporter.js    CRM 详情页本地导出器
    │   └── source-loader.js     CRM 源数据加载
    ├── bean/
    │   ├── query.js             JPOS 京豆查询
    │   └── query-kfuad.js       KFUAD 京豆查询
    ├── ui/
    │   ├── template.js          面板 HTML 模板
    │   ├── render.js            结果渲染（批渲染 + 让出主线程）
    │   ├── panel.js             面板状态与控制
    │   └── events.js            事件绑定
    ├── export/
    │   └── csv.js               CSV 导出
    └── update/
        └── check.js             自动版本检测
```

## 安装

1. Chrome 打开 `chrome://extensions/`
2. 右上角开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择本目录（`v3.0.0/`）
4. 打开 JPOS 京豆列表页或 CRM 监控详情页，扩展会自动注入面板

## 使用

### JPOS 京豆批量查询

1. 进入 `http://newadmin.jpos.jd.com/tool/beanList`
2. 页面右侧出现工具面板
3. 直接使用页面表格 / 粘贴本地数据 / 加载 CRM 源数据
4. 可在面板顶部切换 **JPOS / KFUAD** 数据源
5. 点击「开始查询」，命中后查看结果，导出 CSV

### CRM 本地导出

1. 进入 `https://crm.jd.com/monitor/monitorCaseInfo/monitorDetail`
2. 面板自动初始化导出模式
3. 选择日期范围（今日 / 昨日+今日）
4. 导出当前 CRM 数据，留作后续在 JPOS 页面批量匹配

## 配置项

可在 [`src/config.js`](src/config.js) 调整：

| 常量 | 默认值 | 说明 |
| --- | --- | --- |
| `DEFAULT_KEYWORD` | `满意度调研发放京豆` | 主关键字 |
| `EXCLUDED_KEYWORDS` | `['在线机器人满意度调研发放京豆']` | 排除关键字 |
| `IGNORED_CREATORS` | `org.jimi / robotlara` | 忽略的机器人账号 |
| `BEAN_QUERY_CONCURRENCY` | `6` | 查询并发数 |
| `BEAN_PAGINATION_CONCURRENCY` | `4` | 分页并发数 |
| `BEAN_QUERY_MAX_PAGES` | `20` | 单账号最大翻页 |
| `KFUAD_QUERY_MAX_PAGES` | `50` | KFUAD 接口最大翻页 |
| `CREATOR_COL_CANDIDATES` | 多个 | 自动识别创建人列名 |
| `TRACKER_COL_CANDIDATES` | 多个 | 自动识别追踪人列名 |

## 注意

- 仅作用于上述列出的内部系统域名，不会拦截或修改其他网站
- 使用者需自行登录原系统，扩展复用页面 Cookie 调用接口
- 仅用于内部业务，请勿用于侵犯他人合法权益的场景
