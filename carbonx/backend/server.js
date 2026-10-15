require("dotenv").config();

const dns = require("node:dns");

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const activityRoutes = require("./routes/activityRoutes");
const marketplaceRoutes = require("./routes/marketplaceRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const walletRoutes = require("./routes/walletRoutes");
const redemptionRoutes = require("./routes/redemptionRoutes");
const verifierRoutes = require("./routes/verifierRoutes");
const installationRoutes = require("./routes/installationRoutes");

const app = express();

connectDB();

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api/verifier", verifierRoutes);

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "CarbonX API is running 🚀"
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "CarbonX backend is healthy"
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/installations", installationRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/marketplace", marketplaceRoutes);
app.use("/api/redemptions", redemptionRoutes);

const PORT = process.env.PORT || 5002;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
