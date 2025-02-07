tcp-probe
=========

TCP probe utility for node.js. This tool allows you to test if a chosen address accepts connections at a desired port and measure latency, as well as validate responses and capture data. It's ideal for service availability testing and more advanced probing tasks. Forked from [tcp-ping](https://github.com/apaszke/tcp-ping).

### Install

```
npm install tcp-probe
```

### Functions

##### probe(options, callback)

`options` is an object, which may contain several properties:

* address (address to ping; defaults to `localhost`)
* port (defaults to `80`)
* timeout (in ms; defaults to 5s)
* attempts (how many times to measure time; defaults to 1)
* request (data to send to the server; can be a string or Buffer)
* match (string, Buffer, RegExp, or function(buffer), to match against the server's response)
* capture (boolean indicating whether to capture the server's response)
* maxResponseBytes (maximum bytes to read from the response; defaults to 10k)
* responseTimeout (maximum time to wait for a response)

`callback` should be a function with arguments in node convention - `function(err, data)`.

##### ping(options, callback)

The `ping` function is an alias of `probe` but defaults to 10 attempts.

Returned data is an object which looks like this:
```javascript
{
  address: '46.28.246.123',
  port: 80,
  attempts: 10,
  matches: 10,
  errors: 0,
  avg: 19.7848844,
  max: 35.306233,
  min: 16.526067,
  conAvg: 17.7848844,
  conMax: 33.306233,
  conMin: 14.526067,
  results:
   [
    { seq: 0, time: 35.306233, conTime: 33.306233, bytes: 102, match: true },
    { seq: 1, time: 16.585919, conTime: 14.585919, bytes: 102, match: true },
    ...
    { seq: 9, time: 17.625968, conTime: 15.625968, bytes: 102, match: true }
   ]
}
```

### Usage

```javascript
tcpp = require('tcp-probe');

tcpp.probe({
  address: '46.28.246.123',
  port: 80,
  request: 'GET / HTTP/1.1\r\nHost: example.com\r\n\r\n',
  match: 'HTTP/1.1 200 OK',
  capture: true
}, function(err, data) {
    console.log(data);
});

```

The `tcp-probe` library is forked from the original [tcp-ping](https://github.com/apaszke/tcp-ping) library by Adam Paszke, with added request and response validation capabilities.
