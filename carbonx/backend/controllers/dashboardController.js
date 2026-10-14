const User = require("../models/User");
const Activity = require("../models/Activity");
const Wallet = require("../models/Wallet");
const CarbonCredit = require("../models/CarbonCredit");

const getUserId = (req) => req.user?.userId;

exports.getDashboard = async (req, res) => {
    try {
        const userId = getUserId(req);

        if (!userId) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        const user = await User.findById(userId)
            .select("-passwordHash");

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const wallet = await Wallet.findOneAndUpdate(
            { userId },
            {
                $setOnInsert: {
                    userId,
                    walletAddress: user.walletAddress || null
                }
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        );

        const activities = await Activity.find({ userId })
            .sort({ createdAt: -1 })
            .lean();

        const creditRecords = await CarbonCredit.find({ ownerId: userId })
            .select("status remainingAmount")
            .lean();

        const sumCredits = (status) =>
            creditRecords
                .filter(c => c.status === status)
                .reduce((sum, c) => sum + Number(c.remainingAmount || 0), 0);

        const available = sumCredits("available");
        const listed = sumCredits("listed");
        const locked = sumCredits("pending");
        const redeemed = sumCredits("redeemed");
        const retired = sumCredits("retired");

        // Keep the dashboard's database mirror aligned with issued credit records.
        wallet.walletAddress = user.walletAddress || wallet.walletAddress || null;
        wallet.balance.available = available;
        wallet.balance.listed = listed;
        wallet.balance.locked = locked;
        wallet.balance.redeemed = redeemed;
        wallet.balance.retired = retired;
        wallet.estimatedValue.amount = available * 200;
        await wallet.save();

        const totalCredits =
            available + listed + locked + redeemed + retired;

        const verifiedStatuses = new Set(["verified", "issued"]);
        const pendingStatuses = new Set(["pending", "under_review"]);

        const verifiedActivities = activities.filter(
            a => verifiedStatuses.has(a.status)
        ).length;

        const pendingActivities = activities.filter(
            a => pendingStatuses.has(a.status)
        ).length;

        // Only verified/issued activities contribute to verified impact and credits.
        const verifiedActivityRows = activities.filter(a => verifiedStatuses.has(a.status));

        // Activity impact is stored as kg CO2e.
        const totalCo2Kg = verifiedActivityRows.reduce(
            (sum, a) => sum + Number(a.impact?.co2e || 0),
            0
        );

        const totalCo2Tons = totalCo2Kg / 1000;

        const generatedCredits = verifiedActivityRows.reduce(
            (sum, a) => sum + Number(a.credits?.issued || 0),
            0
        );

        let cleanEnergyKwh = 0;
        let wasteKg = 0;
        let treesEquivalent = 0;

        for (const activity of verifiedActivityRows) {
            const type = String(activity.activityType || "").toLowerCase();
            const quantity = Number(activity.measurement?.quantity || 0);
            const unit = String(activity.measurement?.unit || "").toLowerCase();

            if (type === "solar" || type === "energy") {
                cleanEnergyKwh += unit.includes("kwh") ? quantity : 0;
            }

            if (type === "waste") {
                wasteKg += unit === "kg" || unit === "kgs"
                    ? quantity
                    : 0;
            }

            if (type === "trees") {
                treesEquivalent += quantity;
            }
        }

        const estimatedValue =
            available * 200;

        const recentActivities = activities
            .slice(0, 5)
            .map(activity => ({
                id: activity._id,
                activityName: activity.activityName,
                activityType: activity.activityType,
                description: activity.description,
                dateOfActivity: activity.dateOfActivity,
                location: activity.location,
                measurement: activity.measurement,
                impact: activity.impact,
                credits: activity.credits,
                status: activity.status,
                createdAt: activity.createdAt
            }));

        res.json({
            success: true,

            user: {
                id: user._id,
                userId: user.carbonxId,
                carbonxId: user.carbonxId,
                name: user.name,
                email: user.email,
                walletAddress: user.walletAddress,
                participantType: user.participantType,
                primaryActivity: user.primaryActivity,
                role: user.role
            },

            // Shape used by the dashboard frontend.
            credits: {
                available,
                listed,
                locked,
                redeemed,
                retired,
                total: totalCredits,
                estimatedValue
            },

            wallet: {
                balance: available,
                available,
                listed,
                locked,
                redeemed,
                retired,
                totalCredits,
                estimatedValue
            },

            impact: {
                co2Kg: totalCo2Kg,
                co2Tons: totalCo2Tons,
                cleanEnergyKwh,
                wasteKg,
                treesEquivalent
            },

            activities: {
                total: activities.length,
                verified: verifiedActivities,
                pending: pendingActivities,
                recent: recentActivities
            },

            activityStats: {
                total: activities.length,
                verified: verifiedActivities,
                pending: pendingActivities
            },

            recentActivities
        });

    } catch (error) {
        console.error("Dashboard error:", error);

        res.status(500).json({
            message: "Failed to load dashboard",
            error: error.message
        });
    }
};
