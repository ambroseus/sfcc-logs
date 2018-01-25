'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const { analyzeLogs } = require('./analyzer.js');
const { summaryHtml } = require('./formatter.js');

const date = process.argv[2] || ''; // YYYYMMDD

const logs = fs.readdirSync(config.LOGSDIR)
		.filter( fname => path.extname(fname) === '.log' && (!date || fname.indexOf(date) > 0) )
		.map( fname => path.join( config.LOGSDIR, fname ) );

const errors = analyzeLogs(logs);

const topErrors = Object.keys(errors)
		.filter( key => errors[key].total > config.MAXERRORS )
		.sort( (a,b) => errors[b].total - errors[a].total )
		.map( key => errors[key] );

const summary = path.join( config.LOGSDIR, `${config.SUMMARY}${date}.html` );

console.log(`output: ${summary}`);
fs.writeFileSync( summary, summaryHtml(topErrors) );

console.log('done.');

