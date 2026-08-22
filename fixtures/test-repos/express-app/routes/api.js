'use strict';

const express = require('express');

const router = express.Router();

router.get('/items', (req, res) => {
  res.json([]);
});

router.post('/items', (req, res) => {
  res.status(201).json({ id: 1 });
});

router.delete('/items/:id', (req, res) => {
  res.status(204).send();
});

module.exports = router;
