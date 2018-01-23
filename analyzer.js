'use strict';

const fs = require('fs');
const path = require('path');
const hash = require('crypto').createHash;
const md5 = x => hash('md5').update(x).digest('hex');
const Liner = require('./liner.js');

const strace = {};
const errors = {};

const RE = {
	STAMP   : /^\[.+GMT\]\s(.+)/,
	SITES   : /Sites-(.*?)-?Site/,
	SESSION : /^(.+?)\s+\d{17,20}\s*\-?\s*/,
	STRACE  : /^Stack trace <(ref:)?(\w+)>/,
	ERROR   : /ERROR\sPipelineCallServlet/
};

function trace(log) {
  	console.log(`trace: ${log}`);
  	let liner = new Liner(log);
 	let line = liner && liner.next() || null;
  
  	while (line !== null) {
  		const found = line.match(RE.STRACE);
  		if ( found && !found[1] ) {
  		    const key = found[2];
  			strace[key] = liner.next();
			line = liner.next();
  			if ( !RE.STAMP.test(line) ) strace[key] += line;
  		}
		line = liner.next();
 	}
  	return log;
}

function analyze(log) {
  	console.log(`analyze: ${log}`);
  	let liner = new Liner(log);
 	let line = liner && liner.next() || null;
    let site, pipe, msg;

	while (line !== null) {
		const found = line.match(RE.STAMP);
		if (found) {
			const parts = found[1].split('|');
			site = parts && RE.ERROR.test(parts[0]) && parts[2];
			if (site) {
				pipe = parts[3];
				site = site.replace(RE.SITES, '$1');
				msg = parts[5] && parts[5].replace(RE.SESSION, '') || '';
			}
		}
		else {
			const found = line.match(RE.STRACE);
			if ( found && site ) {
				const desc = strace[found[2]];
				const key = md5(msg + desc);
				let count;

				if ( !(key in errors) ) {
					errors[key] = {
						'total': 0,
						'sites': {},
						'pipes': {},
						'desc': desc,
						'msg': msg
					};
				}
				errors[key].total++;

				count = errors[key].sites[site];
				errors[key].sites[site] = count ? count + 1 : 1;
				count = errors[key].pipes[pipe];
				errors[key].pipes[pipe] = count ? count + 1 : 1;
			}
		}
		line = liner.next();
	}
	return log;
}

function analyzeLogs(options) {
	fs.readdirSync(options.LOGSDIR)
		.filter( file => path.extname(file) === '.log' )
		.map( file => path.join(options.LOGSDIR, file) )
		.map(trace).map(analyze);

	return Object.keys(errors)
		.filter( key => errors[key].total > options.MAXERRORS )
		.sort( (a,b) => errors[b].total - errors[a].total )
		.map(key => errors[key]);
}	

module.exports = {
	analyzeLogs: analyzeLogs
}

