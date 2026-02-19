import React from 'react';
import { View, ScrollView, Text } from '@tarojs/components';
import { useLoad } from '@tarojs/taro';

import ShopBrand from '../../components/ShopBrand';
import CustomerCardStack from '../../components/CustomerCardStack';
import ActivityArea from '../../components/ActivityArea';
import CustomerBottomDock from '../../components/CustomerBottomDock';

import './index.scss';

// Phase 1: shop brand collapses over this scroll distance (px)
const BRAND_COLLAPSE_HEIGHT = 110;
// Phase 2: card stack collapses over this scroll distance (px)
const FOLD_HEIGHT = 360;

export default function Index() {
    const shopBrandRef = React.useRef<any>(null);
    const cardStackRef = React.useRef<any>(null);
    const headerTitleRef = React.useRef<any>(null);

    useLoad(() => {
        console.log('Page loaded.');
    });

    /**
     * All scroll-driven animations are imperative (direct DOM mutations)
     * so we get native 60fps without React re-renders.
     */
    const onScroll = (e) => {
        const scrollTop = e.detail.scrollTop;

        // ── Phase 1: ShopBrand — parallax slower scroll ───────────────────
        // Brand scrolls at ~35% of scroll speed by counteracting 65% with translateY.
        // The card stack (z-index above brand) scrolls at full speed → slides over brand.
        const brandEl = shopBrandRef.current?.$el ?? shopBrandRef.current;
        if (brandEl) {
            const p1 = Math.min(1, Math.max(0, scrollTop / BRAND_COLLAPSE_HEIGHT));
            // Slow the brand: counteract 65% of scroll so brand only moves at 35% speed
            const parallax = scrollTop * 0.65;
            // Scale down slightly for depth (bottom-anchor keeps bottom fixed)
            const scale = 1 - p1 * 0.15;
            brandEl.style.transform = `translateY(${parallax}px) scale(${scale})`;
            // Opacity: stay visible until near-end so the occlusion is visible
            brandEl.style.opacity = p1 > 0.7 ? String(1 - (p1 - 0.7) / 0.3) : '1';
        }

        // ── Header compact title reveal ──────────────────────────────────
        const titleEl = headerTitleRef.current?.$el ?? headerTitleRef.current;
        if (titleEl) {
            const tp = Math.min(1, Math.max(0,
                (scrollTop - BRAND_COLLAPSE_HEIGHT * 0.7) / (BRAND_COLLAPSE_HEIGHT * 0.3)
            ));
            titleEl.style.opacity = String(tp);
            titleEl.style.transform = `translateX(${(1 - tp) * -8}px)`;
        }

        // ── Phase 2: Card stack — parallax slower scroll ─────────────────
        // Card stack slows to ~50% speed in its phase so the activity area covers it.
        const cardEl = cardStackRef.current?.$el ?? cardStackRef.current;
        if (cardEl) {
            const phase2 = Math.max(0, scrollTop - BRAND_COLLAPSE_HEIGHT);
            const p2 = Math.min(1, phase2 / FOLD_HEIGHT);
            // Slow the card stack relative to activity area
            const parallax = phase2 * 0.5;
            const scale = 1 - p2 * 0.12;
            cardEl.style.transform = `translateY(${parallax}px) scale(${scale})`;
            cardEl.style.opacity = String(1 - p2 * 0.5);
        }
    };

    return (
        <View className="index-container">
            <ScrollView
                scrollY
                className="main-scroll-view"
                enhanced
                showScrollbar={false}
                onScroll={onScroll}
            >
                {/* ── Sticky Navigation Bar ── */}
                <View className="sticky-header">
                    <View className="header-nav">
                        <View className="avatar-wrapper active:scale-95 transition-transform">
                            <View className="avatar-circle">
                                <Text className="avatar-emoji">👤</Text>
                            </View>
                        </View>

                        {/* Compact store name — fades in when ShopBrand scrolls away */}
                        <View ref={headerTitleRef} className="header-store-name">
                            <Text className="header-store-name__emoji">🏮</Text>
                            <Text className="header-store-name__text">探味轩</Text>
                        </View>

                        <View className="navigation-capsule">
                            <View className="capsule-dots">•••</View>
                            <View className="capsule-divider" />
                            <View className="capsule-circle" />
                        </View>
                    </View>
                </View>

                {/* ── ShopBrand — in scroll flow, collapses first ── */}
                <View
                    ref={shopBrandRef}
                    className="shop-brand-scroll-wrapper"
                    style={{
                        transformOrigin: 'bottom center',
                        willChange: 'transform, opacity',
                        transform: 'scale(1)',
                        opacity: '1',
                    }}
                >
                    <ShopBrand />
                </View>

                {/* ── Card Stack — collapses after brand ── */}
                <View
                    ref={cardStackRef}
                    className="card-stack-section"
                    style={{
                        transformOrigin: 'bottom center',
                        zIndex: 10,
                        position: 'relative',
                        transform: 'scale(1)',
                        willChange: 'transform, opacity',
                    }}
                >
                    <CustomerCardStack />
                </View>

                {/* ── Activity Area ── */}
                <View className="activity-area-container">
                    <ActivityArea />
                </View>
            </ScrollView>

            {/* 底部水晶支付坞 */}
            <CustomerBottomDock />
        </View>
    );
}
