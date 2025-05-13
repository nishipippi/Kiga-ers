// apps/web/postcss.config.js
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {}, // ここを 'tailwindcss': {} から変更します
    autoprefixer: {},
  },
};