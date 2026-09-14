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

Dashboard 的服务状态只读取真实 `GET /api/v1/health`；前端不提供 mock fallback。

## 验证

```bash
npm run test:run
npm run build
```

一级工作区路由为 `/`、`/market`、`/screening`、`/watchlist`、`/research`、`/strategy`、`/backtest` 和 `/data`。
