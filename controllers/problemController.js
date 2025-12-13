const Problem = require('../models/problem');
const Performance = require('../models/performance');
const tokenService = require('../services/tokenService');

exports.getProblemsByTopic = async (req, res) => {
    const token =  req.cookies.token;
    if (!token) return res.status(401).json({ error: "Authentication required" });
    let decodedToken;
    try {
    decodedToken = tokenService.verify(token);
    } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
    }
    const userId = decodedToken.id;
  try {
    const { topic } = req.body;
    const problems = await Problem.find({ topic }).lean().exec();
    const performances = await Performance.find({ userId, topic }).lean().exec();
    for (const problem of problems) {
      const performance = performances.find(p => p.problemId.toString() === problem._id.toString());
      if (performance && performance.passed) {
        problem.solved = true;
      }
    }
    res.json({ problems });
  } catch (err) {
    console.error("getProblemsByTopic error:", err);
    res.status(500).json({ error: "Failed to get problems." });
  }
};

exports.alterProblems = async (req, res) => {
  try {
    // delete all problems that are not of topic 'data types', 'strings', 'conditions', 'loops' or 'methods'
    const result = await Problem.deleteMany({ topic: { $nin: ['data types', 'strings', 'conditions', 'loops', 'methods'] } });
    res.json({ result });
  } catch (err) {
    console.error("alterProblems error:", err);
    res.status(500).json({ error: "Failed to alter problems." });
  }
};