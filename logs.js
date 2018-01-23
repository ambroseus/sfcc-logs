'use strict';

const options = require('./config.json');
const analyzeLogs = require('./analyzer.js').analyzeLogs;
const summaryHtml = require('./formatter.js').summaryHtml; 
const summaryFile = require('path').join(options.LOGSDIR, options.SUMMARY);

require('fs').writeFileSync( summaryFile, summaryHtml(analyzeLogs(options)) );
console.log(`output: ${summaryFile}\n\ndone.`);
