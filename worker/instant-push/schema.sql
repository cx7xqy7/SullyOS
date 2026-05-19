-- Instant Push Worker — D1 schema for BlobStore (optional but recommended)
--
-- amsg-instant 0.7.0+ 在 push payload 超 2.6 KB 安全线时把真正 body 写到 BlobStore,
-- push 只推 200 B envelope `{ _blob:true, key, url }`. SW 收到后 fetch URL 拿真 body.
-- agentic loop + reasoning_content 场景 (DeepSeek-R1 / GLM-4.5 等) 容易触发, 推荐配上.
--
-- 部署方法:
--   wrangler d1 create instant-blob-db        # 拿到 database_id
--   wrangler d1 execute instant-blob-db --file schema.sql
--   把 database_id 填到 worker/instant-push/wrangler.toml 的 [[d1_databases]] 里
--
-- 不部署 D1 也能跑 — 超限 push 会返 500 PAYLOAD_TOO_LARGE, 但 < 2.6 KB 的小 payload
-- 路径 (90% 场景) 不受影响.

CREATE TABLE IF NOT EXISTS amsg_transient_blobs (
  key        TEXT    PRIMARY KEY,
  body       TEXT    NOT NULL,
  expires_at INTEGER NOT NULL  -- ms epoch
);

CREATE INDEX IF NOT EXISTS idx_amsg_blobs_expires
  ON amsg_transient_blobs(expires_at);
