'use strict';

const fs = require('fs');
const path = require('path');
const options = require('./config.json');

const errors = require('./analyzer.js').logs(options);
const formatter = require('./formatter.js');

const summary = format => {
	const file = path.join(options.logsDir, `summary.${format}`);
	fs.writeFileSync( file, formatter[format](errors) );
	console.log(`output: ${file}`);
}

summary('json');
summary('html');
console.log(`\ndone.`);
