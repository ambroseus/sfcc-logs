'use strict';

const fs = require('fs');
const path = require('path');
const hash = require('crypto').createHash;
const md5  = x => hash('md5').update(x).digest('hex');

const CONFIG = require('./config.json');
const Liner = require('./liner.js');
const getLiner = file => new Liner(path.join(CONFIG.LOGSDIR, file));
const isLog = file => path.extname(file) === '.log';

const RE = {
	STAMP   : /^\[.+GMT\]\s(.+)/,
	SITES   : /Sites-(.*?)-?Site/,
	SESSION : /^(.+?)\s+\d{17,20}\s+/,
	STRACE  : /^Stack trace <(ref:)?(\w+)>/
};

const STRACE = {};
const ERRORS = {};
const logs = fs.readdirSync(CONFIG.LOGSDIR);

console.log(CONFIG.LOGSDIR);
console.log(logs);
logs.filter(isLog).map(strace).map(process);

//console.log(STRACE);

Object.keys(ERRORS)
	.filter( a => ERRORS[a].total > CONFIG.MAXERRORS )
	.sort( (a,b) => ERRORS[a].total < ERRORS[b].total )
	.map(stats);


//    fs.writeFileSync(require("path").join(options.errorlog_dir, fileName), fileData);

function strace(log) {
  	console.log(`stacktrace: ${log}`);
  	let liner = getLiner(log);
 	let line = liner.next();
  
  	while (line !== null) {
  		const found = line.match(RE.STRACE);
  		if ( found && !found[1] ) {
  		    const key = found[2];
  			STRACE[key] = liner.next();
			line = liner.next();
  			if ( !RE.STAMP.test(line) ) STRACE[key] += line;
  		}
		line = liner.next();
 	}
  	return log;
}

function process(log) {
	console.log(`process: ${log}`);
	let liner = getLiner(log);
	let line = liner.next();
    let site, pipe, msg;

	while (line !== null) {
		const found = line.match(RE.STAMP);
		if (found) {
			const parts = found[1].split('|');
			site = parts && parts[0] === 'ERROR PipelineCallServlet' && parts[2];
			if (site) {
				pipe = parts[3];
				site = site.replace(RE.SITES, '$1');
				msg = parts[5] && parts[5].replace(RE.SESSION, '') || '';
			}
		}
		else {
			const found = line.match(RE.STRACE);
			if ( found && site ) {
				const desc = `${msg}\n${STRACE[found[2]]}`;
				const key = md5(desc);

				if ( !(key in ERRORS) ) ERRORS[key] = {};
				if ( !('total' in ERRORS[key]) ) ERRORS[key].total = 0;
				if ( !('sites' in ERRORS[key]) ) ERRORS[key].sites = {};

				if ( ERRORS[key].total === 0 ) {
					ERRORS[key].desc = desc;
					ERRORS[key].pipe = pipe;
				}
				ERRORS[key].total++;
				
				const count = ERRORS[key].sites[site];
				ERRORS[key].sites[site] = count ? count + 1 : 1;
			}
		}
		line = liner.next();
	}
	return log;
}

function stats(key) {
	console.log(ERRORS[key]);
	return key;
}