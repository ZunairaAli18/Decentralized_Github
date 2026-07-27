require('dotenv').config();

const express = require('express');
const db = require('./db');
const reposRouter = require('./routes/repos');
const replicateRouter = require('./routes/replicate');
const { catchUpFromPeers } = require('./gossip/replication');
const gitRouter = require('./routes/git');


const app = express();
app.use(express.json());

app.get('/health', (_, res) => res.json({
    status: 'node ok',
    id: process.env.NODE_ID,
}));

app.use('/node/repos', reposRouter);
app.use('/node/replicate', replicateRouter);
app.use('/node/repos/:repoId/git', gitRouter);


async function start() {
    try {
        await db.query('SELECT 1');
        console.log(`[${process.env.NODE_ID}] DB connected`);
    } catch (err) {
        console.error(`Failed to start node-service: ${err}`);
        process.exit(1);
    }

    const PORT = process.env.PORT || 4001;
    app.listen(PORT, () => {
        console.log(`Node ${process.env.NODE_ID} running on :${PORT}`);

        // server start hone ke 2 sec baad catch-up karo
        // taake peers bhi ready hon
        setTimeout(() => {
            catchUpFromPeers().catch(() => { });
        }, 2000);
    });

}

start();