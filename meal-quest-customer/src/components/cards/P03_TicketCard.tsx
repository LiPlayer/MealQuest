import {View, Text, Image} from '@tarojs/components';
import React from 'react';

import './P03_TicketCard.scss';

export interface Voucher {
    id: string;
    name: string;
    value: number;
    icon?: string;
    minSpend?: number;
    status?: 'ACTIVE' | 'USED' | 'EXPIRED';
    expiresAt?: string;
}

interface TicketCardProps {
    style?: React.CSSProperties;
    isFocused?: boolean;
    vouchers?: Voucher[];
    onGoToSynthesis?: () => void;
    onUseVoucher?: (voucher: Voucher) => void;
    onMoreClick?: () => void;
}

function isUrgentVoucher(voucher?: Voucher): boolean {
    if (!voucher?.expiresAt) {
        return false;
    }
    const deadline = new Date(voucher.expiresAt).getTime();
    if (Number.isNaN(deadline)) {
        return false;
    }
    return deadline - Date.now() <= 24 * 60 * 60 * 1000;
}

export default function P03_TicketCard({
    style,
    isFocused,
    vouchers = [],
    onGoToSynthesis,
    onUseVoucher,
    onMoreClick,
}: TicketCardProps) {
    const count = vouchers.length;
    const topVoucher = vouchers[0];

    const renderEmptyState = () => (
        <View className="empty-state" onClick={onGoToSynthesis}>
            <View className="empty-plate">
                <View className="plate-inner" />
            </View>
            <Text className="empty-text">暂无可兑付资产</Text>
            <View className="synthesis-btn-mini">
                <Text>去合成第一道菜</Text>
            </View>
        </View>
    );

    const renderSingleState = () => (
        <View className="single-state" onClick={() => topVoucher && onUseVoucher?.(topVoucher)}>
            <View className="asset-hero">
                {topVoucher?.icon ? (
                    <Image className="asset-icon-large" src={topVoucher.icon} mode="aspectFit" />
                ) : (
                    <View className="asset-placeholder-large" />
                )}
                <View className="holographic-overlay" />
                {isUrgentVoucher(topVoucher) && (
                    <View className="asset-urgent-tag">
                        <Text className="asset-urgent-tag__text">24h 内到期</Text>
                    </View>
                )}
            </View>
            <View className="asset-info-large">
                <Text className="asset-name">{topVoucher?.name}</Text>
                <Text className="asset-value">¥{topVoucher?.value ?? 0}</Text>
                {topVoucher?.minSpend ? (
                    <Text className="asset-rule">满 {topVoucher.minSpend} 可用</Text>
                ) : (
                    <Text className="asset-rule">无门槛直接抵扣</Text>
                )}
            </View>
        </View>
    );

    const renderMinimalState = () => (
        <View className="minimal-grid">
            {vouchers.map(v => (
                <View key={v.id} className="minimal-item" onClick={() => onUseVoucher?.(v)}>
                    <View className="asset-icon-wrap">
                        {v.icon ? (
                            <Image className="asset-icon-sm" src={v.icon} />
                        ) : (
                            <View className="asset-placeholder-sm" />
                        )}
                    </View>
                    <Text className="asset-name-sm">{v.name}</Text>
                </View>
            ))}
        </View>
    );

    const renderAssetGridState = () => {
        const displayedVouchers = vouchers.slice(0, 5);
        const hasMore = vouchers.length > 5;
        const moreCount = vouchers.length - 5;

        return (
            <View className="asset-grid">
                {displayedVouchers.map(v => (
                    <View key={v.id} className="grid-item" onClick={() => onUseVoucher?.(v)}>
                        <View className="asset-icon-wrap-grid">
                            {v.icon ? (
                                <Image className="asset-icon-grid" src={v.icon} />
                            ) : (
                                <View className="asset-placeholder-grid" />
                            )}
                            <View className="asset-badge">
                                <Text>x1</Text>
                            </View>
                        </View>
                    </View>
                ))}
                {hasMore && (
                    <View className="grid-item more-item" onClick={onMoreClick}>
                        <View className="more-overlay">
                            <Text className="more-text">+{moreCount}</Text>
                        </View>
                    </View>
                )}
            </View>
        );
    };

    return (
        <View
            style={{
                ...style,
                backgroundImage:
                    'radial-gradient(circle at 6% 0%, rgba(251,113,133,0.20), transparent 36%), linear-gradient(145deg, rgba(255,241,242,0.34), #ffffff 62%)',
                borderColor: 'rgba(254,205,211,0.7)',
            }}
            className={`relative w-full rounded-3xl overflow-hidden border box-border text-slate-900 p03-ticket-card ${isFocused ? 'is-focused' : ''}`}>
            <View className="h-full flex flex-col box-border card-shell">
                <View className="card-header">
                    <Text className="card-title">口福红包</Text>
                    {count > 0 && (
                        <View className="card-badge">
                            <Text className="card-badge-text">{count} VOUCHERS</Text>
                        </View>
                    )}
                </View>

                <View className="card-body">
                    {count === 0 && renderEmptyState()}
                    {count === 1 && renderSingleState()}
                    {count > 1 && count <= 3 && renderMinimalState()}
                    {count >= 4 && renderAssetGridState()}
                </View>
            </View>
        </View>
    );
}

