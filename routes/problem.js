const express = require('express');
const router = express.Router();
const problemController = require('../controllers/problemController');

router.post('/byTopic', problemController.getProblemsByTopic);
router.post('/alter', problemController.alterProblems);

module.exports = router;