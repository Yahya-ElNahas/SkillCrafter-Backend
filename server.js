const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const session = require("express-session");
const cookieParser = require("cookie-parser");

const app = express();
app.use(cors({
    origin: ["http://localhost:5173", "https://skill-crafter-nine.vercel.app"], 
    credentials: true
}));
app.use(express.json());
app.use(cookieParser()); 
app.use(session({
  secret: "1234",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log("MongoDB connected"))
.catch(err => console.error(err));

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

// Routes

// Provinces routes
const provinceRoutes = require("./routes/provinces");
app.use("/api/provinces", provinceRoutes);
 
// Armies routes
const armyRoutes = require("./routes/armies");
app.use("/api/armies", armyRoutes);

// Battle routes
const battleRoutes = require("./routes/battle");
app.use("/api/battle", battleRoutes);

// Turn routes
const turnRoutes = require("./routes/turn");
app.use("/api/turn", turnRoutes);

// Performance routes
const performanceRoutes = require("./routes/performance");
app.use("/api/performance", performanceRoutes);

// Problem routes
const problemRoutes = require("./routes/problem");
app.use("/api/problem", problemRoutes);

// Achievement routes
const achievementRoutes = require("./routes/achievement");
app.use("/api/achievements", achievementRoutes);

// User routes
const userRoutes = require("./routes/user");
app.use("/api/auth", userRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
