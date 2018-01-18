'use strict';

const fs = require('fs');
const path = require('path');
const CONFIG = require('./config.json');
const Liner = require('./liner.js');
const getLiner = file => new Liner(path.join(CONFIG.LOGSDIR, file));
const isLog = file => path.extname(file) === '.log';

const RE = {
	TIMESTAMP : /^\[.+GMT\]\s(.+)/,
	SITENAME  : /^Sites-(.*)-?Site$/,
	SESSION   : /^(.+?)\s+\d{17,20}\s+/,
	STRACE    : /^Stack trace <(ref:)?(\w+)>$/
};

const STRACE = {};
const ERRORS = {};
const logs = fs.readdirSync(CONFIG.LOGSDIR);

console.log(CONFIG.LOGSDIR);
console.log(logs);

logs.filter(isLog).map(process);

//console.log(STRACE);
//console.log(ERRORS);

//    fs.writeFileSync(require("path").join(options.errorlog_dir, fileName), fileData);

function process(log) {
	console.log(`process: ${log}`);
	let liner = getLiner(log);
	let line = liner.next();
    let site, pipe, msg;

	while (line !== null) {
		const found = line.match(RE.TIMESTAMP);
		if (found) {
			const parts = found[1].split('|');
			site = parts && parts[2];
			if (site) {
				pipe = parts[3];
				site = site.replace(RE.SITENAME, '$1');
				msg = parts[5] && parts[5].replace(RE.SESSION, '') || '';
			}
			line = liner.next();
		}
		else {
			const found = line.match(RE.STRACE);
			if ( found && site ) {
				const key = found[2];
				STRACE[key] = liner.next();
				line = liner.next();
				if ( !RE.TIMESTAMP.test(line) ) STRACE[key] += line;

				if ( !(key in ERRORS) ) ERRORS[key] = {};
				if ( !('total' in ERRORS[key]) ) ERRORS[key].total = 0;
				if ( !('sites' in ERRORS[key]) ) ERRORS[key].sites = {};

				if ( ERRORS[key].total === 0 ) {
					ERRORS[key].msg = msg;
					ERRORS[key].pipe = pipe;
				}
				ERRORS[key].total++;
				
				const count = ERRORS[key].sites[site];
				ERRORS[key].sites[site] = count ? count + 1 : 1;
			}
			else line = liner.next();
		}
	}
	return log;
}
