import React from 'react';

const CustomerHome: React.FC = () => {
    return (
        <div className="flex flex-col gap-6 pb-20">
            {/* Brand Section */}
            <div className="px-6 pt-6">
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                    午安，<span className="text-indigo-600">食客</span>
                </h1>
                <p className="text-sm text-slate-500 font-medium">今天也是充满惊喜的一餐</p>
            </div>

            {/* Asset Cards - 2.5D Style Container */}
            <div className="px-6 grid grid-cols-2 gap-4">
                {/* Silver Balance */}
                <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-1 transition-transform active:scale-95">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">碎银子</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-slate-800">1,280</span>
                        <span className="text-xs text-slate-400 font-bold">两</span>
                    </div>
                    <div className="mt-2 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="w-2/3 h-full bg-indigo-400" />
                    </div>
                </div>

                {/* Gift Account */}
                <div className="bg-indigo-600 p-4 rounded-3xl shadow-lg shadow-indigo-200 flex flex-col gap-1 transition-transform active:scale-95 text-white">
                    <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">赠送金</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black uppercase">¥88.5</span>
                    </div>
                    <span className="text-[10px] text-indigo-200 font-medium mt-1">下次就餐自动抵扣</span>
                </div>
            </div>

            {/* Gourmet Cards Section - 2.5D Tilted Cards */}
            <div className="px-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="font-bold text-slate-800">我的口福卡</h2>
                    <span className="text-xs text-indigo-600 font-bold">查看全部</span>
                </div>

                <div className="relative h-44 flex items-center overflow-x-auto no-scrollbar gap-4 px-2 -mx-2">
                    {/* Card 1 */}
                    <div className="min-w-[140px] h-36 bg-gradient-to-br from-amber-200 to-orange-400 rounded-2xl shadow-xl shadow-orange-100 border border-white/50 relative overflow-hidden transform rotate-[-2deg] flex flex-col p-3 text-orange-950 transition-transform active:scale-90 touch-none">
                        <div className="absolute -right-4 -top-4 w-16 h-16 bg-white/20 rounded-full blur-xl" />
                        <span className="text-xs font-black">招牌酱汁鸡腿</span>
                        <div className="mt-auto">
                            <span className="text-2xl font-black">8.5</span>
                            <span className="text-[10px] ml-1 opacity-70 font-bold">折</span>
                        </div>
                        <div className="absolute bottom-2 right-2 w-6 h-6 bg-white/30 backdrop-blur-md rounded-lg flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-orange-900 rounded-full animate-pulse" />
                        </div>
                    </div>

                    {/* Card 2 */}
                    <div className="min-w-[140px] h-36 bg-gradient-to-br from-indigo-400 to-purple-600 rounded-2xl shadow-xl shadow-indigo-100 border border-white/50 relative overflow-hidden transform rotate-[3deg] flex flex-col p-3 text-white transition-transform active:scale-90 touch-none">
                        <div className="absolute -right-4 -top-4 w-16 h-16 bg-white/20 rounded-full blur-xl" />
                        <span className="text-xs font-black">满减特权</span>
                        <div className="mt-auto">
                            <span className="text-2xl font-black">20</span>
                            <span className="text-[10px] ml-1 opacity-70 font-bold">元</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Ingredients/Fragments Collection */}
            <div className="px-6">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex flex-col">
                        <h2 className="font-bold text-slate-800">已解锁食材</h2>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">收集碎片合成口福卡</span>
                    </div>
                    <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                        <div className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    {[
                        { img: "🍗", name: "鸡腿", color: "bg-orange-50" },
                        { img: "🥬", name: "青菜", color: "bg-emerald-50" },
                        { img: "🧄", name: "大蒜", color: "bg-yellow-50" },
                    ].map((item, idx) => (
                        <div key={idx} className={`${item.color} aspect-square rounded-[24px] flex flex-col items-center justify-center border border-white shadow-sm transition-transform active:scale-90`}>
                            <span className="text-3xl mb-1">{item.img}</span>
                            <span className="text-[10px] font-bold text-slate-500">{item.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Interaction Cards */}
            <div className="px-6 flex flex-col gap-4">
                {/* Game Entry */}
                <div className="bg-white border border-slate-100 p-5 rounded-[32px] flex items-center gap-4 shadow-sm group active:bg-slate-50 transition-all">
                    <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center text-2xl group-hover:rotate-12 transition-transform">
                        🔪
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-slate-800">神厨飞刀</h3>
                        <p className="text-xs text-slate-500 font-medium tracking-tight mt-0.5">玩游戏 赢碎银 • 离免费吃更近</p>
                    </div>
                    <div className="w-8 h-8 flex items-center justify-center text-slate-300">
                        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 stroke-current stroke-[3px]">
                            <path d="M9 18l6-6-6-6" />
                        </svg>
                    </div>
                </div>

                {/* Health/Steps */}
                <div className="bg-white border border-slate-100 p-5 rounded-[32px] flex items-center gap-4 shadow-sm active:bg-slate-50 transition-all">
                    <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-2xl">
                        👟
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-slate-800">步数换钱</h3>
                        <p className="text-xs text-slate-500 font-medium tracking-tight mt-0.5">今日已走 <span className="text-emerald-600 font-black">8,420</span> 步</p>
                    </div>
                    <span className="text-[10px] font-black px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">进行中</span>
                </div>
            </div>

            {/* Floating Bottom Nav - Scan Action */}
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-[343px]">
                <button className="w-full h-16 bg-slate-900 rounded-full shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-transform group">
                    <div className="w-8 h-8 bg-indigo-500 rounded-xl flex items-center justify-center transform group-hover:rotate-90 transition-transform">
                        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 stroke-white stroke-[3px]">
                            <path d="M3 7V5a2 2 0 012-2h2m10 0h2a2 2 0 012 2v2m0 10v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10" />
                        </svg>
                    </div>
                    <span className="text-white font-bold tracking-widest text-sm">扫码点餐 / 支付</span>
                </button>
            </div>
        </div>
    );
};

export default CustomerHome;
