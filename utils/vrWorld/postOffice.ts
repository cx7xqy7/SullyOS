/**
 * 彼方虚拟邮局 · 客户端 API
 *
 * 对接【所有用户共用】的后端（默认 https://noir2.cc.cd/po）。
 * 匿名：本地一个随机 deviceId，无登录无 PII。
 */

const DEFAULT_BASE = 'https://noir2.cc.cd/po';
const BASE_KEY = 'vr_po_base';
const DEVICE_KEY = 'vr_po_device';

export const getPostOfficeBase = (): string => {
    try { return (localStorage.getItem(BASE_KEY) || DEFAULT_BASE).replace(/\/+$/, ''); }
    catch { return DEFAULT_BASE; }
};
export const setPostOfficeBase = (url: string) => {
    try { url.trim() ? localStorage.setItem(BASE_KEY, url.trim()) : localStorage.removeItem(BASE_KEY); } catch { /* ignore */ }
};

export const getDeviceId = (): string => {
    try {
        let id = localStorage.getItem(DEVICE_KEY);
        if (!id) {
            id = (globalThis.crypto?.randomUUID?.() || `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            localStorage.setItem(DEVICE_KEY, id);
        }
        return id;
    } catch {
        return 'dev-anonymous';
    }
};

export interface RemoteLetter { id: string; pen: string; content: string; created_at: number; }
export interface RemoteReply { id: string; letter_id: string; pen: string; content: string; created_at: number; }

async function call<T>(path: string, opts: RequestInit & { query?: Record<string, string> } = {}): Promise<T> {
    const base = getPostOfficeBase();
    const qs = opts.query ? '?' + new URLSearchParams(opts.query).toString() : '';
    const res = await fetch(`${base}${path}${qs}`, {
        method: opts.method || 'GET',
        headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
        body: opts.body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data && data.ok === false)) {
        throw new Error((data && data.error) || `HTTP ${res.status}`);
    }
    return data as T;
}

export const PostOffice = {
    async health(): Promise<boolean> {
        try { const r = await call<{ ok: boolean }>('/health'); return !!r.ok; } catch { return false; }
    },

    /** 上传待寄出的信，返回服务端分配的 id 列表 */
    async uploadLetters(letters: { pen: string; content: string; lang?: string }[]): Promise<string[]> {
        const r = await call<{ ids: string[] }>('/letters', { method: 'POST', body: JSON.stringify({ device: getDeviceId(), letters }) });
        return r.ids || [];
    },

    /** 随机抽别人的、还能回的信 */
    async fetchInbox(limit = 5): Promise<RemoteLetter[]> {
        const r = await call<{ letters: RemoteLetter[] }>('/inbox', { query: { device: getDeviceId(), limit: String(limit) } });
        return r.letters || [];
    },

    /** 上传回信 */
    async uploadReplies(replies: { letterId: string; pen: string; content: string }[]): Promise<number> {
        const r = await call<{ accepted: number }>('/replies', { method: 'POST', body: JSON.stringify({ device: getDeviceId(), replies }) });
        return r.accepted || 0;
    },

    /** 取回挂在"我寄出的信"上的回复 */
    async fetchReplies(): Promise<RemoteReply[]> {
        const r = await call<{ replies: RemoteReply[] }>('/replies', { query: { device: getDeviceId() } });
        return r.replies || [];
    },

    /** 原作者留档后释放（后端删除信+回复） */
    async release(letterIds: string[]): Promise<void> {
        if (letterIds.length === 0) return;
        await call('/release', { method: 'POST', body: JSON.stringify({ device: getDeviceId(), letterIds }) });
    },
};
