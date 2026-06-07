/**
 * 彼方·剧院 面板 —— 场景内的话剧部门。
 *
 * 投稿池(浏览/写/LLM代写/传txt) → 选一本【编排】(选角+缺角roll NPC+调用模式+可润色)
 * → 并发收集演员意见(已就绪/吐槽) → 【召唤导演】整合最终本 → 小人气泡演出
 * → 收录【历史舞台剧】+ 回发各参演角色聊天。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { X, CaretLeft, CaretRight, Plus, Trash, Sparkle, Play, FilmSlate, UploadSimple, DownloadSimple } from '@phosphor-icons/react';
import { DB } from '../../utils/db';
import { IslandButton, IslandInput, IslandSelect, IslandModal, IslandCard, ISLAND } from '../../components/island/IslandUI';
import { SCRIPT_TEMPLATE, PLAY_LITERARY_STYLES, PLAY_ART_STYLES } from '../../utils/vrWorld/constants';
import { resolveTheaterApi, generateScript, polishScript, collectActorNotes, charActorCount, runDirector, type TheaterCtx } from '../../utils/vrWorld/theater';
import { rollNpcChibi, randomNpcName } from '../../utils/vrWorld/npcRoll';
import type { VRScript, VRStagedPlay, VRCastAssign, VRActorNote, VRStageMode, VRPlayRole, Emoji, EmojiCategory } from '../../types';

const tid = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** 把上传的 txt 解析成剧本（尽量贴模板，解析不出就整段当正文）。 */
function parseUploadedScript(text: string, fallbackTitle: string): { title: string; logline: string; roles: VRPlayRole[]; body: string } {
    const grab = (label: string) => {
        const m = text.match(new RegExp(`${label}\\s*[:：]\\s*(.+)`));
        return m ? m[1].trim() : '';
    };
    const title = grab('标题') || fallbackTitle;
    const logline = grab('简介');
    const roles: VRPlayRole[] = [];
    const rolesBlock = text.match(/登场角色\s*[:：]?\s*\n([\s\S]*?)(?:\n\s*正文|\n\s*$)/);
    if (rolesBlock) {
        for (const raw of rolesBlock[1].split('\n')) {
            const l = raw.replace(/^[-·•\s]+/, '').trim();
            if (!l) continue;
            const [name, ...rest] = l.split(/[|｜/／:：]/);
            if (name.trim()) roles.push({ name: name.trim(), persona: rest.join('/').trim() });
        }
    }
    const bodyM = text.match(/正文\s*[:：]?\s*\n([\s\S]*)$/);
    const body = (bodyM ? bodyM[1] : text).trim();
    return { title, logline, roles, body };
}

type View = 'list' | 'script' | 'stage' | 'play';

const TheaterPanel: React.FC<{ addToast?: (m: string, t?: any) => void }> = ({ addToast }) => {
    const { characters, userProfile, groups, apiConfig } = useOS();
    const [tab, setTab] = useState<'scripts' | 'history'>('scripts');
    const [scripts, setScripts] = useState<VRScript[]>([]);
    const [plays, setPlays] = useState<VRStagedPlay[]>([]);
    const [view, setView] = useState<View>('list');
    const [cur, setCur] = useState<VRScript | null>(null);
    const [curPlay, setCurPlay] = useState<VRStagedPlay | null>(null);
    const [page, setPage] = useState(0);
    const [emojis, setEmojis] = useState<Emoji[]>([]);
    const [categories, setCategories] = useState<EmojiCategory[]>([]);

    // 新建剧本弹窗
    const [writeOpen, setWriteOpen] = useState(false);
    const [llmOpen, setLlmOpen] = useState(false);

    const reload = useCallback(async () => {
        setScripts(await DB.getVRScripts());
        setPlays(await DB.getVRStagedPlays());
    }, []);
    useEffect(() => {
        void reload();
        void (async () => { setEmojis(await DB.getEmojis()); setCategories(await DB.getEmojiCategories()); })();
        const onDone = () => { void reload(); };
        window.addEventListener('vr-session-done', onDone);
        return () => window.removeEventListener('vr-session-done', onDone);
    }, [reload]);

    const ctx: TheaterCtx = useMemo(() => ({ characters, userProfile: userProfile!, groups, emojis, categories }), [characters, userProfile, groups, emojis, categories]);

    const PER = 6;
    const totalPages = Math.max(1, Math.ceil(scripts.length / PER));
    const shown = scripts.slice(page * PER, page * PER + PER);

    const openScript = (s: VRScript) => { setCur(s); setView('script'); };
    const startStaging = (s: VRScript) => { setCur(s); setView('stage'); };
    const openPlay = (p: VRStagedPlay) => { setCurPlay(p); setView('play'); };

    // ── 顶部面板容器 ──
    return (
        <>
            <div className="absolute left-3 right-3 z-20 rounded-2xl overflow-hidden flex flex-col backdrop-blur-md"
                style={{ top: 'calc(var(--chrome-top) + 3.75rem)', bottom: 'calc(var(--safe-bottom) + 0.75rem)', background: 'rgba(28,12,16,0.5)', border: '1px solid rgba(244,170,170,0.28)', boxShadow: '0 8px 26px rgba(0,0,0,.4)' }}>
                {/* tabs */}
                <div className="flex items-center gap-3 px-3 py-2 border-b border-white/10">
                    {(['scripts', 'history'] as const).map(t => (
                        <button key={t} onClick={() => { setTab(t); setView('list'); }}
                            className="text-[11px] tracking-[0.2em] pb-0.5"
                            style={{ fontFamily: `'Noto Serif SC',serif`, color: tab === t ? '#ffd9d9' : 'rgba(255,255,255,.4)', borderBottom: tab === t ? '1px solid #f5a6a6' : '1px solid transparent' }}>
                            {t === 'scripts' ? '剧本投稿' : '历史舞台剧'}
                        </button>
                    ))}
                    <span className="ml-auto text-[9px] text-rose-100/45">{tab === 'scripts' ? `${scripts.length} 份剧本` : `${plays.length} 场演出`}</span>
                </div>

                <div className="flex-1 overflow-y-auto vr-reader-scroll p-3">
                    {/* ============ 剧本列表 ============ */}
                    {tab === 'scripts' && view === 'list' && (
                        <>
                            <div className="flex gap-2 mb-3 flex-wrap">
                                <IslandButton size="small" type="primary" icon={<Plus size={13} weight="bold" />} onClick={() => setWriteOpen(true)}>我来写</IslandButton>
                                <IslandButton size="small" icon={<Sparkle size={13} weight="bold" />} onClick={() => setLlmOpen(true)}>LLM 代写</IslandButton>
                                <UploadButton onParsed={async (p) => {
                                    const s: VRScript = { id: tid('scr'), ...p, authorId: 'user', authorName: userProfile?.name || '我', source: 'upload', createdAt: Date.now() };
                                    await DB.saveVRScript(s); await reload(); addToast?.(`已收录《${s.title}》`, 'success');
                                }} />
                            </div>
                            {scripts.length === 0 ? (
                                <p className="text-[11px] text-rose-50/60 text-center py-10 leading-relaxed">剧本箱还空着。<br />让角色逛进剧院写一出，或你自己投一稿。</p>
                            ) : (
                                <div className="space-y-2">
                                    {shown.map(s => (
                                        <button key={s.id} onClick={() => openScript(s)} className="w-full text-left rounded-xl p-2.5 active:scale-[0.99] transition-transform"
                                            style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
                                            <div className="flex items-center gap-1.5">
                                                <FilmSlate size={13} weight="fill" className="text-rose-200/80 shrink-0" />
                                                <span className="text-[12.5px] font-bold text-rose-50 truncate">《{s.title}》</span>
                                                <span className="ml-auto text-[8.5px] text-rose-100/40 shrink-0">{s.authorName}</span>
                                            </div>
                                            {s.logline && <p className="text-[10.5px] text-rose-100/65 mt-0.5 leading-snug line-clamp-2">{s.logline}</p>}
                                            <p className="text-[8.5px] text-rose-100/35 mt-1">{s.roles.length} 个角色 · {new Date(s.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</p>
                                        </button>
                                    ))}
                                    {totalPages > 1 && (
                                        <div className="flex items-center justify-center gap-3 pt-1">
                                            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="h-6 w-6 rounded-full flex items-center justify-center text-white/60 disabled:opacity-25" style={{ border: '1px solid rgba(255,255,255,.14)' }}><CaretLeft size={11} weight="bold" /></button>
                                            <span className="text-[10px] text-white/45 tabular-nums">{page + 1}/{totalPages}</span>
                                            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="h-6 w-6 rounded-full flex items-center justify-center text-white/60 disabled:opacity-25" style={{ border: '1px solid rgba(255,255,255,.14)' }}><CaretRight size={11} weight="bold" /></button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* ============ 历史舞台剧 ============ */}
                    {tab === 'history' && view === 'list' && (
                        plays.length === 0 ? (
                            <p className="text-[11px] text-rose-50/60 text-center py-10 leading-relaxed">还没有演出。<br />去剧本投稿里挑一本【编排】上演吧。</p>
                        ) : (
                            <div className="space-y-2">
                                {plays.map(p => (
                                    <button key={p.id} onClick={() => openPlay(p)} className="w-full text-left rounded-xl p-2.5 active:scale-[0.99] transition-transform"
                                        style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[12.5px] font-bold text-rose-50 truncate">《{p.title}》</span>
                                            <span className="ml-auto text-[10px] font-bold shrink-0" style={{ color: '#ffd97a' }}>{p.rating?.split(/\s/)[0]}</span>
                                        </div>
                                        <p className="text-[9.5px] text-rose-100/55 mt-0.5">{p.cast.map(c => c.actorName).join('、')}</p>
                                    </button>
                                ))}
                            </div>
                        )
                    )}

                    {/* ============ 看剧本 ============ */}
                    {view === 'script' && cur && (
                        <ScriptView script={cur} onBack={() => setView('list')} onStage={() => startStaging(cur)}
                            onDelete={async () => { await DB.deleteVRScript(cur.id); await reload(); setView('list'); addToast?.('已删除', 'success'); }} />
                    )}

                    {/* ============ 编排 ============ */}
                    {view === 'stage' && cur && (
                        <StageView script={cur} ctx={ctx} apiConfig={apiConfig} addToast={addToast}
                            onBack={() => setView('list')}
                            onPolished={(body) => setCur({ ...cur, body })}
                            onStaged={async (play) => { await DB.saveVRStagedPlay(play); await reload(); setCurPlay(play); setView('play'); }} />
                    )}

                    {/* ============ 演出回放 ============ */}
                    {view === 'play' && curPlay && (
                        <PlaybackView play={curPlay} characters={characters} onBack={() => { setView('list'); setTab('history'); }} />
                    )}
                </div>
            </div>

            {/* 我来写 */}
            <WriteScriptModal open={writeOpen} onClose={() => setWriteOpen(false)}
                onSave={async (p) => {
                    const s: VRScript = { id: tid('scr'), ...p, authorId: 'user', authorName: userProfile?.name || '我', source: 'user', createdAt: Date.now() };
                    await DB.saveVRScript(s); await reload(); setWriteOpen(false); addToast?.(`已投稿《${s.title}》`, 'success');
                }} />

            {/* LLM 代写 */}
            <LLMScriptModal open={llmOpen} onClose={() => setLlmOpen(false)} apiConfig={apiConfig} addToast={addToast}
                onSaved={async () => { await reload(); setLlmOpen(false); }} />
        </>
    );
};

// ============ 看剧本 ============
const ScriptView: React.FC<{ script: VRScript; onBack: () => void; onStage: () => void; onDelete: () => void }> = ({ script, onBack, onStage, onDelete }) => (
    <div>
        <div className="flex items-center gap-2 mb-2">
            <button onClick={onBack} className="text-rose-100/70 p-1 -ml-1"><CaretLeft size={18} /></button>
            <span className="text-[13px] font-bold text-rose-50 truncate">《{script.title}》</span>
            <button onClick={onDelete} className="ml-auto text-rose-300/50 p-1"><Trash size={15} /></button>
        </div>
        {script.logline && <p className="text-[11px] text-rose-100/70 mb-2 italic">{script.logline}</p>}
        <div className="text-[10px] text-rose-100/55 mb-2">登场：{script.roles.map(r => `${r.name}（${r.persona}）`).join('、') || '—'}</div>
        <pre className="text-[11px] text-rose-50/85 whitespace-pre-wrap leading-relaxed rounded-lg p-2.5 mb-3" style={{ background: 'rgba(0,0,0,.22)', fontFamily: 'inherit' }}>{script.body}</pre>
        <IslandButton type="primary" block icon={<FilmSlate size={14} weight="fill" />} onClick={onStage}>编排这出戏</IslandButton>
    </div>
);

// ============ 编排 ============
const StageView: React.FC<{
    script: VRScript; ctx: TheaterCtx; apiConfig: any; addToast?: (m: string, t?: any) => void;
    onBack: () => void; onPolished: (body: string) => void; onStaged: (play: VRStagedPlay) => void;
}> = ({ script, ctx, apiConfig, addToast, onBack, onPolished, onStaged }) => {
    const [step, setStep] = useState<'cast' | 'notes'>('cast');
    const [assign, setAssign] = useState<Record<string, VRCastAssign>>({});
    const [mode, setMode] = useState<VRStageMode>('per-role');
    const [busy, setBusy] = useState<string>('');     // 进度文案
    const [notes, setNotes] = useState<VRActorNote[]>([]);
    const [polishOpen, setPolishOpen] = useState(false);
    const [rolling, setRolling] = useState<string>('');

    const charOpts = useMemo(() => [{ key: '', label: '— 选演员 —' }, ...ctx.characters.map(c => ({ key: c.id, label: c.name }))], [ctx.characters]);
    const cast = useMemo(() => script.roles.map(r => assign[r.name]).filter(Boolean) as VRCastAssign[], [assign, script.roles]);
    const allCast = cast.length === script.roles.length && script.roles.length > 0;
    const charCount = charActorCount(cast);

    const setChar = (role: VRPlayRole, charId: string) => {
        if (!charId) { setAssign(a => { const n = { ...a }; delete n[role.name]; return n; }); return; }
        const ch = ctx.characters.find(c => c.id === charId);
        if (!ch) return;
        setAssign(a => ({ ...a, [role.name]: { roleName: role.name, actorId: ch.id, actorName: ch.name, isNpc: false } }));
    };
    const rollNpc = async (role: VRPlayRole) => {
        setRolling(role.name);
        const used = Object.values(assign).map(c => c.actorName);
        const name = randomNpcName(used);
        const npc = await rollNpcChibi();
        setAssign(a => ({ ...a, [role.name]: { roleName: role.name, actorId: tid('npc'), actorName: name, isNpc: true, npcChibi: npc?.img } }));
        setRolling('');
        addToast?.(npc ? `捏了个 NPC：${name}` : `NPC ${name}（立绘没出来，用占位）`, npc ? 'success' : 'error');
    };

    const runStaging = async () => {
        const api = await resolveTheaterApi(apiConfig);
        if (!api) { addToast?.('没配 API，去「API」标签填一下', 'error'); return; }
        setBusy(mode === 'two-call' ? '演员们在读剧本（固定2次调用）…' : `${charCount} 位演员在各自读剧本…`);
        try {
            const result = await collectActorNotes(script, cast, mode, ctx, api);
            setNotes(result);
            setStep('notes');
            // 把"改了戏/有意见"回发到各 char 聊天
            for (const n of result) {
                if (n.actorId.startsWith('npc')) continue;
                const act = !n.cooperative
                    ? `对舞台剧《${script.title}》有点抵触，觉得：${n.note}`
                    : n.changes
                        ? `修改了舞台剧《${script.title}》的内容，觉得：${n.note}`
                        : `读了舞台剧《${script.title}》，觉得：${n.note}`;
                await DB.saveMessage({ charId: n.actorId, role: 'assistant', type: 'vr_card', content: `「彼方 · 剧院」${n.actorName}${act}`, metadata: { vrCard: true, room: 'theater', activity: act, behavior: n.changes } } as any);
            }
        } catch (e: any) {
            addToast?.('编排失败：' + (e?.message || '检查网络/API'), 'error');
        } finally { setBusy(''); }
    };

    const summonDirector = async () => {
        const api = await resolveTheaterApi(apiConfig);
        if (!api) { addToast?.('没配 API', 'error'); return; }
        setBusy('导演在整合最终本…');
        try {
            const d = await runDirector(script, cast, notes, api);
            const play: VRStagedPlay = {
                id: tid('play'), scriptId: script.id, title: script.title, logline: script.logline,
                cast, notes, stage: d.stage, reviews: d.reviews, rating: d.rating, createdAt: Date.now(),
            };
            // 回发各参演 char：本场落幕
            const castNames = cast.map(c => c.actorName).join('、');
            for (const c of cast) {
                if (c.isNpc) continue;
                const act = `参演的舞台剧《${script.title}》落幕了（演员：${castNames}）。综评 ${d.rating}`;
                await DB.saveMessage({ charId: c.actorId, role: 'assistant', type: 'vr_card', content: `「彼方 · 剧院」${act}`, metadata: { vrCard: true, room: 'theater', activity: act } } as any);
            }
            onStaged(play);
        } catch (e: any) {
            addToast?.('导演罢工了：' + (e?.message || '检查网络/API'), 'error');
        } finally { setBusy(''); }
    };

    if (busy) return (
        <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-7 w-7 border-2 border-rose-200/30 border-t-rose-200 mb-3" />
            <p className="text-[11.5px] text-rose-100/75">{busy}</p>
        </div>
    );

    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <button onClick={onBack} className="text-rose-100/70 p-1 -ml-1"><CaretLeft size={18} /></button>
                <span className="text-[13px] font-bold text-rose-50 truncate">编排《{script.title}》</span>
            </div>

            {step === 'cast' && (
                <>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] tracking-wider text-rose-100/55">选角</span>
                        <IslandButton size="small" icon={<Sparkle size={12} />} onClick={() => setPolishOpen(true)}>润色剧本</IslandButton>
                    </div>
                    <div className="space-y-2 mb-3">
                        {script.roles.map(r => {
                            const a = assign[r.name];
                            return (
                                <div key={r.name} className="rounded-xl p-2" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
                                    <div className="text-[11px] font-bold text-rose-50">{r.name} <span className="text-[9px] font-normal text-rose-100/45">{r.persona}</span></div>
                                    {a?.isNpc ? (
                                        <div className="flex items-center gap-2 mt-1.5">
                                            {a.npcChibi ? <img src={a.npcChibi} className="h-7 w-7 object-contain" alt="" /> : <div className="h-7 w-7 rounded-full bg-rose-400/40 flex items-center justify-center text-[10px]">{a.actorName.slice(0, 1)}</div>}
                                            <span className="text-[11px] text-rose-50">{a.actorName} <span className="text-[8.5px] text-rose-200/50">NPC</span></span>
                                            <button onClick={() => setChar(r, '')} className="ml-auto text-rose-300/50 p-1"><X size={13} /></button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                            <div className="flex-1"><IslandSelect value={a?.actorId || ''} onChange={(v) => setChar(r, v)} options={charOpts} /></div>
                                            <IslandButton size="small" disabled={!!rolling} onClick={() => rollNpc(r)}>{rolling === r.name ? '🎲…' : '🎲NPC'}</IslandButton>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* 调用模式 */}
                    <div className="text-[10px] tracking-wider text-rose-100/55 mb-1.5">演员表演方式</div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        {([['per-role', '逐角色', `每位角色各调一次 LLM（精准、贴人设）`], ['two-call', '固定两次', `1 次搞定全部演员（省，但可能 OOC）`]] as const).map(([m, t, d]) => (
                            <button key={m} onClick={() => setMode(m)} className="rounded-xl p-2 text-left" style={{ background: mode === m ? 'rgba(245,166,166,.16)' : 'rgba(255,255,255,.04)', border: `1px solid ${mode === m ? 'rgba(245,166,166,.6)' : 'rgba(255,255,255,.1)'}` }}>
                                <div className="text-[11px] font-bold text-rose-50">{t}</div>
                                <div className="text-[8.5px] text-rose-100/60 leading-snug mt-0.5">{d}</div>
                            </button>
                        ))}
                    </div>
                    <p className="text-[9px] text-rose-100/45 mb-2 text-center">
                        本次约调用 <b className="text-rose-200">{mode === 'two-call' ? (charCount > 0 ? 2 : 1) : charCount + 1}</b> 次 LLM
                        {mode === 'per-role' ? `（${charCount} 位角色 + 1 位导演；NPC 不计）` : '（演员 1 次 + 导演 1 次）'}
                    </p>
                    <IslandButton type="primary" block disabled={!allCast} onClick={runStaging}>
                        {allCast ? '开始编排 →' : '先给每个角色选演员'}
                    </IslandButton>
                </>
            )}

            {step === 'notes' && (
                <>
                    <div className="text-[10px] tracking-wider text-rose-100/55 mb-2">演员就位 · 各自的意见</div>
                    <div className="space-y-2 mb-3">
                        {notes.map((n, i) => <ActorNoteCard key={i} note={n} cast={cast} characters={ctx.characters} />)}
                    </div>
                    <IslandButton type="primary" block icon={<FilmSlate size={14} weight="fill" />} onClick={summonDirector}>召唤导演 · 整合最终本</IslandButton>
                </>
            )}

            <PolishModal open={polishOpen} onClose={() => setPolishOpen(false)} apiConfig={apiConfig} body={script.body} addToast={addToast}
                onPolished={(body) => { onPolished(body); setPolishOpen(false); addToast?.('润色好啦', 'success'); }} />
        </div>
    );
};

const ActorNoteCard: React.FC<{ note: VRActorNote; cast: VRCastAssign[]; characters: any[] }> = ({ note, cast, characters }) => {
    const [open, setOpen] = useState(false);
    const assign = cast.find(c => c.actorId === note.actorId);
    const ch = characters.find(c => c.id === note.actorId);
    const img = assign?.npcChibi || ch?.avatar;
    return (
        <button onClick={() => setOpen(o => !o)} className="w-full text-left rounded-xl p-2" style={{ background: 'rgba(255,255,255,.05)', border: `1px solid ${note.cooperative ? 'rgba(255,255,255,.1)' : 'rgba(244,120,120,.4)'}` }}>
            <div className="flex items-center gap-2">
                {img ? <img src={img} className="h-7 w-7 object-contain rounded-full" alt="" /> : <div className="h-7 w-7 rounded-full bg-rose-400/40 flex items-center justify-center text-[10px] text-white">{note.actorName.slice(0, 1)}</div>}
                <span className="text-[11px] font-bold text-rose-50">{note.actorName}</span>
                <span className="text-[8.5px] text-rose-100/45">饰 {note.roleName}</span>
                <span className="ml-auto text-[9px]" style={{ color: note.cooperative ? '#86e3b0' : '#f5a6a6' }}>{note.cooperative ? '已就绪' : '有意见'}</span>
            </div>
            <p className="text-[10.5px] text-rose-100/75 mt-1 leading-snug">{note.note}</p>
            {open && note.changes && <p className="text-[10px] text-amber-100/70 mt-1 pl-2 border-l-2 border-amber-300/40 leading-snug">改：{note.changes}</p>}
        </button>
    );
};

// ============ 演出回放 ============
const PlaybackView: React.FC<{ play: VRStagedPlay; characters: any[]; onBack: () => void }> = ({ play, characters, onBack }) => {
    const [i, setI] = useState(0);
    const beats = play.stage;
    const ended = i >= beats.length;

    // 当前在台上的演员（按 enter/exit 推算到第 i 拍）
    const onStage = useMemo(() => {
        const s = new Set<string>();
        for (let k = 0; k <= Math.min(i, beats.length - 1); k++) {
            const b = beats[k];
            if (b.kind === 'enter' && b.actorName) s.add(b.actorName);
            if (b.kind === 'exit' && b.actorName) s.delete(b.actorName);
        }
        // 没有 enter 标记的剧本：默认全员在台
        if (s.size === 0) play.cast.forEach(c => s.add(c.actorName));
        return s;
    }, [i, beats, play.cast]);

    const imgOf = (actorName: string) => {
        const a = play.cast.find(c => c.actorName === actorName);
        if (a?.npcChibi) return a.npcChibi;
        const ch = characters.find(c => c.id === a?.actorId);
        return ch?.avatar as string | undefined;
    };

    const beat = beats[Math.min(i, beats.length - 1)];
    const speaker = beat?.kind === 'line' ? beat.actorName : undefined;

    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <button onClick={onBack} className="text-rose-100/70 p-1 -ml-1"><CaretLeft size={18} /></button>
                <span className="text-[13px] font-bold text-rose-50 truncate">《{play.title}》</span>
                <span className="ml-auto text-[10px] font-bold" style={{ color: '#ffd97a' }}>{play.rating?.split(/\s/)[0]}</span>
            </div>

            {/* 舞台 */}
            <div className="rounded-xl mb-3 relative overflow-hidden" style={{ height: 220, background: 'linear-gradient(180deg,#3a0d14 0%,#1c0608 100%)', border: '1px solid rgba(244,170,170,.25)' }}>
                {/* 幕布 */}
                <div className="absolute top-0 left-0 right-0 h-5" style={{ background: 'repeating-linear-gradient(90deg,#7a1020 0 10px,#a11528 10px 20px)' }} />
                {/* 台词/旁白气泡 */}
                {!ended && beat && (
                    <div className="absolute left-3 right-3 top-7 z-10">
                        {beat.kind === 'narration' ? (
                            <div className="text-center text-[10.5px] text-rose-100/80 italic px-3 py-1.5 rounded-lg" style={{ background: 'rgba(0,0,0,.4)' }}>（{beat.text}）</div>
                        ) : beat.kind === 'line' ? (
                            <div className="px-3 py-2 rounded-2xl text-[12px] text-stone-800 font-medium mx-auto w-fit max-w-full" style={{ background: '#fff7ea', boxShadow: '0 3px 0 rgba(0,0,0,.25)' }}>
                                <span className="text-[9px] text-rose-500 font-bold block">{beat.actorName}</span>{beat.text}
                            </div>
                        ) : (
                            <div className="text-center text-[9.5px] text-rose-200/60">（{beat.actorName} {beat.kind === 'enter' ? '上场' : '下场'}）</div>
                        )}
                    </div>
                )}
                {/* 演员小人 */}
                <div className="absolute bottom-2 left-0 right-0 flex items-end justify-center gap-3 px-3">
                    {[...onStage].map(name => {
                        const img = imgOf(name);
                        const active = name === speaker;
                        return (
                            <div key={name} className="flex flex-col items-center transition-transform" style={{ transform: active ? 'translateY(-4px) scale(1.08)' : 'none', opacity: active || !speaker ? 1 : 0.6 }}>
                                {img ? <img src={img} className="h-16 object-contain" style={{ filter: active ? 'drop-shadow(0 0 8px rgba(255,210,120,.6))' : 'none' }} alt="" /> : <div className="h-12 w-12 rounded-full bg-rose-400/50 flex items-center justify-center text-white text-sm">{name.slice(0, 1)}</div>}
                                <span className="text-[8px] text-rose-50/80 mt-0.5">{name}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {!ended ? (
                <div className="flex items-center gap-2">
                    <span className="text-[9px] text-rose-100/40 tabular-nums">{Math.min(i + 1, beats.length)}/{beats.length}</span>
                    <div className="ml-auto flex gap-2">
                        {i > 0 && <IslandButton size="small" onClick={() => setI(x => Math.max(0, x - 1))}>上一拍</IslandButton>}
                        <IslandButton size="small" type="primary" icon={<Play size={12} weight="fill" />} onClick={() => setI(x => x + 1)}>下一拍</IslandButton>
                    </div>
                </div>
            ) : (
                <div>
                    <div className="text-[10px] tracking-wider text-rose-100/55 mb-1.5">谢幕 · 观众席</div>
                    <div className="space-y-1.5 mb-2">
                        {play.reviews.map((r, k) => (
                            <div key={k} className="rounded-lg p-2 text-[10.5px]" style={{ background: 'rgba(255,255,255,.05)' }}>
                                <b className="text-rose-200/80">{r.critic}</b><span className="text-rose-50/80">：{r.text}</span>
                            </div>
                        ))}
                    </div>
                    <div className="text-center text-[12px] font-bold mb-3" style={{ color: '#ffd97a' }}>综合评级：{play.rating}</div>
                    <div className="flex gap-2">
                        <IslandButton block onClick={() => setI(0)}>重看一遍</IslandButton>
                        <IslandButton block type="primary" onClick={onBack}>收工</IslandButton>
                    </div>
                </div>
            )}
        </div>
    );
};

// ============ 弹窗：我来写 ============
const WriteScriptModal: React.FC<{ open: boolean; onClose: () => void; onSave: (p: { title: string; logline: string; roles: VRPlayRole[]; body: string }) => void }> = ({ open, onClose, onSave }) => {
    const [title, setTitle] = useState(''); const [logline, setLogline] = useState('');
    const [rolesText, setRolesText] = useState(''); const [body, setBody] = useState('');
    const submit = () => {
        const roles = rolesText.split('\n').map(l => l.replace(/^[-·•\s]+/, '').trim()).filter(Boolean).map(l => { const [n, ...r] = l.split(/[|｜/／:：]/); return { name: (n || '').trim(), persona: r.join('/').trim() }; }).filter(r => r.name);
        if (!title.trim() || !body.trim()) return;
        onSave({ title: title.trim(), logline: logline.trim(), roles, body: body.trim() });
        setTitle(''); setLogline(''); setRolesText(''); setBody('');
    };
    return (
        <IslandModal open={open} title="我来写一出" width={360} onClose={onClose}
            footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><IslandButton onClick={onClose}>取消</IslandButton><IslandButton type="primary" onClick={submit}>投稿</IslandButton></div>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '52vh', overflowY: 'auto' }}>
                <IslandInput value={title} onChange={e => setTitle(e.target.value)} placeholder="剧名" />
                <IslandInput value={logline} onChange={e => setLogline(e.target.value)} placeholder="一句话简介（可空）" />
                <textarea value={rolesText} onChange={e => setRolesText(e.target.value)} rows={2} placeholder="登场角色，每行一个：角色名|性格" style={taStyle} />
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={7} placeholder="正文（角色名：台词 / 动作写进圆括号）" style={taStyle} />
            </div>
        </IslandModal>
    );
};

// ============ 弹窗：LLM 代写 ============
const LLMScriptModal: React.FC<{ open: boolean; onClose: () => void; apiConfig: any; addToast?: (m: string, t?: any) => void; onSaved: () => void }> = ({ open, onClose, apiConfig, addToast, onSaved }) => {
    const { userProfile } = useOS();
    const [brief, setBrief] = useState(''); const [busy, setBusy] = useState(false);
    const gen = async () => {
        const api = await resolveTheaterApi(apiConfig);
        if (!api) { addToast?.('没配 API', 'error'); return; }
        setBusy(true);
        try {
            const p = await generateScript(brief, api);
            const s: VRScript = { id: tid('scr'), title: p.title, logline: p.logline, roles: p.roles, body: p.body, authorId: 'llm', authorName: 'LLM 编剧', source: 'llm', createdAt: Date.now() };
            await DB.saveVRScript(s); addToast?.(`写好了《${s.title}》`, 'success'); setBrief(''); onSaved();
        } catch (e: any) { addToast?.('代写失败：' + (e?.message || ''), 'error'); }
        finally { setBusy(false); }
    };
    return (
        <IslandModal open={open} title="LLM 代写" width={340} onClose={busy ? undefined : onClose} maskClosable={!busy}
            footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><IslandButton onClick={onClose} disabled={busy}>取消</IslandButton><IslandButton type="primary" disabled={busy} onClick={gen}>{busy ? '写作中…' : '写'}</IslandButton></div>}>
            <div style={{ color: ISLAND.text }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>想看什么样的戏？</div>
                <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={3} placeholder="风格 / 主题 / 任意脑洞，如：荒诞喜剧，两个困在电梯里的陌生人" style={taStyle} />
            </div>
        </IslandModal>
    );
};

// ============ 弹窗：润色 ============
const PolishModal: React.FC<{ open: boolean; onClose: () => void; apiConfig: any; body: string; addToast?: (m: string, t?: any) => void; onPolished: (body: string) => void }> = ({ open, onClose, apiConfig, body, addToast, onPolished }) => {
    const [lit, setLit] = useState(''); const [art, setArt] = useState(''); const [extra, setExtra] = useState(''); const [busy, setBusy] = useState(false);
    const run = async () => {
        const api = await resolveTheaterApi(apiConfig);
        if (!api) { addToast?.('没配 API', 'error'); return; }
        setBusy(true);
        try { const p = await polishScript(body, lit, art, extra, api); onPolished(p.body); }
        catch (e: any) { addToast?.('润色失败：' + (e?.message || ''), 'error'); }
        finally { setBusy(false); }
    };
    const chip = (active: boolean) => ({ padding: '4px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer', border: `1.5px solid ${active ? ISLAND.primary : ISLAND.border}`, background: active ? ISLAND.primaryBg : ISLAND.subtleBg, color: ISLAND.text } as React.CSSProperties);
    return (
        <IslandModal open={open} title="润色剧本" width={360} onClose={busy ? undefined : onClose} maskClosable={!busy}
            footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><IslandButton onClick={onClose} disabled={busy}>取消</IslandButton><IslandButton type="primary" disabled={busy} onClick={run}>{busy ? '润色中…' : '润色'}</IslandButton></div>}>
            <div style={{ color: ISLAND.text, maxHeight: '52vh', overflowY: 'auto' }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>文学风格</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {PLAY_LITERARY_STYLES.map(s => <span key={s} style={chip(lit === s)} onClick={() => setLit(lit === s ? '' : s)}>{s}</span>)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>参考艺术风格</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {PLAY_ART_STYLES.map(s => <span key={s} style={chip(art === s)} onClick={() => setArt(art === s ? '' : s)}>{s}</span>)}
                </div>
                <IslandInput value={extra} onChange={e => setExtra(e.target.value)} placeholder="额外要求（可空）" />
            </div>
        </IslandModal>
    );
};

// ============ 上传 txt ============
const UploadButton: React.FC<{ onParsed: (p: { title: string; logline: string; roles: VRPlayRole[]; body: string }) => void }> = ({ onParsed }) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const dlTemplate = () => {
        const blob = new Blob([SCRIPT_TEMPLATE], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '剧本模板.txt'; a.click(); URL.revokeObjectURL(a.href);
    };
    return (
        <>
            <IslandButton size="small" icon={<UploadSimple size={13} weight="bold" />} onClick={() => inputRef.current?.click()}>传 txt</IslandButton>
            <IslandButton size="small" icon={<DownloadSimple size={13} weight="bold" />} onClick={dlTemplate}>模板</IslandButton>
            <input ref={inputRef} type="file" accept=".txt,text/plain" className="hidden"
                onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const text = await f.text();
                    onParsed(parseUploadedScript(text, f.name.replace(/\.txt$/i, '')));
                    e.target.value = '';
                }} />
        </>
    );
};

const taStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 13, fontFamily: ISLAND.fontStack, color: ISLAND.text,
    background: ISLAND.subtleBg, border: `2px solid ${ISLAND.border}`, borderRadius: ISLAND.radiusSm, outline: 'none', resize: 'vertical',
};

export default TheaterPanel;
