import React from 'react';
import { CreditCard, ArrowRight } from 'lucide-react';

interface BalanceCardProps {
    expanded: boolean;
    onExpand: () => void;
    onReference: React.RefObject<HTMLDivElement | null>;
    style?: React.CSSProperties;
}

export default function BalanceCard({ expanded, onExpand, onReference, style }: BalanceCardProps) {
    return (
        <div
            ref={onReference}
            style={style}
            className="relative w-full rounded-3xl overflow-hidden shadow-2xl aspect-[1.586/1] bg-white border border-gray-200"
        >
            {/* Header Area */}
            <div
                className="h-[30px] px-5 flex items-center justify-between shrink-0 cursor-pointer active:scale-[0.99] transition-transform"
                onClick={onExpand}
            >
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-900">
                        <CreditCard size={14} />
                    </div>
                    <span className="font-bold text-gray-800 text-[15px]">聚宝金库</span>
                </div>
                <div className="text-xl font-black text-gray-900 tracking-tight font-mono">
                    ¥120.00
                </div>
            </div>

            {/* Expanded Content Area */}
            <div className={`p-6 pt-2 transition-opacity duration-500 ${expanded ? 'opacity-100' : 'opacity-100'}`}>

                {/* Asset Breakdown */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <div className="text-xs text-gray-400 mb-1">本金 (可退)</div>
                        <div className="text-xl font-bold text-gray-900">¥100.00</div>
                    </div>
                    <div className="bg-pink-50 p-4 rounded-xl border border-pink-100">
                        <div className="text-xs text-pink-400 mb-1">赠送金 (活动)</div>
                        <div className="text-xl font-bold text-pink-600">¥20.00</div>
                    </div>
                </div>

                {/* Promo Banner */}
                <div className="bg-gradient-to-r from-pink-500 to-rose-400 rounded-2xl p-6 text-white mb-6 shadow-lg relative overflow-hidden group active:scale-[0.98] transition-transform cursor-pointer">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-xl"></div>
                    <h3 className="text-lg font-bold mb-1 relative z-10">首充好礼</h3>
                    <p className="text-pink-100 text-sm mb-4 relative z-10">充 ¥200 送 ¥20，立即开通</p>
                    <button className="flex items-center gap-1 text-xs font-bold bg-white/20 px-3 py-1.5 rounded-full backdrop-blur-md hover:bg-white/30 transition-colors">
                        前往充值中心 <ArrowRight size={12} />
                    </button>
                </div>

                {/* Actions */}
                <button className="w-full py-4 flex items-center justify-between px-2 text-gray-500 hover:text-gray-900 border-t border-gray-100">
                    <span className="text-sm font-medium">查看账单明细</span>
                    <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );
}
