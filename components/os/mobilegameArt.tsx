import React from 'react';
import { AppID } from '../../types';

// ===== 手游主题专用插画 =====
// 粉紫渐变 + 白色高光 + 圆润立体的「手游味」小插画，用于快捷入口 / 应用目录卡。
// 每个 viewBox 64x64，className 控制尺寸。渐变 id 各自唯一，避免冲突。

const A = {
    purple1: '#c9b8f0', purple2: '#8b73c9', purpleDeep: '#6f57b0',
    pink1: '#f9c9e2', pink2: '#ec8fc2', pinkDeep: '#d96ba8',
    peri1: '#bcccf4', peri2: '#8aa3e0', periDeep: '#6f8bd4',
    gloss: '#ffffff',
};

const Sparkle: React.FC<{ x: number; y: number; s: number; c: string }> = ({ x, y, s, c }) => (
    <path d={`M${x} ${y - s} L${x + s * 0.3} ${y - s * 0.3} L${x + s} ${y} L${x + s * 0.3} ${y + s * 0.3} L${x} ${y + s} L${x - s * 0.3} ${y + s * 0.3} L${x - s} ${y} L${x - s * 0.3} ${y - s * 0.3} Z`} fill={c} />
);

// 行星 · 神经链接
const Planet: React.FC = () => (
    <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs><linearGradient id="mg-planet" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stopColor={A.purple1} /><stop offset="1" stopColor={A.purple2} /></linearGradient></defs>
        <circle cx="30" cy="30" r="16" fill="url(#mg-planet)" />
        <ellipse cx="22" cy="22" rx="6" ry="4" fill={A.gloss} opacity="0.55" transform="rotate(-25 22 22)" />
        <ellipse cx="31" cy="31" rx="26" ry="8.5" fill="none" stroke={A.pink2} strokeWidth="4" transform="rotate(-22 31 31)" opacity="0.9" />
        <ellipse cx="31" cy="31" rx="26" ry="8.5" fill="none" stroke={A.gloss} strokeWidth="1.4" transform="rotate(-22 31 31)" opacity="0.5" />
        <Sparkle x={52} y={13} s={5} c={A.pink1} />
    </svg>
);

// 大脑 · 记忆宫殿
const Brain: React.FC = () => (
    <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs><linearGradient id="mg-brain" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={A.pink1} /><stop offset="1" stopColor={A.pink2} /></linearGradient></defs>
        <path d="M32 13 C21 13 15 21 18 29 C12 33 15 44 25 43 C27 49 37 49 39 43 C49 44 52 33 46 29 C49 21 43 13 32 13 Z" fill="url(#mg-brain)" />
        <path d="M32 15 V45" stroke={A.gloss} strokeWidth="2" opacity="0.55" fill="none" strokeLinecap="round" />
        <path d="M25 23 q5 2 1 7 M39 23 q-5 2 -1 7 M21 33 q5 3 9 1 M43 33 q-5 3 -9 1" stroke={A.gloss} strokeWidth="1.8" opacity="0.55" fill="none" strokeLinecap="round" />
        <Sparkle x={50} y={16} s={4.5} c={A.gloss} />
    </svg>
);

// 电话 · 电话
const Phone: React.FC = () => (
    <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs><linearGradient id="mg-phone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={A.purple1} /><stop offset="1" stopColor={A.purpleDeep} /></linearGradient></defs>
        <path d="M19 15 q-5 0 -5 5 q0 9 8 19 q10 13 21 16 q5 1 6 -3 l2 -6 q1 -3 -3 -4 l-7 -2 q-3 -1 -4 2 l-1 2 q-7 -4 -12 -12 l2 -1 q3 -1 2 -4 l-2 -7 q-1 -3 -4 -2 z" fill="url(#mg-phone)" />
        <path d="M21 19 q-2 0 -2 3" stroke={A.gloss} strokeWidth="2" opacity="0.5" fill="none" strokeLinecap="round" />
        <path d="M42 14 a9 9 0 0 1 8 8 M44 9 a14 14 0 0 1 11 11" stroke={A.pink2} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <Sparkle x={15} y={46} s={4} c={A.pink1} />
    </svg>
);

// 房子 · 小小窝
const House: React.FC = () => (
    <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs>
            <linearGradient id="mg-house" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={A.peri1} /><stop offset="1" stopColor={A.peri2} /></linearGradient>
            <linearGradient id="mg-roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={A.purple1} /><stop offset="1" stopColor={A.purple2} /></linearGradient>
        </defs>
        <rect x="18" y="30" width="28" height="20" rx="3" fill="url(#mg-house)" />
        <path d="M32 12 L52 31 Q53 33 50 33 L14 33 Q11 33 12 31 Z" fill="url(#mg-roof)" />
        <ellipse cx="24" cy="20" rx="4" ry="2.5" fill={A.gloss} opacity="0.4" transform="rotate(-30 24 20)" />
        <rect x="28" y="38" width="8" height="12" rx="2" fill={A.gloss} opacity="0.85" />
        <circle cx="34" cy="44" r="1" fill={A.peri2} />
        <Sparkle x={50} y={16} s={4} c={A.pink1} />
    </svg>
);

// 手机 · 查手机
const Smartphone: React.FC = () => (
    <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs><linearGradient id="mg-sp" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0" stopColor={A.peri1} /><stop offset="1" stopColor={A.peri2} /></linearGradient></defs>
        <rect x="20" y="10" width="24" height="44" rx="7" fill="url(#mg-sp)" />
        <rect x="24" y="16" width="16" height="28" rx="3" fill={A.gloss} opacity="0.85" />
        <path d="M26 18 l10 0 -12 16 0 -12 z" fill={A.gloss} opacity="0.6" />
        <circle cx="32" cy="49" r="2" fill={A.gloss} opacity="0.9" />
        <Sparkle x={47} y={16} s={4.5} c={A.pink1} />
    </svg>
);

// 日记本（带爱心）· 见面
const Diary: React.FC = () => (
    <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs><linearGradient id="mg-diary" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={A.pink1} /><stop offset="1" stopColor={A.pink2} /></linearGradient></defs>
        <rect x="16" y="12" width="32" height="40" rx="5" fill="url(#mg-diary)" />
        <rect x="16" y="12" width="7" height="40" rx="3" fill={A.pinkDeep} opacity="0.55" />
        <path d="M34 24 c-2 -3 -7 -2 -7 2 c0 3 4 6 7 8 c3 -2 7 -5 7 -8 c0 -4 -5 -5 -7 -2 z" fill={A.gloss} />
        <rect x="44" y="20" width="4" height="16" rx="2" fill={A.periDeep} opacity="0.8" />
        <Sparkle x={50} y={48} s={4} c={A.pink1} />
    </svg>
);

// 文件夹 · 档案
const Folder: React.FC = () => (
    <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs><linearGradient id="mg-folder" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={A.peri1} /><stop offset="1" stopColor={A.peri2} /></linearGradient></defs>
        <path d="M12 20 q0 -4 4 -4 l10 0 q2 0 3 2 l2 3 l17 0 q4 0 4 4 l0 4 l-44 0 z" fill={A.periDeep} opacity="0.85" />
        <rect x="20" y="24" width="24" height="14" rx="2" fill={A.gloss} opacity="0.85" />
        <path d="M10 30 q0 -3 4 -3 l36 0 q4 0 4 3 l-2 15 q-1 4 -5 4 l-30 0 q-4 0 -5 -4 z" fill="url(#mg-folder)" />
        <ellipse cx="20" cy="34" rx="5" ry="2" fill={A.gloss} opacity="0.35" />
        <Sparkle x={48} y={20} s={4} c={A.pink1} />
    </svg>
);

// 星星罐 · 存钱罐
const Jar: React.FC = () => (
    <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs><linearGradient id="mg-jar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={A.pink1} stopOpacity="0.85" /><stop offset="1" stopColor={A.pink2} stopOpacity="0.9" /></linearGradient></defs>
        <rect x="22" y="10" width="20" height="6" rx="3" fill={A.pinkDeep} opacity="0.8" />
        <path d="M20 20 q0 -4 4 -4 l16 0 q4 0 4 4 l0 26 q0 6 -6 6 l-12 0 q-6 0 -6 -6 z" fill="url(#mg-jar)" />
        <Sparkle x={32} y={34} s={9} c={A.gloss} />
        <ellipse cx="26" cy="26" rx="3" ry="8" fill={A.gloss} opacity="0.35" />
        <Sparkle x={49} y={16} s={4} c={A.pink1} />
    </svg>
);

// 日历（带勾）· 日程
const Calendar: React.FC = () => (
    <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs><linearGradient id="mg-cal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={A.purple1} /><stop offset="1" stopColor={A.purple2} /></linearGradient></defs>
        <rect x="13" y="16" width="38" height="36" rx="6" fill="url(#mg-cal)" />
        <rect x="13" y="16" width="38" height="11" rx="6" fill={A.purpleDeep} opacity="0.7" />
        <rect x="21" y="11" width="4" height="9" rx="2" fill={A.purpleDeep} />
        <rect x="39" y="11" width="4" height="9" rx="2" fill={A.purpleDeep} />
        <path d="M24 39 l5 5 9 -11" stroke={A.gloss} strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Sparkle x={48} y={48} s={4} c={A.pink1} />
    </svg>
);

// 齿轮 · 设置
const Gear: React.FC = () => (
    <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs><linearGradient id="mg-gear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={A.purple1} /><stop offset="1" stopColor={A.purple2} /></linearGradient></defs>
        {Array.from({ length: 8 }).map((_, i) => (
            <rect key={i} x="29" y="8" width="6" height="12" rx="3" fill="url(#mg-gear)" transform={`rotate(${i * 45} 32 32)`} />
        ))}
        <circle cx="32" cy="32" r="16" fill="url(#mg-gear)" />
        <circle cx="32" cy="32" r="7" fill={A.gloss} opacity="0.9" />
        <ellipse cx="26" cy="25" rx="4" ry="2.5" fill={A.gloss} opacity="0.4" transform="rotate(-30 26 25)" />
        <Sparkle x={50} y={16} s={4} c={A.pink1} />
    </svg>
);

const MG_ART: Partial<Record<AppID, React.FC>> = {
    [AppID.Character]: Planet,
    [AppID.MemoryPalace]: Brain,
    [AppID.Call]: Phone,
    [AppID.Room]: House,
    [AppID.CheckPhone]: Smartphone,
    [AppID.Date]: Diary,
    [AppID.User]: Folder,
    [AppID.Bank]: Jar,
    [AppID.Schedule]: Calendar,
    [AppID.Settings]: Gear,
};

// 有插画就用插画，否则返回 null（调用方回退到 Phosphor 图标）
export const getMobileGameArt = (id: AppID): React.ReactNode => {
    const Comp = MG_ART[id];
    return Comp ? <Comp /> : null;
};
