module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    parser: '@typescript-eslint/parser',
    sourceType: 'module'
  },
  rules: {
    '@typescript-eslint/ban-ts-comment': 'off', // 使用ts注释
    '@typescript-eslint/no-explicit-any': 'off', // 使用any
    '@typescript-eslint/ban-types': 'off',
  }
}
