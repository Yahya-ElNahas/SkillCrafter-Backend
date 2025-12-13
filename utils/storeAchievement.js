const mongoose = require('mongoose');
const Achievement = require('../models/achievement');
const fs = require('fs');
const path = require('path');

// Replace with your MongoDB connection string
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://yahiaelnahas10_db_user:84mGg7uTfIr3Jl2J@main.game6hi.mongodb.net/SkillCrafter?retryWrites=true&w=majority&appName=Main";

async function run() {
  await mongoose.connect(MONGO_URI);

  const achievementsPath = path.join(__dirname, 'achievements.json');
  const achievementsData = fs.readFileSync(achievementsPath, 'utf8');
  const achievements = JSON.parse(achievementsData);

  for (const ach of achievements) {
    const achievement = new Achievement({
      title: ach.title,
      description: ach.description,
      emoji: ach.emoji,
      category: ach.category,
      trigger: ach.trigger,
      id: ach.id
    });

    await achievement.save();
    console.log(`Achievement "${ach.title}" inserted successfully!`);
  }

  console.log("All achievements inserted successfully!");
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  mongoose.disconnect();
});
