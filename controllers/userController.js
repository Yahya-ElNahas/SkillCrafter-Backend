const User = require('../models/user');
const tokenService = require('../services/tokenService');
const Turn = require('../models/turn');
const Armies = require('../models/armies');
const Performance = require('../models/performance');
const { version } = require('mongoose');

exports.getUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, email, password, version, gender } = req.body;
    const user = new User({ username, email, password, version, gender });
    await user.save();
    
    const turn = new Turn({ userId: user._id, version });
    await turn.save();

    // Create initial armies for the user. createUnit is an INSTANCE method,
    // so we instantiate and then save each document.
    const initialUnits = [
      ['infantry', 'allied', 'path33'],
      ['infantry', 'allied', 'path49'],
      ['infantry', 'allied', 'path48'],
      ['infantry', 'allied', 'path38'],
      ['infantry', 'enemy',  'path36'],
      ['infantry', 'enemy',  'path52'],
      ['infantry', 'enemy',  'path37'],
      ['infantry', 'enemy',  'path14'],
      ['armor',    'enemy',  'path44'],
    ];

    for (const [type, faction, position] of initialUnits) {
      const doc = new Armies({ turnId: turn._id });
      await doc.createUnit(turn._id, type, faction, position);
      await doc.save();
    }

    res.status(201).json({ message: 'User created successfully', user });
  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === 11000) {
      if(error.keyPattern.username) {
        return res.status(400).json({ message: 'Username already exists' });
      }
      if(error.keyPattern.email) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const updates = req.body;
    const user = await User.findByIdAndUpdate(userId, updates, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.deleteMany();
    const turn = await Turn.deleteMany();
    const armies = await Armies.deleteMany();
    const performance = await Performance.deleteMany();
    res.json({ message: 'User deleted successfully', user });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;
    let user;
    if (username.includes('@')) {
      user = await User.findOne({ email: username });
    } else {
      user = await User.findOne({ username });
    }
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const payload = { id: user._id, username: user.username, email: user.email };
    const token = tokenService.generate(payload);

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    };

    res.cookie('token', token, cookieOptions);

    const safeUser = user.toObject();
    delete safeUser.password;

    res.json({ message: 'Login successful', version: user.version, token });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.logoutUser = async (req, res) => {
  try {
    res.clearCookie('token');
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Error logging out user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
