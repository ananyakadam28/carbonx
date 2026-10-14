const express = require("express");

const router = express.Router();

const protect = require("../middleware/authMiddleware");

const {
    getOffers,
    createRedemption,
    getHistory
} = require("../controllers/redemptionController");

router.get("/offers", protect, getOffers);
router.post("/", protect, createRedemption);
router.get("/history", protect, getHistory);

module.exports = router;
