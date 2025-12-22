const Problem = require('../models/problem');
const Performance = require('../models/performance');
const tokenService = require('../services/tokenService');

exports.getProblemsByTopic = async (req, res) => {
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

    // get problems and check if each one is solved by this user and return solved = true for each solved one
    const { topic } = req.body;
    const problems = await Problem.find({ topic }).exec();
    const performances = await Performance.find({ userId, passed: true }).exec();
    const solvedProblemIds = new Set(performances.map(p => p.problemId.toString()));

    const problemsWithSolvedStatus = problems.map(problem => ({
      ...problem.toObject(),
      solved: solvedProblemIds.has(problem._id.toString())
    }));

    return res.status(200).json({ problems: problemsWithSolvedStatus });
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