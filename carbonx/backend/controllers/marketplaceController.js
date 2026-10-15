const mongoose = require("mongoose");

const MarketplaceListing =
    require("../models/MarketplaceListing");

const CarbonCredit =
    require("../models/CarbonCredit");

const Wallet =
    require("../models/Wallet");

const Transaction =
    require("../models/Transaction");

const getUserId = (req) => req.user?.userId;

const ensureWallet = async (userId) => {
    return Wallet.findOneAndUpdate(
        { userId },
        {
            $setOnInsert: {
                userId
            }
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
        }
    );
};

exports.getMarketplaceListings = async (req, res) => {
    try {
        const listings = await MarketplaceListing.find({
            status: "active",
            remainingQuantity: { $gt: 0 }
        })
            .populate("sellerId", "name email walletAddress carbonxId")
            .populate("creditId")
            .sort({ createdAt: -1 })
            .lean();

        const formatted = listings.map(listing => ({
            ...listing,
            seller: listing.sellerId
                ? {
                    id: listing.sellerId._id,
                    name: listing.sellerId.name,
                    email: listing.sellerId.email,
                    walletAddress: listing.sellerId.walletAddress,
                    carbonxId: listing.sellerId.carbonxId
                }
                : null
        }));

        res.json({
            success: true,
            listings: formatted
        });

    } catch (error) {
        console.error("Marketplace fetch error:", error);

        res.status(500).json({
            message: "Failed to load marketplace",
            error: error.message
        });
    }
};

exports.createListing = async (req, res) => {
    try {
        const sellerId = getUserId(req);

        if (!sellerId) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        const {
            creditId,
            title,
            description,
            category,
            quantity,
            pricePerCredit,
            durationDays = 30
        } = req.body;

        if (!creditId || !quantity || !pricePerCredit) {
            return res.status(400).json({
                message:
                    "creditId, quantity and pricePerCredit are required"
            });
        }

        if (!mongoose.isValidObjectId(creditId)) {
            return res.status(400).json({
                message: "Invalid carbon credit ID"
            });
        }

        const amount = Number(quantity);
        const price = Number(pricePerCredit);
        const duration = Number(durationDays);

        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({
                message: "Quantity must be greater than zero"
            });
        }

        if (!Number.isFinite(price) || price <= 0) {
            return res.status(400).json({
                message: "Price must be greater than zero"
            });
        }

        if (![7, 30, 90].includes(duration)) {
            return res.status(400).json({
                message: "Duration must be 7, 30, or 90 days"
            });
        }

        const credit = await CarbonCredit.findOne({
            _id: creditId,
            ownerId: sellerId,
            status: "available",
            remainingAmount: { $gte: amount }
        });

        if (!credit) {
            return res.status(400).json({
                message:
                    "The carbon credit is not available or you do not own enough of it"
            });
        }

        const wallet = await ensureWallet(sellerId);

        if (Number(wallet.balance.available || 0) < amount) {
            return res.status(400).json({
                message: "Insufficient available wallet credits"
            });
        }

        wallet.balance.available -= amount;
        wallet.balance.listed += amount;
        wallet.estimatedValue.amount =
            wallet.balance.available * 200;

        await wallet.save();

        credit.status = "listed";
        await credit.save();

        const listing = await MarketplaceListing.create({
            sellerId,
            creditId,
            category: category || "Carbon Credit",
            title: title || "Verified Carbon Credit",
            description:
                description ||
                "Verified carbon-credit listing on the CarbonX marketplace.",
            quantity: amount,
            remainingQuantity: amount,
            pricePerCredit: price,
            currency: "INR",
            status: "active",
            durationDays: duration,
            expiresAt: new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
        });

        res.status(201).json({
            success: true,
            message: "Credits listed successfully",
            listing
        });

    } catch (error) {
        console.error("Create listing error:", error);

        res.status(500).json({
            message: "Failed to create listing",
            error: error.message
        });
    }
};

exports.buyListing = async (req, res) => {
    try {
        const buyerId = getUserId(req);

        if (!buyerId) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        const listingId = req.params.id;
        const quantity = Number(req.body.quantity || 1);

        if (!mongoose.isValidObjectId(listingId)) {
            return res.status(400).json({
                message: "Invalid listing ID"
            });
        }

        if (!Number.isInteger(quantity) || quantity <= 0) {
            return res.status(400).json({
                message: "Quantity must be a positive whole number"
            });
        }

        const listing = await MarketplaceListing.findById(listingId);

        if (!listing) {
            return res.status(404).json({
                message: "Listing not found"
            });
        }

        if (listing.status !== "active") {
            return res.status(400).json({
                message: "This listing is no longer active"
            });
        }

        if (listing.sellerId.toString() === buyerId.toString()) {
            return res.status(400).json({
                message: "You cannot buy your own listing"
            });
        }

        if (listing.remainingQuantity < quantity) {
            return res.status(400).json({
                message: "Not enough credits available"
            });
        }

        const buyerWallet = await ensureWallet(buyerId);
        const sellerWallet = await ensureWallet(listing.sellerId);

        const credit = await CarbonCredit.findById(listing.creditId);

        if (!credit) {
            return res.status(404).json({
                message: "Carbon credit record not found"
            });
        }

        if (credit.remainingAmount < quantity) {
            return res.status(400).json({
                message: "The underlying carbon credit has insufficient balance"
            });
        }

        /*
         * This project currently uses a demo marketplace:
         * the UI records the credit transfer but does not process
         * real INR payment. A payment gateway can be added later.
         */

        sellerWallet.balance.listed =
            Math.max(
                0,
                Number(sellerWallet.balance.listed || 0) - quantity
            );

        buyerWallet.balance.available =
            Number(buyerWallet.balance.available || 0) + quantity;

        sellerWallet.estimatedValue.amount =
            sellerWallet.balance.available * 200;

        buyerWallet.estimatedValue.amount =
            buyerWallet.balance.available * 200;

        // Reduce the seller's original credit balance.
        credit.remainingAmount -= quantity;

        listing.remainingQuantity -= quantity;

        if (listing.remainingQuantity <= 0) {
            listing.remainingQuantity = 0;
            listing.status = "sold";
        }

        credit.status =
            credit.remainingAmount > 0
                ? (listing.status === "active" ? "listed" : "available")
                : "sold";

        // Create a separate credit record for the buyer so partial
        // purchases remain traceable to the original seller credit.
        const buyerCredit = await CarbonCredit.create({
            creditId: `CX-CC-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
            ownerId: buyerId,
            activityId: credit.activityId,
            amount: quantity,
            remainingAmount: quantity,
            status: "available",
            methodology: credit.methodology,
            co2e: credit.co2e,
            vintage: credit.vintage,
            issuanceDate: credit.issuanceDate,
            blockchain: credit.blockchain
        });

        await sellerWallet.save();
        await buyerWallet.save();
        await credit.save();
        await listing.save();

        const totalAmount =
            quantity * Number(listing.pricePerCredit);

        const transaction = await Transaction.create({
            type: "credit_purchased",
            fromUserId: listing.sellerId,
            toUserId: buyerId,
            creditId: buyerCredit._id,
            amount: quantity,
            pricePerCredit: Number(listing.pricePerCredit),
            totalAmount,
            currency: listing.currency || "INR",
            listingId: listing._id,
            status: "completed"
        });

        res.json({
            success: true,
            message: "Carbon credits purchased successfully",
            purchase: {
                listingId: listing._id,
                quantity,
                pricePerCredit: listing.pricePerCredit,
                totalAmount,
                currency: listing.currency
            },
            transaction
        });

    } catch (error) {
        console.error("Buy listing error:", error);

        res.status(500).json({
            message: "Failed to purchase carbon credits",
            error: error.message
        });
    }
};

exports.cancelListing = async (req, res) => {
    try {
        const sellerId = getUserId(req);

        if (!sellerId) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        const listing = await MarketplaceListing.findById(
            req.params.id
        );

        if (!listing) {
            return res.status(404).json({
                message: "Listing not found"
            });
        }

        if (
            listing.sellerId.toString() !==
            sellerId.toString()
        ) {
            return res.status(403).json({
                message: "You can only cancel your own listing"
            });
        }

        if (listing.status !== "active") {
            return res.status(400).json({
                message: "Listing is no longer active"
            });
        }

        const wallet = await ensureWallet(sellerId);

        const unsold = Number(
            listing.remainingQuantity || 0
        );

        wallet.balance.listed =
            Math.max(
                0,
                Number(wallet.balance.listed || 0) - unsold
            );

        wallet.balance.available =
            Number(wallet.balance.available || 0) + unsold;

        wallet.estimatedValue.amount =
            wallet.balance.available * 200;

        await wallet.save();

        const credit = await CarbonCredit.findById(
            listing.creditId
        );

        if (credit) {
            credit.ownerId = sellerId;
            credit.status = "available";
            await credit.save();
        }

        listing.status = "cancelled";
        await listing.save();

        res.json({
            success: true,
            message: "Listing cancelled successfully"
        });

    } catch (error) {
        console.error("Cancel listing error:", error);

        res.status(500).json({
            message: "Failed to cancel listing",
            error: error.message
        });
    }
};
