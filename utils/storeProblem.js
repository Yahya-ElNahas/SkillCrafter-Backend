const mongoose = require('mongoose');
const Problem = require('../models/problem');
const fs = require('fs');
const path = require('path');

// Replace with your MongoDB connection string
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://yahiaelnahas10_db_user:84mGg7uTfIr3Jl2J@main.game6hi.mongodb.net/SkillCrafter?retryWrites=true&w=majority&appName=Main";

async function run() {
  await mongoose.connect(MONGO_URI);

  const problemsPath = path.join(__dirname, 'problems.json');
  const problemsData = fs.readFileSync(problemsPath, 'utf8');
  const problems = JSON.parse(problemsData);

  for (const prob of problems) {
    const problem = new Problem({
      title: prob.title,
      description: prob.description,
      difficulty: prob.difficulty,
      topic: prob.topic, 
      testCases: prob.testCases
    });

    await problem.save();
    console.log(`Problem "${prob.title}" inserted successfully!`);
  }

  console.log("All problems inserted successfully!");
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  mongoose.disconnect();
});