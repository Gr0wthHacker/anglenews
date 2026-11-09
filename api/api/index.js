// Vercel entry point for the AngleCheck API.
// `npm run build` compiles src/ and ../shared/ into dist/; this file wraps the
// compiled Hono app for Vercel's Node.js runtime. Every path is rewritten here
// by vercel.json, so routes stay at /api/health, /api/analyze and so on.
const { handle } = require("@hono/node-server/vercel");
const app = require("../dist/api/src/index.js").default;

module.exports = handle(app);
