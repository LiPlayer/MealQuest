const React = require('react');

const mapProps = (props = {}) => {
    const mapped = { ...props };
    if (mapped.onTap) {
        mapped.onClick = mapped.onTap;
        delete mapped.onTap;
    }
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
};

module.exports = taroComponentsMock;
module.exports.default = taroComponentsMock;
module.exports.View = taroComponentsMock.View;
module.exports.Text = taroComponentsMock.Text;
module.exports.Button = taroComponentsMock.Button;
module.exports.Image = taroComponentsMock.Image;
module.exports.ScrollView = taroComponentsMock.ScrollView;
