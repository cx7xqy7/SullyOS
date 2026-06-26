/**
 * UpdateNotificationEvent.tsx
 * 版本更新强制提醒弹窗 (2026.5.25 小更新)
 *
 * 所有尚未确认过本次弹窗的用户，打开后都会被强制接到一次，
 * 点击"查看更新"后会跳转到使用帮助 App 的对应更新日志页。
 */

import React from 'react';
import { useOS } from '../context/OSContext';
import { AppID } from '../types';

// 历史 key —— 保留, 让老用户的"已看过"状态延续到本月新弹窗判断里
export const UPDATE_NOTIFICATION_KEY = 'sullyos_update_2026_04_seen';
export const UPDATE_NOTIFICATION_KEY_2026_05 = 'sullyos_update_2026_05_seen';
export const UPDATE_NOTIFICATION_KEY_2026_05_10 = 'sullyos_update_2026_05_10_seen';
export const UPDATE_NOTIFICATION_KEY_2026_05_17 = 'sullyos_update_2026_05_17_seen';
// 历史 key —— 5.25 情绪 buff 也接入 Instant Push
export const UPDATE_NOTIFICATION_KEY_2026_05_25 = 'sullyos_update_2026_05_25_seen';
// 历史 key —— 6.5 「彼方」上线
export const UPDATE_NOTIFICATION_KEY_2026_06_05 = 'sullyos_update_2026_06_05_seen';
// 历史 key —— 6.14 「家园」上线 · 小屋翻新 + 瑞幸咖啡
export const UPDATE_NOTIFICATION_KEY_2026_06_14 = 'sullyos_update_2026_06_14_seen';
// 历史 key —— 6.21 「查手机」翻新 + 人格模拟 · 手游风外观 · 小红书分享
export const UPDATE_NOTIFICATION_KEY_2026_06_21 = 'sullyos_update_2026_06_21_seen';
// 本次更新 key —— 6.26 梦境盲盒 · 联系人模式 · char 的小手机 · 见面状态栏 · 时间感知归位 · 鱼生 TTS
export const UPDATE_NOTIFICATION_KEY_2026_06_26 = 'sullyos_update_2026_06_26_seen';

export const FAQ_TARGET_SECTION_KEY = 'sullyos_faq_target_section';
export const CHANGELOG_2026_04 = 'changelog-2026-04';
export const CHANGELOG_2026_05 = 'changelog-2026-05';
export const CHANGELOG_2026_05_10 = 'changelog-2026-05-10';
export const CHANGELOG_2026_05_17 = 'changelog-2026-05-17';
export const CHANGELOG_2026_05_27 = 'changelog-2026-05-27';
export const CHANGELOG_2026_06_05 = 'changelog-2026-06-05';
export const CHANGELOG_2026_06_14 = 'changelog-2026-06-14';
export const CHANGELOG_2026_06_21 = 'changelog-2026-06-21';
export const CHANGELOG_2026_06_26 = 'changelog-2026-06-26';

export const shouldShowUpdateNotification = (): boolean => {
    try {
        return !localStorage.getItem(UPDATE_NOTIFICATION_KEY_2026_06_26);
    } catch {
        return false;
    }
};

interface UpdateNotificationPopupProps {
    onClose: () => void;
}

export const UpdateNotificationPopup: React.FC<UpdateNotificationPopupProps> = ({ onClose }) => {
    const { openApp } = useOS();

    const handleView = () => {
        try {
            localStorage.setItem(UPDATE_NOTIFICATION_KEY_2026_06_26, Date.now().toString());
            sessionStorage.setItem(FAQ_TARGET_SECTION_KEY, CHANGELOG_2026_06_26);
        } catch { /* ignore */ }
        openApp(AppID.FAQ);
        onClose();
    };

    const handleDismiss = () => {
        try { localStorage.setItem(UPDATE_NOTIFICATION_KEY_2026_06_26, Date.now().toString()); } catch { /* ignore */ }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-5 animate-fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
            <div className="relative w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden animate-slide-up">
                <div className="pt-7 pb-3 px-6 text-center">
                    <img
                        src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f514.png"
                        alt="update"
                        className="w-10 h-10 mx-auto mb-2"
                    />
                    <h2 className="text-lg font-extrabold text-slate-800">新功能上线 · 梦境盲盒</h2>
                    <p className="text-[11px] text-slate-400 mt-1">2026 年 6 月 26 日 · 7 项更新</p>
                </div>

                <div className="px-6 pb-4 space-y-3">
                    <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-4">
                        <p className="text-[13px] text-slate-700 leading-relaxed">
                            <strong className="text-indigo-600">「小屋」</strong>新增<strong className="text-violet-600">梦境系统</strong>：进角色小屋后刷新，可看 ta 的梦，集齐 <strong>13 款梦境盲盒</strong>。
                        </p>
                        <p className="text-[12px] text-slate-500 leading-relaxed mt-2">
                            <strong className="text-indigo-600">「查手机」</strong>新增<strong>联系人模式</strong>（看人际关系、删好友）与<strong className="text-violet-600">智能体</strong>——char 也有自己的小手机，你还能扮演 ta 酒馆里的 AI。
                        </p>
                        <p className="text-[12px] text-slate-500 leading-relaxed mt-2">
                            还有：<strong>见面</strong>新增可自定义状态栏、设置前移；<strong>日程</strong>看得更细；<strong className="text-violet-600">时间感知</strong>归位到神经链接；<strong>TTS</strong> 新增<strong>鱼生 API</strong>。
                        </p>
                    </div>
                    <div className="bg-violet-50 border border-violet-200 rounded-2xl p-3">
                        <p className="text-[12px] font-bold text-violet-600 text-center">
                            点下方按钮看完整更新说明
                        </p>
                    </div>
                </div>

                <div className="px-6 pb-7 pt-2 space-y-2">
                    <button
                        onClick={handleView}
                        className="w-full py-3.5 bg-gradient-to-r from-violet-500 to-purple-500 text-white font-bold rounded-2xl shadow-lg shadow-violet-200 active:scale-95 transition-transform text-sm"
                    >
                        看看这次更新了啥
                    </button>
                    <button
                        onClick={handleDismiss}
                        className="w-full py-2 text-slate-400 font-medium text-xs active:scale-95 transition-transform"
                    >
                        以后再说
                    </button>
                </div>
            </div>
        </div>
    );
};

interface UpdateNotificationControllerProps {
    onClose: () => void;
}

export const UpdateNotificationController: React.FC<UpdateNotificationControllerProps> = ({ onClose }) => {
    return <UpdateNotificationPopup onClose={onClose} />;
};
