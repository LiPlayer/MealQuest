Component({
    options: {
        multipleSlots: true,
        styleIsolation: 'shared'
    },
    properties: {},
    data: {
        // For Alipay (JS-based animation fallback)
        brandStyle: '',
        titleStyle: 'opacity: 0; transform: translate3d(-8px, 0, 0);',
        cardStyle: ''
    },
    lifetimes: {
        attached() {
            console.log('WxsScrollView Component Attached!');
        }
    },
    methods: {
        onScroll: function (e) {
            // This method is called by Alipay's onScroll (or WeChat if WXS fails/is not used)
            // We implement the SAME logic as index.wxs but via setData

            const scrollTop = e.detail.scrollTop;
            const BRAND_COLLAPSE_HEIGHT = 110;
            const FOLD_HEIGHT = 360;

            // 1. ShopBrand
            let p1 = Math.min(1, Math.max(0, scrollTop / BRAND_COLLAPSE_HEIGHT));
            let scale = (1 - p1 * 0.3).toFixed(4); // Match WXS 0.3 shrink
            let opacity = (p1 > 0.7 ? 1 - (p1 - 0.7) / 0.3 : 1).toFixed(2);

            const brandStyle = `transform: scale(${scale}); opacity: ${opacity}; transition: none;`;

            // 2. Title
            let tp = Math.min(1, Math.max(0, (scrollTop - BRAND_COLLAPSE_HEIGHT * 0.7) / (BRAND_COLLAPSE_HEIGHT * 0.3)));
            let tx = Math.floor((1 - tp) * -8);

            const titleStyle = `opacity: ${tp.toFixed(2)}; transform: translate3d(${tx}px, 0, 0); transition: none;`;

            // 3. Cards
            let phase2 = Math.max(0, scrollTop - BRAND_COLLAPSE_HEIGHT);
            let p2 = Math.min(1, phase2 / FOLD_HEIGHT);
            let scaleCard = (1 - p2 * 0.2).toFixed(4); // Match WXS 0.2 shrink
            let opacityCard = (1 - p2 * 0.5).toFixed(2);

            const cardStyle = `transform: scale(${scaleCard}); opacity: ${opacityCard}; transition: none;`;

            // Throttle? Or just set? Alipay setData is reasonably fast.
            this.setData({
                brandStyle,
                titleStyle,
                cardStyle
            });
        }
    }
});
