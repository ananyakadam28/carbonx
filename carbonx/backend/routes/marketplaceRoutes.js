const express = require("express");

const router = express.Router();

const marketplaceController = require("../controllers/marketplaceController");
const authMiddleware = require("../middleware/authMiddleware");


// Get marketplace listings
router.get(
    "/",
    authMiddleware,
    marketplaceController.getMarketplaceListings
);


// Create listing
router.post(
    "/list",
    authMiddleware,
    marketplaceController.createListing
);


// Buy listing
router.post(
    "/:id/buy",
    authMiddleware,
    marketplaceController.buyListing
);


// Cancel listing
router.delete(
    "/:id",
    authMiddleware,
    marketplaceController.cancelListing
);


module.exports = router;