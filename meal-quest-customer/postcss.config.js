// postcss.config.js
module.exports = {
    plugins: [
        require('tailwindcss'),
        require('autoprefixer'),
        {
            // Replaces universal selectors (*) to be compatible with WeChat WXSS.
            // IMPORTANT: scroll-view is intentionally excluded from all replacements.
            // WeChat's scroll-view in webview rendering mode does NOT support padding/margin.
            // Including scroll-view would cause Tailwind's preflight (padding:0, margin:0) 
            // to be applied to it, triggering runtime warnings.
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
