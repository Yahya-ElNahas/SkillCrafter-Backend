const mongoose = require('mongoose');

const testCaseSchema = new mongoose.Schema({
  input: { type: [String], required: false },
  output: { type: String, required: false }
}, { _id: false });

const problemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  difficulty: { type: String, enum: ['basic', 'easy', 'medium', 'hard'], required: true },
  topic: { type: String, required: true },
  testCases: { type: [testCaseSchema], required: true },
});

module.exports = mongoose.model('Problem', problemSchema);
