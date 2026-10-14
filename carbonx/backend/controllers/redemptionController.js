const mongoose = require("mongoose");

const Redemption = require("../models/Redemption");
const Wallet = require("../models/Wallet");
const CarbonCredit = require("../models/CarbonCredit");

const OFFERS = [
    {
        id: "66a100000000000000000001",
        category: "Eco Reward",
        title: "Sustainable Shopping Voucher",
        partner: "CarbonX Partner",
        description: "Redeem your carbon credits for a sustainable shopping benefit.",
        value: "₹500 Voucher",
        creditCost: 2.5
    },
    {
        id: "66a100000000000000000002",
        category: "Green Travel",
        title: "Eco Travel Benefit",
        partner: "CarbonX Mobility",
        description: "Use verified carbon credits toward an eligible low-carbon travel benefit.",
        value: "₹1,000 Benefit",
        creditCost: 5
    },
    {
        id: "66a100000000000000000003",
        category: "Tree Plantation",
        title: "Plant a Native Tree",
        partner: "CarbonX Forests",
        description: "Retire credits to support a native tree plantation initiative.",
        value: "1 Tree",
        creditCost: 1
    }
];

const getUserId = (req) => req.user?.userId;

exports.getOffers = async (req, res) => {
    res.json({
        success: true,
        offers: OFFERS
    });
};

exports.createRedemption = async (req, res) => {
    try {
        const userId = getUserId(req);
        const {
            offerId,
            redemptionId,
            txHash,
            blockNumber,
            contractAddress,
            walletAddress
        } = req.body;

        if (!userId) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        const offer = OFFERS.find(
            item => item.id === String(offerId)
        );

        if (!offer) {
            return res.status(404).json({
                message: "Redemption offer not found"
            });
        }

        const amount = Number(offer.creditCost);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({
                message: "Invalid redemption amount"
            });
        }

        // The frontend burns the same amount on the user's Sepolia wallet
        // before this endpoint is called. Keeping the tx hash with the
        // redemption makes the database record traceable to that burn.
        if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(String(txHash))) {
            return res.status(400).json({
                message: "A valid Sepolia redemption transaction is required"
            });
        }

        if (walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(String(walletAddress))) {
            return res.status(400).json({
                message: "Invalid wallet address"
            });
        }

        // CarbonCredit records are the source of truth for the user's
        // available balance. Consume the requested amount from verified,
        // available credits instead of only changing the Wallet mirror.
        const credits = await CarbonCredit.find({
            ownerId: userId,
            status: "available",
            remainingAmount: { $gt: 0 }
        }).sort({ createdAt: 1 });

        const totalAvailable = credits.reduce(
            (sum, credit) => sum + Number(credit.remainingAmount || 0),
            0
        );

        if (totalAvailable + 1e-9 < amount) {
            return res.status(400).json({
                message: `You need ${amount} CC to redeem this reward. Available: ${totalAvailable.toFixed(2)} CC`
            });
        }

        let remainingToConsume = amount;
        const consumedCredits = [];

        for (const credit of credits) {
            if (remainingToConsume <= 0) break;

            const current = Number(credit.remainingAmount || 0);
            const consumed = Math.min(current, remainingToConsume);

            credit.remainingAmount = Number((current - consumed).toFixed(8));
            if (credit.remainingAmount <= 0.00000001) {
                credit.remainingAmount = 0;
                credit.status = "redeemed";
            }

            await credit.save();
            consumedCredits.push({
                creditId: credit._id,
                amount: consumed
            });
            remainingToConsume -= consumed;
        }

        const wallet = await Wallet.findOne({ userId });
        if (wallet) {
            // Keep the legacy mirror in sync. Wallet/dashboard controllers
            // also derive the value from CarbonCredit records on next load.
            wallet.balance.available = Math.max(
                0,
                Number(wallet.balance.available || 0) - amount
            );
            wallet.balance.redeemed =
                Number(wallet.balance.redeemed || 0) + amount;
            wallet.estimatedValue.amount =
                wallet.balance.available * 200;
            await wallet.save();
        }

        const code = redemptionId ||
            `CX-RED-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

        const redemption = await Redemption.create({
            userId,
            offerId: new mongoose.Types.ObjectId(offer.id),
            creditsUsed: amount,
            reward: {
                type: offer.category,
                title: offer.title,
                value: Number(
                    String(offer.value).replace(/[^0-9.]/g, "")
                ) || 0,
                currency: "INR"
            },
            status: "completed",
            redemptionCode: code,
            blockchain: {
                transactionHash: String(txHash),
                blockNumber: Number(blockNumber || 0) || undefined,
                contractAddress: contractAddress || undefined,
                walletAddress: walletAddress || undefined,
                network: "sepolia"
            }
        });

        res.status(201).json({
            success: true,
            message: "Credits redeemed successfully",
            redemption,
            consumedCredits,
            remainingBalance: totalAvailable - amount
        });

    } catch (error) {
        console.error("Redemption error:", error);

        res.status(500).json({
            message: "Redemption failed",
            error: error.message
        });
    }
};

exports.getHistory = async (req, res) => {
    try {
        const redemptions = await Redemption.find({
            userId: req.user.userId
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            redemptions
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch redemption history"
        });
    }
};
