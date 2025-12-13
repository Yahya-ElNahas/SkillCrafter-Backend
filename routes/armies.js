const express = require("express");
const router = express.Router();
const armyController = require("../controllers/armyController");

router.get("/", armyController.getArmies);
router.post("/move", armyController.moveDivision);
router.post("/adjacenciesOfUnit", armyController.getAdjacenciesOfUnit);

module.exports = router;
