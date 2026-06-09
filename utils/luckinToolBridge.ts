/**
 * 瑞幸 MCP 工具桥
 *
 * 职责 (与 mcdToolBridge 同构):
 * 1. 把 MCP 工具定义 (JSONSchema) 转成 OpenAI function-calling 的 tools 数组
 * 2. 给主对话注入"瑞幸点单服务"的 system 提示词
 * 3. 判定哪些工具属于"终结性"操作 (下单成功后自动结束瑞幸请求)
 * 4. 给前端 LuckinCard 一个"工具结果该渲染成什么卡片"的暗示函数
 * 5. LuckinMiniApp 协同模式: 实时快照 + 推荐工具
 *
 * 工具循环本身写在 useChatAI.ts 里。
 *
 * ⚠️ 瑞幸真实工具名/字段暂未跑通 tools/list 确认, 下面的 *_PATTERNS / 会话状态抽取
 *    全部用关键词模糊匹配 (兼容 query-menu / query-products / create-order /
 *    place-order 等各种命名), 不写死。等你填上 token、控制台打出真实工具清单后,
 *    可按需把关键词收紧成精确匹配。
 */

import { listLuckinTools, LuckinToolDef } from './luckinMcpClient';

// ========== OpenAI tools schema ==========

export interface OpenAITool {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters?: any;
    };
}

export const luckinToolsToOpenAI = (tools: LuckinToolDef[]): OpenAITool[] => {
    return tools.map(t => ({
        type: 'function' as const,
        function: {
            name: t.name,
            description: t.description || `瑞幸 MCP 工具 ${t.name}`,
            parameters: t.inputSchema && typeof t.inputSchema === 'object'
                ? t.inputSchema
                : { type: 'object', properties: {} },
        },
    }));
};

/** 拉工具并转成 OpenAI 兼容格式; 失败返回 null (调用方应跳过工具注入) */
export const fetchOpenAIToolsForLuckin = async (): Promise<OpenAITool[] | null> => {
    try {
        const tools = await listLuckinTools(false);
        if (!tools.length) return null;
        return luckinToolsToOpenAI(tools);
    } catch (e) {
        console.warn('[Luckin] 拉取工具失败, 跳过本轮工具注入:', e);
        return null;
    }
};

// ========== 提示词 ==========

export const LUCKIN_SYSTEM_PROMPT = `

---
[瑞幸点单助手已开启]

**你的本职**: 仍然是原来的角色; 瑞幸点单工具只是你顺手帮 TA 做的事, 不是你的身份。**每一轮永远要用角色的语气给一段文字回复**——哪怕只是一两句吐槽 / 关心 / 推荐, 哪怕这一轮调了工具拿到了卡片, 也要在卡片旁补一两句角色化的话。**绝不能空回**。

**何时调工具**: 用户明确想喝咖啡 / 点单 / 找门店 / 看菜单 / 查券 / 查订单时再调; 日常闲聊就照角色平时聊, 不调工具但仍要正常回话。可用工具来自瑞幸官方 (open.lkcoffee.com) 的点单 MCP——门店查询、商品浏览、购物车、优惠券/咖啡券、地址、订单; 用户明确同意时才能下单。

**关于卡片 (重要)**: 工具结果前端会自动渲染成卡片 (菜单卡 / 门店卡 / 地址卡 / 订单卡 / 券卡), 商品名、价格、图片用户都能直接看到。你的文字部分**只负责"角色味儿"**: 推荐时说"这个看着不错" / 调侃 / 关心。不要复读菜单, 不要画 markdown 表格, 不要列编码列价格 (卡片已显示)。也别说"菜单拉出来啦请选购"那种客服腔。

**真实数据 / 报错**: 工具数据是实时的, 按返回内容说话, 别自己编商品和价格。工具报错就如实告诉用户原因, 给个下一步建议 (重试 / 换门店 / 检查 token)。

**下单前**: 口语化念一下清单 (商品、规格、数量、取餐方式、门店/地址、合计), 等 TA 说"好 / 嗯 / 下吧"再继续。

---

# 通用下单工作流 (调到了再看)

1. **选门店**: 自提先查附近门店拿门店标识; 配送先选/查收货地址。
2. **拉菜单**: 查商品列表, 拿到每个商品的 code/规格。后续加购、算价、下单的商品标识都从这里来, **不要凭印象编 code**。
3. **规格**: 瑞幸饮品常有规格 (冷/热、糖度、加料、杯型), 下单前按工具 schema 把规格选项带齐, 缺了上游可能拒单。
4. **算价/确认**: 下单前先确认金额、优惠券是否生效。
5. **下单**: 用户明确同意后再调下单工具。
6. 工具报"空结果"多半是参数错 (门店标识 / 商品 code / 规格 不匹配): 先排查参数, 再换门店重试。
---
`;

/**
 * 尾部小提醒 (注入在 messages 数组的最后, 主消息之前)。
 * 长 context 下模型注意力会衰减, 头部提示词会被中段历史挤掉, 加一道短 reminder。
 */
export const LUCKIN_TAIL_REMINDER = `[瑞幸点单助手 ON · **永远用角色语气给一段文字回复, 别空回**; 工具结果有卡片自动展示, 别复读菜单 / 别画 markdown 表格; 下单链路: 选门店/地址 → 查菜单 → 选规格 → 算价确认 → 下单; 商品 code 必须来自查菜单的返回, 不要编; 数量用整数]`;

// ========== 终结性工具判定 (自动结束瑞幸请求) ==========

const TERMINAL_TOOL_PATTERNS: RegExp[] = [
    /create.*order/i,
    /submit.*order/i,
    /place.*order/i,
    /confirm.*order/i,
    /pay.*order/i,
    /one[-_]?click[-_]?order/i,
    /下单/i,
    /提交订单/i,
    /创建订单/i,
];

export const isTerminalToolCall = (toolName: string, success: boolean): boolean => {
    if (!success) return false;
    return TERMINAL_TOOL_PATTERNS.some(p => p.test(toolName));
};

// ========== 卡片类型暗示 (给前端 LuckinCard 用) ==========

export type LuckinCardKind = 'menu' | 'order' | 'store' | 'coupon' | 'activity' | 'address' | 'cart' | 'generic';

const MENU_PATTERNS = [
    /menu/i, /meal/i, /drink/i, /beverage/i, /product/i, /goods/i, /sku/i, /commodit/i, /item/i,
    /菜单/, /商品/, /饮品/, /咖啡/, /单品/, /菜品/,
    /query.*menu/i, /query.*product/i, /query.*goods/i, /list.*product/i, /list.*goods/i, /list.*menu/i,
    /get.*menu/i, /get.*product/i,
];
const STORE_PATTERNS = [/store/i, /shop/i, /门店/, /附近/, /nearby/i, /网点/];
const ADDRESS_PATTERNS = [/address/i, /地址/, /收货/, /consignee/i, /delivery.*area/i];
const COUPON_PATTERNS = [/coupon/i, /voucher/i, /券/, /redeem/i, /兑换/, /咖啡券/, /ticket/i];
const ACTIVITY_PATTERNS = [/activity/i, /event/i, /campaign/i, /活动/, /promotion/i];
const CART_PATTERNS = [/cart/i, /购物车/, /basket/i];
const ORDER_PATTERNS = [/order/i, /下单/, /订单/, /submit/i, /place.*order/i, /create.*order/i];

export const inferCardKind = (toolName: string): LuckinCardKind => {
    if (ORDER_PATTERNS.some(p => p.test(toolName))) return 'order';
    if (CART_PATTERNS.some(p => p.test(toolName))) return 'cart';
    if (ADDRESS_PATTERNS.some(p => p.test(toolName))) return 'address';
    if (MENU_PATTERNS.some(p => p.test(toolName))) return 'menu';
    if (STORE_PATTERNS.some(p => p.test(toolName))) return 'store';
    if (COUPON_PATTERNS.some(p => p.test(toolName))) return 'coupon';
    if (ACTIVITY_PATTERNS.some(p => p.test(toolName))) return 'activity';
    return 'generic';
};

// ========== 激活态从消息历史推导 ==========

export const LUCKIN_ACTIVATE_TRIGGER = '瑞幸请求';
export const LUCKIN_DEACTIVATE_TRIGGER = '结束瑞幸请求';

interface MsgLike {
    role: string;
    content?: string;
    metadata?: any;
    timestamp?: number;
    type?: string;
}

/** 从消息列表推导：当前 chatId 下"瑞幸请求"是否处于激活态 */
export const isLuckinActivatedInMessages = (messages: MsgLike[]): boolean => {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        const meta = m.metadata || {};
        if (meta.luckinDeactivate) return false;
        if (meta.luckinActivate) return true;
        if (m.role === 'user' && typeof m.content === 'string') {
            const c = m.content.trim();
            if (c === LUCKIN_DEACTIVATE_TRIGGER) return false;
            if (c === LUCKIN_ACTIVATE_TRIGGER) return true;
        }
    }
    return false;
};

// ========== LuckinMiniApp 协同模式: 给主 systemPrompt 追加的上下文块 ==========

export interface LuckinMiniAppSnapshot {
    open: boolean;
    step?: 'mode' | 'pick' | 'menu' | 'review';
    /** 1=自提/到店, 2=配送 (沿用麦当劳约定; 瑞幸真实取值待确认) */
    orderType?: 1 | 2;
    storeCode?: string;
    storeName?: string;
    addressLabel?: string;
    cart?: Array<{ code: string; name: string; price?: any; qty: number; spec?: string }>;
    /** 当前门店菜单 (code → {name, price}) */
    menuItems?: Record<string, { name?: string; price?: string; spec?: string }>;
}

/**
 * char 在小程序里能调的"建议加购"工具。
 * 不真改购物车, 只把建议作为一张"提案"卡渲染到 chat 面板, 让用户决定。
 */
export const LUCKIN_PROPOSE_TOOL = {
    type: 'function' as const,
    function: {
        name: 'propose_cart_items',
        description: '当你想给用户推荐 1~N 杯饮品/商品加进购物车时调用这工具。用户会在小程序聊天里看到一张"char 想加这些"小卡片, 每项带"+ 加进购物车"按钮自己决定。这不是真下单, 只是把推荐推到 UI。\n\n**前置硬条件**: 必须等到 system prompt 里出现"当前门店在售"清单后再调; 用户还在选模式 / 选门店阶段时菜单没加载, 任何 code 都是凭印象编的, 会被拒。这种时候用文字陪聊就好。',
        parameters: {
            type: 'object',
            properties: {
                items: {
                    type: 'array',
                    description: '推荐项列表 (1~6 件最佳)',
                    items: {
                        type: 'object',
                        properties: {
                            code: { type: 'string', description: '商品 code, **必须**是当前 system prompt 里"当前门店在售"清单 = 号左边那串。**绝对不能**用商品名当 code, 也不能用印象中/别店的 code。' },
                            name: { type: 'string', description: '商品名 (跟菜单一致)' },
                            qty: { type: 'integer', description: '推荐数量', minimum: 1, maximum: 10 },
                            reason: { type: 'string', description: '一句话说为什么推这个 (口味/搭配/划算), 30 字内' }
                        },
                        required: ['code', 'name', 'qty']
                    },
                    minItems: 1
                },
                overall_note: { type: 'string', description: '整体推荐理由 (可选, 50 字内)' }
            },
            required: ['items']
        }
    }
};

/**
 * 把 char 在 propose_cart_items 里塞的 items 里所有 code 按菜单校准 (完全匹配 → 子串匹配)。
 */
export const autoFixProposalCodesByName = (
    items: any[],
    menuItems: Record<string, { name?: string; price?: string }> | undefined
): { fixed: any[]; fixes: Array<{ from: string; to: string; name: string }> } => {
    const fixes: Array<{ from: string; to: string; name: string }> = [];
    if (!items?.length || !menuItems || !Object.keys(menuItems).length) {
        return { fixed: items || [], fixes };
    }
    const menuKeys = Object.keys(menuItems);
    const nameToCode: Record<string, string> = {};
    for (const k of menuKeys) {
        const nm = String(menuItems[k]?.name || '').trim();
        if (nm) nameToCode[nm] = k;
    }
    const fixed = items.map((it: any) => {
        const origCode = String(it?.code || '').trim();
        if (origCode && menuItems[origCode]) return it;
        const target = String(it?.name || origCode || '').trim();
        if (!target) return it;
        if (nameToCode[target]) {
            const realCode = nameToCode[target];
            fixes.push({ from: origCode, to: realCode, name: target });
            return { ...it, code: realCode, name: menuItems[realCode].name };
        }
        let bestKey: string | null = null;
        let bestLen = 0;
        for (const k of menuKeys) {
            const nm = String(menuItems[k]?.name || '').trim();
            if (!nm) continue;
            if (nm === target) { bestKey = k; bestLen = nm.length; break; }
            if (nm.includes(target) || target.includes(nm)) {
                if (nm.length > bestLen) { bestKey = k; bestLen = nm.length; }
            }
        }
        if (bestKey) {
            fixes.push({ from: origCode, to: bestKey, name: menuItems[bestKey].name || target });
            return { ...it, code: bestKey, name: menuItems[bestKey].name };
        }
        return it;
    });
    return { fixed, fixes };
};

export const buildLuckinMiniAppContextBlock = (snap?: LuckinMiniAppSnapshot, userName: string = '用户'): string => {
    if (!snap || !snap.open) return '';
    const lines: string[] = [];
    lines.push('');
    lines.push('---');
    lines.push(`[瑞幸协同点单 — ${userName} 现在打开了瑞幸小程序, 跟你一起选]`);
    lines.push('');
    lines.push('# 当前状态 (实时)');
    lines.push(`- 步骤: ${snap.step === 'mode' ? '选模式' : snap.step === 'pick' ? '选地址/门店' : snap.step === 'menu' ? '浏览菜单' : snap.step === 'review' ? '确认订单' : '?'}`);
    if (snap.orderType) lines.push(`- 取餐方式: ${snap.orderType === 1 ? '到店自提' : '外卖配送'}`);
    if (snap.storeName || snap.storeCode) lines.push(`- 门店: ${snap.storeName || snap.storeCode}`);
    if (snap.addressLabel) lines.push(`- 收货地址: ${snap.addressLabel}`);
    const cart = snap.cart || [];
    if (cart.length) {
        const total = cart.reduce((s, l) => {
            const p = typeof l.price === 'string' ? parseFloat(l.price) : (typeof l.price === 'number' ? l.price : 0);
            return s + (isFinite(p) ? p * l.qty : 0);
        }, 0);
        lines.push(`- 购物车 (${cart.length} 项, 合计 ¥${total.toFixed(2)}):`);
        for (const l of cart) {
            const p = typeof l.price === 'string' ? parseFloat(l.price) : (typeof l.price === 'number' ? l.price : 0);
            lines.push(`    · ${l.name}${l.spec ? ` (${l.spec})` : ''} ×${l.qty}${isFinite(p) && p > 0 ? ` (¥${p.toFixed(2)}/份)` : ''}`);
        }
    } else {
        lines.push(`- 购物车: 空`);
    }
    lines.push('');

    const menuLoaded = !!(snap.menuItems && Object.keys(snap.menuItems).length);
    if (!menuLoaded) {
        lines.push(`# 当前菜单: ❌ 还没加载 (用户还在选模式 / 选门店阶段)`);
        lines.push(`**这一阶段不要调 propose_cart_items**: 没有菜单字典, 你 propose 出去的任何 code 都会被拒。陪用户选门店就好, 文字回应即可; 等进入菜单页、system prompt 里出现"当前门店在售"清单后再说推荐。`);
        lines.push('');
    } else {
        const entries = Object.entries(snap.menuItems!).filter(([, m]: any) => m?.name).slice(0, 120);
        lines.push(`# 当前门店在售 (前 ${entries.length} 项, 推荐时从这里挑)`);
        lines.push('格式: `code=商品名 ¥价格` ← propose_cart_items 的 code 字段必须用这里的 code (= 号左边那串), 不要用商品名');
        for (const [code, m] of entries) {
            const v = m as any;
            if (!v?.name) continue;
            lines.push(`- ${code}=${v.name}${v.price ? ` ¥${v.price}` : ''}`);
        }
        lines.push('');
    }

    lines.push(`# 协同规则 (这段优先级高于其它通用规则)`);
    lines.push(`- ${userName} 在小程序里跟你聊"喝啥 / 帮我挑 / 这个怎么样", 你按平时人设自然回应。`);
    lines.push(`- 真要推荐具体商品时, **优先调 \`propose_cart_items\` 工具**把推荐推到 UI (用户会看到 "+ 加进购物车" 卡片自己决定)。`);
    lines.push(`- **propose 工具的 code 必须是菜单字典里的 key**, **绝对不能把商品名当 code 传**。code 错了用户加不到购物车。如果你不确定 code, 宁可不推。`);
    lines.push(`- 工具调用后**还可以继续聊**, 解释为啥推这些 / 调侃几句, 这是文字部分, 不要再复读商品名 (卡片里已显示)。`);
    lines.push(`- **不要画 markdown 表格 / 不要贴 code**, 那些信息小程序界面已经在显示。`);
    lines.push(`- **你不能直接改购物车 / 不能直接下单**, 工具只是推送建议, 加减、敲定都要 ${userName} 在小程序里自己点。`);
    lines.push('---');
    return lines.join('\n');
};

// ========== 会话状态沉淀 (关键词驱动, 不依赖精确工具名) ==========

interface LuckinSessionState {
    storeCode?: string;
    storeName?: string;
    orderType?: 1 | 2;
    addressId?: string;
    addressLabel?: string;
    knownProductCodes: Array<{ code: string; name?: string; price?: string | number }>;
    lastOrderId?: string;
}

const pickStr = (obj: any, keys: string[]): string | undefined => {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const k of keys) {
        const v = obj[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
        if (typeof v === 'number') return String(v);
    }
    return undefined;
};

/** 从一段任意结构里尽力抽出 "商品列表", 容忍 data.list / data.items / data.menu / 字典等多种形态 */
const collectProductCodes = (result: any): Array<{ code: string; name?: string; price?: string }> => {
    const out: Array<{ code: string; name?: string; price?: string }> = [];
    if (!result || typeof result !== 'object') return out;
    const pushItem = (m: any, codeHint?: string) => {
        if (!m || typeof m !== 'object') return;
        const code = codeHint || pickStr(m, ['code', 'productCode', 'goodsCode', 'skuCode', 'productId', 'skuId', 'goodsId', 'id']);
        if (!code) return;
        out.push({
            code,
            name: pickStr(m, ['name', 'goodsName', 'productName', 'title', 'commodityName']),
            price: pickStr(m, ['price', 'currentPrice', 'salePrice', 'sellPrice', 'realPrice']),
        });
    };
    const scanArray = (arr: any[]) => { for (const m of arr) pushItem(m); };
    const scanDict = (dict: any) => { for (const k of Object.keys(dict)) pushItem(dict[k], k); };
    // 常见容器键
    for (const key of ['items', 'products', 'goods', 'menu', 'menus', 'list', 'goodsList', 'skuList', 'commodities']) {
        const v = result[key];
        if (Array.isArray(v)) scanArray(v);
        else if (v && typeof v === 'object') scanDict(v);
    }
    if (Array.isArray(result)) scanArray(result);
    return out;
};

export const extractLuckinSessionState = (messages: MsgLike[]): LuckinSessionState => {
    const state: LuckinSessionState = { knownProductCodes: [] };
    let activateIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        const meta = m.metadata || {};
        if (meta.luckinDeactivate) break;
        if (meta.luckinActivate || (m.role === 'user' && typeof m.content === 'string' && m.content.trim() === LUCKIN_ACTIVATE_TRIGGER)) {
            activateIdx = i;
            break;
        }
    }
    if (activateIdx === -1) return state;

    const seenCodes = new Set<string>();
    for (let i = activateIdx; i < messages.length; i++) {
        const m: any = messages[i];
        const meta = m.metadata || {};
        if (meta.luckinDeactivate) break;
        if ((m.type as string) !== 'luckin_card') continue;
        const tool = String(meta.luckinToolName || '').toLowerCase();
        const args = meta.luckinToolArgs || {};
        const result = meta.luckinToolResult;
        if (meta.luckinToolError || result == null) continue;

        // 算价/下单的 args 里的门店/地址/取餐方式是最权威的当前决策
        if (/calculate|price|create.*order|place.*order|submit.*order/.test(tool)) {
            const sc = pickStr(args, ['storeCode', 'storeId', 'shopCode', 'shopId']);
            if (sc) state.storeCode = sc;
            const ai = pickStr(args, ['addressId']);
            if (ai) state.addressId = ai;
            const ot = args.orderType ?? args.deliveryMode ?? args.takeType;
            if (ot === 1 || ot === '1') state.orderType = 1;
            else if (ot === 2 || ot === '2') state.orderType = 2;
        }

        // 门店查询
        if (/store|shop|门店|nearby|网点/.test(tool)) {
            const list = Array.isArray(result) ? result : (result?.stores || result?.list || result?.shops);
            const first = Array.isArray(list) ? list[0] : null;
            if (first && typeof first === 'object') {
                if (!state.storeCode) state.storeCode = pickStr(first, ['storeCode', 'storeId', 'shopCode', 'shopId', 'code', 'id']);
                state.storeName = state.storeName || pickStr(first, ['storeName', 'shopName', 'name']);
                if (state.orderType == null) state.orderType = 1;
            }
        }

        // 地址查询
        if (/address|地址|收货/.test(tool)) {
            const list = result?.addresses || result?.list || result;
            const first = Array.isArray(list) ? list[0] : null;
            if (first && typeof first === 'object') {
                state.addressId = state.addressId || pickStr(first, ['addressId', 'id']);
                state.addressLabel = state.addressLabel || pickStr(first, ['fullAddress', 'address', 'detailAddress']);
                if (state.orderType == null) state.orderType = 2;
            }
        }

        // 菜单/商品: 累积 productCode
        if (/menu|product|goods|商品|菜单|饮品|sku|item/.test(tool)) {
            if (!state.storeCode) {
                const sc = pickStr(args, ['storeCode', 'storeId', 'shopCode', 'shopId']);
                if (sc) state.storeCode = sc;
            }
            for (const c of collectProductCodes(result)) {
                if (!seenCodes.has(c.code)) {
                    seenCodes.add(c.code);
                    state.knownProductCodes.push(c);
                }
            }
        }

        // 下单成功 → orderId
        if (/create.*order|place.*order|submit.*order|下单/.test(tool)) {
            const oid = pickStr(result, ['orderId', 'orderNo', 'orderCode']) || pickStr(result?.orderDetail, ['orderId', 'orderNo']);
            if (oid) state.lastOrderId = oid;
        }
    }
    return state;
};

export const buildLuckinSessionContextPrompt = (state: LuckinSessionState): string => {
    const lines: string[] = [];
    if (state.orderType) {
        lines.push(`- 取餐模式: ${state.orderType === 1 ? '到店自提' : '外卖配送'}`);
    }
    if (state.storeCode) {
        lines.push(`- 当前选中门店: ${state.storeCode}${state.storeName ? ` (${state.storeName})` : ''}`);
    }
    if (state.addressId) {
        lines.push(`- 当前选中 addressId: ${state.addressId}${state.addressLabel ? ` (${state.addressLabel})` : ''}`);
    }
    if (state.lastOrderId) {
        lines.push(`- 最近订单号: ${state.lastOrderId}`);
    }
    if (state.knownProductCodes.length) {
        const sample = state.knownProductCodes.slice(0, 30).map(p => {
            const priceStr = p.price ? ` ¥${p.price}` : '';
            return `${p.code}=${p.name || '?'}${priceStr}`;
        }).join(', ');
        const more = state.knownProductCodes.length > 30 ? ` ...还有 ${state.knownProductCodes.length - 30} 个` : '';
        lines.push(`- 当前门店下已确认存在的商品 code (从查菜单拿到的, 下单的 code 必须从这里选, 不要编):\n  ${sample}${more}`);
    }
    if (!lines.length) return '';
    return `\n[瑞幸本轮会话已沉淀的状态 — 调工具时直接复用下面这些 ID, 不要再问用户也不要重新查]\n${lines.join('\n')}\n`;
};
