'use strict';

const fs = require('fs');
const path = require('path');
const options = require('./config.json');
const { analyzeLogs } = require('./analyzer.js');
const formatter = require('./formatter.js');

function writeSummaryFile(errors, format) {
	const file = path.join(options.LOGSDIR, `summary.${format}`);
	fs.writeFileSync( file, formatter[format](errors) );
	console.log(`output: ${file}`);
}

const logs = fs.readdirSync(options.LOGSDIR)
				.filter( file => path.extname(file) === '.log' )
				.map( file => path.join(options.LOGSDIR, file) );

const errors = analyzeLogs(logs);
writeSummaryFile(errors, 'json');

const topErrors = Object.keys(errors)
				.filter( key => errors[key].total > options.MAXERRORS )
				.sort( (a,b) => errors[b].total - errors[a].total )
				.map(key => errors[key]);

writeSummaryFile(topErrors, 'html');
console.log('done.');

