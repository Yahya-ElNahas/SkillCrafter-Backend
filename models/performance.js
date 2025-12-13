const mongoose = require('mongoose');

const performanceSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  problemId: { type: String, required: true },
  topic: { type: String, required: true },
  passed: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 },
  hintsUsed: { type: Number, default: 0 },
  hints: { type: [String], default: [] },
  timeSpent: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Performance', performanceSchema);