const express = require("express");

const protect =
    require("../middleware/authMiddleware");

const {
    createActivity,
    getMyActivities
} =
    require("../controllers/activityController");

const router = express.Router();

router.post(
    "/",
    protect,
    createActivity
);

router.get(
    "/",
    protect,
    getMyActivities
);

module.exports = router;