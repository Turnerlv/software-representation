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
