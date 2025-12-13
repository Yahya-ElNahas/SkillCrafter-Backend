const express = require("express");
const router = express.Router();
const performanceController = require("../controllers/performanceController");

router.delete("/", performanceController.deletePerformances);

module.exports = router;