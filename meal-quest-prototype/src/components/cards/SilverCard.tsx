import React from 'react';
import { Coins, ShoppingBag, Gamepad2, Activity } from 'lucide-react';

interface SilverCardProps {
    expanded: boolean;
    onExpand: () => void;
    onReference: React.RefObject<HTMLDivElement | null>;
    style?: React.CSSProperties;
}

export default function SilverCard({ expanded, onExpand, onReference, style }: SilverCardProps) {
    return (
        <div
            ref={onReference}
            style={style}
            className="relative w-full rounded-3xl overflow-hidden shadow-2xl aspect-[1.586/1] bg-gradient-to-br from-indigo-50 to-white border border-indigo-100"
        >
            {/* Header Area (Always Visible) */}
            <div
                className="card-header h-[30px] px-5 flex items-center justify-between shrink-0 cursor-pointer active:scale-[0.99] transition-transform"
                onClick={onExpand}
            >
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                        <Coins size={14} />
                    </div>
                    <span className="font-bold text-gray-800 text-[15px]">寻味碎银</span>

                    {/* Step Counter Capsule */}
                    <div className="px-1.5 py-0.5 rounded-full bg-black/5 flex items-center gap-1 ml-0.5">
                        <Activity size={10} className="text-orange-500" />
                        <span className="text-[10px] font-mono font-bold text-gray-600">8,420</span>
                    </div>
                </div>
                <div className="text-xl font-black text-gray-900 tracking-tight font-mono">
                    12,850 <span className="text-xs font-normal text-gray-500 ml-0.5">两</span>
                </div>
            </div>

            {/* Expanded Content Area */}
            <div className={`p-6 pt-2 transition-opacity duration-500 ${expanded ? 'opacity-100' : 'opacity-100'}`}>

                {/* Main Actions Grid */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                    <button className="h-32 bg-white rounded-2xl border border-indigo-50 shadow-sm flex flex-col items-center justify-center gap-3 relative overflow-hidden group active:scale-95 transition-transform">
                        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                            <ShoppingBag size={64} />
                        </div>
                        <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                            <ShoppingBag size={24} />
                        </div>
                        <div className="text-center">
                            <div className="font-bold text-gray-900">逛集市</div>
                            <div className="text-[10px] text-gray-500 mt-1">采购/出售食福碎片</div>
                        </div>
                    </button>

                    <button className="h-32 bg-gray-900 rounded-2xl shadow-lg flex flex-col items-center justify-center gap-3 relative overflow-hidden active:scale-95 transition-transform">
                        <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/20 to-transparent"></div>
                        <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center text-yellow-400">
                            <Gamepad2 size={24} />
                        </div>
                        <div className="text-center z-10">
                            <div className="font-bold text-white">玩游戏</div>
                            <div className="text-[10px] text-gray-400 mt-1">剩余 3 次机会</div>
                        </div>
                    </button>
                </div>

                {/* Step Exchange Progress */}
                <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-6 shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-4 bg-orange-500 rounded-full"></div>
                            <span className="font-bold text-gray-800">步数兑换</span>
                        </div>
                        <span className="text-xs text-gray-400">8,420 / 10,000</span>
                    </div>

                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-4 relative">
                        <div className="absolute top-0 left-0 h-full bg-orange-500 w-[84%] rounded-full"></div>
                    </div>

                    <button className="w-full py-3 rounded-xl bg-orange-500 text-white font-bold text-sm shadow-md shadow-orange-200 active:scale-[0.98] transition-transform">
                        兑换 (预计 +84 两)
                    </button>
                </div>

                {/* Recent Transactions */}
                <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">近期流水</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-gray-800">游戏赢取 - 叠高高</span>
                                <span className="text-xs text-gray-400">14:20</span>
                            </div>
                            <span className="font-mono font-bold text-green-600">+ 120</span>
                        </div>
                        <div className="w-full h-px bg-gray-100"></div>
                        <div className="flex justify-between items-center">
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-gray-800">集市购买 - 葱花食福碎片</span>
                                <span className="text-xs text-gray-400">昨天</span>
                            </div>
                            <span className="font-mono font-bold text-black">- 300</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
