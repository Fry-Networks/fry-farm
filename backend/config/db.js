const mongoose = require("mongoose");
const logger = require("./logger");

const uri = process.env.MONGODB_URI;
if (!uri) {
  logger.error("FATAL: MONGODB_URI environment variable is not set");
  process.exit(1);
}

const connectDB = async () => {
    try {
      const conn = await mongoose.connect(uri);
      logger.info(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
      logger.error(`MongoDB connection error: ${error.message}`);
      process.exit(1);
    }
  };

  module.exports = connectDB;
