const Problem = require('../models/problem');
const Performance = require('../models/performance');
const tokenService = require('../services/tokenService');

exports.getProblemsByTopic = async (req, res) => {
  try {
    // return only all problem titles and descriptions for a given topic
    const { topic } = req.body;
    const problems = await Problem.find({ topic }, { title: 1, description: 1, difficulty: 1 }).lean().exec();

    res.json(problems);
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