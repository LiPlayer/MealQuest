import React from 'react';
import { Ticket, Utensils, Star } from 'lucide-react';

interface TicketCardProps {
    expanded: boolean;
    onExpand: () => void;
    onReference: React.RefObject<HTMLDivElement | null>;
    style?: React.CSSProperties;
}

// Mock Ticket Item
const TicketItem = ({ name, expiry }: { name: string, expiry: string }) => (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-orange-100 flex items-center gap-4 relative overflow-hidden">
        <div className="w-1.5 h-full absolute left-0 top-0 bg-orange-400"></div>
        <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center text-2xl border border-orange-100">
            🍜
        </div>
        <div className="flex-1">
            <h4 className="font-bold text-gray-800">{name}</h4>
            <p className="text-xs text-gray-400">有效期至 {expiry}</p>
        </div>
        <button className="px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg shadow-md">
            使用
        </button>

        {/* Ticket Stub Effect */}
        <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#FAFAFA] rounded-full border border-orange-100"></div>
        <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#FAFAFA] rounded-full border-r border-orange-100"></div>
    </div>
)

export default function TicketCard({ expanded, onExpand, onReference, style }: TicketCardProps) {
    return (
        <div
            ref={onReference}
            style={style}
            className="relative w-full rounded-3xl overflow-hidden shadow-2xl aspect-[1.586/1] bg-stone-50 border border-stone-200"
        >
            {/* Header Area */}
            <div
                className="card-header h-[30px] px-5 flex items-center justify-between shrink-0 cursor-pointer active:scale-[0.99] transition-transform"
                onClick={onExpand}
            >
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                        <Ticket size={14} />
                    </div>
                    <span className="font-bold text-gray-800 text-[15px]">口福红包</span>
                </div>

                {/* Isometric Flow Preview (Mini) */}
                {!expanded && (
                    <div className="flex -space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-white border border-gray-100 shadow-sm flex items-center justify-center text-xs transform -skew-x-12">🍜</div>
                        <div className="w-8 h-8 rounded-lg bg-white border border-gray-100 shadow-sm flex items-center justify-center text-xs transform -skew-x-12">🥩</div>
                        <div className="w-8 h-8 rounded-lg bg-gray-200 border border-gray-100 shadow-sm flex items-center justify-center text-xs text-gray-400 transform -skew-x-12 font-bold">+2</div>
                    </div>
                )}
            </div>

            {/* Expanded Content Area */}
            <div className={`p-6 pt-2 transition-opacity duration-500 opacity-100`}>

                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Utensils size={18} /> 资产大厅
                    </h3>
                    <span className="text-xs text-gray-400">共 3 张可用</span>
                </div>

                {/* Tickets List */}
                <div className="space-y-4 mb-8">
                    <TicketItem name="招牌葱油拌面" expiry="2026-03-01" />
                    <TicketItem name="红烧狮子头" expiry="2026-02-28" />
                    <TicketItem name="可乐/雪碧" expiry="2026-03-15" />
                </div>

                {/* Synthesis Preview */}
                <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
                    <Star size={18} /> 合成进度
                </h3>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 opacity-60 grayscale">
                    <div className="flex gap-4">
                        <div className="w-16 h-16 bg-gray-100 rounded-lg"></div>
                        <div className="flex-1">
                            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                            <div className="h-2 bg-gray-100 rounded w-full"></div>
                        </div>
                    </div>
                    <p className="text-xs text-center mt-2 text-gray-500">跳转食福碎片卡查看详情</p>
                </div>

            </div>
        </div>
    );
}
