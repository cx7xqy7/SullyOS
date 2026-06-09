/**
 * 瑞幸小程序 (Phase 1) — 与 McdMiniApp 同构
 *
 * 纯按钮驱动的点单壳: 选模式 → 拉地址/门店 → 拉菜单 → 加购 → 算价 → 下单。
 * 全程直接调 callLuckinTool, 不经过 LLM, 不会有 productCode 幻觉。
 *
 * ⚠️ 瑞幸真实工具名/字段暂未跑通 tools/list 确认。本组件用 **语义动作解析器**
 *    (resolveTool) 从 listLuckinTools() 拿到的真实清单里按关键词挑工具, 因此不
 *    硬编码工具名 —— 不管瑞幸叫 query-menu 还是 query-products 都能命中。等你填上
 *    token、控制台打出真实工具清单后, 如果某个动作没解析对, 只需在 ACTION_KEYWORDS
 *    里把对应关键词收紧成精确名即可。数据形态用通用提取 (容忍 list/dict/嵌套)。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { callLuckinTool, isLuckinConfigured, listLuckinTools, LuckinToolDef } from '../../utils/luckinMcpClient';
import { autoFixProposalCodesByName } from '../../utils/luckinToolBridge';
import { luckinItemEmoji } from '../../utils/luckinEmoji';

interface LuckinMiniAppProps {
    open: boolean;
    onClose: () => void;
    char?: any;
    userProfile?: any;
    messages?: any[];
    isTyping?: boolean;
    onSendMessage?: (text: string) => void | Promise<void>;
    onStateChange?: (state: import('../../utils/luckinToolBridge').LuckinMiniAppSnapshot) => void;
    onConfirmOrder?: (cart: CartLine[], context: OrderContext) => void;
}

interface CartLine {
    code: string;
    name: string;
    price?: string | number;
    qty: number;
    spec?: string;
}

interface OrderContext {
    orderType: 1 | 2; // 1=到店自提, 2=外卖配送
    storeCode: string;
    storeName?: string;
    addressId?: string;
    addressLabel?: string;
}

type Step = 'mode' | 'pick' | 'menu' | 'review' | 'success';

// ========== 语义动作 → 实际工具名解析 ==========
// 调用方用语义动作 (listStores / listMenu / ...), 解析器从真实工具清单挑名字。
const ACTION_KEYWORDS: Record<string, RegExp[]> = {
    listStores: [/nearby.*store|store.*nearby/i, /query.*store|query.*shop/i, /list.*store|list.*shop/i, /门店|网点/, /store|shop/i],
    listAddresses: [/query.*address|list.*address/i, /address/i, /地址|收货/],
    listMenu: [/query.*menu|query.*product|query.*goods/i, /list.*menu|list.*product|list.*goods/i, /menu|product|goods/i, /菜单|商品|饮品/],
    calcPrice: [/calc.*price|price.*calc/i, /preview.*order|order.*preview/i, /trial|预览|试算|计价|算价/i],
    createOrder: [/one.*click.*order/i, /create.*order|place.*order|submit.*order/i, /下单|创建订单|提交订单/],
    listCoupons: [/store.*coupon|coupon.*store/i, /query.*coupon|list.*coupon/i, /coupon|券/i, /ticket/i],
};

const resolveTool = (tools: LuckinToolDef[], action: keyof typeof ACTION_KEYWORDS): string | null => {
    const names = tools.map(t => t.name);
    for (const re of ACTION_KEYWORDS[action]) {
        const hit = names.find(n => re.test(n));
        if (hit) return hit;
    }
    return null;
};

// 通用: 从任意结构里尽力抽出一个"列表"
const asList = (data: any, prefKeys: string[]): any[] => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data !== 'object') return [];
    for (const k of prefKeys) {
        const v = data[k];
        if (Array.isArray(v)) return v;
    }
    // dict-of-objects → values
    const vals = Object.values(data).filter(x => x && typeof x === 'object' && !Array.isArray(x));
    if (vals.length) return vals as any[];
    // 兜底: 第一个数组字段
    for (const k of Object.keys(data)) {
        if (Array.isArray(data[k])) return data[k];
    }
    return [];
};

const pick = (obj: any, keys: string[]): any => {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const k of keys) if (obj[k] != null) return obj[k];
    return undefined;
};

const CODE_KEYS = ['code', 'productCode', 'goodsCode', 'skuCode', 'productId', 'skuId', 'goodsId', 'id'];
const NAME_KEYS = ['name', 'productName', 'goodsName', 'commodityName', 'title', 'displayName'];
const PRICE_KEYS = ['currentPrice', 'price', 'salePrice', 'sellPrice', 'realPrice', 'memberPrice'];
const STORE_CODE_KEYS = ['storeCode', 'storeId', 'shopCode', 'shopId', 'code', 'id'];
const STORE_NAME_KEYS = ['storeName', 'shopName', 'name'];

// ========== 通用 UI ==========

const fmtMoney = (v: any): string => {
    if (v == null) return '';
    const n = typeof v === 'string' ? parseFloat(v) : v;
    if (!isFinite(n)) return String(v);
    return `¥${n.toFixed(2)}`;
};

const Spinner: React.FC<{ label?: string }> = ({ label }) => (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-blue-700">
        <div className="w-8 h-8 border-[3px] border-blue-300 border-t-blue-600 rounded-full animate-spin" />
        {label && <div className="text-[12px] text-blue-700/70">{label}</div>}
    </div>
);

const ErrorBox: React.FC<{ msg: string; onRetry?: () => void }> = ({ msg, onRetry }) => (
    <div className="m-3 p-3 rounded-xl bg-red-50 border border-red-200 text-[12px] text-red-700 leading-relaxed">
        <div className="font-bold mb-1">😣 出错了</div>
        <div className="mb-2 whitespace-pre-wrap break-all">{msg}</div>
        {onRetry && (
            <button onClick={onRetry} className="px-3 py-1 bg-red-500 text-white rounded-lg text-[11px] font-bold active:scale-95">重试</button>
        )}
    </div>
);

// ========== Step 1: 选模式 ==========

const ModeStep: React.FC<{ onPick: (t: 1 | 2) => void }> = ({ onPick }) => (
    <div className="px-4 py-6 space-y-3">
        <div className="text-[20px] font-bold text-blue-900 text-center mb-1">☕ 想怎么喝？</div>
        <div className="text-[12px] text-blue-800/70 text-center mb-4">瑞幸官方 MCP · 点完会让 ta 给点意见</div>
        <button
            onClick={() => onPick(2)}
            className="w-full p-4 rounded-2xl bg-gradient-to-br from-blue-100 to-sky-100 border-2 border-blue-300 active:scale-[0.98] transition-transform text-left"
        >
            <div className="flex items-center gap-3">
                <span className="text-3xl">🛵</span>
                <div className="flex-1">
                    <div className="text-[15px] font-bold text-blue-900">外卖配送</div>
                    <div className="text-[11px] text-blue-800/70 mt-0.5">从已存的收货地址里选一个</div>
                </div>
                <span className="text-blue-700 text-xl">›</span>
            </div>
        </button>
        <button
            onClick={() => onPick(1)}
            className="w-full p-4 rounded-2xl bg-gradient-to-br from-sky-50 to-blue-50 border-2 border-blue-200 active:scale-[0.98] transition-transform text-left"
        >
            <div className="flex items-center gap-3">
                <span className="text-3xl">🏪</span>
                <div className="flex-1">
                    <div className="text-[15px] font-bold text-blue-900">到店自提</div>
                    <div className="text-[11px] text-blue-800/70 mt-0.5">从附近门店里选一家</div>
                </div>
                <span className="text-blue-700 text-xl">›</span>
            </div>
        </button>
    </div>
);

// ========== Step 2: 选地址 / 门店 ==========

const PickStep: React.FC<{ tools: LuckinToolDef[]; orderType: 1 | 2; onPick: (ctx: OrderContext) => void; onBack: () => void }> = ({ tools, orderType, onPick, onBack }) => {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [addresses, setAddresses] = useState<any[]>([]);
    const [stores, setStores] = useState<any[]>([]);

    const reload = async () => {
        setLoading(true); setErr(null);
        try {
            if (orderType === 2) {
                const tool = resolveTool(tools, 'listAddresses');
                if (!tool) throw new Error('没在瑞幸工具清单里找到"查地址"工具。可在控制台看 tools/list 实际工具名后调整 ACTION_KEYWORDS。');
                const r = await callLuckinTool(tool, {});
                if (!r.success) throw new Error(r.error || '拉取地址失败');
                setAddresses(asList(r.data, ['addresses', 'addressList', 'list', 'data', 'items']));
            } else {
                const tool = resolveTool(tools, 'listStores');
                if (!tool) throw new Error('没在瑞幸工具清单里找到"查门店"工具。可在控制台看 tools/list 实际工具名后调整 ACTION_KEYWORDS。');
                const r = await callLuckinTool(tool, {});
                if (!r.success) throw new Error(r.error || '拉取门店失败');
                setStores(asList(r.data, ['stores', 'shops', 'storeList', 'shopList', 'list', 'data', 'items']));
            }
        } catch (e: any) {
            setErr(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { reload(); /* eslint-disable-next-line */ }, [orderType]);

    if (loading) return <Spinner label={orderType === 2 ? '正在拉取你的收货地址...' : '正在拉取附近门店...'} />;
    if (err) return <ErrorBox msg={err} onRetry={reload} />;

    return (
        <div className="px-3 py-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
                <button onClick={onBack} className="text-[12px] text-blue-700 active:scale-95">‹ 换模式</button>
                <div className="text-[13px] font-bold text-blue-900">{orderType === 2 ? '选收货地址' : '选门店'}</div>
                <div className="w-12" />
            </div>
            {orderType === 2 ? (
                addresses.length === 0 ? (
                    <div className="text-center py-8 text-[12px] text-slate-500">还没有收货地址。请先在瑞幸 App 里添加。</div>
                ) : addresses.map((a: any, i: number) => (
                    <button
                        key={pick(a, ['addressId', 'id']) || i}
                        onClick={() => onPick({
                            orderType: 2,
                            storeCode: pick(a, STORE_CODE_KEYS) || '',
                            storeName: pick(a, STORE_NAME_KEYS),
                            addressId: pick(a, ['addressId', 'id']),
                            addressLabel: pick(a, ['fullAddress', 'address', 'detailAddress']),
                        })}
                        className="w-full p-3 rounded-xl bg-white border border-blue-200 active:scale-[0.99] active:bg-blue-50 transition text-left"
                    >
                        <div className="flex items-start gap-2">
                            <span className="text-xl shrink-0 mt-0.5">📍</span>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-[13px] text-slate-800 truncate">
                                    {pick(a, ['contactName', 'name', 'consignee']) || '收货人'}
                                    {pick(a, ['phone', 'mobile', 'tel']) && <span className="text-[10px] text-slate-500 font-normal ml-1.5">{pick(a, ['phone', 'mobile', 'tel'])}</span>}
                                </div>
                                <div className="text-[11px] text-slate-600 line-clamp-2 leading-snug mt-0.5">{pick(a, ['fullAddress', 'address', 'detailAddress'])}</div>
                            </div>
                            <span className="text-blue-700 text-sm shrink-0 mt-1">›</span>
                        </div>
                    </button>
                ))
            ) : (
                stores.length === 0 ? (
                    <div className="text-center py-8 text-[12px] text-slate-500 leading-relaxed">没找到门店。<br />确认定位/账号后重试。</div>
                ) : stores.map((s: any, i: number) => {
                    const distance = pick(s, ['distance', 'distanceM']);
                    return (
                        <button
                            key={pick(s, STORE_CODE_KEYS) || i}
                            onClick={() => onPick({
                                orderType: 1,
                                storeCode: pick(s, STORE_CODE_KEYS) || '',
                                storeName: pick(s, STORE_NAME_KEYS),
                            })}
                            className="w-full p-3 rounded-xl bg-white border border-blue-200 active:scale-[0.99] active:bg-blue-50 transition text-left"
                        >
                            <div className="flex items-start gap-2">
                                <span className="text-xl shrink-0 mt-0.5">🏪</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="font-bold text-[13px] text-slate-800 truncate flex-1">{pick(s, STORE_NAME_KEYS) || '瑞幸门店'}</div>
                                        {distance != null && (
                                            <div className="text-[10px] text-blue-700 shrink-0">
                                                {typeof distance === 'number' ? (distance > 1000 ? (distance / 1000).toFixed(1) + 'km' : distance + 'm') : distance}
                                            </div>
                                        )}
                                    </div>
                                    {pick(s, ['address', 'storeAddress', 'shopAddress']) && <div className="text-[11px] text-slate-600 line-clamp-2 leading-snug mt-0.5">{pick(s, ['address', 'storeAddress', 'shopAddress'])}</div>}
                                </div>
                            </div>
                        </button>
                    );
                })
            )}
        </div>
    );
};

// ========== Step 3: 浏览菜单 + 加购 ==========

const MenuStep: React.FC<{
    tools: LuckinToolDef[];
    ctx: OrderContext;
    cart: Map<string, CartLine>;
    onCart: (code: string, delta: number, item?: { name: string; price?: any }) => void;
    onMenuLoaded?: (items: Record<string, { name?: string; price?: string }>) => void;
    onBack: () => void;
    onReview: () => void;
}> = ({ tools, ctx, cart, onCart, onMenuLoaded, onBack, onReview }) => {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [items, setItems] = useState<any[]>([]);

    const reload = async () => {
        setLoading(true); setErr(null);
        try {
            const tool = resolveTool(tools, 'listMenu');
            if (!tool) throw new Error('没在瑞幸工具清单里找到"查菜单"工具。可调整 ACTION_KEYWORDS。');
            const args: any = {};
            if (ctx.storeCode) { args.storeCode = ctx.storeCode; args.storeId = ctx.storeCode; }
            const r = await callLuckinTool(tool, args);
            if (!r.success) throw new Error(r.error || '拉取菜单失败');
            const list = asList(r.data, ['items', 'products', 'goods', 'menu', 'menus', 'list', 'goodsList', 'skuList']);
            setItems(list);
            // 推给父组件: code → {name, price}
            const dict: Record<string, { name?: string; price?: string }> = {};
            for (const it of list) {
                const code = pick(it, CODE_KEYS);
                if (code) dict[String(code)] = { name: pick(it, NAME_KEYS), price: pick(it, PRICE_KEYS) };
            }
            onMenuLoaded?.(dict);
        } catch (e: any) {
            setErr(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { reload(); /* eslint-disable-next-line */ }, [ctx.storeCode, ctx.orderType]);

    const cartCount = (Array.from(cart.values()) as CartLine[]).reduce((s, l) => s + l.qty, 0);
    const cartTotal = (Array.from(cart.values()) as CartLine[]).reduce((s, l) => {
        const p = typeof l.price === 'string' ? parseFloat(l.price) : (typeof l.price === 'number' ? l.price : 0);
        return s + (isFinite(p) ? p * l.qty : 0);
    }, 0);

    if (loading) return <Spinner label="正在拉取菜单..." />;
    if (err) return <ErrorBox msg={err} onRetry={reload} />;

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-3 py-2 border-b border-blue-200/60 bg-blue-50/60">
                <button onClick={onBack} className="text-[12px] text-blue-700 active:scale-95">‹ 换{ctx.orderType === 2 ? '地址' : '门店'}</button>
                <div className="text-[12px] font-bold text-blue-900 truncate mx-2">
                    {ctx.storeName || ctx.storeCode || '瑞幸'}
                    <span className="text-[10px] text-blue-700/60 font-normal ml-1.5">{ctx.orderType === 2 ? '外送' : '自提'}</span>
                </div>
                <div className="w-14" />
            </div>

            <div className="flex-1 overflow-y-auto luckin-scroll p-2 space-y-2">
                {items.length === 0
                    ? <div className="text-center py-8 text-[11px] text-slate-400">这家店暂时没拉到可售商品</div>
                    : items.map((it: any, idx: number) => {
                        const code = String(pick(it, CODE_KEYS) || `idx-${idx}`);
                        const name = pick(it, NAME_KEYS) || '瑞幸商品';
                        const price = pick(it, PRICE_KEYS);
                        const inCart = cart.get(code);
                        const q = inCart?.qty || 0;
                        return (
                            <div key={code} className="flex gap-2 p-2 bg-white rounded-xl border border-blue-100">
                                <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-blue-50 to-sky-50 shrink-0 flex items-center justify-center text-3xl">
                                    {luckinItemEmoji(name)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-[12px] text-slate-800 line-clamp-2 leading-snug">{name}</div>
                                    <div className="flex items-center justify-between mt-1 gap-2">
                                        {price != null
                                            ? <div className="text-[12px] font-bold text-blue-700">{fmtMoney(price)}</div>
                                            : <div className="flex-1" />}
                                        <div className="flex items-center bg-white border border-blue-300 rounded-md overflow-hidden shrink-0">
                                            <button
                                                onClick={() => onCart(code, -1)}
                                                disabled={q <= 0}
                                                className={`w-6 h-6 flex items-center justify-center text-[14px] font-bold ${q <= 0 ? 'text-slate-300' : 'text-blue-700 active:bg-blue-100'}`}
                                            >−</button>
                                            <span className="min-w-[20px] text-center text-[11px] font-bold text-slate-700">{q}</span>
                                            <button
                                                onClick={() => onCart(code, 1, { name, price })}
                                                className="w-6 h-6 flex items-center justify-center text-[14px] font-bold text-blue-700 active:bg-blue-100"
                                            >+</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
            </div>

            {cartCount > 0 && (
                <div className="border-t border-blue-300 bg-gradient-to-r from-blue-100 to-sky-100 px-3 py-2.5 flex items-center gap-3">
                    <div className="text-2xl">🛒</div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-blue-800/70">已选 {cartCount} 件</div>
                        {cartTotal > 0 && <div className="text-[15px] font-bold text-blue-800">{fmtMoney(cartTotal)}</div>}
                    </div>
                    <button onClick={onReview} className="px-4 py-2 bg-blue-600 text-white text-[12px] font-bold rounded-xl shadow active:scale-95">去结算 →</button>
                </div>
            )}
        </div>
    );
};

// ========== Step 4: 确认订单 (algorithm: 尽力调 calcPrice → createOrder) ==========

const ReviewStep: React.FC<{
    tools: LuckinToolDef[];
    ctx: OrderContext;
    cart: Map<string, CartLine>;
    onCart: (code: string, delta: number) => void;
    onBack: () => void;
    onOrderPlaced: (orderResult: any) => void;
}> = ({ tools, ctx, cart, onCart, onBack, onOrderPlaced }) => {
    const lines = (Array.from(cart.values()) as CartLine[]);
    const localTotal = lines.reduce((s: number, l: CartLine) => {
        const p = typeof l.price === 'string' ? parseFloat(l.price) : (typeof l.price === 'number' ? l.price : 0);
        return s + (isFinite(p) ? p * l.qty : 0);
    }, 0);

    const [priceLoading, setPriceLoading] = useState(false);
    const [priceData, setPriceData] = useState<any>(null);
    const [priceErr, setPriceErr] = useState<string | null>(null);
    const [orderLoading, setOrderLoading] = useState(false);
    const [orderErr, setOrderErr] = useState<string | null>(null);

    const cartHash = useMemo(() => lines.map((l: CartLine) => `${l.code}x${l.qty}`).sort().join('|'), [lines]);

    const buildItems = (): any[] => lines.map((l: CartLine) => ({ productCode: l.code, code: l.code, quantity: l.qty }));
    const buildArgs = (): any => {
        const args: any = { items: buildItems(), orderType: ctx.orderType };
        if (ctx.storeCode) { args.storeCode = ctx.storeCode; args.storeId = ctx.storeCode; }
        if (ctx.orderType === 2 && ctx.addressId) args.addressId = ctx.addressId;
        return args;
    };

    useEffect(() => {
        if (!lines.length) { setPriceData(null); return; }
        const tool = resolveTool(tools, 'calcPrice');
        if (!tool) { setPriceData(null); setPriceErr(null); return; } // 没有计价工具就跳过, 用本地合计
        let cancelled = false;
        setPriceLoading(true); setPriceErr(null);
        callLuckinTool(tool, buildArgs()).then((r: any) => {
            if (cancelled) return;
            if (!r.success) { setPriceErr(r.error || '算价失败'); setPriceData(null); }
            else setPriceData(r.data || {});
            setPriceLoading(false);
        }).catch((e: any) => {
            if (cancelled) return;
            setPriceErr(e?.message || String(e));
            setPriceLoading(false);
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cartHash, ctx.storeCode, ctx.orderType]);

    const handleOrder = async () => {
        if (!lines.length) return;
        const tool = resolveTool(tools, 'createOrder');
        if (!tool) { setOrderErr('没在瑞幸工具清单里找到"下单"工具。可调整 ACTION_KEYWORDS。'); return; }
        setOrderLoading(true); setOrderErr(null);
        try {
            const r = await callLuckinTool(tool, buildArgs());
            if (!r.success) throw new Error(r.error || '下单失败');
            onOrderPlaced(r.data);
        } catch (e: any) {
            setOrderErr(e?.message || String(e));
        } finally {
            setOrderLoading(false);
        }
    };

    const finalPrice = pick(priceData, ['price', 'totalAmount', 'payAmount', 'realPayAmount', 'total']);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-3 py-2 border-b border-blue-200/60 bg-blue-50/60">
                <button onClick={onBack} className="text-[12px] text-blue-700 active:scale-95">‹ 继续选</button>
                <div className="text-[13px] font-bold text-blue-900">确认订单</div>
                <div className="w-12" />
            </div>
            <div className="flex-1 overflow-y-auto luckin-scroll p-3 space-y-2">
                <div className="text-[10px] text-blue-700/70 font-bold uppercase">送达 / 取餐</div>
                <div className="bg-white rounded-xl border border-blue-100 p-2.5 text-[12px] text-slate-700">
                    {ctx.orderType === 2
                        ? <>📍 {ctx.addressLabel || ctx.addressId || '配送地址'}</>
                        : <>🏪 {ctx.storeName || ctx.storeCode} (到店自提)</>}
                </div>
                <div className="text-[10px] text-blue-700/70 font-bold uppercase mt-2">商品</div>
                <div className="bg-white rounded-xl border border-blue-100 overflow-hidden">
                    {lines.map((l: CartLine) => (
                        <div key={l.code} className="flex items-center gap-2 p-2 border-b border-blue-50 last:border-b-0">
                            <span className="text-2xl shrink-0">{luckinItemEmoji(l.name)}</span>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-[12px] text-slate-800 truncate">{l.name}</div>
                                {l.price != null && <div className="text-[10px] text-blue-700">{fmtMoney(l.price)}</div>}
                            </div>
                            <div className="flex items-center bg-blue-50 border border-blue-200 rounded-md overflow-hidden shrink-0">
                                <button onClick={() => onCart(l.code, -1)} className="w-6 h-6 flex items-center justify-center text-[14px] font-bold text-blue-700 active:bg-blue-100">−</button>
                                <span className="min-w-[20px] text-center text-[11px] font-bold text-slate-700">{l.qty}</span>
                                <button onClick={() => onCart(l.code, 1)} className="w-6 h-6 flex items-center justify-center text-[14px] font-bold text-blue-700 active:bg-blue-100">+</button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="text-[10px] text-blue-700/70 font-bold uppercase mt-2">费用</div>
                <div className="bg-white rounded-xl border border-blue-100 p-3 text-[12px] text-slate-700 space-y-1.5">
                    {priceLoading ? (
                        <div className="flex items-center gap-2 py-1 text-slate-500">
                            <div className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                            <span className="text-[11px]">算价中...</span>
                        </div>
                    ) : priceErr ? (
                        <div className="text-[11px] text-amber-600 leading-relaxed whitespace-pre-wrap break-all">算价未通过 (可先按本地合计下单): {priceErr}</div>
                    ) : finalPrice != null ? (
                        <div className="flex justify-between"><span className="text-slate-500">应付</span><span className="font-bold text-blue-700">{fmtMoney(finalPrice)}</span></div>
                    ) : (
                        <div className="flex justify-between"><span className="text-slate-500">本地合计</span><span>{localTotal > 0 ? fmtMoney(localTotal) : '—'}</span></div>
                    )}
                </div>

                {orderErr && (
                    <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-[11px] text-red-700 leading-relaxed whitespace-pre-wrap break-all">
                        <div className="font-bold mb-0.5">下单失败</div>
                        {orderErr}
                    </div>
                )}
            </div>
            <div className="border-t border-blue-300 bg-gradient-to-r from-blue-100 to-sky-100 px-3 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-blue-800/70">合计</div>
                    <div className="text-[17px] font-bold text-blue-800">
                        {priceLoading ? '...' : (finalPrice != null ? fmtMoney(finalPrice) : (localTotal > 0 ? fmtMoney(localTotal) : '—'))}
                    </div>
                </div>
                <button
                    onClick={handleOrder}
                    disabled={lines.length === 0 || orderLoading}
                    className="px-5 py-2.5 bg-blue-600 text-white text-[13px] font-bold rounded-xl shadow active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                >{orderLoading ? '下单中...' : '敲定 →'}</button>
            </div>
        </div>
    );
};

// ========== Step 5: 下单成功 ==========

const SuccessStep: React.FC<{ orderResult: any; onClose: () => void }> = ({ orderResult, onClose }) => {
    const orderId = pick(orderResult, ['orderId', 'orderNo', 'orderCode']);
    const payUrl = pick(orderResult, ['payUrl', 'paymentUrl', 'payH5Url', 'cashierUrl', 'h5Url']);
    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto luckin-scroll p-4 space-y-3">
                <div className="text-center py-3">
                    <div className="text-5xl mb-2">🎉</div>
                    <div className="text-[16px] font-bold text-blue-900">下单成功！</div>
                    <div className="text-[11px] text-blue-700/70 mt-1">订单已创建, 等待支付</div>
                </div>
                <div className="bg-white rounded-xl border border-blue-100 p-3 space-y-2 text-[12px] text-slate-700">
                    {orderId && (
                        <div>
                            <div className="text-[10px] text-slate-400">订单号</div>
                            <div className="font-mono text-[11px] break-all">{orderId}</div>
                        </div>
                    )}
                </div>
            </div>
            <div className="border-t border-blue-300 bg-gradient-to-r from-blue-100 to-sky-100 px-3 py-2.5 flex items-center gap-2">
                {payUrl && (
                    <a href={payUrl} target="_blank" rel="noreferrer"
                        className="flex-1 text-center px-3 py-2.5 bg-blue-600 text-white text-[12px] font-bold rounded-xl shadow active:scale-95"
                    >去支付 →</a>
                )}
                <button
                    onClick={onClose}
                    className={`${payUrl ? 'shrink-0' : 'flex-1'} px-3 py-2.5 bg-white border border-blue-300 text-blue-800 text-[12px] font-bold rounded-xl active:scale-95`}
                >完成</button>
            </div>
        </div>
    );
};

// ========== 协同聊天面板 (modal 内嵌) ==========

interface LuckinProposalItem { code: string; name: string; qty: number; reason?: string; }
interface LuckinProposalPayload { items: LuckinProposalItem[]; overall_note?: string; }
interface LuckinChatViewMsg {
    role: 'user' | 'assistant';
    content: string;
    ts: number;
    type?: string;
    proposal?: LuckinProposalPayload;
}

const ProposalCard: React.FC<{
    payload: LuckinProposalPayload;
    onAddItem: (it: LuckinProposalItem) => void;
    onAddAll: (items: LuckinProposalItem[]) => void;
}> = ({ payload, onAddItem, onAddAll }) => {
    const [added, setAdded] = useState<Set<string>>(new Set());
    const handle = (it: LuckinProposalItem) => {
        onAddItem(it);
        setAdded((prev: Set<string>) => { const n = new Set(prev); n.add(it.code); return n; });
    };
    const handleAll = () => {
        onAddAll(payload.items);
        setAdded(new Set(payload.items.map((i: LuckinProposalItem) => i.code)));
    };
    return (
        <div className="bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-300 rounded-2xl overflow-hidden">
            <div className="px-2.5 py-1.5 bg-blue-200/60 border-b border-blue-300/60 flex items-center justify-between">
                <span className="text-[10px] font-bold text-blue-900">📋 这些怎么样？</span>
                <button onClick={handleAll} className="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded-full font-bold active:scale-95">全部加</button>
            </div>
            {payload.overall_note && (
                <div className="px-2.5 py-1.5 text-[11px] text-slate-600 italic border-b border-blue-200/60">{payload.overall_note}</div>
            )}
            <div className="divide-y divide-blue-200/60">
                {payload.items.map((it: LuckinProposalItem, i: number) => {
                    const isAdded = added.has(it.code);
                    return (
                        <div key={i} className="flex items-center gap-2 px-2.5 py-2">
                            <span className="text-2xl shrink-0">{luckinItemEmoji(it.name)}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-[12px] text-slate-800 truncate">{it.name}</span>
                                    <span className="text-[10px] text-blue-700 shrink-0">×{it.qty}</span>
                                </div>
                                {it.reason && <div className="text-[10px] text-slate-500 leading-snug truncate">{it.reason}</div>}
                            </div>
                            <button
                                onClick={() => handle(it)}
                                disabled={isAdded}
                                className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-bold active:scale-95 ${isAdded ? 'bg-emerald-100 text-emerald-700' : 'bg-white border border-blue-400 text-blue-700'}`}
                            >{isAdded ? '✓ 已加' : '+ 加'}</button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const InAppChat: React.FC<{
    char: any;
    visibleMessages: LuckinChatViewMsg[];
    isTyping: boolean;
    onSendMessage?: (text: string) => void | Promise<void>;
    onAddCartFromProposal?: (it: LuckinProposalItem) => void;
    onAddAllFromProposal?: (items: LuckinProposalItem[]) => void;
}> = ({ char, visibleMessages, isTyping, onSendMessage, onAddCartFromProposal, onAddAllFromProposal }) => {
    const [expanded, setExpanded] = useState(false);
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [visibleMessages, isTyping, expanded]);

    const send = () => {
        const text = input.trim();
        if (!text || !onSendMessage) return;
        setInput('');
        setExpanded(true);
        onSendMessage(text);
    };

    const lastChar = [...visibleMessages].reverse().find((m: LuckinChatViewMsg) => m.role === 'assistant');
    const charAvatar = char?.avatar;
    const charName = char?.name || 'TA';

    return (
        <div className="border-t-2 border-blue-300/60 bg-gradient-to-b from-blue-100/60 to-sky-50 shrink-0 flex flex-col" style={{ maxHeight: expanded ? '50%' : '52px' }}>
            <button
                onClick={() => setExpanded((v: boolean) => !v)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-100/80 active:bg-blue-200/60 transition border-b border-blue-200/60"
            >
                <div className="w-7 h-7 rounded-full bg-blue-300 overflow-hidden shrink-0 flex items-center justify-center text-sm">
                    {charAvatar ? <img src={charAvatar} alt="" className="w-full h-full object-cover" /> : '🐾'}
                </div>
                <div className="flex-1 min-w-0 text-left">
                    {!expanded && lastChar
                        ? <div className="text-[11px] text-slate-700 truncate"><span className="text-blue-700 font-bold">{charName}: </span>{lastChar.content}</div>
                        : <div className="text-[11px] font-bold text-blue-900">跟 {charName} 一起选 · {expanded ? '点这里收起' : '点这里展开聊'}</div>}
                </div>
                <span className="text-blue-700 text-xs shrink-0">{expanded ? '▼' : '▲'}</span>
            </button>

            {expanded && (
                <>
                    <div ref={scrollRef} className="flex-1 overflow-y-auto luckin-scroll px-3 py-2 space-y-2 min-h-0">
                        {visibleMessages.length === 0 && (
                            <div className="text-center py-4 text-[11px] text-slate-500 leading-relaxed">
                                可以这样问 {charName}:<br />
                                <span className="text-blue-700">"帮我挑杯不那么甜的"</span><br />
                                <span className="text-blue-700">"我选了这些, 你看怎么样"</span><br />
                                <span className="text-blue-700">"今天想喝点厚乳的"</span>
                            </div>
                        )}
                        {visibleMessages.map((m: LuckinChatViewMsg, i: number) => (
                            <div key={i} className={`flex gap-1.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {m.role === 'assistant' && (
                                    <div className="w-6 h-6 rounded-full bg-blue-300 overflow-hidden shrink-0 flex items-center justify-center text-xs mt-0.5">
                                        {charAvatar ? <img src={charAvatar} alt="" className="w-full h-full object-cover" /> : '🐾'}
                                    </div>
                                )}
                                <div className="max-w-[80%] flex flex-col gap-1 min-w-0">
                                    {m.proposal ? (
                                        <ProposalCard
                                            payload={m.proposal}
                                            onAddItem={(it: LuckinProposalItem) => onAddCartFromProposal?.(it)}
                                            onAddAll={(items: LuckinProposalItem[]) => onAddAllFromProposal?.(items)}
                                        />
                                    ) : m.type === 'emoji' ? (
                                        <img
                                            src={m.content}
                                            alt="表情"
                                            className="w-20 h-20 sm:w-24 sm:h-24 object-contain rounded-lg bg-white/40 p-1"
                                            loading="lazy"
                                            referrerPolicy="no-referrer"
                                            onError={(e: any) => { e.target.style.display = 'none'; }}
                                        />
                                    ) : (
                                        <div className={`px-2.5 py-1.5 rounded-2xl text-[12px] leading-relaxed whitespace-pre-wrap break-words ${
                                            m.role === 'user'
                                                ? 'bg-blue-600 text-white rounded-br-sm'
                                                : 'bg-white border border-blue-200 text-slate-800 rounded-bl-sm'
                                        }`}>
                                            {m.content}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="flex gap-1.5 justify-start">
                                <div className="w-6 h-6 rounded-full bg-blue-300 overflow-hidden shrink-0 flex items-center justify-center text-xs">
                                    {charAvatar ? <img src={charAvatar} alt="" className="w-full h-full object-cover" /> : '🐾'}
                                </div>
                                <div className="px-2.5 py-1.5 rounded-2xl bg-white border border-blue-200">
                                    <span className="inline-flex gap-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="border-t border-blue-200/60 p-2 flex items-end gap-2 bg-white">
                        <textarea
                            value={input}
                            onChange={(e: any) => setInput(e.target.value)}
                            onKeyDown={(e: any) => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                            }}
                            placeholder={`问问 ${charName}...`}
                            rows={1}
                            className="flex-1 resize-none bg-blue-50/60 border border-blue-200 rounded-xl px-3 py-1.5 text-[12px] focus:outline-none focus:border-blue-400 max-h-20"
                        />
                        <button
                            onClick={send}
                            disabled={!input.trim() || isTyping}
                            className="px-3 py-1.5 bg-blue-600 text-white text-[12px] font-bold rounded-xl shadow active:scale-95 disabled:opacity-40 shrink-0"
                        >发送</button>
                    </div>
                </>
            )}
        </div>
    );
};

// ========== 主组件 ==========

const LuckinMiniApp: React.FC<LuckinMiniAppProps> = ({ open, onClose, char, messages, isTyping, onSendMessage, onStateChange, onConfirmOrder }) => {
    const [step, setStep] = useState<Step>('mode');
    const [orderType, setOrderType] = useState<1 | 2 | null>(null);
    const [ctx, setCtx] = useState<OrderContext | null>(null);
    const [cart, setCart] = useState<Map<string, CartLine>>(new Map());
    const [menuDict, setMenuDict] = useState<Record<string, { name?: string; price?: string }>>({});
    const [tools, setTools] = useState<LuckinToolDef[]>([]);
    const [toolsErr, setToolsErr] = useState<string | null>(null);
    const [orderResult, setOrderResult] = useState<any>(null);

    useEffect(() => {
        if (open) {
            setStep('mode');
            setOrderType(null);
            setCtx(null);
            setCart(new Map());
            setMenuDict({});
            setOrderResult(null);
            setToolsErr(null);
            // 拉一次工具清单, 用于 resolveTool 语义解析
            listLuckinTools(false).then((t) => setTools(t)).catch((e) => setToolsErr(e?.message || String(e)));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // 每次状态变化推给父组件 → useChatAI 注入到 system prompt 末尾
    useEffect(() => {
        if (!onStateChange) return;
        const cartArr = (Array.from(cart.values()) as CartLine[]).map((l: CartLine) => ({
            code: l.code, name: l.name, price: l.price, qty: l.qty, spec: l.spec,
        }));
        onStateChange({
            open,
            step: step === 'success' ? 'review' : step,
            orderType: ctx?.orderType ?? (orderType || undefined),
            storeCode: ctx?.storeCode,
            storeName: ctx?.storeName,
            addressLabel: ctx?.addressLabel,
            cart: cartArr,
            menuItems: Object.keys(menuDict).length ? menuDict : undefined,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, step, orderType, ctx, cart, menuDict]);

    useEffect(() => {
        if (!open && onStateChange) onStateChange({ open: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const visibleChatMessages = useMemo<LuckinChatViewMsg[]>(() => {
        if (!Array.isArray(messages)) return [];
        const out: LuckinChatViewMsg[] = [];
        for (const m of messages) {
            if (!m?.metadata?.fromLuckinMiniApp) continue;
            if (m.type === 'luckin_card' && m.metadata?.luckinCardKind === 'proposal' && m.metadata?.luckinProposal) {
                out.push({ role: 'assistant', content: '', ts: m.timestamp || 0, proposal: m.metadata.luckinProposal });
                continue;
            }
            if (m.role !== 'user' && m.role !== 'assistant') continue;
            if (typeof m.content !== 'string' || !m.content.trim()) continue;
            out.push({ role: m.role, content: m.content, ts: m.timestamp || 0, type: m.type || 'text' });
        }
        return out;
    }, [messages]);

    const updateCart = (code: string, delta: number, item?: { name: string; price?: any }) => {
        setCart((prev: Map<string, CartLine>) => {
            const next = new Map<string, CartLine>(prev);
            const cur = next.get(code);
            if (cur) {
                const nextQty = Math.max(0, Math.min(20, cur.qty + delta));
                if (nextQty === 0) next.delete(code);
                else next.set(code, { ...cur, qty: nextQty });
            } else if (delta > 0 && item) {
                next.set(code, { code, name: item.name, price: item.price, qty: delta });
            }
            return next;
        });
    };

    const handleAddFromProposal = (it: LuckinProposalItem) => {
        if (!it?.code && !it?.name) return;
        if (!Object.keys(menuDict).length) {
            console.warn('☕ [Luckin-MiniApp] 拒绝加购: 当前菜单还没加载');
            return;
        }
        let realCode: string | undefined = menuDict[it.code || ''] ? it.code : undefined;
        let meal = realCode ? menuDict[realCode] : undefined;
        if (!meal) {
            const { fixed, fixes } = autoFixProposalCodesByName([it], menuDict);
            if (fixes.length && fixed[0]?.code && menuDict[fixed[0].code]) {
                realCode = fixed[0].code;
                meal = realCode ? menuDict[realCode] : undefined;
            }
        }
        if (!realCode || !meal) {
            console.warn(`☕ [Luckin-MiniApp] 拒绝加购: code='${it.code}' name='${it.name}' 不在当前菜单`);
            return;
        }
        const name = meal.name || it.name;
        for (let i = 0; i < (it.qty || 1); i++) updateCart(realCode, 1, { name, price: meal.price });
    };
    const handleAddAllFromProposal = (items: LuckinProposalItem[]) => { for (const it of items) handleAddFromProposal(it); };

    const handleOrderPlaced = (result: any) => {
        setOrderResult(result);
        if (ctx) onConfirmOrder?.((Array.from(cart.values()) as CartLine[]), ctx);
        setStep('success');
    };

    if (!open) return null;
    if (!isLuckinConfigured()) {
        return (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
                <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center" onClick={(e: any) => e.stopPropagation()}>
                    <div className="text-3xl mb-2">☕</div>
                    <div className="font-bold text-slate-800 mb-2">瑞幸还没开启</div>
                    <div className="text-[12px] text-slate-500 mb-4 leading-relaxed">请到设置 → 瑞幸填入 MCP token 并开启功能</div>
                    <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-[12px] font-bold">知道了</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
            <style>{`
                .luckin-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
                .luckin-scroll::-webkit-scrollbar-track { background: transparent; }
                .luckin-scroll::-webkit-scrollbar-thumb { background: rgba(37, 99, 235, 0.25); border-radius: 999px; }
                .luckin-scroll::-webkit-scrollbar-thumb:hover { background: rgba(37, 99, 235, 0.5); }
                .luckin-scroll { scrollbar-width: thin; scrollbar-color: rgba(37, 99, 235, 0.25) transparent; }
            `}</style>
            <div
                className="bg-gradient-to-b from-blue-50 to-sky-50 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
                style={{ height: '85vh', maxHeight: '85vh' }}
                onClick={(e: any) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-700 to-blue-500 shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🦌</span>
                        <div>
                            <div className="text-[13px] font-bold text-white">瑞幸咖啡</div>
                            <div className="text-[9px] text-white/70">官方 MCP · 直连下单</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center text-white active:scale-90">✕</button>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    {toolsErr && <ErrorBox msg={`拉取瑞幸工具清单失败: ${toolsErr}`} onRetry={() => listLuckinTools(true).then(setTools).catch((e) => setToolsErr(e?.message || String(e)))} />}
                    {step === 'mode' && (
                        <ModeStep onPick={(t: 1 | 2) => { setOrderType(t); setStep('pick'); }} />
                    )}
                    {step === 'pick' && orderType && (
                        <PickStep tools={tools} orderType={orderType} onBack={() => setStep('mode')} onPick={(c: OrderContext) => { setCtx(c); setStep('menu'); }} />
                    )}
                    {step === 'menu' && ctx && (
                        <MenuStep tools={tools} ctx={ctx} cart={cart} onCart={updateCart} onMenuLoaded={setMenuDict} onBack={() => setStep('pick')} onReview={() => setStep('review')} />
                    )}
                    {step === 'review' && ctx && (
                        <ReviewStep tools={tools} ctx={ctx} cart={cart} onCart={updateCart} onBack={() => setStep('menu')} onOrderPlaced={handleOrderPlaced} />
                    )}
                    {step === 'success' && orderResult && (
                        <SuccessStep orderResult={orderResult} onClose={onClose} />
                    )}
                </div>

                {char && step !== 'mode' && (
                    <InAppChat
                        char={char}
                        visibleMessages={visibleChatMessages}
                        isTyping={!!isTyping}
                        onSendMessage={onSendMessage}
                        onAddCartFromProposal={handleAddFromProposal}
                        onAddAllFromProposal={handleAddAllFromProposal}
                    />
                )}
            </div>
        </div>
    );
};

export default LuckinMiniApp;
export type { CartLine, OrderContext };
