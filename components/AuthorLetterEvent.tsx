/**
 * AuthorLetterEvent.tsx
 * 「致用户的一封信」—— 作者糯米鸡的一次性公告弹窗。
 *
 * 尚未读过的用户打开 App 后会强制接到一次，点「我看到了」后置位，
 * 之后不再弹。文案为作者原文，逐字保留。
 */

import React from 'react';

// 已读标记 key（按月份命名，方便日后再发新信时新增 key 区分）
export const AUTHOR_LETTER_KEY = 'sullyos_author_letter_2026_06_seen';

export const shouldShowAuthorLetter = (): boolean => {
    try {
        return !localStorage.getItem(AUTHOR_LETTER_KEY);
    } catch {
        return false;
    }
};

interface AuthorLetterPopupProps {
    onClose: () => void;
}

export const AuthorLetterPopup: React.FC<AuthorLetterPopupProps> = ({ onClose }) => {
    const handleDismiss = () => {
        try { localStorage.setItem(AUTHOR_LETTER_KEY, Date.now().toString()); } catch { /* ignore */ }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-5 animate-fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
            <div className="relative w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden animate-slide-up flex flex-col max-h-[86vh]">
                <div className="pt-7 pb-3 px-6 text-center shrink-0 border-b border-slate-100">
                    <h2 className="text-lg font-extrabold text-slate-800">致用户的一封信</h2>
                    <p className="text-[11px] text-slate-400 mt-1">SullyOS · 糯米鸡</p>
                </div>

                <div className="px-6 py-4 overflow-y-auto no-scrollbar">
                    <div className="space-y-3 text-[13px] text-slate-700 leading-relaxed">
                        <p>这几天看到一些讨论和对社区的评价，也看到很多人对项目未来的担心。作为 SullyOS 的作者，我一直处于一种焦虑的状态中很长时间了，这份压力来源并不明确，但是已经给我造成明显伤害了。所以，近期关于社区的放开与否，以及管理与调整，我可能需要重新规划一下。</p>
                        <p>对于未来的发展方向我还没考虑清楚。社区会怎样变化我也无法预测。今天想了很多可能，或许社区会被解散，我会神隐，但是这个项目会继续开放，我始终希望能够保证：SullyOS 不会因为我个人的情绪、状态或者去留而突然消失。</p>
                        <p>抛开社区而言，我希望这个项目本身是可靠的。可靠不只是功能更多、更新更快，可靠意味着，即使某一天我忙于工作、忙于生活，甚至不再频繁出现在社区里，它依然能够正常运行。</p>
                        <p>包括去年九月停止维护的初代糯米机，直到今天依然能够正常打开。从很早开始，我就在有意识地避免让项目过度依赖某一个人。SullyOS 源码仓库始终公开、核心逻辑尽量透明、社区资料持续整理、服务架构不断调整。很多工作平时几乎没人会注意到，但目的都只有一个：让项目拥有独立生存能力。</p>
                        <p>社区接下来怎么发展，我目前的状态无法清晰地做出规划，但也无意给任何人施压、希望大家看到这里不要焦虑，只是似乎不说出来的话，我会一直被当作某种标记，或者靶子。但关于项目本身：</p>
                        <ul className="space-y-2">
                            <li className="flex gap-2"><span className="text-slate-400 shrink-0">·</span><span>源码仓库地址一直公开，从没变过；项目我不会关掉。</span></li>
                            <li className="flex gap-2"><span className="text-slate-400 shrink-0">·</span><span>唯一真正的风险，是用户量过大时，公共的 Cloudflare Worker 可能撑不住。</span></li>
                            <li className="flex gap-2"><span className="text-slate-400 shrink-0">·</span><span>为此，今晚我把原先写死在前端各处的 Worker 代理地址，统一抽成了「设置」里可自填的中心配置——搜索、备份、Notion、飞书、点单、网页抓取、出图、小红书 Lite、音乐都跟着它走。也就是说，将来即便我不再维护，你也能换成自己部署的 Worker 接着用。</span></li>
                        </ul>
                        <p className="font-bold text-slate-800 bg-amber-50 border border-amber-100 rounded-2xl p-3.5 mt-1">这不是目前需要担心的东西，也不是目前就得抓紧配好的东西，项目在继续正常地、健康地运行，同时也有很多朋友在帮助它，非常感谢大家。</p>
                        <p className="text-right text-slate-500 pt-1">—— 糯米鸡</p>
                    </div>
                </div>

                <div className="px-6 pb-7 pt-3 shrink-0 border-t border-slate-100">
                    <button
                        onClick={handleDismiss}
                        className="w-full py-3.5 bg-gradient-to-r from-rose-400 to-amber-400 text-white font-bold rounded-2xl shadow-lg shadow-amber-100 active:scale-95 transition-transform text-sm"
                    >
                        我看到了
                    </button>
                </div>
            </div>
        </div>
    );
};

interface AuthorLetterControllerProps {
    onClose: () => void;
}

export const AuthorLetterController: React.FC<AuthorLetterControllerProps> = ({ onClose }) => {
    return <AuthorLetterPopup onClose={onClose} />;
};
