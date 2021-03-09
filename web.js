'use strict';

const express = require('express');
const packageInfo = require('./package.json');

const app = express();

app.get('/', (req, res) => {
	res.json({ version: packageInfo.version });
});

const server = app.listen(process.env.PORT, () => {
	const { port, address: host } = server.address().port;

	console.log('Web server started at http://%s:%s', host, port);
});
