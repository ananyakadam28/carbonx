const express = require("express");
const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const {
    createActivity,
    getMyActivities,
    getActivityById,
    uploadEvidence,
    getEvidenceFile
} = require("../controllers/activityController");

const router = express.Router();

// Upload supporting evidence files (mandatory for solar activity submission)
router.post(
    "/upload-evidence",
    protect,
    upload.array("proofFiles", 5),
    uploadEvidence
);

// Securely view/stream uploaded evidence file (owner or verifier/admin only)
router.get(
    "/evidence/:id/file",
    protect,
    getEvidenceFile
);

// Submit an activity
router.post(
    "/",
    protect,
    createActivity
);

// Get current user's activities
router.get(
    "/",
    protect,
    getMyActivities
);

// Get single activity by ID
router.get(
    "/:id",
    protect,
    getActivityById
);

module.exports = router;