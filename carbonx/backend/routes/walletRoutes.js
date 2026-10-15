const express = require("express");

const router = express.Router();

const protect = require("../middleware/authMiddleware");
const {
    getWallet,
    getCredits,
    getMyActivityCredits,
    getMyListings,
    getMyTransactions
} = require("../controllers/walletController");

router.get("/", protect, getWallet);
router.get("/credits", protect, getCredits);
router.get("/activities", protect, getMyActivityCredits);
router.get("/my-listings", protect, getMyListings);
router.get("/transactions", protect, getMyTransactions);

module.exports = router;

