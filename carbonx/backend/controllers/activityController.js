const Activity = require("../models/Activity");

exports.createActivity = async (req, res) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        const {
            activityType,
            activityName,
            description,
            dateOfActivity,
            location,
            measurement,
            impact,
            credits,
            methodology
        } = req.body;

        if (
            !activityType ||
            !activityName ||
            !dateOfActivity ||
            !measurement?.quantity
        ) {
            return res.status(400).json({
                message:
                    "Activity type, name, date and quantity are required"
            });
        }

        const quantity = Number(measurement.quantity);

        if (!Number.isFinite(quantity) || quantity <= 0) {
            return res.status(400).json({
                message: "Quantity must be greater than zero"
            });
        }

        const activity = await Activity.create({
            userId,
            activityType,
            activityName: String(activityName).trim(),
            description: description || "",
            dateOfActivity: new Date(dateOfActivity),
            location: {
                address:
                    typeof location === "string"
                        ? location
                        : location?.address || "",
                latitude: Number(location?.latitude) || undefined,
                longitude: Number(location?.longitude) || undefined
            },
            measurement: {
                quantity,
                unit: measurement.unit || ""
            },
            impact: {
                co2e: Number(
                    impact?.co2e ??
                    impact?.co2eKg ??
                    0
                ),
                unit: impact?.unit || "kgCO2e"
            },
            credits: {
                estimated: Number(
                    credits?.estimated || 0
                ),
                issued: Number(
                    credits?.issued || 0
                )
            },
            methodology: methodology || {},
            status: "pending"
        });

        res.status(201).json({
            success: true,
            message: "Activity submitted successfully",
            activity
        });

    } catch (error) {
        console.error("Activity creation error:", error);

        res.status(500).json({
            message: "Activity submission failed",
            error: error.message
        });
    }
};

exports.getMyActivities = async (req, res) => {
    try {
        const activities = await Activity.find({
            userId: req.user.userId
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            activities
        });

    } catch (error) {
        console.error("Activity fetch error:", error);

        res.status(500).json({
            message: "Failed to fetch activities",
            error: error.message
        });
    }
};
