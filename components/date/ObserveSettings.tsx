import React, { useState, useEffect } from 'react';
import { useOS } from '../../context/OSContext';
import { CharacterProfile, DateObservation, DateObserveConfig, DateObserveStyleId } from '../../types';
import { OBSERVE_DIMENSIONS } from '../../utils/datePrompts';
import ObserveHUD, { OBSERVE_STYLES } from './ObserveHUD';

/**
 * 见面设置里的「观测协议 OBSERVE」配置块：
 *   - 总开关
 *   - HUD 样式选择（全息 / 水墨 / 霓虹 / 水晶 / 终端），带实时预览
 *   - 每个维度（时间/地点/状态/细节）的：启用开关、HUD 显示标签、生成提示
 *   - 一键重置（样式 + 全部字段自定义回默认）
 *
 * 所有改动即时写回 char.dateObserve，下一条回复 / 下次渲染生效。
 */

interface ObserveSettingsProps {
    char: CharacterProfile;
}

// 预览用的示例观测（不发请求，纯展示样式）
const SAMPLE: DateObservation = {
    time: '傍晚六点过，天刚擦黑',
    place: '便利店门口的塑料凳上',
    state: '有点疲惫，但见到你眼神亮了一下',
    detail: '指尖无意识地敲着关东煮的纸杯',
};

type Draft = Record<string, { label: string; hint: string }>;

const buildDraft = (char: CharacterProfile): Draft => {
    const f = char.dateObserve?.fields || {};
    const d: Draft = {};
    for (const dim of OBSERVE_DIMENSIONS) {
        d[dim.key] = { label: f[dim.key]?.label || '', hint: f[dim.key]?.hint || '' };
    }
    return d;
};

const ObserveSettings: React.FC<ObserveSettingsProps> = ({ char }) => {
    const { updateCharacter, addToast } = useOS();
    const enabled = !!char.dateObserve?.enabled;
    const style = char.dateObserve?.style || 'hologram';
    const fields = char.dateObserve?.fields || {};

    const [draft, setDraft] = useState<Draft>(() => buildDraft(char));
    useEffect(() => { setDraft(buildDraft(char)); }, [char.id]);

    const patchObserve = (patch: Partial<DateObserveConfig>) =>
        updateCharacter(char.id, { dateObserve: { ...char.dateObserve, ...patch } });

    const patchField = (key: keyof DateObservation, partial: Record<string, unknown>) =>
        patchObserve({ fields: { ...fields, [key]: { ...(fields[key] || {}), ...partial } } });

    // 提交某字段的 label/hint 草稿：空串存 undefined（回落默认）
    const commitField = (key: keyof DateObservation, which: 'label' | 'hint') => {
        const v = (draft[key]?.[which] || '').trim();
        if (v === (fields[key]?.[which] || '')) return;
        patchField(key, { [which]: v || undefined });
    };

    const resetAll = () => {
        updateCharacter(char.id, { dateObserve: { enabled: char.dateObserve?.enabled, style: undefined, fields: undefined } });
        setDraft(buildDraft({ ...char, dateObserve: { enabled } }));
        addToast('观测样式与提示词已重置为默认', 'success');
    };

    return (
        <section className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between">
                <div className="pr-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase">观测协议 · OBSERVE</h3>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">开启后，每条回复都会附上 {char.name} 此刻的「时间 / 地点 / 状态 / 细节」，渲染成可独立查看的观测面板。修改后从下一条回复生效。</p>
                </div>
                <button
                    onClick={() => patchObserve({ enabled: !enabled })}
                    className={`w-12 h-7 rounded-full transition-colors relative shrink-0 ${enabled ? 'bg-primary' : 'bg-slate-200'}`}
                >
                    <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
                </button>
            </div>

            {enabled && (
                <div className="mt-4 space-y-4">
                    {/* ── 样式选择 ── */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-[11px] font-bold text-slate-500">面板样式</h4>
                            <button onClick={resetAll} className="text-[10px] font-bold text-primary/80 hover:text-primary px-2 py-0.5 rounded-full bg-primary/5 active:scale-95 transition-transform">一键重置</button>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                            {OBSERVE_STYLES.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => patchObserve({ style: s.id as DateObserveStyleId })}
                                    title={s.desc}
                                    className={`flex flex-col items-center gap-1 py-2 rounded-xl border transition-all active:scale-95 ${style === s.id ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-slate-200 hover:border-slate-300'}`}
                                >
                                    <span className="w-7 h-7 rounded-lg shadow-inner" style={{ background: s.swatch }} />
                                    <span className={`text-[10px] font-bold ${style === s.id ? 'text-primary' : 'text-slate-500'}`}>{s.name}</span>
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">{OBSERVE_STYLES.find(s => s.id === style)?.desc}</p>
                    </div>

                    {/* ── 实时预览 ── */}
                    <div>
                        <h4 className="text-[11px] font-bold text-slate-500 mb-2">预览</h4>
                        <div className="rounded-xl p-4 flex justify-center" style={{ background: style === 'ink' ? '#e9e0cd' : 'radial-gradient(circle at 30% 20%, #1e2433, #0a0d16)' }}>
                            <div className="w-full max-w-[260px]">
                                <ObserveHUD observation={SAMPLE} variant="card" charName={char.name} config={char.dateObserve} />
                            </div>
                        </div>
                    </div>

                    {/* ── 每个维度的提示词与标签自定义 ── */}
                    <div>
                        <h4 className="text-[11px] font-bold text-slate-500 mb-1">每个部分生成什么（自定义提示词）</h4>
                        <p className="text-[10px] text-slate-400 mb-2.5 leading-snug">「显示标签」只改面板上的字样；「生成提示」决定这一格让 AI 写什么。留空即用默认。关掉的维度不注入、面板也不显示。</p>
                        <div className="space-y-2.5">
                            {OBSERVE_DIMENSIONS.map(dim => {
                                const on = fields[dim.key]?.enabled !== false;
                                const defHint = dim.hint.replace(/\{name\}/g, char.name);
                                return (
                                    <div key={dim.key} className={`rounded-xl border p-2.5 transition-opacity ${on ? 'border-slate-200 bg-slate-50/60' : 'border-slate-100 bg-slate-50/30 opacity-60'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5"><span className="text-slate-400">{dim.glyph}</span>{dim.label}</span>
                                            <button
                                                onClick={() => patchField(dim.key, { enabled: !on })}
                                                className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${on ? 'bg-primary' : 'bg-slate-300'}`}
                                            >
                                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`}></div>
                                            </button>
                                        </div>
                                        {on && (
                                            <div className="space-y-1.5">
                                                <input
                                                    value={draft[dim.key]?.label || ''}
                                                    onChange={e => setDraft(d => ({ ...d, [dim.key]: { ...d[dim.key], label: e.target.value } }))}
                                                    onBlur={() => commitField(dim.key, 'label')}
                                                    placeholder={`显示标签（默认「${dim.label}」）`}
                                                    className="w-full text-[12px] px-2.5 py-1.5 rounded-lg border border-slate-200 focus:border-primary focus:outline-none bg-white"
                                                />
                                                <textarea
                                                    value={draft[dim.key]?.hint || ''}
                                                    onChange={e => setDraft(d => ({ ...d, [dim.key]: { ...d[dim.key], hint: e.target.value } }))}
                                                    onBlur={() => commitField(dim.key, 'hint')}
                                                    placeholder={`生成提示（默认：${defHint}）`}
                                                    rows={2}
                                                    className="w-full text-[12px] px-2.5 py-1.5 rounded-lg border border-slate-200 focus:border-primary focus:outline-none bg-white leading-relaxed resize-none"
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default ObserveSettings;
