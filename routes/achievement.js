const express = require("express");
const router = express.Router();
const achievementController = require("../controllers/achievementController");

router.get("/", achievementController.getUserAchievements);
router.get("/leaderboard", achievementController.getAllUsersLevels);

module.exports = router;