# 彼方虚拟邮局 · 后端 Worker

跨用户漂流信的**共享后端**（Cloudflare Worker + D1）。所有用户共用同一个实例，
其他用户无需任何配置。匿名：客户端只带一个随机 `deviceId`，无登录、无 PII。

## 部署

```bash
cd worker/post-office
wrangler d1 create sullyos-post-office          # 拿到 database_id
# 把 database_id 填到 wrangler.toml 的 [[d1_databases]]
wrangler deploy
```

表结构由 Worker 自动 `CREATE TABLE IF NOT EXISTS`，不必手动跑 `schema.sql`。

### 挂到统一域名（如 noir2.cc.cd/po）

二选一：

- **A. 单独部署 + 路由**：部署本 worker，然后在 Cloudflare 给 `noir2.cc.cd/po/*`
  加一条 Route 指向它。客户端默认就是 `https://noir2.cc.cd/po`。
- **B. 合并进现有 worker**：把 `src/index.ts` 的 `fetch` 逻辑并进你现有的 noir2
  worker（按 path 结尾匹配，和现有 push 路由不冲突），并绑定 D1 `DB`。

客户端后端地址可在「彼方 → 邮局 → ⚙」里改（默认 `https://noir2.cc.cd/po`）。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET  | `/health` | 健康检查 |
| POST | `/letters` | `{device, letters:[{pen,content,lang?}]}` 上传待寄出的信 |
| GET  | `/inbox?device=X&limit=N` | 随机抽 N 封"别人的、还能回"的信（标记已抽，避免重复） |
| POST | `/replies` | `{device, replies:[{letterId,pen,content}]}` 上传回信（每封信最多 `PO_MAX_REPLIES` 个设备能回） |
| GET  | `/replies?device=X` | 取回挂在"我寄出的信"上的回复 |
| POST | `/release` | `{device, letterIds:[...]}` 原作者留档后释放（删信+回复） |

## 环境变量（可选）

- `PO_MAX_REPLIES` 一封信最多被几个设备回信（默认 3）
- `PO_TTL_DAYS` 信件保留天数，超期自动清理（默认 30）

## 信件生命周期

```
待发送(本地草稿) ─[一键寄出]→ POST /letters → 公共池 open
   其他用户 ─[刷新收件箱]→ GET /inbox（随机抽，非自己的）
   回信 ─[一键发送]→ POST /replies（挂到该信）
原作者 ─[收取回复]→ GET /replies → 落本地 IndexedDB 留档 ─→ POST /release（后端删除）
   超 PO_TTL_DAYS 天没人理的孤儿信，Worker 随请求概率性清理
```
