'use strict';

const fs = require('fs');
const path = require('path');
const options = require('./config.json');
const { analyzeLogs } = require('./analyzer.js');
const { summaryHtml } = require('./formatter.js');

const date = process.argv[2] || '';

const logs = fs.readdirSync(options.LOGSDIR)
		.filter( file => path.extname(file) === '.log' && (!date || file.indexOf(date) > 0) )
		.map( file => path.join(options.LOGSDIR, file) );

const errors = analyzeLogs(logs);
const topErrors = Object.keys(errors)
		.filter( key => errors[key].total > options.MAXERRORS )
		.sort( (a,b) => errors[b].total - errors[a].total )
		.map(key => errors[key]);

const file = path.join(options.LOGSDIR, `${options.SUMMARY}-${date}.html`);
console.log(`output: ${file}`);
fs.writeFileSync( file, summaryHtml(topErrors) );
console.log('done.');

