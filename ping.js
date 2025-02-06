//The MIT License (MIT)
//
//Copyright (c) 2025 Brant Wedel
//Based on tcp-ping (c) 2014 Adam Paszke
//
//Permission is hereby granted, free of charge, to any person obtaining a copy
//of this software and associated documentation files (the "Software"), to deal
//in the Software without restriction, including without limitation the rights
//to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//copies of the Software, and to permit persons to whom the Software is
//furnished to do so, subject to the following conditions:
//
//The above copyright notice and this permission notice shall be included in all
//copies or substantial portions of the Software.
//
//THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//SOFTWARE.

var net = require('net');

/**
 * Probes a TCP connection to a specified address and port, with options for capturing data and matching responses.
 * @param {Object} options - Configuration options for the probe.
 * @param {string} [options.address='localhost'] - The address to probe. Defaults to 'localhost'.
 * @param {number} [options.port=80] - The port to probe. Defaults to 80.
 * @param {number} [options.attempts=1] - Number of attempts for probing. Defaults to 1.
 * @param {number} [options.timeout=5000] - Timeout for each probe attempt in milliseconds. Defaults to 5000.
 * @param {string|Buffer} [options.request] - Data to send as a request.
 * @param {string|Buffer} [options.exitRequest] - Data to send before closing socket.
 * @param {number} [options.maxResponseBytes=50000] - Maximum bytes to read from the response.
 * @param {boolean} [options.capture=false] - Whether to capture response data.
 * @param {string|Buffer|RegExp|Function} [options.match] - Pattern or function to match against response data.
 * @param {boolean} [options.noDelay=true] - Whether to disable Nagle's algorithm. Defaults to true.
 * @param {Function} callback - Callback function with signature (err, data) where data contains probe results.
 */
function probe(options, callback) {
    if (typeof callback !== 'function') {
        throw new Error('Callback function is required');
    }

    var i = 0;
    var results = [];

    // if a response option is set use probe logic
    let isProbe = !!(options.request || options.exitRequest || options.capture || options.match || options.maxResponseBytes);

    // merge defaults
    options = {
        address: 'localhost',
        port: 80,
        attempts: 1,
        timeout: 5000,

        // probe response options
        encoding: 'utf8',
        request: Buffer.alloc(0),
        exitRequest: undefined,
        match: undefined,
        exit: Buffer.alloc(0),
        maxResponseBytes: 50000,
        capture: false,
        noDelay: true,

        ...options
    };

    if (typeof options.request === 'string') {
        options.request = Buffer.from(options.request, options.encoding);
    }
    if (typeof options.exitRequest === 'string') {
        options.exitRequest = Buffer.from(options.exitRequest, options.encoding);
    }
    if (typeof options.match === 'string') {
        options.match = Buffer.from(options.match, options.encoding);
    }

    var check = function(options, callback) {
        if (i < options.attempts) {
            connect(options, callback);
        } else {
            var dropped = results.reduce(function(prev, curr) {
                return (typeof curr.time === 'undefined') ? prev + 1 : prev;
            }, 0);

            var avg = results.reduce(function(prev, curr) {
                return (typeof curr.time === 'undefined') ? prev : prev + curr.time;
            }, 0);
            var max = results.reduce(function(prev, curr) {
                return (prev > curr.time) ? prev : curr.time;
            }, results[0].time);
            var min = results.reduce(function(prev, curr) {
                return (prev < curr.time) ? prev : curr.time;
            }, results[0].time);
            avg = avg / (results.length - dropped);

            if (isProbe) {
                var conAvg = results.reduce(function(prev, curr) {
                    return (typeof curr.time === 'undefined') ? prev : prev + curr.conTime;
                }, 0) / (results.length - dropped);
                var conMax = results.reduce(function(prev, curr) {
                    return (prev > curr.conTime) ? prev : curr.conTime;
                }, results[0].conTime);
                var conMin = results.reduce(function(prev, curr) {
                    return (prev < curr.conTime) ? prev : curr.conTime;
                }, results[0].conTime);

                var matches = results.filter(function(result) {
                    return result.match === true;
                }).length;
                var errors = results.filter(function(result) {
                    return result.err;
                }).length;

                var probeOut = {
                    address: options.address,
                    port: options.port,
                    attempts: options.attempts,
                    dropped: dropped,
                    matches: matches,
                    errors: errors,
                    avg: avg,
                    max: max,
                    min: min,
                    conAvg: conAvg,
                    conMax: conMax,
                    conMin: conMin,
                    results: results
                };
                callback(undefined, probeOut);
                return;
            }

            var out = {
                address: options.address,
                port: options.port,
                attempts: options.attempts,
                dropped: dropped,
                avg: avg,
                max: max,
                min: min,
                results: results
            };
            callback(undefined, out);
        }
    };

    var connect = function(options, callback) {
        var s = new net.Socket();
        s.setNoDelay(options.noDelay);
        var start = process.hrtime();

        if (isProbe) {
            let didPushResults = false;
            let connectTime = undefined;
            let didMatch = false;
            let didExceedResponseBytes = false;
            let didRequestExit = false;
            let lastErr = undefined;
            let responseBuffer;

            let responseTimeoutRef;

            var probeResultCheck = function(result = {}) {
                clearTimeout(responseTimeoutRef);
                if (didPushResults) {
                    return;
                }
                didPushResults = true;

                if (options.exitRequest && !didRequestExit) {
                    didRequestExit = true;
                    try {
                        s.write(options.exitRequest);
                    } catch (e) {
                        // ignore errors on exit as the socket is likely closed
                    }
                }

                s.end();

                let time_arr = process.hrtime(start);
                let endTime = (time_arr[0] * 1e9 + time_arr[1]) / 1e6;

                results.push({
                    seq: i,
                    conTime: connectTime,
                    time: typeof connectTime === 'undefined' ? undefined : endTime,
                    ...(options.match ? { match: didMatch } : undefined),
                    ...(lastErr && { err: lastErr }),
                    ...(responseBuffer && { bytes: responseBuffer.length }),
                    ...(options.capture && responseBuffer && { data: responseBuffer }),
                    ...result
                });
                i++;
                check(options, callback);
            }

            responseTimeoutRef = setTimeout(() => {
                if (didPushResults) {
                    return;
                }
                lastErr = lastErr ?? Error('Response timeout');
                probeResultCheck({ err: Error('Response timeout') });
            }, options.timeout);

            s.connect(options.port, options.address, function onConnect() {
                let connectTimeArr = process.hrtime(start);
                connectTime = (connectTimeArr[0] * 1e9 + connectTimeArr[1]) / 1e6;

                // Write the request payload as soon as we're connected
                s.write(options.request);

                // Accumulate data
                responseBuffer = Buffer.alloc(0);

                s.on('data', function onData(data) {
                    if (didPushResults) {
                        return;
                    }

                    // limit buffer to maxResponseBytes
                    if (responseBuffer.length + data.length <= options.maxResponseBytes) {
                        responseBuffer = Buffer.concat([responseBuffer, data]);
                    } else if (responseBuffer.length >= options.maxResponseBytes && data.length > 0) {
                        didExceedResponseBytes = true;
                    } else if (data.length > 0) {
                        didExceedResponseBytes = true;
                        responseBuffer = Buffer.concat([responseBuffer, data.slice(0, options.maxResponseBytes - responseBuffer.length)]);
                    }

                    if (responseBuffer.length > options.maxResponseBytes) {
                        didExceedResponseBytes = true;
                        responseBuffer = responseBuffer.slice(0, options.maxResponseBytes);
                    }

                    if (options.match) {
                        if (
                            (Buffer.isBuffer(options.match) && responseBuffer.includes(options.match)) ||
                            (options.match instanceof RegExp && options.match.test(responseBuffer.toString(options.encoding))) ||
                            (typeof options.match === 'function' && options.match(responseBuffer, options))
                        ) {
                            didMatch = true;
                            if (options.exitRequest && !didRequestExit) {
                                didRequestExit = true;
                                try {
                                    s.write(options.exitRequest);
                                } catch (e) {
                                    // ignore errors on exit as the socket is likely closed
                                }
                            }
                            s.end();
                        }
                    }

                    if (didExceedResponseBytes) {
                        lastErr = lastErr ?? new Error('Max Response Bytes Exceeded');
                        if (options.exitRequest && !didRequestExit) {
                            didRequestExit = true;
                            try {
                                s.write(options.exitRequest);
                            } catch (e) {
                                // ignore errors on exit as the socket is likely closed
                            }
                        }
                        s.end();
                    }

                });

            });

            s.on('error', function onError(e) {
                lastErr = lastErr ?? e;
                s.destroy();
            });

            s.on('finish', function onFinish() {
                s.destroy();
            });

            // guaranteed to be called
            s.on('close', function onClose() {
                probeResultCheck({});
            });

            s.setTimeout(options.timeout, function() {
                probeResultCheck({});
            });

            return;
        }

        s.connect(options.port, options.address, function() {
            var time_arr = process.hrtime(start);
            var time = (time_arr[0] * 1e9 + time_arr[1]) / 1e6;
            results.push({ seq: i, time: time });
            s.destroy();
            i++;
            check(options, callback);
        });
        s.on('error', function(e) {
            results.push({seq: i, time: undefined, err: e });
            s.destroy();
            i++;
            check(options, callback);
        });
        s.setTimeout(options.timeout, function() {
            results.push({seq: i, time: undefined, err: Error('Request timeout') });
            s.destroy();
            i++;
            check(options, callback);
        });
    };
    connect(options, callback);
};

module.exports.probe = probe;

/**
 * Pings a TCP connection to a specified address and port, with default options for multiple (10) attempts.
 * @param {Object} options - Configuration options for the probe.
 * @param {string} [options.address='localhost'] - The address to probe. Defaults to 'localhost'.
 * @param {number} [options.port=80] - The port to probe. Defaults to 80.
 * @param {number} [options.attempts=10] - Number of attempts for ping. Defaults to 10.
 * @param {number} [options.timeout=5000] - Timeout for each probe attempt in milliseconds. Defaults to 5000.
 * @param {string|Buffer} [options.request] - Data to send as a request.
 * @param {string|Buffer} [options.exitRequest] - Data to send before closing socket.
 * @param {number} [options.maxResponseBytes=50000] - Maximum bytes to read from the response.
 * @param {boolean} [options.capture=false] - Whether to capture response data.
 * @param {string|Buffer|RegExp|Function} [options.match] - Pattern or function to match against response data.
 * @param {boolean} [options.noDelay=true] - Whether to disable Nagle's algorithm. Defaults to true.
 * @param {Function} callback - Callback function with signature (err, data) where data contains probe results.
 */
function ping(options, callback) {
  return probe({ attempts: 10, ...options }, callback);
};

module.exports.ping = ping;
