/**
 * SullyOS · 彼方虚拟邮局 —— 跨用户漂流信后端（Cloudflare Worker + D1）
 *
 * 这是一个共享后端：所有用户共用一个实例（如 https://noir2.cc.cd），
 * 别的用户无需任何配置。信件被丢进一个公共 D1 池，随机分发给别的设备回信，
 * 回信再路由回原作者，原作者收下并留档后通知后端释放。
 *
 * 匿名：客户端只带一个随机 deviceId（无登录、无 PII）。信件只含 笔名 + 正文。
 *
 * 路由（兼容挂在根路径或 /po 前缀下；按 path 结尾匹配）：
 *   POST  …/letters   { device, letters:[{id?,pen,content,lang?}] }     上传待寄出的信
 *   GET   …/inbox?device=X&limit=N                                       随机抽 N 封"别人的、还能回"的信
 *   POST  …/replies   { device, replies:[{letterId,pen,content}] }       上传回信
 *   GET   …/replies?device=X                                             取回挂在"我寄出的信"上的回复
 *   POST  …/release   { device, letterIds:[...] }                        原作者留档后释放（后端删除信+回复）
 *   GET   …/health                                                       健康检查
 *
 * 表结构由 Worker 自动 CREATE IF NOT EXISTS。也可手动跑 schema.sql。
 */

export interface Env {
    DB: D1Database;
    /** 可选：一封信最多被几个设备回信（默认 3） */
    PO_MAX_REPLIES?: string;
    /** 可选：信件保留天数，超过自动清理（默认 30） */
    PO_TTL_DAYS?: string;
}

// 最小 D1 类型（避免依赖 @cloudflare/workers-types）
interface D1Database {
    prepare(q: string): D1PreparedStatement;
    batch(s: D1PreparedStatement[]): Promise<unknown[]>;
    exec(q: string): Promise<unknown>;
}
interface D1PreparedStatement {
    bind(...a: unknown[]): D1PreparedStatement;
    run(): Promise<unknown>;
    first<T = unknown>(c?: string): Promise<T | null>;
    all<T = unknown>(): Promise<{ results: T[] }>;
}

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};
const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const MAX_CONTENT = 6000;   // 单封正文字数上限
const MAX_BATCH = 20;       // 单次上传封数上限
const uuid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);

let schemaReady = false;
async function ensureSchema(db: D1Database) {
    if (schemaReady) return;
    await db.exec(
        `CREATE TABLE IF NOT EXISTS po_letters (id TEXT PRIMARY KEY, device TEXT NOT NULL, pen TEXT NOT NULL, content TEXT NOT NULL, lang TEXT, created_at INTEGER NOT NULL, reply_count INTEGER NOT NULL DEFAULT 0);`
    );
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_po_letters_dev ON po_letters(device);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_po_letters_open ON po_letters(reply_count, created_at);`);
    await db.exec(`CREATE TABLE IF NOT EXISTS po_picks (device TEXT NOT NULL, letter_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (device, letter_id));`);
    await db.exec(`CREATE TABLE IF NOT EXISTS po_replies (id TEXT PRIMARY KEY, letter_id TEXT NOT NULL, device TEXT NOT NULL, pen TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_po_replies_letter ON po_replies(letter_id);`);
    schemaReady = true;
}

async function sweepExpired(db: D1Database, ttlDays: number) {
    // 概率性清理（~5% 请求触发一次），删掉超期的孤儿信及其回复/picks
    if (Math.random() > 0.05) return;
    const cutoff = Date.now() - ttlDays * 86400_000;
    try {
        await db.prepare(`DELETE FROM po_replies WHERE letter_id IN (SELECT id FROM po_letters WHERE created_at < ?)`).bind(cutoff).run();
        await db.prepare(`DELETE FROM po_picks WHERE letter_id IN (SELECT id FROM po_letters WHERE created_at < ?)`).bind(cutoff).run();
        await db.prepare(`DELETE FROM po_letters WHERE created_at < ?`).bind(cutoff).run();
    } catch { /* 清理失败不影响主流程 */ }
}

const clip = (s: unknown) => String(s ?? '').slice(0, MAX_CONTENT);

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
        if (!env.DB) return json({ ok: false, error: 'D1 binding "DB" 未配置' }, 500);

        const url = new URL(req.url);
        const path = url.pathname.replace(/\/+$/, '');
        const ends = (p: string) => path === p || path.endsWith(p);
        const maxReplies = parseInt(env.PO_MAX_REPLIES || '3', 10) || 3;
        const ttlDays = parseInt(env.PO_TTL_DAYS || '30', 10) || 30;

        try {
            await ensureSchema(env.DB);
            await sweepExpired(env.DB, ttlDays);

            if (req.method === 'GET' && ends('/health')) {
                return json({ ok: true, service: 'sullyos-post-office', maxReplies, ttlDays });
            }

            // 上传待寄出的信
            if (req.method === 'POST' && ends('/letters')) {
                const body: any = await req.json().catch(() => ({}));
                const device = String(body.device || '').slice(0, 80);
                const letters: any[] = Array.isArray(body.letters) ? body.letters.slice(0, MAX_BATCH) : [];
                if (!device || letters.length === 0) return json({ ok: false, error: 'bad request' }, 400);
                const ids: string[] = [];
                const now = Date.now();
                for (const l of letters) {
                    const content = clip(l.content);
                    if (!content.trim()) continue;
                    const id = uuid();
                    ids.push(id);
                    await env.DB.prepare(`INSERT INTO po_letters (id, device, pen, content, lang, created_at, reply_count) VALUES (?,?,?,?,?,?,0)`)
                        .bind(id, device, String(l.pen || '匿名').slice(0, 60), content, String(l.lang || '').slice(0, 16), now).run();
                }
                return json({ ok: true, ids });
            }

            // 随机抽别人的、还能回的信
            if (req.method === 'GET' && ends('/inbox')) {
                const device = String(url.searchParams.get('device') || '').slice(0, 80);
                const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '5', 10) || 5, 1), 10);
                if (!device) return json({ ok: false, error: 'bad request' }, 400);
                const rows = await env.DB.prepare(
                    `SELECT id, pen, content, created_at FROM po_letters
                     WHERE device != ? AND reply_count < ?
                       AND id NOT IN (SELECT letter_id FROM po_picks WHERE device = ?)
                     ORDER BY RANDOM() LIMIT ?`
                ).bind(device, maxReplies, device, limit).all<any>();
                const letters = rows.results || [];
                const now = Date.now();
                for (const r of letters) {
                    await env.DB.prepare(`INSERT OR IGNORE INTO po_picks (device, letter_id, at) VALUES (?,?,?)`).bind(device, r.id, now).run();
                }
                return json({ ok: true, letters });
            }

            // 上传回信
            if (req.method === 'POST' && ends('/replies')) {
                const body: any = await req.json().catch(() => ({}));
                const device = String(body.device || '').slice(0, 80);
                const replies: any[] = Array.isArray(body.replies) ? body.replies.slice(0, MAX_BATCH) : [];
                if (!device || replies.length === 0) return json({ ok: false, error: 'bad request' }, 400);
                const now = Date.now();
                let accepted = 0;
                for (const rp of replies) {
                    const letterId = String(rp.letterId || '');
                    const content = clip(rp.content);
                    if (!letterId || !content.trim()) continue;
                    // 校验信仍存在且未超回信上限
                    const lt = await env.DB.prepare(`SELECT reply_count FROM po_letters WHERE id = ?`).bind(letterId).first<any>();
                    if (!lt || lt.reply_count >= maxReplies) continue;
                    await env.DB.prepare(`INSERT INTO po_replies (id, letter_id, device, pen, content, created_at) VALUES (?,?,?,?,?,?)`)
                        .bind(uuid(), letterId, device, String(rp.pen || '匿名').slice(0, 60), content, now).run();
                    await env.DB.prepare(`UPDATE po_letters SET reply_count = reply_count + 1 WHERE id = ?`).bind(letterId).run();
                    accepted++;
                }
                return json({ ok: true, accepted });
            }

            // 取回挂在"我寄出的信"上的回复
            if (req.method === 'GET' && ends('/replies')) {
                const device = String(url.searchParams.get('device') || '').slice(0, 80);
                if (!device) return json({ ok: false, error: 'bad request' }, 400);
                const rows = await env.DB.prepare(
                    `SELECT r.id, r.letter_id, r.pen, r.content, r.created_at
                     FROM po_replies r JOIN po_letters l ON l.id = r.letter_id
                     WHERE l.device = ? ORDER BY r.created_at ASC LIMIT 200`
                ).bind(device).all<any>();
                return json({ ok: true, replies: rows.results || [] });
            }

            // 原作者留档后释放：删信 + 回复 + picks
            if (req.method === 'POST' && ends('/release')) {
                const body: any = await req.json().catch(() => ({}));
                const device = String(body.device || '').slice(0, 80);
                const letterIds: string[] = Array.isArray(body.letterIds) ? body.letterIds.slice(0, 100) : [];
                if (!device || letterIds.length === 0) return json({ ok: false, error: 'bad request' }, 400);
                for (const id of letterIds) {
                    const lt = await env.DB.prepare(`SELECT device FROM po_letters WHERE id = ?`).bind(id).first<any>();
                    if (!lt || lt.device !== device) continue; // 只能释放自己的信
                    await env.DB.prepare(`DELETE FROM po_replies WHERE letter_id = ?`).bind(id).run();
                    await env.DB.prepare(`DELETE FROM po_picks WHERE letter_id = ?`).bind(id).run();
                    await env.DB.prepare(`DELETE FROM po_letters WHERE id = ?`).bind(id).run();
                }
                return json({ ok: true });
            }

            return json({ ok: false, error: 'not found' }, 404);
        } catch (e: any) {
            return json({ ok: false, error: e?.message || 'server error' }, 500);
        }
    },
};
