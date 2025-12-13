const express = require('express');
const router = express.Router();
const battleController = require('../controllers/battleController');

router.post('/initiate', battleController.initiateBattle);
router.post('/run', battleController.runSolution);
router.post('/hint', battleController.getHint);

module.exports = router;