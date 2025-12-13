const express = require('express');
const router = express.Router();
const turnController = require("../controllers/turnController");

router.post("/end", turnController.endTurn);
router.get("/", turnController.getTurn);

module.exports = router;