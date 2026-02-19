module.exports = {
    extends: ['taro/react'],
    env: {
        jest: true
    },
    rules: {
        'react/jsx-uses-react': 'off',
        'react/react-in-jsx-scope': 'off',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error'],
        'react-hooks/exhaustive-deps': 'warn'
    }
}
