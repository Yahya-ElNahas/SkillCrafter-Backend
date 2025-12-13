const path = require("path");
const fs = require("fs");
const Performance = require('../models/performance');
const tokenService = require("../services/tokenService");

exports.deletePerformances = async (req, res) => {
    try {
        const result = await Performance.deleteMany({});
        res.json({ result });
    } catch (err) {
        console.error("deletePerformances error:", err);
        res.status(500).json({ error: "Failed to delete performances." });
    }
};
