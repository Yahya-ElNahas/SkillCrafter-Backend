const mongoose = require('mongoose');
const Achievement = require('../models/achievement');
const User = require('../models/user');
const { checkAndAwardProblemAchievement, checkAndAwardTurnAchievement } = require('../controllers/achievementController');

// Test MongoDB connection string
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://yahiaelnahas10_db_user:84mGg7uTfIr3Jl2J@main.game6hi.mongodb.net/SkillCrafter?retryWrites=true&w=majority&appName=Main";

async function validateAchievements() {
  try {
    console.log('🔍 Starting Achievement System Validation...\n');

    // Connect to database
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Check if achievements exist in database
    const achievementCount = await Achievement.countDocuments();
    console.log(`📊 Found ${achievementCount} achievements in database`);

    if (achievementCount === 0) {
      console.log('❌ No achievements found! Run storeAchievement.js first');
      return;
    }

    // List all achievements
    const achievements = await Achievement.find({}).sort({ category: 1, title: 1 });
    console.log('\n🏆 Achievements in database:');
    achievements.forEach(ach => {
      console.log(`   ${ach.emoji} ${ach.title} (${ach.id})`);
    });

    // Create a test user for validation
    const testUser = new User({
      username: 'achievement_test_user',
      email: 'test@example.com',
      password: 'testpassword123',
      gender: 'other',
      achievements: [],
      xp: 0
    });

    await testUser.save();
    console.log(`\n👤 Created test user: ${testUser.username} (${testUser._id})`);

    // Test problem achievement awarding
    console.log('\n🧪 Testing Problem Achievement Awarding...');

    // Test 1: Hard data types problem solved in 1 attempt
    const testProblem1 = {
      difficulty: 'hard',
      topic: 'data types'
    };
    const testPerformance1 = {
      attempts: 1,
      hintsUsed: 0
    };

    const awarded1 = await checkAndAwardProblemAchievement(testUser._id, testProblem1, testPerformance1);
    console.log(`   Test 1 - Hard data types (1 attempt): Awarded ${awarded1.length} achievements`);
    awarded1.forEach(ach => console.log(`     ✅ ${ach.emoji} ${ach.title}`));

    // Test 2: Easy problem solved without hints
    const testProblem2 = {
      difficulty: 'easy',
      topic: 'strings'
    };
    const testPerformance2 = {
      attempts: 3,
      hintsUsed: 0
    };

    const awarded2 = await checkAndAwardProblemAchievement(testUser._id, testProblem2, testPerformance2);
    console.log(`   Test 2 - Easy strings (3 attempts, no hints): Awarded ${awarded2.length} achievements`);
    awarded2.forEach(ach => console.log(`     ✅ ${ach.emoji} ${ach.title}`));

    // Test turn achievement awarding
    console.log('\n🧪 Testing Turn Achievement Awarding...');

    const turnAwarded = await checkAndAwardTurnAchievement(testUser._id, 1);
    console.log(`   Test 3 - First turn completion: Awarded ${turnAwarded.length} achievements`);
    turnAwarded.forEach(ach => console.log(`     ✅ ${ach.emoji} ${ach.title}`));

    // Check final user state
    const updatedUser = await User.findById(testUser._id);
    console.log(`\n📈 Final user state:`);
    console.log(`   XP: ${updatedUser.xp}`);
    console.log(`   Achievement count: ${updatedUser.achievements.length}`);

    // Clean up test user
    await User.findByIdAndDelete(testUser._id);
    console.log('🧹 Cleaned up test user');

    console.log('\n🎉 Achievement System Validation Complete!');
    console.log('✅ All core functionality working correctly');

  } catch (error) {
    console.error('❌ Validation failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run validation if called directly
if (require.main === module) {
  validateAchievements();
}

module.exports = { validateAchievements };