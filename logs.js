'use strict';

const CONFIG = require('./config.json');

const fs   = require('fs');
const path = require('path');
const hash = require('crypto').createHash;
const md5  = x => hash('md5').update(x).digest('hex');

const LineReader = require('n-readlines');
const getLiner = file => new LineReader(path.join(CONFIG.logsdir, file));

let STRACE = {};
let ERRORS = {};

console.log(CONFIG.logsdir);

const logs = fs.readdirSync(CONFIG.logsdir);
logs.filter(file => path.extname(file) !== 'log').map(strace).map(process);

console.log(ERRORS);

//    fs.writeFileSync(require("path").join(options.errorlog_dir, fileName), fileData);

function strace(log) {
	console.log(`stacktrace: ${log}`);
	let liner = getLiner(log);
	let line = liner.next();

	while (line) {
		line = line.toString();
		const found = line.match(/^Stack trace <([a-z0-9]+)>$/);
		if (found) {
		    const ref = found[1];
			line = liner.next().toString();
			STRACE[ref] = line;
			line = liner.next().toString();
			if ( !/^\[.+GMT\]/.test(line) ) STRACE[ref] += line;
		}
		line = liner.next();
	}
	return log;
}

function process(log) {
	console.log(`process: ${log}`);
	let liner = getLiner(log);
    let site, pipe, msg;
	let line = liner.next();

	while (line) {
		line = line.toString();
		const found = line.match(/^\[.+GMT\]\s(.+)/);
		
		if (found) {
			const parts = found[1].split('|');
			site = parts && parts[2];
			if (site) {
				pipe = parts[3];
				site = site.replace(/^Sites-/, '').replace(/-?Site$/, '');
				msg = parts[5] && parts[5].replace(/^(.+?)\s+\d{17,20}\s+/, '') || '';
			}
		}
		else {
			const found = line.match(/^Stack trace <(ref:)?(\w+)>$/);
			if ( found && found[2] && site ) {
				msg = `${msg}\n${STRACE[found[2]]}`;
				const key = md5(msg);
				
				if ( !(key in ERRORS) ) ERRORS[key] = {};
				if ( !('count' in ERRORS[key]) ) ERRORS[key].count = 0;
				if ( !('sites' in ERRORS[key]) ) ERRORS[key].sites = {};

				if ( ERRORS[key].count === 0 ) {
					ERRORS[key].error = msg;
					ERRORS[key].pipe = pipe;
				}
				ERRORS[key].count++;
				ERRORS[key].sites[site] = true;
			}
		}
		line = liner.next();
	}
	return log;
}


/*
my $out;
open($out, '>', 'summary.html') or die "can't create 'summary.html': $!";
foreach my $type (keys %$err) {
	print $out "<table cellpadding='5' border='1'><tbody>\n";
	print_errs($err->{$type});
	print $out "</tbody></table>\n";
}
close($out);

sub print_errs {
	my ($err) = @_;
	my @keys = sort { $err->{$b}->{cnt} <=> $err->{$a}->{cnt} } keys %$err;
	print $out "<tr><th>total</th><th>pipeline</th><th>sites</th><th>error</th></tr>\n";
	print_err($err->{$_}) foreach (@keys[0..$MAXERR-1]);
}

sub print_err {
	my ($err) = @_;
	return if !$err->{cnt} || $err->{cnt}==1;
    printf $out "<tr><td>%d</td><td>%s</td><td>%s</td><td>%s</td></tr>\n",
				$err->{cnt}, $err->{pipe}, join("<br>", sort keys %{ $err->{sites} }), $err->{desc};
}	
*/