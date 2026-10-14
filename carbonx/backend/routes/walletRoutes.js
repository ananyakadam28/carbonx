const express = require("express");

const router = express.Router();

const protect = require("../middleware/authMiddleware");
const {
    getWallet,
    getCredits
} = require("../controllers/walletController");

router.get("/", protect, getWallet);
router.get("/credits", protect, getCredits);

module.exports = router;
