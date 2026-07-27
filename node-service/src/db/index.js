const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
    console.error(`[${process.env.NODE_ID}] database pool error: ${err.message}`);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};