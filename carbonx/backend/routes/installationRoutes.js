const express = require("express");
const protect = require("../middleware/authMiddleware");
const {
    getMyInstallations,
    getInstallationById,
    createInstallation,
    updateInstallation,
    deleteInstallation
} = require("../controllers/installationController");

const router = express.Router();

router.get("/", protect, getMyInstallations);
router.post("/", protect, createInstallation);
router.get("/:id", protect, getInstallationById);
router.put("/:id", protect, updateInstallation);
router.delete("/:id", protect, deleteInstallation);

module.exports = router;
