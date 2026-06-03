-- 彼方虚拟邮局 · D1 schema
-- 默认无需手动执行：Worker 启动时会自动 CREATE TABLE IF NOT EXISTS。
-- 想提前建表 / 排查时可手动：
--   wrangler d1 create sullyos-post-office
--   wrangler d1 execute sullyos-post-office --file schema.sql

-- 公共信件池
CREATE TABLE IF NOT EXISTS po_letters (
  id          TEXT    PRIMARY KEY,   -- 远端信 id (uuid)
  device      TEXT    NOT NULL,      -- 寄信方匿名 deviceId
  pen         TEXT    NOT NULL,      -- 笔名（角色名/匿名）
  content     TEXT    NOT NULL,
  lang        TEXT,
  created_at  INTEGER NOT NULL,      -- ms epoch
  reply_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_po_letters_dev  ON po_letters(device);
CREATE INDEX IF NOT EXISTS idx_po_letters_open ON po_letters(reply_count, created_at);

-- 谁抽到过哪封信（避免同一设备重复抽到同一封）
CREATE TABLE IF NOT EXISTS po_picks (
  device    TEXT    NOT NULL,
  letter_id TEXT    NOT NULL,
  at        INTEGER NOT NULL,
  PRIMARY KEY (device, letter_id)
);

-- 回信
CREATE TABLE IF NOT EXISTS po_replies (
  id         TEXT    PRIMARY KEY,
  letter_id  TEXT    NOT NULL,       -- 被回的信
  device     TEXT    NOT NULL,       -- 回信方 deviceId
  pen        TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_po_replies_letter ON po_replies(letter_id);
