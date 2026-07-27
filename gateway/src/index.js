const express = require('express');
const { router: authRouter } = require('./middleware/auth');
const reposRouter = require('./routes/repos');
const nodesRouter = require('./routes/nodes');

const app = express();
app.use(express.json());

app.get('/health', (_, res) => res.json({ status: 'gateway ok' }));

app.use('/auth', authRouter);
app.use('/repos', reposRouter);
app.use('/nodes', nodesRouter);

app.listen(3000, () => console.log('Gateway running on :3000'));