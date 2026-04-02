require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const logger = require("./config/logger");
const swapHistoryRoute = require("./routes/UserSwapHistoryRoute");
const stakerDataRoute = require("./routes/stackerDataRoute");
const yieldFarmingRoute = require("./routes/yeildFarmingRoute");
const stakingRoute = require("./routes/stackingRoute");
const stakingTokenRoutes = require('./routes/stackingTokenRoute');
const TokenRoute = require("./routes/tokenRoute");
const withdrawRoutes = require("./routes/withdrawRoutes");
const claimRewardRoute = require("./routes/claimRewardRoute");
const farmingRoute = require("./routes/farmingRoute");
const stackingFarmingTokenRoute = require("./routes/stackingFarmingTokenRoute");
const farmingWithdrawRoutes = require("./routes/farmingWithdrawRoutes");
const claimFarmRewardRoutes = require('./routes/claimFarmRewardRoutes');
const userRoutes = require("./routes/userRoutes");
const gasFeeRoutes = require('./routes/gasFeeRoutes');
const authRoutes = require('./routes/authRoutes');
const tokenDiscoveryRoute = require('./routes/tokenDiscoveryRoute');
const swapProxyRoute = require('./routes/swapProxyRoute');
const rewardsRoute = require('./routes/rewardsRoute');
const feeConfigRoutes = require('./routes/feeConfigRoutes');
const eventRoutes = require('./routes/eventRoutes');
const nftStakingRoute = require('./routes/nftStakingRoute');

const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require("./config/db");
const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const path = require("path");
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(cors({
  origin: 'https://fry.farm',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'cache-control'],
  credentials: true,
}));

// Rate limiters
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later' },
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many write requests, please try again later' },
});

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later' },
});

// Apply global rate limit
app.use(globalLimiter);

// Prevent CDN and browser caching of API responses
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
  });
  next();
});

// Auth routes (with stricter rate limit)
app.use('/auth', authRoutes);

// Routes use readLimiter (300/15min) — write endpoints are already protected by requireAuth middleware
app.use("/swaphistory", readLimiter, swapHistoryRoute);
app.use("/stakerdata", readLimiter, stakerDataRoute);
app.use("/yieldfarming", readLimiter, yieldFarmingRoute);
app.use("/staking", readLimiter, stakingRoute);
app.use("/token", readLimiter, TokenRoute);
app.use('/stakingtoken', readLimiter, stakingTokenRoutes);
app.use("/withdraw", writeLimiter, withdrawRoutes);
app.use("/claimreward", readLimiter, claimRewardRoute);
app.use("/farming", readLimiter, farmingRoute);
app.use("/stakingfarmingtoken", readLimiter, stackingFarmingTokenRoute);
app.use("/farmingwithdraw", writeLimiter, farmingWithdrawRoutes);
app.use('/claimfarmrewards', readLimiter, claimFarmRewardRoutes);
app.use('/gasfee', readLimiter, gasFeeRoutes);
app.use("/user", readLimiter, userRoutes);
app.use("/tokens", readLimiter, tokenDiscoveryRoute);
app.use("/swap", readLimiter, swapProxyRoute);
app.use("/rewards", readLimiter, rewardsRoute);
app.use("/feeconfig", readLimiter, feeConfigRoutes);
app.use("/events", readLimiter, eventRoutes);
app.use("/nftstaking", readLimiter, nftStakingRoute);

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Not found',
  });
});

// Global error handler
app.use((err, req, res, _next) => {
  logger.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

// Connect to MongoDB
connectDB();

// Start cron jobs
require('./crons/eventPointsCron');

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});
