'use strict';

const CONFIG = require('./config.json');

const fs   = require('fs');
const path = require('path');
const hash = require('crypto').createHash;
const md5  = x => hash('md5').update(x).digest('hex');
const getLiner = file => new LineReader(path.join(CONFIG.logsdir, file));

let STRACE = {};
let ERRORS = {};

console.log(CONFIG.logsdir);

const logs = fs.readdirSync(CONFIG.logsdir);
logs.filter(file => path.extname(file) !== 'log').map(process);

console.log(STRACE);

console.log(ERRORS);

//    fs.writeFileSync(require("path").join(options.errorlog_dir, fileName), fileData);

function strace(log) {
	console.log(`stacktrace: ${log}`);
	let liner = getLiner(log);
	let line = readLine(liner);
	
	console.log(line);

	while (line) {
		const found = line.match(/^Stack trace <([a-z0-9]+)>$/);
		if (found) {
		    const ref = found[1];
			line = readLine(liner);
			STRACE[ref] = line;
			line = readLine(liner);
			if ( !/^\[.+GMT\]/.test(line) ) STRACE[ref] += line;
		}
		line = readLine(liner);
	}
	return log;
}

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
			line = readLine(liner);
		}
		else {
	console.log(line);

		const found = line.match(/^Stack trace <(ref:)?(\w+)>$/);
			if ( found && site ) {
				const key = found[2];
				STRACE[key] = readLine(liner);
				line = readLine(liner);
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
				line = readLine(liner);
			}
		}
	}
	return log;
}


// LineReader
function LineReader(file, options) {
    options = options || {};

    if (!options.readChunk) {
        options.readChunk = 1024;
    }

    if (!options.newLineCharacter) {
        options.newLineCharacter = 0x0a; //linux line ending
    } else {
        options.newLineCharacter = options.newLineCharacter.charCodeAt(0);
    }

    if (typeof file === 'number') {
        this.fd = file;
    } else {
        this.fd = fs.openSync(file, 'r');
    }

    this.options = options;

    this.newLineCharacter = options.newLineCharacter;

    this.reset();
}

LineReader.prototype._searchInBuffer = function(buffer, hexNeedle) {
    var found = -1;

    for (var i = 0; i <= buffer.length; i++) {
        var b_byte = buffer[i];
        if (b_byte === hexNeedle) {
            found = i;
            break;
        }
    }

    return found;
};

LineReader.prototype.reset = function() {
    this.bufferData = null;
    this.bytesRead = 0;

    this.bufferPosition = 0;
    this.eofReached = false;

    this.line = '';

    this.linesCache = [];

    this.lastBytePosition = null;

    this.fdPosition = 0;
};

LineReader.prototype._extractLines = function(buffer) {
    var line;
    var lines = [];
    var bufferPosition = 0;

    var lastNewLineBufferPosition = 0;
    while (true) {
        var bufferPositionValue = buffer[bufferPosition++];

        if (bufferPositionValue === this.newLineCharacter) {
            line = buffer.slice(lastNewLineBufferPosition, bufferPosition);
            lines.push(line);
            lastNewLineBufferPosition = bufferPosition;
        } else if (!bufferPositionValue) {
            break;
        }
    }

    var leftovers = buffer.slice(lastNewLineBufferPosition, bufferPosition);
    if (leftovers.length) {
        lines.push(leftovers);
    }

    return lines;
};

LineReader.prototype._readChunk = function(lineLeftovers) {
    var bufferData = new Buffer(this.options.readChunk);

    var totalBytesRead = 0;

    var bytesRead = fs.readSync(this.fd, bufferData, 0, this.options.readChunk, this.fdPosition);

    totalBytesRead = totalBytesRead + bytesRead;

    this.fdPosition = this.fdPosition + bytesRead;

    var buffers = [];
    buffers.push(bufferData);

    var lastBuffer = buffers[buffers.length-1];

    while(this._searchInBuffer(buffers[buffers.length-1], this.options.newLineCharacter) === -1) {
        //new line character doesn't exist in the readed data, so we must read
        //again
        var newBuffer = new Buffer(this.options.readChunk);

        var bytesRead = fs.readSync(this.fd, newBuffer, 0, this.options.readChunk, this.fdPosition);
        totalBytesRead = totalBytesRead + bytesRead;

        this.fdPosition = this.fdPosition + bytesRead;

        buffers.push(newBuffer);
    }

    bufferData = Buffer.concat(buffers);

    if (bytesRead < this.options.readChunk) {
        this.eofReached = true;
        bufferData = bufferData.slice(0, totalBytesRead);
    }

    if (bytesRead) {
        this.linesCache = this._extractLines(bufferData);

        if (lineLeftovers) {
            this.linesCache[0] = Buffer.concat([lineLeftovers, this.linesCache[0]]);
        }
    }

    return totalBytesRead;
};

LineReader.prototype.next = function() {
    var line = null;

    if (this.eofReached && this.linesCache.length === 0) {
        return null;
    }

    var bytesRead;

    if (!this.linesCache.length) {
        bytesRead = this._readChunk();
    }

    if (this.linesCache.length) {
        line = this.linesCache.shift();

        var lastLineCharacter = line[line.length-1];

        if (lastLineCharacter !== this.newLineCharacter) {
            bytesRead = this._readChunk(line);

            if (bytesRead) {
                line = this.linesCache.shift();
            }
        }
    }

    if (this.eofReached && this.linesCache.length === 0) {
        fs.closeSync(this.fd);
        this.fd = null;
    }

    if (line && line[line.length-1] === this.newLineCharacter) {
        line = line.slice(0, line.length-1);
    }

	return (line && line.toString() || '');
};


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