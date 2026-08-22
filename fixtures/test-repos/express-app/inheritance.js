var http = require('http');
var req = Object.create(http.IncomingMessage.prototype);
Object.setPrototypeOf(req, http.IncomingMessage.prototype);
var EventEmitter = require('events').EventEmitter;
var app = {};
mixin(app, EventEmitter.prototype, false);
