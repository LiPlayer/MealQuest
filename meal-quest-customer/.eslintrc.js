module.exports = {
    extends: ['taro/react'],
    env: {
        jest: true,
        node: true
    },
    globals: {
        wx: 'readonly',
        Component: 'readonly'
    },
    rules: {
        'react/jsx-uses-react': 'off',
        'react/react-in-jsx-scope': 'off',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error'],
        'react-hooks/exhaustive-deps': 'warn',
        'react/jsx-pascal-case': 'off',
        'jsx-quotes': 'off',
        'react/jsx-indent-props': 'off',
        'react/jsx-closing-bracket-location': 'off',
        'import/no-commonjs': 'off',
        'import/first': 'off'
    },
    overrides: [
        {
            files: ['test/e2e/**/*.js', 'test/__mocks__/**/*.js', 'src/components/native/**/*.js'],
            env: {
                node: true,
                jest: true
            },
            rules: {
                'no-undef': 'off',
                'import/no-commonjs': 'off'
            }
        }
    ]
}
