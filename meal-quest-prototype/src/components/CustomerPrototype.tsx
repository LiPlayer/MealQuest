
import React, { useState } from 'react';

// --- Types ---
interface CardData {
    id: 'silver' | 'balance' | 'orders' | 'fragments';
    title: string;
    color: string;
    headerContent: React.ReactNode;
    detailContent: React.ReactNode;
}

// --- Icons (Simple SVG placeholders for weight saving) ---
const Icons = {
    Market: () => <span>🏮</span>,
    Game: () => <span>🎮</span>,
    Steps: () => <span>👟</span>,
    Bill: () => <span>🧾</span>,
    TopUp: () => <span>🎁</span>,
    Scan: () => (
        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 stroke-white stroke-[2px]">
            <path d="M3 7V5a2 2 0 012-2h2m10 0h2a2 2 0 012 2v2m0 10v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10" />
        </svg>
    ),
    Ticket: () => <span>🎫</span>,
    Lock: () => <span>🔒</span>,
    Check: () => <span>✅</span>
};

const CustomerHome: React.FC = () => {
    const [expandedCard, setExpandedCard] = useState<string | null>(null);

    // --- Detail Views Components ---

    // 1. Silver Detail View
    const SilverDetail = () => (
        <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Core Actions Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-[24px] shadow-sm border border-stone-100 active:scale-95 transition-transform flex flex-col justify-between h-32 relative overflow-hidden group">
                    <div className="absolute right-[-10px] top-[-10px] text-[80px] opacity-5 group-hover:rotate-12 transition-transform">🏮</div>
                    <div>
                        <div className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center text-xl mb-2">
                            <Icons.Market />
                        </div>
                        <span className="font-bold text-stone-800 text-lg">逛集市</span>
                    </div>
                    <span className="text-xs text-stone-400 font-medium">采购/出售碎片</span>
                </div>
                <div className="bg-white p-5 rounded-[24px] shadow-sm border border-stone-100 active:scale-95 transition-transform flex flex-col justify-between h-32 relative overflow-hidden group">
                    <div className="absolute right-[-10px] top-[-10px] text-[80px] opacity-5 group-hover:rotate-12 transition-transform">🎮</div>
                    <div>
                        <div className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center text-xl mb-2">
                            <Icons.Game />
                        </div>
                        <span className="font-bold text-stone-800 text-lg">赚银两</span>
                    </div>
                    <span className="text-xs text-stone-400 font-medium">玩游戏赢积分</span>
                </div>
            </div>

            {/* Step Counter Widget */}
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-stone-100 relative overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-3 items-center">
                        <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl">
                            <Icons.Steps />
                        </div>
                        <div>
                            <h3 className="font-bold text-stone-800">健康出行</h3>
                            <p className="text-xs text-stone-400">每日 24:00 重置</p>
                        </div>
                    </div>
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">已达标</span>
                </div>

                <div className="flex items-end gap-1 mb-2">
                    <span className="text-4xl font-black text-stone-800">8,420</span>
                    <span className="text-sm font-bold text-stone-400 mb-1">/ 10,000 步</span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-3 bg-stone-100 rounded-full overflow-hidden mb-4">
                    <div className="w-[84%] h-full bg-emerald-500 rounded-full" />
                </div>

                <div className="flex gap-3">
                    <button className="flex-1 py-3 bg-stone-900 text-white rounded-xl font-bold text-sm active:scale-95 transition-transform shadow-lg shadow-stone-200">
                        领取 84 两
                    </button>
                </div>
            </div>

            {/* Transaction Mini List */}
            <div className="space-y-3">
                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider ml-2">最近收支</h4>
                {[
                    { label: '步数兑换', amount: '+80', time: '10:23', type: 'earn' },
                    { label: '集市采购', amount: '-200', time: 'Yesterday', type: 'spend' },
                ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center bg-white/50 p-4 rounded-2xl">
                        <div className="flex flex-col">
                            <span className="font-bold text-stone-700 text-sm">{item.label}</span>
                            <span className="text-[10px] text-stone-400">{item.time}</span>
                        </div>
                        <span className={`font - mono font - bold ${item.type === 'earn' ? 'text-emerald-500' : 'text-stone-800'} `}>
                            {item.amount}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );

    // 2. Balance Detail View
    const BalanceDetail = () => (
        <div className="p-6 space-y-6 text-white animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Account Perspective Chart */}
            <div className="bg-indigo-500/30 border border-white/10 p-6 rounded-[32px] backdrop-blur-md">
                <h3 className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-6">资金构成透视</h3>

                <div className="flex gap-4 items-end mb-4">
                    <div className="flex-1 space-y-2">
                        <div className="h-32 bg-white/20 rounded-2xl relative overflow-hidden flex flex-col justify-end p-1">
                            <div className="w-full h-[80%] bg-indigo-300/80 rounded-xl" />
                            <span className="absolute top-2 left-1/2 -translate-x-1/2 text-xs font-bold text-white/60">80%</span>
                        </div>
                        <div className="text-center">
                            <span className="block text-xl font-black">¥100</span>
                            <span className="text-[10px] text-indigo-200 uppercase">本金 (可退)</span>
                        </div>
                    </div>
                    <div className="flex-1 space-y-2">
                        <div className="h-32 bg-white/10 rounded-2xl relative overflow-hidden flex flex-col justify-end p-1">
                            <div className="w-full h-[20%] bg-amber-400/80 rounded-xl" />
                            <span className="absolute top-2 left-1/2 -translate-x-1/2 text-xs font-bold text-white/60">20%</span>
                        </div>
                        <div className="text-center">
                            <span className="block text-xl font-black text-amber-300">¥20</span>
                            <span className="text-[10px] text-indigo-200 uppercase">赠送 (活动)</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="bg-gradient-to-r from-pink-500 to-rose-500 p-5 rounded-[24px] shadow-lg shadow-rose-900/20 flex items-center justify-between active:scale-95 transition-transform cursor-pointer">
                <div>
                    <h3 className="font-bold text-lg">充值有礼</h3>
                    <p className="text-xs text-white/80">充 ¥200 送 ¥20 Clip • 限时活动</p>
                </div>
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <Icons.TopUp />
                </div>
            </div>

            <button className="w-full py-4 bg-indigo-800/50 rounded-2xl font-bold text-sm text-indigo-200 flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <Icons.Bill /> 查看账单明细
            </button>
        </div>
    );

    // 3. Orders Detail View
    const OrdersDetail = () => (
        <div className="p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Filter Tabs */}
            <div className="flex p-1 bg-amber-100 rounded-xl mb-2">
                <button className="flex-1 py-2 bg-white rounded-lg shadow-sm text-amber-900 font-bold text-xs">可用 (2)</button>
                <button className="flex-1 py-2 text-amber-900/50 font-bold text-xs">历史记录</button>
            </div>

            {/* Card List */}
            {[
                { name: "招牌酱汁鸡腿", type: "gold", expire: "2026.05.01", id: "NO.9527" },
                { name: "爆炒空心菜", type: "silver", expire: "2026.04.20", id: "NO.8842" }
            ].map((ticket, i) => (
                <div key={i} className="bg-white rounded-[24px] shadow-sm border border-stone-100 overflow-hidden relative group active:scale-95 transition-transform">
                    {/* Rank Strip */}
                    <div className={`h - 1.5 w - full ${ticket.type === 'gold' ? 'bg-gradient-to-r from-amber-300 to-yellow-500' : 'bg-slate-300'} `} />

                    <div className="p-5 flex justify-between items-stretch">
                        <div className="flex flex-col justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text - [10px] px - 1.5 py - 0.5 rounded font - black uppercase ${ticket.type === 'gold' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'} `}>
                                        {ticket.type === 'gold' ? 'Gold' : 'Silver'}
                                    </span>
                                    <span className="text-xs text-stone-400 font-mono">{ticket.id}</span>
                                </div>
                                <h3 className="font-bold text-stone-800 text-lg">{ticket.name}</h3>
                            </div>
                            <span className="text-xs text-stone-400 mt-2">有效期至 {ticket.expire}</span>
                        </div>

                        {/* QR Stub */}
                        <div className="w-24 border-l border-dashed border-stone-200 pl-4 flex flex-col items-center justify-center gap-1 group-active:opacity-50">
                            <div className="w-12 h-12 bg-stone-900 rounded-lg p-1 opacity-10"></div>
                            <span className="text-[10px] font-bold text-stone-400">点击核销</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );

    // 4. Fragments Detail View
    const FragmentsDetail = () => (
        <div className="p-6 h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Target Recipe Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <span className="text-rose-200 text-xs font-bold uppercase tracking-wider">正在研制</span>
                    <h2 className="text-2xl font-black text-white mt-1">招牌酱汁鸡腿</h2>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-2xl backdrop-blur-sm shadow-inner">
                    🍗
                </div>
            </div>

            {/* Slots Grid */}
            <div className="bg-black/20 p-6 rounded-[32px] backdrop-blur-md mb-6">
                <div className="flex justify-between text-xs font-bold text-rose-200 mb-4 px-2">
                    <span>所需食材</span>
                    <span>3 / 5</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { icon: '🍗', has: true, name: '鸡腿', count: 1 },
                        { icon: '🥬', has: true, name: '青菜', count: 2 },
                        { icon: '🧄', has: true, name: '蒜瓣', count: 1 },
                        { icon: '🌶️', has: false, name: '辣椒', count: 0 },
                        { icon: '🧂', has: false, name: '精盐', count: 0 },
                        { icon: '🎁', has: false, name: '神秘', count: 0 }, // Extra slot styling
                    ].map((item, i) => (
                        <div key={i} className={`aspect - square rounded - 2xl flex flex - col items - center justify - center relative transition - all ${item.has ? 'bg-white shadow-lg' : 'bg-white/5 border-2 border-dashed border-rose-300/30'} `}>
                            {item.has ? (
                                <>
                                    <span className="text-3xl mb-1">{item.icon}</span>
                                    <span className="text-[10px] font-bold text-stone-600">{item.name}</span>
                                    <span className="absolute top-1 right-1 bg-rose-500 text-white text-[8px] font-bold px-1.5 rounded-full">{item.count}</span>
                                </>
                            ) : (
                                <>
                                    <span className="text-xs font-bold text-rose-200/50 mb-1">缺</span>
                                    <span className="text-[10px] text-rose-200/50">{item.name}</span>
                                    <button className="absolute -bottom-2 bg-rose-600 text-[8px] text-white px-2 py-0.5 rounded-full font-bold shadow-sm">
                                        去集市
                                    </button>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Action Bar */}
            <div className="mt-auto">
                <button className="w-full py-4 bg-stone-900/40 text-rose-200 rounded-2xl font-bold backdrop-blur-md border border-white/10 flex items-center justify-center gap-2 active:scale-95 transition-transform mb-3">
                    ⟵ 切换食谱 ⟶
                </button>
                <p className="text-center text-rose-200/60 text-xs">集齐所有食材即可自动合成入席令</p>
            </div>
        </div>
    );

    // --- Main Rendering Setup ---
    const cards: CardData[] = [
        {
            id: 'silver',
            title: '碎银子',
            color: 'bg-stone-50', // Lighter grey for better contrast
            headerContent: (
                <div className="flex justify-between items-center w-full px-6 h-full">
                    <span className="text-xs font-bold text-stone-400 tracking-widest uppercase">Silver</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-stone-800">12,850</span>
                        <span className="text-xs text-stone-500 font-bold">两</span>
                    </div>
                </div>
            ),
            detailContent: <SilverDetail />
        },
        {
            id: 'balance',
            title: '储蓄资金',
            color: 'bg-indigo-600',
            headerContent: (
                <div className="flex justify-between items-center w-full px-6 h-full text-white">
                    <span className="text-xs font-bold text-indigo-300 tracking-widest uppercase">Balance</span>
                    <span className="text-2xl font-black">¥120.00</span>
                </div>
            ),
            detailContent: <BalanceDetail />
        },
        {
            id: 'orders',
            title: '入席令',
            color: 'bg-amber-400',
            headerContent: (
                <div className="flex justify-between items-center w-full px-6 h-full text-amber-950">
                    <span className="text-xs font-bold text-amber-800/60 tracking-widest uppercase">Orders</span>
                    <span className="px-3 py-1 bg-white/30 rounded-full text-xs font-black backdrop-blur-sm">2 张可用</span>
                </div>
            ),
            detailContent: <OrdersDetail />
        },
        {
            id: 'fragments',
            title: '碎片进度',
            color: 'bg-rose-500',
            headerContent: (
                <div className="flex justify-between items-center w-full px-6 h-full text-white">
                    <span className="text-xs font-bold text-rose-200 tracking-widest uppercase">Fragments</span>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold opacity-90">3/5</span>
                        <div className="w-12 h-1.5 bg-rose-800/30 rounded-full overflow-hidden">
                            <div className="w-3/5 h-full bg-white"></div>
                        </div>
                    </div>
                </div>
            ),
            detailContent: <FragmentsDetail />
        }
    ];

    const toggleCard = (id: string | null) => {
        setExpandedCard(expandedCard === id ? null : id);
    };

    return (
        <div className="h-full relative overflow-hidden bg-slate-100 font-['Inter',sans-serif] select-none">
            {/* Header Area */}
            <div className={`px - 6 pt - 6 transition - all duration - 500 ${expandedCard ? 'opacity-0 translate-y-[-20px]' : 'opacity-100 translate-y-0'} `}>
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center text-white font-bold text-xs ring-4 ring-slate-200">
                            MQ
                        </div>
                        <div>
                            <h1 className="text-sm font-bold text-slate-800">午安，食客</h1>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">MealQuest Member</div>
                        </div>
                    </div>
                    <button className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center border border-slate-100 text-slate-400 active:scale-90 transition-transform">
                        🔔
                    </button>
                </div>
            </div>

            {/* Click backdrop to collapse */}
            {expandedCard && (
                <div className="absolute inset-0 z-0 bg-slate-900/5 backdrop-blur-[2px] transition-all" onClick={() => setExpandedCard(null)} />
            )}

            {/* Cards Stack */}
            {cards.map((card, index) => {
                const isExpanded = expandedCard === card.id;
                const isHidden = expandedCard && expandedCard !== card.id;

                // Stack Logic
                const baseOffset = 100 + (index * 85);
                let transformStyle = '';

                if (isExpanded) {
                    transformStyle = 'translateY(100px)';
                } else if (isHidden) {
                    transformStyle = `translateY(120 %)`; // Push others away
                } else {
                    transformStyle = `translateY(${baseOffset}px) scale(${1 - (index * 0.03)})`; // Subtle scale depth
                }

                return (
                    <div
                        key={card.id}
                        onClick={(e) => { e.stopPropagation(); toggleCard(card.id); }}
                        className={`absolute left - 0 right - 0 h - [85 %] rounded - t - [40px] shadow - [0_ - 10px_40px_rgba(0, 0, 0, 0.1)] transition - all duration - 500 cubic - bezier(0.34, 1.56, 0.64, 1) cursor - pointer overflow - hidden ${card.color} z - ${(index + 1) * 10} will - change - transform`}
                        style={{ transform: transformStyle }}
                    >
                        {/* Drag Handle Area */}
                        <div className="h-[75px] relative">
                            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-8 h-1 bg-black/5 rounded-full" />
                            {card.headerContent}
                        </div>

                        {/* Content Area */}
                        <div className={`h - full overflow - y - auto pb - 32 transition - opacity duration - 300 delay - 100 ${isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'} `}>
                            {card.detailContent}
                        </div>
                    </div>
                );
            })}

            {/* Payment Dock - Context Aware */}
            <div className={`fixed bottom - 8 left - 1 / 2 - translate - x - 1 / 2 w - [90 %] transition - all duration - 500 z - 50 ${expandedCard ? 'translate-y-[200%] opacity-0' : 'translate-y-0 opacity-100'} `}>
                <div className="bg-slate-900 rounded-[28px] p-2 pr-3 flex items-center justify-between shadow-2xl shadow-slate-900/40 border border-white/10 backdrop-blur-md">
                    <div className="flex items-center gap-3 pl-4">
                        <div className="w-11 h-11 bg-indigo-500 rounded-2xl flex items-center justify-center rotate-3 shadow-lg shadow-indigo-500/30 text-white">
                            <Icons.Scan />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-white font-bold text-sm tracking-tight text-shadow">双模收银台</span>
                            <span className="text-[10px] text-slate-400 font-medium">Payment Dock</span>
                        </div>
                    </div>
                    <button className="bg-white text-slate-900 px-6 py-3.5 rounded-[22px] font-black text-sm active:scale-95 transition-transform shadow-lg shadow-white/10 hover:bg-slate-50">
                        支付/核销
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CustomerHome;

