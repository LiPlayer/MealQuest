// postcss.config.js
module.exports = {
    plugins: [
        require('tailwindcss'),
        require('autoprefixer'),
        {
            postcssPlugin: 'postcss-remove-universal-selector',
            Rule(rule) {
                if (rule.selector === '*' || rule.selector === '*, ::before, ::after') {
                    rule.selector = 'page, view, text, ::before, ::after';
                } else if (rule.selector.includes('*')) {
                    rule.selector = rule.selector.replace(/\*/g, 'page');
                }
            }
        }
    ],
}
