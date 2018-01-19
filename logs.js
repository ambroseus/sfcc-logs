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
logs.filter(isLog).map(strace).map(process);

const STATS = Object.keys(ERRORS)
	.filter( key => ERRORS[key].total > CONFIG.MAXERRORS )
	.sort( (a,b) => ERRORS[b].total - ERRORS[a].total )
	.map( key => ERRORS[key] );

fs.writeFileSync( path.join(CONFIG.LOGSDIR, CONFIG.SUMMARY ), summary(STATS) );
console.log('done.');


function strace(log) {
  	console.log(`strace: ${log}`);
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
				const desc = `${msg} ${STRACE[found[2]]}`;
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

function summary(errors) {
	const sort = sites => Object.keys(sites).sort( (a,b) => sites[b] - sites[a] ).map( site => `${sites[site]}:${site}` ).join('<br/>');
	const header = '<tr><th>total</th><th>sites</th><th>pipeline</th><th>error</th></tr>';
	const body = errors.map(err => `<tr><td>${err.total}</td><td>${sort(err.sites)}</td><td>${err.pipe}</td><td>${err.desc}</td></tr>\n`).join('');

	return `<table cellpadding='5' border='1'><tbody>${header}${body}</tbody></table>\n`;
}