# 前端导航索引

本文件只记录当前已存在文件的职责，不记录待实现页面或计划。

| 路径 | 当前职责 |
| --- | --- |
| `src/main.tsx` | 挂载 React、TDesign `ConfigProvider` 与根应用。 |
| `src/app/App.tsx` | 根据路由渲染 A 股数据同步页或同步计划管理页，并承载工作台导航。 |
| `src/api/health.ts` | 请求并校验 `GET /api/v1/health` 响应，提供状态 Hook。 |
| `src/api/syncTasks.ts` | 提供 FEAT-001 同步任务的契约类型、真实相对路径请求、响应校验和显式 Mock 适配器。 |
| `src/api/syncTasks.test.ts` | 覆盖同步任务 Mock、契约校验、错误归类和真实请求路径。 |
| `src/api/syncSchedules.ts` | 提供 FEAT-002 同步计划 CRUD 契约、真实相对路径请求和显式 Mock 适配器。 |
| `src/api/syncSchedules.test.ts` | 覆盖同步计划 Mock、契约校验、冲突错误和真实请求路径。 |
| `src/app/App.test.tsx` | 覆盖同步页面加载、空态、日期校验、创建、详情、冲突和重试状态。 |
| `src/app/SyncSchedulePage.tsx` | 渲染同步计划列表、创建/编辑抽屉、启停、删除及加载、空、错误和冲突状态。 |
| `src/app/SyncSchedulePage.test.tsx` | 覆盖同步计划管理页的主要加载、空态、创建、错误、冲突和删除状态。 |
| `src/styles.css` | 同步工作台的深色研究终端布局、状态语义色和窄屏样式。 |
| `vite.config.ts` | 配置 React 插件和 `/api` 开发代理。 |
| `vitest.config.ts` | 配置 jsdom 测试环境与测试初始化。 |
| `package.json` | 定义依赖、开发、类型检查、测试与构建命令。 |

运行与验证命令见 [README.md](README.md)。
