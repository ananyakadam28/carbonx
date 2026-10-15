const Wallet = require("../models/Wallet");
const User = require("../models/User");
const CarbonCredit = require("../models/CarbonCredit");
const Activity = require("../models/Activity");
const MarketplaceListing = require("../models/MarketplaceListing");
const Transaction = require("../models/Transaction");

const getUserId = (req) => req.user?.userId;

const sumRemaining = (credits, status) =>
    credits
        .filter((credit) => credit.status === status)
        .reduce((sum, credit) => sum + Number(credit.remainingAmount || 0), 0);

const formatWallet = (wallet, derived = {}) => {
    const available = Number(derived.available ?? wallet?.balance?.available ?? 0);
    const listed = Number(derived.listed ?? wallet?.balance?.listed ?? 0);
    const locked = Number(derived.locked ?? wallet?.balance?.locked ?? 0);
    const redeemed = Number(derived.redeemed ?? wallet?.balance?.redeemed ?? 0);
    const retired = Number(derived.retired ?? wallet?.balance?.retired ?? 0);

    const total = available + listed + locked + redeemed + retired;
    const estimatedValue = available * 200;

    return {
        balance: available,
        totalCredits: total,
        estimatedValue,
        credits: {
            available,
            listed,
            locked,
            redeemed,
            retired,
            total,
            estimatedValue
        },
        balanceBreakdown: {
            available,
            listed,
            locked,
            redeemed,
            retired
        }
    };
};

async function getDerivedCreditBalances(userId) {
    const credits = await CarbonCredit.find({ ownerId: userId })
        .select("status remainingAmount amount")
        .lean();

    return {
        available: sumRemaining(credits, "available"),
        listed: sumRemaining(credits, "listed"),
        locked: sumRemaining(credits, "pending"),
        redeemed: sumRemaining(credits, "redeemed"),
        retired: sumRemaining(credits, "retired")
    };
}

exports.getWallet = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const user = await User.findById(userId).select("-passwordHash").lean();
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        let wallet = await Wallet.findOneAndUpdate(
            { userId },
            {
                $setOnInsert: {
                    userId,
                    walletAddress: user.walletAddress || null
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        const derived = await getDerivedCreditBalances(userId);

        // CarbonCredit records are the source of truth for issued credits.
        // Sync the UI wallet mirror from those records so old/stale demo values
        // cannot override real verified credits.
        wallet.walletAddress = user.walletAddress || wallet.walletAddress || null;
        wallet.balance.available = derived.available;
        wallet.balance.listed = derived.listed;
        wallet.balance.locked = derived.locked;
        wallet.balance.redeemed = derived.redeemed;
        wallet.balance.retired = derived.retired;
        wallet.estimatedValue.amount = derived.available * 200;
        await wallet.save();

        const formatted = formatWallet(wallet, derived);

        res.json({
            success: true,
            user: {
                id: user._id,
                userId: user.carbonxId,
                name: user.name,
                email: user.email,
                walletAddress: user.walletAddress
            },
            wallet: formatted,
            ...formatted
        });
    } catch (error) {
        console.error("Wallet error:", error);
        res.status(500).json({
            message: "Failed to load wallet",
            error: error.message
        });
    }
};

exports.getCredits = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const credits = await CarbonCredit.find({
            ownerId: userId,
            status: "available",
            remainingAmount: { $gt: 0 }
        })
            .populate("activityId", "activityType activityName description methodology status")
            .sort({ createdAt: -1 })
            .lean();

        const formattedCredits = credits.map((credit) => ({
            id: credit._id,
            creditId: credit.creditId,
            amount: Number(credit.amount || 0),
            remainingAmount: Number(credit.remainingAmount || 0),
            methodology: credit.methodology || credit.activityId?.methodology?.name || null,
            vintage: credit.vintage || null,
            blockchain: credit.blockchain || null,
            activity: credit.activityId
                ? {
                      id: credit.activityId._id,
                      type: credit.activityId.activityType,
                      name: credit.activityId.activityName,
                      description: credit.activityId.description,
                      status: credit.activityId.status
                  }
                : null
        }));

        const wallet = await Wallet.findOne({ userId });

        res.json({
            success: true,
            wallet: wallet ? formatWallet(wallet) : null,
            credits: formattedCredits,
            totalAvailable: formattedCredits.reduce(
                (sum, credit) => sum + credit.remainingAmount,
                0
            )
        });
    } catch (error) {
        console.error("Credits error:", error);
        res.status(500).json({
            message: "Failed to load credits",
            error: error.message
        });
    }
};

// GET /api/wallet/activities
// Returns all activities submitted by the authenticated user, with their
// corresponding issued CarbonCredit records joined in for status display.
exports.getMyActivityCredits = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const activities = await Activity.find({ userId })
            .sort({ createdAt: -1 })
            .lean();

        // Fetch issued credits keyed by activityId so we can attach credit
        // balance info without an N+1 query.
        const issuedCredits = await CarbonCredit.find({
            ownerId: userId,
            activityId: { $in: activities.map(a => a._id) }
        })
            .select("activityId status amount remainingAmount issuanceDate creditId")
            .lean();

        const creditsByActivity = {};
        for (const credit of issuedCredits) {
            const key = credit.activityId.toString();
            if (!creditsByActivity[key]) creditsByActivity[key] = [];
            creditsByActivity[key].push(credit);
        }

        const result = activities.map(activity => {
            const credits = creditsByActivity[activity._id.toString()] || [];
            const totalIssued = credits.reduce((s, c) => s + Number(c.amount || 0), 0);
            const totalAvailable = credits
                .filter(c => c.status === "available")
                .reduce((s, c) => s + Number(c.remainingAmount || 0), 0);
            const totalListed = credits
                .filter(c => c.status === "listed")
                .reduce((s, c) => s + Number(c.remainingAmount || 0), 0);
            const totalSold = credits
                .filter(c => c.status === "sold")
                .reduce((s, c) => s + Math.max(0, Number(c.amount || 0) - Number(c.remainingAmount || 0)), 0);
            const issuanceDate = credits.length ? credits[0].issuanceDate : null;
            const primaryCredit =
                credits.find(c => c.status === "available") ||
                credits.find(c => c.status === "listed") ||
                credits[0] ||
                null;

            return {
                id: activity._id,
                activityName: activity.activityName,
                activityType: activity.activityType,
                description: activity.description,
                dateOfActivity: activity.dateOfActivity,
                submittedAt: activity.createdAt,
                status: activity.status,
                estimatedCredits: Number(activity.credits?.estimated || 0),
                issuedCreditsFromActivity: Number(activity.credits?.issued || 0),
                impact: activity.impact,
                measurement: activity.measurement,
                creditRecord: primaryCredit
                    ? {
                          id: primaryCredit._id,
                          creditId: primaryCredit.creditId,
                          status: primaryCredit.status,
                          totalIssued,
                          availableAmount: totalAvailable,
                          listedAmount: totalListed,
                          soldAmount: totalSold,
                          issuanceDate
                      }
                    : null,
                hasCreditRecord: credits.length > 0
            };
        });

        res.json({
            success: true,
            activities: result,
            total: result.length
        });
    } catch (error) {
        console.error("Activity credits error:", error);
        res.status(500).json({
            message: "Failed to load activity credits",
            error: error.message
        });
    }
};

// GET /api/wallet/my-listings
// Returns marketplace listings created by the authenticated user.
exports.getMyListings = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const listings = await MarketplaceListing.find({ sellerId: userId })
            .populate("creditId", "activityId creditId methodology co2e vintage issuanceDate")
            .sort({ createdAt: -1 })
            .lean();

        const formatted = listings.map(l => ({
            id: l._id,
            title: l.title,
            description: l.description,
            category: l.category,
            quantity: Number(l.quantity || 0),
            remainingQuantity: Number(l.remainingQuantity || 0),
            soldQuantity: Number(l.quantity || 0) - Number(l.remainingQuantity || 0),
            pricePerCredit: Number(l.pricePerCredit || 0),
            currency: l.currency || "INR",
            status: l.status,
            expiresAt: l.expiresAt,
            createdAt: l.createdAt,
            credit: l.creditId
                ? {
                      id: l.creditId._id,
                      creditId: l.creditId.creditId,
                      methodology: l.creditId.methodology,
                      vintage: l.creditId.vintage,
                      issuanceDate: l.creditId.issuanceDate
                  }
                : null
        }));

        res.json({
            success: true,
            listings: formatted
        });
    } catch (error) {
        console.error("My listings error:", error);
        res.status(500).json({
            message: "Failed to load your listings",
            error: error.message
        });
    }
};

// GET /api/wallet/transactions
// Returns purchase and sale transactions involving the authenticated user.
exports.getMyTransactions = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const transactions = await Transaction.find({
            $or: [
                { fromUserId: userId },
                { toUserId: userId }
            ]
        })
            .populate("fromUserId", "name email carbonxId")
            .populate("toUserId", "name email carbonxId")
            .populate("creditId", "creditId activityId methodology vintage amount")
            .sort({ createdAt: -1 })
            .lean();

        const formatted = transactions.map(t => {
            const toId = t.toUserId?._id?.toString() || String(t.toUserId || "");
            const fromId = t.fromUserId?._id?.toString() || String(t.fromUserId || "");
            const isBuyer = toId === String(userId);
            const isSeller = fromId === String(userId);

            let displayType = t.type;
            if (t.type === "credit_purchased") {
                displayType = isBuyer ? "purchase" : "sale";
            } else if (t.type === "credit_sold") {
                displayType = "sale";
            } else if (t.type === "credit_issued") {
                displayType = "issuance";
            }

            const counterparty = isBuyer
                ? (t.fromUserId && t.fromUserId.name ? t.fromUserId : null)
                : (t.toUserId && t.toUserId.name ? t.toUserId : null);

            return {
                id: t._id,
                type: displayType,
                rawType: t.type,
                quantity: Number(t.amount || 0),
                pricePerCredit: Number(t.pricePerCredit || 0),
                totalAmount: Number(t.totalAmount || 0),
                currency: t.currency || "INR",
                status: t.status,
                listingId: t.listingId || null,
                counterparty: counterparty
                    ? {
                          id: counterparty._id,
                          name: counterparty.name,
                          carbonxId: counterparty.carbonxId
                      }
                    : null,
                credit: t.creditId
                    ? {
                          id: t.creditId._id,
                          creditId: t.creditId.creditId,
                          methodology: t.creditId.methodology,
                          vintage: t.creditId.vintage
                      }
                    : null,
                isBuyer,
                isSeller,
                createdAt: t.createdAt,
                blockchain: t.blockchain || null
            };
        });

        res.json({
            success: true,
            transactions: formatted,
            total: formatted.length
        });
    } catch (error) {
        console.error("Transactions error:", error);
        res.status(500).json({
            message: "Failed to load transactions",
            error: error.message
        });
    }
};
