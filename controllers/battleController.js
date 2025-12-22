const llmService = require("../services/llmService.js");
const Problem = require("../models/problem");
const Performance = require("../models/performance");
const RLAgent = require("../utils/rlAgent.js");
const { runTestCases } = require("../services/sandboxService");
const turnModel = require("../models/turn");
const { retreat } = require("./armyController");
const Armies = require("../models/armies");
const tokenService = require("../services/tokenService");
const { getProvincesWithControllers, readProvincesFile } = require("./provinceController");
const { checkAndAwardProblemAchievement, checkAndAwardTurnAchievement } = require("./achievementController");
const User = require("../models/user");

const rlAgent = new RLAgent();

exports.initiateBattle = async (req, res) => {
  const { attacker, defender, topic, position, problem } = req.body;

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

  if (attacker && attacker.faction === "allied" && turn && turn.isEnding) {
    return res.status(400).json({ error: "Cannot initiate battle while turn is ending." });
  }

  if(attacker && attacker.faction === "allied" && attacker.type === "infantry" && defender.type === "armor") {
    return res.status(400).json({ error: "Infantry units cannot attack armored units. Choose a different attacker." });
  }

  if(turn.version == 2) {
    if(!problem) {
      return res.status(400).json({ error: "Problem is required for version 2." });
    }

    if (!(await Performance.findOne({ userId, problemId: problem._id }))) {
      await Performance.create({
        userId,
        problemId: problem._id,
        topic: problem.topic,
        difficulty: problem.difficulty
      });
    }

    return res.json({ attacker, defender, position, problem });
  }

  
  // Check if topic is mastered (no unsolved problems)
  const allProblems = await Problem.find({ topic }).select('_id');
  const solvedProblemIds = new Set((await Performance.find({ userId, topic, passed: true })).map(p => p.problemId.toString()));
  const unsolvedCount = allProblems.length - solvedProblemIds.size;
  if (unsolvedCount === 0) {
    return res.json({ mastered: true });
  }

  const unfinishedPerformances = await Performance.find({
    userId,
    topic,
    passed: { $ne: true }
  }).sort({ date: -1 }).lean();

  let resumedProblem = null;
  let recentUnfinished = null;
  for (const perf of unfinishedPerformances) {
    const prob = await Problem.findById(perf.problemId).lean();
    if (!prob) continue;
    resumedProblem = prob;
    recentUnfinished = perf;
    break;
  }

  if (resumedProblem) {
    // req.session = req.session || {};
    // req.session.rlState = req.session.rlState || null;
    // req.session.rlAction = req.session.rlAction || null;
    return res.json({
      attacker,
      defender,
      position,
      problem: resumedProblem,
      resumed: true,
      performanceId: recentUnfinished._id
    });
  }

  // 1. Find problems for the chosen topic
  const problems = await Problem.find({ topic });

  const performances = await Performance.find({ userId, topic, passed: true }).sort({ date: -1 }).lean();

  const performanceSummary = {
    recentScore: performances[0]?.score || null,
    averageScore: Math.round(
      performances.reduce((acc, p) => acc + p.score, 0) /
        (performances.length || 1)
    ),
    attempts: performances.length,
    commonErrors: [...new Set(performances.flatMap(p => p.errors || []))],
    lastDifficulty: performances[0]?.difficulty || null,
    hintsUsed: performances.reduce((acc, p) => acc + (p.hintsUsed || 0), 0)
  };

  // If lastDifficulty is missing, fetch from the problem
  if (performances.length > 0 && !performanceSummary.lastDifficulty) {
    const lastProblem = await Problem.findById(performances[0].problemId).lean();
    performanceSummary.lastDifficulty = lastProblem?.difficulty || null;
  }

  // 2. Filter problems for chosen topic/difficulty
  const solvedIds = new Set(performances.map(p => p.problemId.toString()));
  const unsolvedProblems = problems.filter(p => !solvedIds.has(p._id.toString()));

  // Always allow all difficulties from the start, but prefer basic for new users
  const poolProblems = unsolvedProblems.length ? unsolvedProblems : problems;

  // Build possible actions from all available difficulties
  const possibleActions = poolProblems.map(p => `${p.topic}_${p.difficulty}`);

  // 3. RL Agent chooses topic/difficulty (action)
  const userState = {
    topic,
    recentScore: performanceSummary.recentScore,
    averageScore: performanceSummary.averageScore,
    attempts: performanceSummary.attempts,
    lastDifficulty: performanceSummary.lastDifficulty,
    hintsUsed: performanceSummary.hintsUsed
  };
  let chosenAction = rlAgent.chooseAction(userId, userState, possibleActions);
  let [chosenTopic, chosenDifficulty] = chosenAction.split("_");

  // If no solved problems in the topic, always start with basic
  if (performances.length === 0) {
    chosenDifficulty = 'basic';
    chosenTopic = topic;
    chosenAction = `${chosenTopic}_${chosenDifficulty}`;
  }

  // 4. Filter problems for chosen topic/difficulty (but constrained to currentDifficulty)
  let filteredProblems = poolProblems.filter(
    p => p.topic === chosenTopic && p.difficulty === chosenDifficulty
  );

  // fallback: if RL/LLM choice yields empty, try other problems in same difficulty pool
  let flag = false;
  if (filteredProblems.length === 0) {
    filteredProblems = poolProblems.filter(p => p.topic === chosenTopic);
    flag = true;
  }

  if (filteredProblems.length === 0) {
    return res.status(400).json({ error: "No suitable unsolved problems available." });
  }

  // 5. LLM selects the best problem
  const prompt = `
    You are an adaptive problem recommender for programming learners.

    Here is the learner's past performance summary for topic "${chosenTopic}":
    ${JSON.stringify(performanceSummary, null, 2)}

    You have access to these problems in the same topic and difficulty that the user has NOT yet solved:
    ${JSON.stringify(filteredProblems, null, 2)}

    Based on the learner's weaknesses, difficulty history, and common mistakes,
    choose ONE problem that:
    - Matches their current level
    - Is slightly challenging but not too difficult
    - Avoids topics they have already mastered
    - Reinforces areas where they struggled

    You have to choose ONE problem that best fits the criteria above.

    Output ONLY the EXACT raw JSON object of the selected problem containing the "_id" field only, with no extra text, formatting, or commentary.
  `;

  let result; 

  if(performances.length > 0) result = await llmService.getLLMResponse(prompt);
  else result = JSON.stringify(filteredProblems[Math.floor(Math.random() * filteredProblems.length)]); // random for first problem
  
  let finalProblem;
  try {
    const problemId = JSON.parse(result)._id;
    finalProblem = filteredProblems.find(p => p._id.toString() === problemId);
    if (!finalProblem) {
      throw new Error("Problem not found");
    }
    if(flag) {
      chosenDifficulty = finalProblem.difficulty;
      chosenAction = `${chosenTopic}_${chosenDifficulty}`;
    }
  } catch (e) {
    // Fallback to random selection
    finalProblem = filteredProblems[Math.floor(Math.random() * filteredProblems.length)];
    if(flag) {
      chosenDifficulty = finalProblem.difficulty;
      chosenAction = `${chosenTopic}_${chosenDifficulty}`;
    }
  }

  if (!(await Performance.findOne({ userId, problemId: finalProblem._id }))) {
    await Performance.create({
      userId,
      problemId: finalProblem._id,
      topic: chosenTopic,
      difficulty: finalProblem.difficulty
    });
  }

  res.json({ attacker, defender, position, problem: finalProblem, rlState: userState, rlAction: chosenAction }); 
};


exports.runSolution = async (req, res) => {
  const { code, problem, attacker, defender, position, language, surrender, rlState, rlAction } = req.body;

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

  if (turn.version == 3) {
    let performance = await Performance.findOne({ userId, problemId: problem._id });
    
    // If performance doesn't exist, create it (shouldn't happen but safety check)
    if (!performance) {
      performance = await Performance.create({
        userId,
        problemId: problem._id,
        topic: problem.topic,
        difficulty: problem.difficulty
      });
    }
  
    let { allPassed, outputs, error } = await runTestCases(code, problem, language);

    const now = new Date();
    const timeSpent = performance.date ? Math.floor((now - performance.date) / 1000) : 0;
    performance.timeSpent = (performance.timeSpent || 0) + timeSpent;
        
    if (error) {
      const errorIndex = error.indexOf('error:');
      if (errorIndex !== -1) {
        error = error.substring(errorIndex + 6).trim();
      }
    } else {
      performance.attempts = (performance.attempts || 0) + 1;

      // RL Agent update after solution - more sensitive reward system
      // rlState and rlAction are passed from req.body
      // const rlState = req.session?.rlState;
      // const rlAction = req.session?.rlAction;

      // Calculate sensitive reward based on attempts, difficulty, and hints
      let reward = 0;
      if (allPassed) {
        // Base reward for solving
        reward = 1;

        // Bonus for solving in fewer attempts (max bonus for 1 attempt)
        const attemptBonus = Math.max(0, 1 - (performance.attempts - 1) * 0.2);
        reward += attemptBonus;

        // Penalty for using hints
        const hintPenalty = (performance.hintsUsed || 0) * 0.1;
        reward = Math.max(0.1, reward - hintPenalty);

        // Cap reward to prevent over-learning
        reward = Math.min(reward, 1);
      } else {
        // Small penalty for failing (encourages learning)
        reward = -0.1;
      }

      const nextState = {
        topic: problem.topic,
        recentScore: allPassed ? Math.min(100, 100 - (performance.attempts - 1) * 10) : 0,
        averageScore: performance.averageScore || 0,
        attempts: performance.attempts,
        lastDifficulty: problem.difficulty,
        hintsUsed: performance.hintsUsed || 0
      };
      if (rlState && rlAction) {
        rlAgent.update(userId, rlState, rlAction, reward, nextState);
      }
    }

    if (allPassed) {
      performance.passed = true;
      performance.score = (allPassed / performance.attempts * 50)
        + (Math.max(0, 20 - performance.hintsUsed * 5))
        + (Math.max(0, 20 - performance.attempts * 5))
        + (Math.max(0, 10 - performance.timeSpent));
      performance.date = new Date();
      await performance.save();

      // Check and award achievements
      const newAchievements = await checkAndAwardProblemAchievement(userId, problem, performance);

      // Award XP based on problem difficulty
      const xpRewards = {
        basic: 50,
        easy: 100,
        medium: 150,
        hard: 200
      };
      const xpGained = xpRewards[problem.difficulty] || 50;
      
      const user = await User.findById(userId);
      user.xp = (user.xp || 0) + xpGained;
      await user.save();

      const victoryMessage = `You have won the battle.

🎖️ Rewards Earned:
+${xpGained} XP
`;

      return res.json({
        passed: true,
        outputs,
        victoryMessage,
      });
    }

    performance.passed = false;
    performance.date = new Date();
    await performance.save();

    const feedbackPrompt = `
    You are a coding tutor providing feedback on a failed solution attempt. Be simple, constructive, and adaptive to the learner's level.
    And only respond with clear feedback that the learner can easily understand to help them solve the problem.
    Take into consideration that the user has very basic coding skills or is a complete beginner, so dont use complex terminology, concepts or data structures.
    The user also only took these basic programming lectures: variables, data types, conditions, strings, loops, methods. So dont tell them to use more advanced concepts like arrays, try/catch, instanceof, etc.

    Problem: ${problem.title}
    Description: ${problem.description}
    User's Code:
    ${code}

    Test Outputs: ${JSON.stringify(outputs)}
    Error (if any): ${error || "None"}

    User's Performance Summary:
    Attempts: ${performance.attempts}
    Hints Used: ${performance.hintsUsed || 0}
    Past Errors: ${performance.errors ? performance.errors.join(", ") : "None"}

    Provide concise feedback (2-3 sentences or more if needed for clarity) that:
    - Explains why it failed (based on outputs/error)
    - Suggests what to fix or try next
    - helps the user understand without giving the full solution
    - Considers their beginner level and history

    Respond with only the feedback text, no extra formatting and prioritize low amount of text but also clarity.
  `;

    let feedback;
    if(turn.version != 2) feedback = await llmService.getLLMResponse(feedbackPrompt);

    return res.json({ passed: false, outputs, error, suggestedProblem: null, feedback });
  }

  const armies = await Armies.find({ turnId: turn._id }).lean().exec();

  if(position) {
    if(surrender) {
      return res.json({
        armies,
        provinces: getProvincesWithControllers(turn),
        turnEnding: turn ? turn.isEnding : false,
        surrendered: true,
      });
    }
    const province = turn.controlledProvinces.find(p => p === position);
    if (!province) res.status(400).json({ error: "You do not control this province." });

    let finalPosition = position;
    if(armies.find(a => a.position === position)) {
      let emptyProvince = null;
      for(const prov of turn.controlledProvinces) {
        if(!armies.find(a => a.position === prov)) {
          emptyProvince = prov;
          break;
        }
      }
      if(emptyProvince) finalPosition = emptyProvince;
      else return res.status(400).json({ error: "No available space to deploy unit." });
    }

    const performance = await Performance.findOne({ userId, problemId: problem._id });
  
    let { allPassed, outputs, error } = await runTestCases(code, problem, language);

    const now = new Date();
    const timeSpent = Math.floor((now - performance.date) / 1000);
    performance.timeSpent = (performance.timeSpent || 0) + timeSpent;
        
    if (error) {
      const errorIndex = error.indexOf('error:');
      if (errorIndex !== -1) {
        error = error.substring(errorIndex + 6).trim();
      }
    } else {
      performance.attempts = (performance.attempts || 0) + 1;

      // RL Agent update after solution - more sensitive reward system
      // rlState and rlAction are passed from req.body
      // const rlState = req.session?.rlState;
      // const rlAction = req.session?.rlAction;

      // Calculate sensitive reward based on attempts, difficulty, and hints
      let reward = 0;
      if (allPassed) {
        // Base reward for solving
        reward = 1;

        // Bonus for solving in fewer attempts (max bonus for 1 attempt)
        const attemptBonus = Math.max(0, 1 - (performance.attempts - 1) * 0.2);
        reward += attemptBonus;

        // Penalty for using hints
        const hintPenalty = (performance.hintsUsed || 0) * 0.1;
        reward = Math.max(0.1, reward - hintPenalty);

        // Cap reward to prevent over-learning
        reward = Math.min(reward, 1);
      } else {
        // Small penalty for failing (encourages learning)
        reward = -0.1;
      }

      const nextState = {
        topic: problem.topic,
        recentScore: allPassed ? Math.min(100, 100 - (performance.attempts - 1) * 10) : 0,
        averageScore: performance.averageScore || 0,
        attempts: performance.attempts,
        lastDifficulty: problem.difficulty,
        hintsUsed: performance.hintsUsed || 0
      };
      if (rlState && rlAction) {
        rlAgent.update(userId, rlState, rlAction, reward, nextState);
      }
    }

    if (allPassed) {
      const provinces = getProvincesWithControllers(turn);
      const finalProvince = provinces.find(p => p.id === position);
      if(finalProvince.type === "barracks") {
        const doc = new Armies({ turnId: turn._id });
        await doc.createUnit(turn._id, "infantry", "allied", finalPosition);
        await doc.save();
      } else {
        const doc = new Armies({ turnId: turn._id });
        await doc.createUnit(turn._id, "armor", "allied", finalPosition);
        await doc.save();
      }

      const updatedArmies = await Armies.find({ turnId: turn._id }).lean().exec();

      if(code !== "test") performance.passed = true;
      performance.score = (allPassed / performance.attempts * 50)
        + (Math.max(0, 20 - performance.hintsUsed * 5))
        + (Math.max(0, 20 - performance.attempts * 5))
        + (Math.max(0, 10 - performance.timeSpent));
      performance.date = new Date();
      await performance.save();

      // Check and award achievements
      const newAchievements = await checkAndAwardProblemAchievement(userId, problem, performance);

      // Award XP based on problem difficulty
      const xpRewards = {
        basic: 50,
        easy: 100,
        medium: 150,
        hard: 200
      };
      const xpGained = xpRewards[problem.difficulty] || 50;
      
      const user = await User.findById(userId);
      user.xp = (user.xp || 0) + xpGained;
      await user.save();

      const freshTurn = await turnModel.findOne({ userId: userId });

      const victoryMessage = `You have won the battle.

🎖️ Rewards Earned:
+${xpGained} XP
`;

      return res.json({
        passed: true,
        outputs,
        victoryMessage,
        armies: updatedArmies,
        provinces: getProvincesWithControllers(freshTurn),
        turnEnding: freshTurn ? freshTurn.isEnding : false
      });
    }

    performance.passed = false;
    performance.date = new Date();
    await performance.save();

    // Generate adaptive feedback using LLM
    const feedbackPrompt = `
    You are a coding tutor providing feedback on a failed solution attempt. Be simple, constructive, and adaptive to the learner's level.
    And only respond with clear feedback that the learner can easily understand to help them solve the problem.
    Take into consideration that the user has very basic coding skills or is a complete beginner, so dont use complex terminology, concepts or data structures.
    The user also only took these basic programming lectures: variables, data types, conditions, strings, loops, methods. So dont tell them to use more advanced concepts like arrays, try/catch, instanceof, etc.

    Problem: ${problem.title}
    Description: ${problem.description}
    User's Code:
    ${code}

    Test Outputs: ${JSON.stringify(outputs)}
    Error (if any): ${error || "None"}

    User's Performance Summary:
    Attempts: ${performance.attempts}
    Hints Used: ${performance.hintsUsed || 0}
    Past Errors: ${performance.errors ? performance.errors.join(", ") : "None"}

    Provide concise feedback (2-3 sentences or more if needed for clarity) that:
    - Explains why it failed (based on outputs/error)
    - Suggests what to fix or try next
    - helps the user understand without giving the full solution
    - Considers their beginner level and history

    Respond with only the feedback text, no extra formatting and prioritize low amount of text but also clarity.
  `;

    let feedback;
    if(turn.version != 2) feedback = await llmService.getLLMResponse(feedbackPrompt);

    return res.json({ passed: false, outputs, error, suggestedProblem: null, feedback });
  }

  const attackerDivision = armies.find(div => div._id.toString() === attacker._id.toString());
  const defenderDivision = armies.find(div => div._id.toString() === defender._id.toString());

  if (surrender) {
    let updatedArmies;
    if (defenderDivision && defenderDivision.faction === "allied") {
      // move attacker to defender position and persist
      try {
        await Armies.findOneAndUpdate(
          { _id: attackerDivision._id },
          { $set: { position: defenderDivision.position, 
            movement: attackerDivision.movement - 1 } }
        ).exec();
      } catch (e) {}

      // retreat defender (returns updated armies list)
      updatedArmies = await retreat(defenderDivision, turn._id);

      // remove province from allied control if present
      if (Array.isArray(turn.controlledProvinces) && turn.controlledProvinces.some(p => String(p) === String(defenderDivision.position))) {
        turn.controlledProvinces = turn.controlledProvinces.filter(p => String(p) !== String(defenderDivision.position));
        await turn.save();
      }
    }

    const freshTurn = await turnModel.findOne({ userId });
    return res.json({
      armies: updatedArmies,
      provinces: getProvincesWithControllers(freshTurn),
      turnEnding: freshTurn ? freshTurn.isEnding : false,
      surrendered: true,
      attacker: attackerDivision,
    });
  }

  // Find the performance record
  const performance = await Performance.findOne({ userId, problemId: problem._id });
  
  let { allPassed, outputs, error } = await runTestCases(code, problem, language);

  const now = new Date();
  const timeSpent = Math.floor((now - performance.date) / 1000);
  performance.timeSpent = (performance.timeSpent || 0) + timeSpent;
    
  if (error) {
    const errorIndex = error.indexOf('error:');
    if (errorIndex !== -1) {
      error = error.substring(errorIndex + 6).trim();
    }
  } else {
    performance.attempts = (performance.attempts || 0) + 1;

    // RL Agent update after solution - more sensitive reward system
    // rlState and rlAction are passed from req.body
    // const rlState = req.session?.rlState;
    // const rlAction = req.session?.rlAction;

    // Calculate sensitive reward based on attempts, difficulty, and hints
    let reward = 0;
    if (allPassed) {
      // Base reward for solving
      reward = 1;

      // Bonus for solving in fewer attempts (max bonus for 1 attempt)
      const attemptBonus = Math.max(0, 1 - (performance.attempts - 1) * 0.2);
      reward += attemptBonus;

      // Penalty for using hints
      const hintPenalty = (performance.hintsUsed || 0) * 0.1;
      reward = Math.max(0.1, reward - hintPenalty);

      // Cap reward to prevent over-learning
      reward = Math.min(reward, 1);
    } else {
      // Small penalty for failing (encourages learning)
      reward = -0.1;
    }

    const nextState = {
      topic: problem.topic,
      recentScore: allPassed ? Math.min(100, 100 - (performance.attempts - 1) * 10) : 0,
      averageScore: performance.averageScore || 0,
      attempts: performance.attempts,
      lastDifficulty: problem.difficulty,
      hintsUsed: performance.hintsUsed || 0
    };
    if (rlState && rlAction) {
      rlAgent.update(userId, rlState, rlAction, reward, nextState);
    }
  }

  // If all test cases passed, handle victory logic
  if (allPassed) {
    // reload armies from DB to get fresh documents
    const freshArmies = await Armies.find({ turnId: turn._id }).lean().exec();
    const freshAttacker = freshArmies.find(div => div._id.toString() === attacker._id.toString());
    const freshDefender = freshArmies.find(div => div._id.toString() === defender._id.toString());

    let capturedCity = null;

    if (freshAttacker && freshDefender) {
      if (freshAttacker.faction === "allied") {
        try {
          await Armies.findByIdAndUpdate(
            freshAttacker._id,
            { $set: { position: freshDefender.position, movement: freshAttacker.movement - 1 } }
          ).exec();
        } catch (e) {}
  
        const provinces = turn.controlledProvinces;
        provinces.push(freshDefender.position);
        turn.controlledProvinces = provinces;

        await retreat(freshDefender, turn._id);
        await turn.save();

        // Check if the captured province is a city and award XP
        const allProvinces = readProvincesFile();
        const capturedProvince = allProvinces.find(p => p.id === freshDefender.position);
        if (capturedProvince && capturedProvince.type === "city") {
          const user = await User.findById(userId);
          user.xp = (user.xp || 0) + 200;
          await user.save();
          capturedCity = capturedProvince.name;
        }
      } else {
        try {
          await Armies.findByIdAndUpdate(
            freshAttacker._id,
            { $set: { movement: freshAttacker.movement - 1 } }
          ).exec();
        } catch (e) {}
      }

      const updatedArmies = await Armies.find({ turnId: turn._id }).lean().exec();


      if(code !== "test") performance.passed = true;
      performance.score = (allPassed / performance.attempts * 50)
        + (Math.max(0, 20 - performance.hintsUsed * 5))
        + (Math.max(0, 20 - performance.attempts * 5))
        + (Math.max(0, 10 - performance.timeSpent));
      performance.date = new Date();
      await performance.save();

      // Check and award achievements
      const newAchievements = await checkAndAwardProblemAchievement(userId, problem, performance);

      // Award XP based on problem difficulty
      const xpRewards = {
        basic: 50,
        easy: 100,
        medium: 150,
        hard: 200
      };
      const xpGained = xpRewards[problem.difficulty] || 50;
      
      const user = await User.findById(userId);
      user.xp = (user.xp || 0) + xpGained;
      await user.save();

      const freshTurn = await turnModel.findOne({ userId: userId });

      const victoryMessage = `You have won the battle.

🎖️ Rewards Earned:
+${xpGained} XP
`;

      return res.json({
        passed: true,
        outputs,
        victoryMessage,
        armies: updatedArmies,
        provinces: getProvincesWithControllers(freshTurn),
        turnEnding: freshTurn ? freshTurn.isEnding : false,
        capturedCity
      });
    }
  }

  performance.passed = false;
  performance.date = new Date();
  await performance.save();

  // Generate adaptive feedback using LLM
  const feedbackPrompt = `
    You are a coding tutor providing feedback on a failed solution attempt. Be simple, constructive, and adaptive to the learner's level.
    And only respond with clear feedback that the learner can easily understand to help them solve the problem.
    Take into consideration that the user has very basic coding skills or is a complete beginner, so dont use complex terminology, concepts or data structures.
    The user also only took these basic programming lectures: variables, data types, conditions, strings, loops, methods. So dont tell them to use more advanced concepts like arrays, try/catch, instanceof, etc.

    Problem: ${problem.title}
    Description: ${problem.description}
    User's Code:
    ${code}

    Test Outputs: ${JSON.stringify(outputs)}
    Error (if any): ${error || "None"}

    User's Performance Summary:
    Attempts: ${performance.attempts}
    Hints Used: ${performance.hintsUsed || 0}
    Past Errors: ${performance.errors ? performance.errors.join(", ") : "None"}

    Provide concise feedback (1-2 sentences) that:
    - Explains why it failed (based on outputs/error)
    - Suggests what to fix or try next
    - helps the user understand without giving the full solution
    - Considers their beginner level and history

    Respond with only the feedback text, no extra formatting and prioritize low amount of text but also clarity.
  `;

  let feedback;
  if(turn.version != 2) feedback = await llmService.getLLMResponse(feedbackPrompt);
  res.json({ passed: false, outputs, error, suggestedProblem: null, feedback });
};

exports.getHint = async (req, res) => {
  const { problem, code } = req.body;
  
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

  const performance = await Performance.findOne({ userId, problemId: problem._id });

  const hints = performance?.hints || [];

  const hintPrompt = `
    You are a coding tutor. Provide a helpful, concise hint for the following programming problem, based on the user's current code. Do not give away the full solution. Respond with only the hint text.
    write the hint text only, no other commentary or formatting.
    Try to give a hint that will make it as clear as possible for the learner to understand what they need to do next.
    Take into consideration that the user has very basic coding skills or is a complete beginner, so dont use complex terminology, concepts or data structures.
    The user also only took these basic programming lectures: variables, data types, conditions, strings, loops, methods. So dont tell them to use more advanced concepts like arrays, try/catch, instanceof, etc.
    Check the user's current code to see what they have already attempted, if they are going in the right direction tell them and encourage them to keep going, if there is a mistake, point it out gently and guide them towards the correct solution, if it is a small mistake or incorrect syntax, provide the correct version.
    If the user has done something manually instead of using predefined functions or methods, don't suggest that they use those functions or methods, it is sufficient that their code works.
    The user can also ask you questions written as comments in their code, so address those questions in your hint if you see any.
    If the user's code is correct and sufficient to solve the problem, acknowledge their success and encourage them to test it, the solution doesn't have to be perfect or optimal.
    If there is an incorrect part in the user's code, point it out and explain why it is incorrect and how to fix it or remove it.
    If the user is stuck or has made no progress, make the hint more explicit than previous hints, while still not giving the full solution.
    If helpful, you may include a very small code fragment (1-2 lines) that illustrates the idea without solving the entire problem.
    
    Problem: ${problem.title}
    Description: ${problem.description}
    Current User Code:
    ${code}
    .
    
    Take into account any previous hints you have given them for this problem and don't contradict yourself, which are:
    ${hints.length > 0 ? hints.map((h, i) => `${i + 1}. ${h}`).join("\n") : "None"}
  `;

  const hint = await llmService.getLLMResponse(hintPrompt);

  if (!hint) {
    return res.status(500).json({ error: "Could not generate a hint at this time." });
  }

  if (performance) {
    performance.hintsUsed = (performance.hintsUsed || 0) + 1;
    performance.hints.push(hint);
    await performance.save();
  }

  res.json({ hint });
};