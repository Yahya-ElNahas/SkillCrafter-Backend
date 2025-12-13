const express = require("express");
const router = express.Router();
const provinceController = require("../controllers/provinceController");

// GET /api/provinces
router.get("/", provinceController.getProvinces);

module.exports = router;