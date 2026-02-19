Component({
    options: {
        multipleSlots: true,
        styleIsolation: 'shared'
    },
    properties: {},
    data: {},
    lifetimes: {
        attached() {
            console.log('WxsScrollView Component Attached!');
        }
    },
    methods: {}
});
