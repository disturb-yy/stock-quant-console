# 前端导航索引

本文件只记录当前已存在文件的职责，不记录待实现页面或计划。

| 路径 | 当前职责 |
| --- | --- |
| `src/main.tsx` | 挂载 React、TDesign `ConfigProvider` 与根应用。 |
| `src/app/App.tsx` | 按当前路由组合研究概览、A 股数据同步页面与已同步股票目录页面。 |
| `src/app/AppShell.tsx` | 提供顶部一级导航、`市场 | 概览 股票 任务 计划` 工作台页签和当前页面选中状态。 |
| `src/components/ui/PageHeader.tsx` | 提供所有业务页复用的页面眉题、标题、说明和右侧操作布局。 |
| `src/components/ui/PaginationBar.tsx` | 提供统一的服务端分页摘要、每页条数、页码选择和前后页操作。 |
| `src/components/ui/PaginationBar.test.tsx` | 覆盖统一分页条的边界状态和控件回调。 |
| `src/app/OverviewPage.tsx` | 读取股票目录与同步任务真实接口，渲染研究概览、数据不可用状态和最近同步任务。 |
| `src/app/OverviewPage.test.tsx` | 覆盖研究概览成功加载、真实摘要展示、接口失败和重试状态。 |
| `src/app/RuntimeConfigContext.tsx` | 在应用外壳中读取运行时能力，向页面提供数据源模式。 |
| `src/app/StockCatalogPage.tsx` | 渲染已同步股票目录，承载搜索、排序、分页、状态展示和详情入口。 |
| `src/app/StockDataPage.tsx` | 渲染股票详情名称卡片、数据来源、历史日线 K 线图和明细表，覆盖加载、空数据、部分可用和错误状态。 |
| `src/app/StockKLineChart.tsx` | 以 A 股常见红涨绿跌、均线和成交量分区渲染历史日线 K 线图。 |
| `src/app/StockDataPage.test.tsx` | 覆盖股票详情卡片、K 线图、空数据、参数错误、加载和不可用状态。 |
| `src/api/health.ts` | 请求并校验 `GET /api/v1/health` 响应，提供状态 Hook。 |
| `src/api/stockCatalog.ts` | 提供 `GET /api/v1/stocks` 的契约类型、真实相对路径请求、响应校验和显式 Mock 适配器。 |
| `src/api/stockCatalog.test.ts` | 覆盖股票目录 Mock、搜索排序分页、契约校验、真实请求路径和错误边界。 |
| `src/api/stockData.ts` | 提供 `GET /api/v1/stocks/{symbol}/data` 的契约类型、真实请求、响应校验和错误归类。 |
| `src/api/stockData.test.ts` | 覆盖单股查询的日期校验、真实请求路径、HTTP 错误和契约错误。 |
| `src/api/runtimeConfig.ts` | 提供 `GET /api/v1/runtime-config` 的运行时能力类型、响应校验和显式 Mock 适配器。 |
| `src/api/runtimeConfig.test.ts` | 覆盖运行时配置的 Mock、真实请求、契约校验和错误边界。 |
| `src/api/syncTasks.ts` | 提供 FEAT-001 同步任务的契约类型、真实相对路径请求、响应校验和显式 Mock 适配器。 |
| `src/api/syncTasks.test.ts` | 覆盖同步任务 Mock、契约校验、错误归类和真实请求路径。 |
| `src/api/syncSchedules.ts` | 提供 FEAT-002 同步计划 CRUD 契约、真实相对路径请求和显式 Mock 适配器。 |
| `src/api/syncSchedules.test.ts` | 覆盖同步计划 Mock、契约校验、冲突错误和真实请求路径。 |
| `src/app/App.test.tsx` | 覆盖同步页面加载、空态、日期校验、创建、详情、冲突和重试状态。 |
| `src/app/StockCatalogPage.test.tsx` | 覆盖股票目录加载、搜索、排序、分页、空态、无结果、错误重试和详情入口。 |
| `src/app/SyncSchedulePage.tsx` | 渲染同步计划列表、创建/编辑抽屉、启停、删除及加载、空、错误和冲突状态。 |
| `src/app/SyncSchedulePage.test.tsx` | 覆盖同步计划管理页的主要加载、空态、创建、错误、冲突和删除状态。 |
| `src/styles.css` | 同步工作台的深色研究终端布局、状态语义色和窄屏样式。 |
| `vite.config.ts` | 配置 React 插件和 `/api` 开发代理。 |
| `vitest.config.ts` | 配置 jsdom 测试环境与测试初始化。 |
| `package.json` | 定义依赖、开发、类型检查、测试与构建命令。 |

运行与验证命令见 [README.md](README.md)。
