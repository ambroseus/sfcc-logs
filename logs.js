'use strict';

const fs = require('fs');
const path = require('path');
const hash = require('crypto').createHash;
const md5 = x => hash('md5').update(x).digest('hex');

const CONFIG = require('./config.json');
const Liner = require('./liner.js');
const getLiner = file => new Liner(path.join(CONFIG.LOGSDIR, file));
const isLog = file => path.extname(file) === '.log';

const RE = {
	STAMP   : /^\[.+GMT\]\s(.+)/,
	SITES   : /Sites-(.*?)-?Site/,
	SESSION : /^(.+?)\s+\d{17,20}\s+/,
	STRACE  : /^Stack trace <(ref:)?(\w+)>/,
	ERROR   : /ERROR\sPipelineCallServlet/
};

const strace = {};
const errors = {};
const logs = fs.readdirSync(CONFIG.LOGSDIR);

console.log(CONFIG.LOGSDIR);
logs.filter(isLog).map(stackrace).map(process);

const keys = Object.keys(errors)
	.filter( key => errors[key].total > CONFIG.MAXERRORS )
	.sort( (a,b) => errors[b].total - errors[a].total );

fs.writeFileSync( path.join(CONFIG.LOGSDIR, CONFIG.SUMMARY), summary_html(keys) );
console.log('done.');


function stackrace(log) {
  	console.log(`strace: ${log}`);
  	let liner = getLiner(log);
 	let line = liner.next();
  
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

function process(log) {
	console.log(`process: ${log}`);
	let liner = getLiner(log);
	let line = liner.next();
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
				const key = md5(msg + strace[found[2]]);
				let count;

				if ( !(key in errors) ) {
					errors[key] = {
						'total': 0,
						'sites': {},
						'pipes': {},
						'desc': strace[found[2]],
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

function summary_html(keys) {
	const head = '<tr><th>total</th><th>sites</th><th>pipelines</th><th>error</th></tr>';
	const sort = hash => Object.keys(hash).sort( (a,b) => hash[b] - hash[a] ).map( key => `${hash[key]}:${key}` ).join('<br/>');
	const row  = e => `<tr><td>${e.total}</td><td nowrap>${sort(e.sites)}</td><td nowrap>${sort(e.pipes)}</td><td>${e.msg}<br/>${e.desc}</td></tr>`;
	const body = keys.map( key => errors[key] ).map(row);
	return `<table cellpadding='5' border='1'><thead>${head}</thead>\n<tbody valign=top>${body.join("\n")}</tbody></table>`;
}

