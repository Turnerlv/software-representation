'use strict';

const express = require('express');
const apiRouter = require('./routes/api');
const usersRouter = require('./routes/users');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded());

// Param loading
app.param('user', (req, res, next, id) => {
  next();
});

// Route definitions
app.get('/', (req, res) => {
  res.send('Hello World');
});

app.post('/login', (req, res) => {
  res.format({
    'application/json': () => res.json({ token: 'abc123' }),
    default: () => res.sendStatus(406)
  });
});

app.route('/settings')
  .get((req, res) => res.send('Get settings'))
  .post((req, res) => res.send('Update settings'));

// Router mounts
app.use('/api', apiRouter);
app.use('/users', usersRouter);

app.get('/download', (req, res) => {
  res.download('/tmp/file.pdf');
});

app.get('/view', (req, res) => {
  res.render('index');
});

app.get('/redirect', (req, res) => {
  res.redirect('/home');
});

module.exports = app;

app.init = function() {};
app['delete'] = function() {};

// New patterns: Exported object method assignments on req and res
const req = Object.create(null);
req.header = function() {};
module.exports.request = req;

const res = Object.create(null);
res.status = function() {};
module.exports.response = res;

Object.defineProperty(req, 'protocol', {
  configurable: true,
  enumerable: true,
  get: function protocol() { return 'http'; }
});

app.get('/cookie', (req, res) => {
  res.cookie('remember', 1);
  res.clearCookie('remember');
  const range = req.get('Range'); // Getter call, should NOT be extracted as Express Route: GET Range
});

function defineGetter(obj, name, fn) {
  Object.defineProperty(obj, name, { get: fn });
}
defineGetter(req, 'ip', function ip() { return '127.0.0.1'; });

function View(name) {}
View.prototype.lookup = function lookup(name) {};

if (require.main === module) {
  app.emit('mount', this);
  app.listen(3000);
}

