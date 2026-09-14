# stock-quant-console

量策研究工作台的 React + TypeScript 前端壳，使用 TDesign React 构建顶部 App Shell、一级工作区路由和可复用基础状态。

## 开发

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

开发服务器会将 `/api` 请求代理到 `http://127.0.0.1:8080`。如后端地址不同，可通过 `VITE_API_PROXY_TARGET` 覆盖。

后端运行在 `/home/jadon/projects/go/stock-quant` 时，启动命令为：

```bash
go run ./cmd/server
```

Dashboard 的服务状态读取真实 `GET /api/v1/health` 与开发环境 `GET /api/v1/dev/demo-status`；前端不提供 mock、静态数据或 fallback。

开发环境数据来源区域会展示后端返回的 `mode`、Provider、`seed_version`、`as_of`、三类数据计数和样本股票。`demo` 与 `fallback` 会明确标记为非实时/真实数据；只有后端返回 `real` 时才显示真实 Provider。

FND-003 本地一键启动（MySQL、后端和 Vite）由后端工作区提供：

```bash
bash /home/jadon/projects/go/stock-quant/scripts/dev/start.sh
```

该命令会将 Vite 的 `/api` 代理指向实际后端监听地址；按 `Ctrl-C` 停止整条本地运行链路。

## 验证

```bash
npm run test:run
npm run build
```

一级工作区路由为 `/`、`/market`、`/screening`、`/watchlist`、`/research`、`/strategy`、`/backtest` 和 `/data`。
