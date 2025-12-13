const path = require("path");
const fs = require("fs");
const tokenService = require("../services/tokenService");
const turnModel = require("../models/turn");

exports.readProvincesFile = () => {
  const provincePath = path.join(__dirname, "../models/provinces.json");
  return JSON.parse(fs.readFileSync(provincePath, "utf8"));
}

exports.getProvinces = async (req, res) => {
  const token =  req.cookies.token;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  let decodedToken;
  try {
    decodedToken = tokenService.verify(token);
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
  const userId = decodedToken.id;

  const turn = await turnModel.findOne({ userId });
  if (!turn) return res.status(404).json({ error: "Turn not found for user" });

  const provinces = exports.getProvincesWithControllers(turn);
  res.json(provinces);
};

exports.getAdjacency = (province) => {
  const provData = fs.readFileSync(path.join(__dirname, "../models/adjacency.json"), "utf8");
  try {
      const adjacency = JSON.parse(provData);
      return adjacency[province] || [];
  } catch (parseProvErr) {
      console.error("Failed to parse adjacency data:", parseProvErr);
      return [];
  }
};

exports.getProvincesWithControllers = (turn) => {
  const provincePath = path.join(__dirname, "../models/provinces.json");
  const provinces = JSON.parse(fs.readFileSync(provincePath, "utf8"));
  provinces.forEach(province => {
    if (turn.controlledProvinces.includes(province.id)) {
      province.controller = "allied";
    } else {
      province.controller = "enemy";
    }
  });
  return provinces;
}