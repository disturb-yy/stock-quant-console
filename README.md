# stock-quant-console

股票分析量化平台的前端工作台，使用 React、TypeScript、Vite 和 TDesign。

## 当前能力

- 在 `/overview` 提供研究概览，读取股票目录和同步任务的真实接口摘要；行情序列未提供时展示明确的不可用状态。
- 在 `/` 提供 A 股数据同步页面，支持同步目标、日期范围、任务状态、详情和失败重试。
- 在 `/stocks` 提供已同步股票目录，支持名称或标识搜索、排序、分页和进入单只股票数据页面。
- 应用启动后读取后端 `/api/v1/runtime-config`，根据运行时数据源模式展示 Mock 状态和能力信息；显式前端 Mock 模式仍使用本地适配器。
- 在 `/sync-schedules` 提供每日同步计划管理，支持创建、编辑、启停、删除，并展示下一次执行与最近结果。
- API 模块支持真实相对路径请求；开发/测试可显式使用 `VITE_STOCK_DATA_API_MODE=mock` 验证页面状态。Mock 不会在真实 API 失败后自动启用。
- 开发服务器将 `/api` 代理到后端地址。

## 目录导航

完整的当前文件职责见 [INDEX.md](INDEX.md)。

```text
src/
├── main.tsx
├── app/App.tsx
├── api/health.ts
├── api/syncTasks.ts
├── api/syncSchedules.ts
├── app/SyncSchedulePage.tsx
├── styles.css
└── test/setup.ts
```

## 环境要求

- Node.js 24（见 `.nvmrc`）
- npm 11 或兼容版本

## 安装与开发

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

仅进行页面开发或状态验证时，显式启用 Mock：

```bash
VITE_STOCK_DATA_API_MODE=mock npm run dev -- --host 127.0.0.1 --port 4173
```

默认代理目标为 `http://127.0.0.1:8357`。需要连接其他后端时，在本地环境设置：

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:8357 npm run dev -- --host 127.0.0.1 --port 4173
```

## 真实后端联通检查

后端运行后，可通过前端代理检查健康接口：

```bash
curl http://127.0.0.1:4173/api/v1/health
```

成功时返回：

```json
{"status":"ok"}
```

## Docker 镜像

本仓库的 `Dockerfile` 构建 Vite 静态资源并使用 Nginx 提供服务；Nginx 将 `/api` 转发到 Compose 网络中的 `backend:8357`。完整的 MySQL、migration、后端和前端编排由后端仓库的 `docker-compose.yml` 负责。

## 验证

```bash
npm run lint
npm run test:run
npm run build
```
