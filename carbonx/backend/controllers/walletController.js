const Wallet = require("../models/Wallet");
const User = require("../models/User");
const CarbonCredit = require("../models/CarbonCredit");

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
