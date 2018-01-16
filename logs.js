'use strict';

var EOL = require('os').EOL;
var fs = require('fs');

module.exports = function(grunt) {
    grunt.registerTask('downloadlogfiles', 'Download Error Logs', function() {
        var done = this.async();
        downloadlogfiles(grunt.config('analyzelogfiles.options'), function() {
            done();
        });
    });

    grunt.registerTask('analyzelogfiles', 'Analyze Error Logs', function() {
        analyze(grunt.config('analyzelogfiles.options'));
    });

    /**
     * Measures the size (in kb) of the error log files.
     * A CSV file named size.csv will contain the total size.
     */
    grunt.registerTask('measuresizelogfiles', 'Measure Error Logs Size', function() {
        var done = this.async(),
            options = grunt.config('analyzelogfiles.options');
        getErrorLogFileList(options, function(fileEntries) {
            var totalSize = 0.0;

            // loop through file entries and aggregate file size
            fileEntries.forEach(function(fileEntry) {
                totalSize += fileEntry.size;
            });

            writeFile(options, "size.csv", "Total Log Size" + EOL + totalSize + EOL);
            done();
        });
    });
}

function downloadlogfiles(options, callback) {
    getErrorLogFileList(options, function(fileEntries) {
        if (!fileEntries || fileEntries.length <= 0) {
            console.log("No log files to download");
            callback();
            return;
        }

        var complete = [];
        fileEntries.forEach(function(fileEntry) {
            var file = fileEntry.name;
            getErrorLog(options, file, function(fileData) {
                console.log('Downloading log: ' + file);
                writeFile(options, file, fileData);
                if (complete.length == fileEntries.length - 1) {
                    callback();
                } else {
                    complete.push(true);
                }
            }), function (e) {
                complete.push(true);
            }
        })
    });
}

function analyze(options) {
    var logParser = LogParser(options.group_errors,options.max_errors);
    var files = fs.readdirSync(options.errorlog_dir);

    files.forEach(function (file) {
        console.log('analyzing: ' + file);
		logParser.parse(options, file);
    });

    writeFile(options, 'summary.html', logParser.summary(options));
//    writeFile(options, 'summary.csv', logParser.csvSummary(options));
}

/**
 * Gets the file list of error log files for a given date and passes them to the callback function.
 *
 * The callback function will receive an array of file entry objects. Each file entry object
 * contains two properties: name (file name without path) and size (file size in kb).
 */
function getErrorLogFileList(options, callback) {
    var https = require('https');
    var dateFilter = getDate(options.log_date);

    var req = https.get({
        rejectUnauthorized: false,
        host: options.webdav_server,
        path: '/on/demandware.servlet/webdav/Sites/Logs',
        auth: options.webdav_username + ":" + options.webdav_password
    }, function(resp) {
        var str = "";

        resp.on('data', function(data) {
            str += data;
        });

        resp.on('end', function() {
            if (str.indexOf('401 - Authorization Required') !== -1) {
                throw '401 - Authorization Required';
            }

            var fileEntries = [],
                re = /a href="[^"]*\/(error[a-z0-9\-]+\.log)"[\s\S]+?([0-9\.]+) kb/g,
                matches = [],
                match;

            do {
                match = re.exec(str);
                if (match) {
                    matches.push(match);
                }
            } while (match);

            if (matches.length) {
                matches.forEach(function(m) {
                    var fileName = m[1];
                    if (fileName.indexOf(dateFilter) !== -1) {
                        fileEntries.push({
                            name: fileName,
                            size: parseFloat(m[2])
                        });
                    }
                });
            }

            callback(fileEntries);
        });
    });

    req.on('error', function(e) {
        console.error(e);
    });
};

function getErrorLog(options, filename, callback) {
    var https = require('https');

    var req = https.get({
        rejectUnauthorized: false,
        host: options.webdav_server,
        path: '/on/demandware.servlet/webdav/Sites/Logs/' + filename,
        auth: options.webdav_username + ":" + options.webdav_password
    }, function(resp) {
        var str = "";
        resp.on('data', function(chunk) {
            str += chunk;
        });
        resp.on('end', function() {
            callback(str);
        })
    });

    req.on('error', function(e) {
        console.error(e);
        callback(e);
    });
};

function writeFile(options, fileName, fileData) {
    fs.writeFileSync(require("path").join(options.errorlog_dir, fileName), fileData);
}

function LogParser(groupErrors, MAX_ERRORS) {
    var totalErrors = [];

    // Parse a log file and return an array of error objects
    function parseLog(options, fileName) {
        var errorRegex = /^(.+?)\|(.+?)\|(.+?)\|(.+?)\|(.+?)\|(.+)/,
		    logDateRegex = /^\[[\d\-\:\s\.]+GMT\]/,
			siteRegex = /Sites-(.*?)-Site/,
            matches = [], errors = [], normalizedErrors = [],
            isQuotaFile = fileName.indexOf("quota") === 0,
			lines,
			log = new LineByLine( require('path').join(options.errorlog_dir, fileName) ),
			line = log.next();

        if (line) {
			lines = [];
			lines[0] = line.toString('utf8');
			while (line = log.next()) {
				line = line.toString('utf8');
				if (line.indexOf('Stack trace') === 0) continue;
				if (logDateRegex.test(line)) {
					var error = lines[0], match = [];
					if (lines.length === 1) {
						if ( error.indexOf('Error in template script') === -1
						  && error.indexOf('The following message was generated') === -1 ) {
							match = errorRegex.exec(error);
							match && matches.push(match);
						}
					}
					else {
						if ( error.indexOf('The following message was generated') === -1 ) {
							match = errorRegex.exec(error+"  "+lines[1]);
							match && matches.push(match);
						}
					}
					lines = [];
					lines[0] = line;
				}
				else {
					lines.push(line);
				}
			}
		}
        if (matches.length) {
            matches.forEach(function(m) {
                var website = m[3].trim().replace('Sites-','').replace('-Site',''),
                    pipeline = m[4].trim(),
                    errorMessage = m[6].trim(),
					re = /^(.+?)\s+\d{17,20}\s+(.+)/,
					errorParts = re.exec(errorMessage);
                if (website == 'Site') website = 'BM';
                errorParts && errors.push({
                    'website': website,
                    'pipeline': pipeline,
                    'errorKey': errorParts[2],
                });
            });
            // This logic optionally groups the errors that are similiar to each other by making the
            // error key for errors that are identical but have 1 difference, in this way
            // the errors are grouped together in the error report and makes the error report smaller
            // and easier to read
            if (groupErrors) {
                errors.forEach(function(e, index) {
                    var errorParts = e.errorKey.split(" ");

                    for (var i = 0; i < errors.length; i++) {
                        if (i !== index) {
                            var differences = 0;
                            var normalizedParts = errors[i].errorKey.split(" ");
                            if (errorParts.length === normalizedParts.length) {
                                for (var j = 0; j < errorParts.length; j++) {
                                    if (errorParts[j] !== normalizedParts[j]) {
                                        differences++;
                                    }
                                }

                                if (differences === 1) {
                                    for (var k = 0; k < errorParts.length; k++) {
                                        if (errorParts[k] !== normalizedParts[k]) {
                                            errorParts[k] = "---";
                                            normalizedParts[k] = "---";
                                        }
                                    };
                                    e.errorKey = errorParts.join(" ");
                                    errors[i].errorKey = normalizedParts.join(" ");
                                }
                            }
                        }
                    }
                });
            }
        };

        return errors;
    };

    // Generates the "summary" data, which consists of the total errors per website and for each
    // website the total errors per pipeline
    function summarizeErrorsByWebSite(errors) {
        var sortedErrors, summary = "",
            prevWebSite, countWebSite, totalErrorCount, results = [];

        sortedErrors = errors.sortObjects("website");
        prevWebSite = sortedErrors[0] ? sortedErrors[0].website : "System";
        countWebSite = 0;
        totalErrorCount = 0;

        sortedErrors.forEach(function(ele) {
            if (ele.website !== prevWebSite) {
                results.push({
                    "website": prevWebSite,
                    "count": countWebSite
                });
                totalErrorCount += countWebSite;
                countWebSite = 1;
                prevWebSite = ele.website;
            } else {
                countWebSite++;
            };
        });

        totalErrorCount += countWebSite;
        results.push({
            "website": sortedErrors[sortedErrors.length - 1] ? sortedErrors[sortedErrors.length - 1].website : "System",
            "count": countWebSite
        });

        //Sort websites by error count descending
        results = results.sortObjects("count", true);

        summary += "<h3>Error Totals</h3>"
        summary += "<ul>";
        results.forEach(function(ele) {
            var currWebSite = ele.website;
            summary += "<li><strong><span " + "style='color:red'>" + ele.count + "</span></strong>&nbsp;" + currWebSite + "</li>";
        });
        summary += "</ul>";

        summary += "<h3>Error Detail</h3>"

        results.forEach(function(ele) {
            var currWebSite = ele.website;
            console.log(ele);
            summary += "<ul>";
            summary += "<li><strong><span " + (ele.count > MAX_ERRORS ? "style='color:red'>" : ">") + ele.count + "</span></strong>&nbsp;" + currWebSite + "</li>";
            summary += "<ul>";
            summary += summarizeErrorsByPipeline(sortedErrors.filter(function(ele) {
                return ele.website === currWebSite;
            }));
            summary += "</ul>";
            summary += "</ul>";
        });

        return summary;
    };

    // This function is called by the "summarizeErrorsByWebSite" function to produce the list of
    // pipelines for a specific website and the count of errors for each pipeline.
    // The "errors" parameter is assumed to be a subset of the "errors" array produced by filtering
    // on the "website" property.
    function summarizeErrorsByPipeline(errors) {
        var sortedErrors, summary = "",
            prevPipeline, countPipeline, results = [];

        sortedErrors = errors.sortObjects("pipeline");
        prevPipeline = sortedErrors[0] ? sortedErrors[0].pipeline : "System";
        countPipeline = 0;

        sortedErrors.forEach(function(ele) {
            if (ele.pipeline !== prevPipeline) {
                results.push({
                    "pipeline": prevPipeline,
                    "count": countPipeline
                });
                countPipeline = 1;
                prevPipeline = ele.pipeline;
            } else {
                countPipeline++;
            };
        });

        results.push({
            "pipeline": sortedErrors[sortedErrors.length - 1] ? sortedErrors[sortedErrors.length - 1].pipeline : "System",
            "count": countPipeline
        });

        //Sort pipelines by error count descending
        results = results.sortObjects("count", true);

        results.forEach(function(ele) {
			if (ele.count > MAX_ERRORS) {
				var currPipeline = ele.pipeline;
				summary += "<ul>";
				summary += "<li><strong><span>" + ele.count + "</span></strong>&nbsp;" + htmlEscape(currPipeline) + "</li>";
				summary += "<ul>";
				summary += summarizeErrorsByErrorKey(sortedErrors.filter(function(ele) {
					return ele.pipeline === currPipeline;
				}));
				summary += "</ul>";
				summary += "</ul>";
			}
        });

        return summary;
    };

    // This function is called by the "summarizeErrorsByWebSite" function to produce the list of
    // pipelines for a specific website and the count of errors for each pipeline.
    // The "errors" parameter is assumed to be a subset of the "errors" array produced by filtering
    // on the "website" property.
    function summarizeErrorsByErrorKey(errors) {
        var sortedErrors, summary = "",
            prevError, lastError, countError, results = [];

        sortedErrors = errors.sortObjects("errorKey");
        prevError = sortedErrors[0] ? sortedErrors[0].errorKey : "System";
        countError = 0;

        sortedErrors.forEach(function(ele) {
            var currError = ele.errorKey;
            if (currError !== prevError) {
                results.push({
                    "error": prevError,
                    "count": countError
                });
                countError = 1;
                prevError = currError;
            } else {
                countError++;
            };
        });

        lastError = sortedErrors[sortedErrors.length - 1] ? sortedErrors[sortedErrors.length - 1].errorKey : "System";
        results.push({
            "error": lastError,
            "count": countError
        });

        //Sort errors by error count descending
        results = results.sortObjects("count", true);

        results.forEach(function(ele, index) {
			if (ele.count > MAX_ERRORS) {
				summary += "<li><div><strong><span>" + ele.count + "</span></strong>&nbsp;" + htmlEscape(ele.error) + "</div></li>";
			}
        });

        return summary;
    };

    return {
        "parse": function(options, fileName) {
			console.log(fileName);
            var errors = parseLog(options, fileName);
            errors.forEach(function(error) {
                totalErrors.push(error);
            });
            return errors.length;
        },
        "summary": function(options) {
            var summary = "";
            summary += "<html><body>";
            summary += "Server: <strong>" + options.webdav_server + "</strong><br/>";
            summary += "Log Date: <strong>" + getDateForDisplay(options.log_date) + "</strong><br/>";
            summary += "Total Errors: <strong>" + totalErrors.length + "</strong><br/>";
            summary += summarizeErrorsByWebSite(totalErrors)
            summary += "</body></html>";
            return summary;
        },
        /**
         * Generate CSV summary.
         * Currently it only puts one row and one column per site.
         */
        "csvSummary": function(options) {
            var csvSummary = "",
                sortedErrors,
                prevWebSite,
                countWebSite = 0,
                totalErrorCount = 0,
                results = [];

            sortedErrors = totalErrors.sortObjects("website");
            prevWebSite = sortedErrors[0] ? sortedErrors[0].website : "System";

            sortedErrors.forEach(function(ele) {
                if (ele.website !== prevWebSite) {
                    results.push({
                        "website": prevWebSite,
                        "count": countWebSite
                    });

                    totalErrorCount += countWebSite;
                    countWebSite = 1;
                    prevWebSite = ele.website;
                } else {
                    countWebSite++;
                }
            });

            totalErrorCount += countWebSite;

            results.push({
                "website": sortedErrors[sortedErrors.length - 1] ? sortedErrors[sortedErrors.length - 1].website : "System",
                "count": countWebSite
            });

            results.unshift({
                "website" : "Total",
                "count": totalErrorCount
            });

            for (var i = 0; i < results.length; i++) {
                if (i > 0) {
                    csvSummary += ",";
                }

                csvSummary += results[i].website;
            }

            csvSummary += EOL;

            for (var i = 0; i < results.length; i++) {
                if (i > 0) {
                    csvSummary += ",";
                }

                csvSummary += results[i].count.toString();
            }

            csvSummary += EOL;
            return csvSummary;
        }
    };
}

function htmlEscape(str) {
    return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}

function getDate(d) {
    var today = d ? new Date(d) : new Date(),
        year = today.getFullYear(),
        month = today.getMonth() + 1,
        day = today.getDate();

    if (month < 10) {
        month = "0" + month;
    }
    if (day < 10) {
        day = "0" + day;
    }
    return year + "" + month + "" + day;
}

function getDateForDisplay(d) {
    var today = d ? new Date(d) : new Date(),
        year = today.getFullYear(),
        month = today.getMonth() + 1,
        day = today.getDate();

    if (month < 10) {
        month = "0" + month;
    }
    if (day < 10) {
        day = "0" + day;
    }
    return year + "-" + month + "-" + day;
}

if (typeof Array.prototype.sortObjects === "undefined") {
    Array.prototype.sortObjects = function(property, desc) {
        // Sorts an array of objects based on a specific object property
        var returnArray = this.slice(0);

        returnArray.sort(function(p1, p2) {
            var returnValue,
                first = p1[property],
                second = p2[property];

            if (first === second) {
                returnValue = 0;
            } else if (first < second) {
                returnValue = -1;
            } else {
                returnValue = 1;
            };
            return desc ? (returnValue * -1) : returnValue;
        });

        return returnArray;
    };
};

if (typeof String.prototype.trim === "undefined") {
    String.prototype.trim = function() {
        // Trim whitespace from beginning and end of the string
        return this.replace(/^\s*/, "").replace(/\s*$/, "");
    };
};

/////////////////////////////////////
function LineByLine(file, options) {
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

LineByLine.prototype._searchInBuffer = function(buffer, hexNeedle) {
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

LineByLine.prototype.reset = function() {
    this.bufferData = null;
    this.bytesRead = 0;

    this.bufferPosition = 0;
    this.eofReached = false;

    this.line = '';

    this.linesCache = [];

    this.lastBytePosition = null;

    this.fdPosition = 0;
};

LineByLine.prototype._extractLines = function(buffer) {
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

LineByLine.prototype._readChunk = function(lineLeftovers) {
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

LineByLine.prototype.next = function() {
    var line = false;

    if (this.eofReached && this.linesCache.length === 0) {
        return line;
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

    return line;
};
