'use strict';

const CONFIG = require('./config.json');

const fs   = require('fs');
const path = require('path');
const hash = require('crypto').createHash;
const md5  = x => hash('md5').update(x).digest('hex');
const Liner = require('./liner.js');
const getLiner = file => new Liner(path.join(CONFIG.logsdir, file));

let STRACE = {};
let ERRORS = {};

console.log(CONFIG.logsdir);

const logs = fs.readdirSync(CONFIG.logsdir);
logs.filter(file => path.extname(file) !== 'log').map(process);

console.log(STRACE);

console.log(ERRORS);

//    fs.writeFileSync(require("path").join(options.errorlog_dir, fileName), fileData);

function process(log) {
	console.log(`process: ${log}`);
	let liner = getLiner(log);
	let line = liner.next();
    let site, pipe, msg;

	while (line) {

		const found = line.match(/^\[.+GMT\]\s(.+)/);
		if (found) {

	console.log(line);

		const parts = found[1].split('|');
			site = parts && parts[2];
			if (site) {
				pipe = parts[3];
				site = site.replace(/^Sites-/, '').replace(/-?Site$/, '');
				msg = parts[5] && parts[5].replace(/^(.+?)\s+\d{17,20}\s+/, '') || '';
			}
			line = liner.next();;
		}
		else {
	console.log(line);

		const found = line.match(/^Stack trace <(ref:)?(\w+)>$/);
			if ( found && site ) {
				const key = found[2];
				STRACE[key] = liner.next();
				line = liner.next();
				if ( !/^\[.+GMT\]/.test(line) ) STRACE[key] += line;

				if ( !(key in ERRORS) ) ERRORS[key] = {};
				if ( !('count' in ERRORS[key]) ) ERRORS[key].count = 0;
				if ( !('sites' in ERRORS[key]) ) ERRORS[key].sites = {};

				if ( ERRORS[key].count === 0 ) {
					ERRORS[key].msg = msg;
					ERRORS[key].pipe = pipe;
				}
				ERRORS[key].count++;
				ERRORS[key].sites[site] = true;
			}
			else {
				line = liner.next();
			}
		}
	}
	return log;
}
