const React = require('react');

const mapProps = (props = {}) => {
    const mapped = { ...props };
    if (mapped.onTap) {
        mapped.onClick = mapped.onTap;
        delete mapped.onTap;
    }
    delete mapped.scrollY;
    delete mapped.scrollX;
    delete mapped.enhanced;
    delete mapped.showScrollbar;
    delete mapped.pagingEnabled;
    delete mapped.scrollWithAnimation;
    delete mapped.enableBackToTop;
    delete mapped.lowerThreshold;
    delete mapped.upperThreshold;
    delete mapped.onScrollToUpper;
    delete mapped.onScrollToLower;
    return mapped;
};

const createComponent = (tag) => {
    const Comp = React.forwardRef((props, ref) => React.createElement(tag, { ...mapProps(props), ref }));
    Comp.displayName = `Mock${tag}`;
    return Comp;
};

const taroComponentsMock = {
    View: createComponent('div'),
    Text: createComponent('span'),
    Button: createComponent('button'),
    Image: createComponent('img'),
    ScrollView: createComponent('div'),
    Input: createComponent('input'),
    Textarea: createComponent('textarea'),
};

module.exports = taroComponentsMock;
module.exports.default = taroComponentsMock;
module.exports.View = taroComponentsMock.View;
module.exports.Text = taroComponentsMock.Text;
module.exports.Button = taroComponentsMock.Button;
module.exports.Image = taroComponentsMock.Image;
module.exports.ScrollView = taroComponentsMock.ScrollView;
module.exports.Input = taroComponentsMock.Input;
module.exports.Textarea = taroComponentsMock.Textarea;
