const { getAdjacency, readProvincesFile, getProvincesWithControllers } = require("./provinceController");
const turnModel = require("../models/turn");
const adjacency = require("../models/adjacency.json");
const Armies = require("../models/armies");
const tokenService = require("../services/tokenService");
const { checkAndAwardTurnAchievement } = require("./achievementController");

exports.getTurn = async (req, res) => {
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
  
  res.json({ turn });
};

exports.endTurn = async (req, res) => {
  try {
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
    if (!turn) return res.status(404).json({ error: "Turn not found." });

    // load armies for this turn (as mutable documents)
    const armiesDocs = await Armies.find({ turnId: turn._id }).exec();
    // also create a quick lookup/clone array for read-only ops
    const armies = armiesDocs.map(d => d.toObject());

    // ensure controlledProvinces exists
    turn.controlledProvinces = turn.controlledProvinces || [];

    if (!turn.isEnding) {
      turn.isEnding = true;
      await turn.save();

      // reset movement for all units and persist
      for (const doc of armiesDocs) {
        if (doc.type === "infantry") doc.movement = 1;
        else if (doc.type === "armor") doc.movement = 2;
        else doc.movement = doc.movement || 1;
        await Armies.findByIdAndUpdate(doc._id, { $set: { movement: doc.movement } }).exec();
      }

      try {
        const provinces = getProvincesWithControllers(turn);
        const enemyControlled = provinces.filter(p => p.controller === "enemy");
        const alliedPositions = armies.filter(a => a.faction === "allied").map(a => a.position);
        const candidateSet = new Set();
        for (const pos of alliedPositions) {
          const adj = getAdjacency(pos) || [];
          for (const pid of adj) {
            if (!armies.some(a => a.position === pid) && enemyControlled.some(p => p.id === pid)) candidateSet.add(pid);
          }
        }
        const candidates = Array.from(candidateSet);
        if (candidates.length > 0) {
          const chosenProvince = candidates[Math.floor(Math.random() * candidates.length)];
          const unitType = Math.random() < 0.7 ? "infantry" : "armor";
          const newDoc = new Armies({ turnId: turn._id });
          await newDoc.createUnit(turn._id, unitType, "enemy", chosenProvince);
          await newDoc.save();
          const currentArmies = await Armies.find({ turnId: turn._id }).lean().exec();
          res.json({ armies: currentArmies, provinces: getProvincesWithControllers(turn), unitProcessed: true });
          return;
        }
      } catch (e) {
        console.error("Error creating enemy spawn unit:", e);
      }
    }

    function isAllied(unit) {
      return unit.faction === "allied";
    }
    function isEnemy(unit) {
      return unit.faction === "enemy";
    }
    function getUnitAtProvince(provinceId) {
      return armies.find(a => a.position === provinceId);
    }
    function isProvinceEmpty(provinceId) {
      return !armies.some(a => a.position === provinceId);
    }
    function getProvinceController(provinceId) {
      if (turn.controlledProvinces.includes(provinceId)) return "allied";
      return "enemy";
    }

    const enemyUnits = armies.filter(a => a.faction === "enemy");
    turn.processedUnitIds = turn.processedUnitIds || [];
    const availableUnits = enemyUnits.filter(u => !turn.processedUnitIds.includes(String(u._id)) && (u.movement || 0) > 0);
    const alliedUnits = armies.filter(a => a.faction === "allied");

    if (availableUnits.length === 0) {
      turn.isEnding = false;
      turn.currentTurn += 1;
      turn.processedUnitIds = [];
      await turn.save();

      // Check and award turn completion achievements
      const newAchievements = await checkAndAwardTurnAchievement(turn.userId, turn.currentTurn);

      // return fresh armies and provinces view
      const freshArmies = await Armies.find({ turnId: turn._id }).lean().exec();

      res.json({ armies: freshArmies, provinces: getProvincesWithControllers(turn), turnEnded: true });
      return;
    }

    const randomUnit = availableUnits[Math.floor(Math.random() * availableUnits.length)];
    const unit = randomUnit;
    const unitDoc = armiesDocs.find(d => String(d._id) === String(unit._id));

    if (!unitDoc) {
      turn.processedUnitIds.push(String(unit._id));
      await turn.save();
      const currentArmies = await Armies.find({ turnId: turn._id }).lean().exec();
      res.json({ armies: currentArmies, provinces: getProvincesWithControllers(turn), unitProcessed: true });
      return;
    }

    // Process one move for this unit
    const adjProvinces = getAdjacency(unitDoc.position) || [];

    // 1. Move into adjacent empty province allied controlled
    for (const adj of adjProvinces) {
      if (getProvinceController(adj) === "allied" && isProvinceEmpty(adj)) {
        // capture: set province to enemy (remove from controlledProvinces)
        unitDoc.position = adj;
        unitDoc.movement -= 1;
        // persist unit
        await Armies.findByIdAndUpdate(unitDoc._id, { $set: { position: unitDoc.position, movement: unitDoc.movement } }).exec();
        
        // remove province from allied control if present
        if (Array.isArray(turn.controlledProvinces) && turn.controlledProvinces.some(p => String(p) === String(adj))) {
          turn.controlledProvinces = turn.controlledProvinces.filter(p => String(p) !== String(adj));
          await turn.save();
        }
        const currentArmies = await Armies.find({ turnId: turn._id }).lean().exec();
        res.json({ armies: currentArmies, provinces: getProvincesWithControllers(turn), unitProcessed: true });
        return;
      }
    }

    // 2. If adjacent to friendly unit, initiate battle
    for (const adj of adjProvinces) {
      const alliedUnit = getUnitAtProvince(adj);
      if (alliedUnit && isAllied(alliedUnit)) {
        // return fresh DB docs for battle
        const attacker = await Armies.findById(unitDoc._id).lean().exec();
        const defender = await Armies.findOne({ position: alliedUnit.position, turnId: turn._id }).lean().exec();
        return res.json({
          pendingBattle: true,
          attacker,
          defender
        });
      }
    }

    // 3. Otherwise, search for nearest allied unit and move towards it (prioritize by fewest adjacent allied)
    let targetAlly = null;
    let minAdjAllied = Infinity;
    for (const ally of alliedUnits) {
      const adj = getAdjacency(ally.position) || [];
      const adjAlliedCount = adj.filter(pid => {
        const u = getUnitAtProvince(pid);
        return u && isAllied(u) && getProvinceController(pid) === "enemy";
      }).length;
      if (adjAlliedCount < minAdjAllied) {
        minAdjAllied = adjAlliedCount;
        targetAlly = ally;
      }
    }
    if (targetAlly) {
      const blockedIds = armies.map(a => a.position); // don't move through occupied provinces
      const nextStep = bfsNextStep(unitDoc.position, targetAlly.position, adjacency, blockedIds);
      if (nextStep && isProvinceEmpty(nextStep)) {
        unitDoc.position = nextStep;
        unitDoc.movement -= 1;
        await Armies.findByIdAndUpdate(unitDoc._id, { $set: { position: unitDoc.position, movement: unitDoc.movement } }).exec();
        // capture province if it was allied-controlled
        // Safely remove the province from controlledProvinces (compare as strings)
        if (Array.isArray(turn.controlledProvinces) && turn.controlledProvinces.some(p => String(p) === String(nextStep))) {
          turn.controlledProvinces = turn.controlledProvinces.filter(p => String(p) !== String(nextStep));
          await turn.save();
        }
        const currentArmies = await Armies.find({ turnId: turn._id }).lean().exec();
        res.json({ armies: currentArmies, provinces: getProvincesWithControllers(turn), unitProcessed: true });
        return;
      }
    }

    // 4. Move towards nearest empty province adjacent to enemy province
    let targetProvince = null;
    for (const province of readProvincesFile()) {
      if (!isProvinceEmpty(province.id)) continue;
      const adj = getAdjacency(province.id) || [];
      if (adj.some(pid => {
        return getProvinceController(pid) === "enemy";
      })) {
        const blockedIds = armies.map(a => a.position);
        const nextStep = bfsNextStep(unitDoc.position, province.id, adjacency, blockedIds);
        if (nextStep) {
          targetProvince = province;
          break;
        }
      }
    }
    if (targetProvince) {
      const blockedIds = armies.map(a => a.position);
      const nextStep = bfsNextStep(unitDoc.position, targetProvince.id, adjacency, blockedIds);
      if (nextStep && isProvinceEmpty(nextStep)) {
        unitDoc.position = nextStep;
        unitDoc.movement -= 1;
        await Armies.findByIdAndUpdate(unitDoc._id, { $set: { position: unitDoc.position, movement: unitDoc.movement } }).exec();
        // Safely remove the province from controlledProvinces (compare as strings)
        if (Array.isArray(turn.controlledProvinces) && turn.controlledProvinces.some(p => String(p) === String(nextStep))) {
          turn.controlledProvinces = turn.controlledProvinces.filter(p => String(p) !== String(nextStep));
          await turn.save();
        }
        const currentArmies = await Armies.find({ turnId: turn._id }).lean().exec();
        res.json({ armies: currentArmies, provinces: getProvincesWithControllers(turn), unitProcessed: true });
        return;
      }
    }

    // 5. Move closer to frontline (adjacent to enemy provinces)
    let frontlineProvince = null;
    for (const province of readProvincesFile()) {
      if (!isProvinceEmpty(province.id)) continue;
      const adj = getAdjacency(province.id) || [];
      if (adj.some(pid => getProvinceController(pid) === "enemy")) {
        frontlineProvince = province;
        break;
      }
    }
    if (frontlineProvince) {
      const blockedIds = armies.map(a => a.position);
      const nextStep = bfsNextStep(unitDoc.position, frontlineProvince.id, adjacency, blockedIds);
      if (nextStep && isProvinceEmpty(nextStep)) {
        unitDoc.position = nextStep;
        unitDoc.movement -= 1;
        await Armies.findByIdAndUpdate(unitDoc._id, { $set: { position: unitDoc.position, movement: unitDoc.movement } }).exec();
        // Safely remove the province from controlledProvinces (compare as strings)
        if (Array.isArray(turn.controlledProvinces) && turn.controlledProvinces.some(p => String(p) === String(nextStep))) {
          turn.controlledProvinces = turn.controlledProvinces.filter(p => String(p) !== String(nextStep));
          await turn.save();
        }
        const currentArmies = await Armies.find({ turnId: turn._id }).lean().exec();
        res.json({ armies: currentArmies, provinces: getProvincesWithControllers(turn), unitProcessed: true });
        return;
      }
    }

    // No valid moves left for this unit, mark as processed
    turn.processedUnitIds.push(String(unit._id));
    await turn.save();

    const currentArmies = await Armies.find({ turnId: turn._id }).lean().exec();

    res.json({ armies: currentArmies, provinces: getProvincesWithControllers(turn), unitProcessed: true });
  } catch (err) {
    console.error("endTurn error:", err);
    res.status(500).json({ error: "Failed to end turn." });
  }
};

// BFS helper (unchanged)
function bfsNextStep(startId, targetId, adjacency, blockedIds = []) {
  if (startId === targetId) return startId;
  const visited = new Set(blockedIds);
  const queue = [[startId]];
  visited.add(startId);

  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];
    const neighbors = adjacency[current] || [];
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      const newPath = [...path, neighbor];
      if (neighbor === targetId) {
        // Return the first step towards the target
        return newPath[1];
      }
      queue.push(newPath);
      visited.add(neighbor);
    }
  }
  // No path found
  return null;
}