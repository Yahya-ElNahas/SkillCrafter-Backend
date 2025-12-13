const { getAdjacency } = require("./provinceController");
const turnModel = require("../models/turn");
const Armies = require("../models/armies");
const tokenService = require("../services/tokenService");
const { getProvincesWithControllers } = require("./provinceController");

exports.getArmies = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies.token;
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

    const armies = await Armies.find({ turnId: turn._id }).lean().exec();
    // Return a plain array to match frontend expectations
    res.json(armies);
  } catch (err) {
    console.error("getArmies error:", err);
    res.status(500).json({ error: "Failed to retrieve armies." });
  }
};

exports.moveDivision = async (req, res) => {
  try {
    const { divisionId, position } = req.body;

    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies.token;
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

    // load armies for this turn
    const armies = await Armies.find({ turnId: turn._id }).exec();

    const division = armies.find(div => div._id.toString() === divisionId.toString());
    if (!division) return res.status(404).json({ error: "Division not found." });

    if (turn.isEnding) return res.status(400).json({ error: "Cannot move division while turn is ending." });

    if (division.faction !== "allied") return res.status(400).json({ error: "Can only move allied divisions." });

    if ((division.movement || 0) <= 0) return res.status(400).json({ error: "Division has no movement points left." });

    const adjacency = getAdjacency(division.position);
    if (!adjacency.includes(position)) return res.status(400).json({ error: "Invalid move. Position not adjacent." });

    const occupyingDivision = armies.find(div => div.position === position);

    if (occupyingDivision && occupyingDivision.faction !== division.faction) {
      // return fresh DB docs for battle
      const attacker = await Armies.findById(division._id).lean().exec();
      const defender = await Armies.findById(occupyingDivision._id).lean().exec();
      if(attacker.type === "infantry" && defender.type === "armor") {
        return res.status(400).json({ error: "Infantry units cannot attack armor units." });
      }
      return res.status(200).json({
        result: "battle",
        attacker,
        defender
      });
    }

    // If friendly occupying division, swap positions
    if (occupyingDivision && occupyingDivision.faction === division.faction) {
      await Armies.findByIdAndUpdate(
        occupyingDivision._id,
        { $set: { position: division.position } },
        { new: true }
      ).exec();
      // increment movement for moving division (we'll persist below)
      division.movement = (division.movement || 0) + 1;
    }

    // update this division's position and movement
    division.position = position;
    division.movement = (division.movement || 0) - 1;

    await Armies.findByIdAndUpdate(
      division._id,
      { $set: { position: division.position, movement: division.movement } },
      { new: true, upsert: true }
    ).exec();

    const provinces = turn.controlledProvinces;
    provinces.push(position);
    turn.controlledProvinces = provinces;
    await turn.save();

    const freshArmies = await Armies.find({ turnId: turn._id }).lean().exec();
    res.json({ message: "Division moved successfully.", armies: freshArmies, provinces: getProvincesWithControllers(turn) });
  } catch (err) {
    console.error("moveDivision error:", err);
    res.status(500).json({ error: "Failed to move division." });
  }
};

exports.retreat = async (unit, turnId) => {
  try {
    const turn = await turnModel.findById(turnId).exec();
    if (!turn) throw new Error("Turn not found");

    const armies = await Armies.find({ turnId }).lean().exec();

    function isProvinceEmpty(provinceId) {
      return !armies.some(a => a.position === provinceId);
    }

    function getProvinceController(provinceId) {
      if(turn.controlledProvinces.includes(provinceId))
        return "allied";
      return "enemy";
    }

    const adjacentProvinces = getAdjacency(unit.position);
    const emptyProvinces = adjacentProvinces.filter(provinceId =>
      isProvinceEmpty(provinceId) && getProvinceController(provinceId) === unit.faction
    );

    if (emptyProvinces.length > 0) {
      const randomProvince = emptyProvinces[Math.floor(Math.random() * emptyProvinces.length)];
      await Armies.findByIdAndUpdate(unit._id, { $set: { position: randomProvince } }).exec();
    } else {
      await Armies.deleteOne({ _id: unit._id, turnId }).exec();
      console.log(`Unit ${unit.name} has been removed due to lack of retreat options.`);
    }

    return await Armies.find({ turnId }).lean().exec();
  } catch (err) {
    console.error("retreat error:", err);
    return await Armies.find({ turnId }).lean().exec();
  }
};

exports.getAdjacenciesOfUnit = async (req, res) => {
  try {
    const { unitId } = req.body;
    const unit = await Armies.findById(unitId).lean().exec();
    if (!unit) return res.status(404).json({ error: "Unit not found." });

    const adjacencies = getAdjacency(unit.position);
    res.json({ adjacencies });
  } catch (err) {
    console.error("getAdjacenciesOfUnit error:", err);
    res.status(500).json({ error: "Failed to get adjacencies." });
  }
};