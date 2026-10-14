const express = require("express");

const {
  getStats,
  getActivities,
  getActivity,
  approveActivity,
  rejectActivity
} = require("../controllers/verifierController");

const router = express.Router();

router.get("/stats", getStats);

router.get("/activities", getActivities);

router.get("/activities/:id", getActivity);

router.post("/activities/:id/approve", approveActivity);

router.post("/activities/:id/reject", rejectActivity);

module.exports = router;