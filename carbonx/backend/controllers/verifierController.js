const Activity = require("../models/Activity");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const CarbonCredit = require("../models/CarbonCredit");


// ============================================================
// GET VERIFIER STATS
// ============================================================

const getStats = async (req, res) => {
  try {
    const pending = await Activity.countDocuments({
      status: { $in: ["pending", "under_review"] }
    });

    const verified = await Activity.countDocuments({
      status: { $in: ["verified", "issued"] }
    });

    const rejected = await Activity.countDocuments({
      status: "rejected"
    });

    const verifiedCredits = await Activity.aggregate([
      {
        $match: {
          status: { $in: ["verified", "issued"] }
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $ifNull: ["$credits.issued", 0]
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        pending,
        verified,
        rejected,
        creditsVerified:
          verifiedCredits.length > 0
            ? Number(verifiedCredits[0].total || 0)
            : 0
      }
    });

  } catch (error) {
    console.error("Verifier stats error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load verifier statistics"
    });
  }
};


// ============================================================
// GET ACTIVITIES
// ============================================================

const getActivities = async (req, res) => {
  try {
    const requestedStatus =
      String(req.query.status || "pending").toLowerCase();

    let statuses;

    if (requestedStatus === "pending") {
      statuses = ["pending", "under_review"];
    } else if (requestedStatus === "verified") {
      statuses = ["verified", "issued"];
    } else if (requestedStatus === "rejected") {
      statuses = ["rejected"];
    } else {
      statuses = [requestedStatus];
    }

    const activities = await Activity.find({
      status: { $in: statuses }
    })
      .populate(
        "userId",
        "name email carbonxId walletAddress participantType"
      )
      .sort({ createdAt: -1 })
      .lean();

    const result = activities.map(activity => ({
      ...activity,

      id: activity._id,

      user: activity.userId || null,

      walletAddress:
        activity.userId?.walletAddress ||
        activity.walletAddress ||
        null
    }));

    res.json({
      success: true,
      activities: result
    });

  } catch (error) {
    console.error("Get verifier activities error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load activities"
    });
  }
};


// ============================================================
// GET SINGLE ACTIVITY
// ============================================================

const getActivity = async (req, res) => {
  try {
    const activity = await Activity.findOne({
      $or: [
        { _id: req.params.id },
        { activityId: req.params.id }
      ]
    })
      .populate(
        "userId",
        "name email carbonxId walletAddress participantType"
      )
      .lean();

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: "Activity not found"
      });
    }

    res.json({
      success: true,
      activity: {
        ...activity,
        id: activity._id,
        user: activity.userId || null,
        walletAddress:
          activity.userId?.walletAddress ||
          activity.walletAddress ||
          null
      }
    });

  } catch (error) {
    console.error("Get verifier activity error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load activity"
    });
  }
};


// ============================================================
// REJECT ACTIVITY
// ============================================================

const rejectActivity = async (req, res) => {
  try {
    const { reason, notes, verifierWallet } = req.body;

    const activity = await Activity.findOne({
      $or: [
        { _id: req.params.id },
        { activityId: req.params.id }
      ]
    });

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: "Activity not found"
      });
    }

    if (!["pending", "under_review"].includes(activity.status)) {
      return res.status(400).json({
        success: false,
        message: "This activity has already been processed"
      });
    }

    activity.status = "rejected";

    activity.credits = {
      ...(activity.credits || {}),
      issued: 0
    };

    activity.rejectionReason =
      reason || notes || "Activity did not meet verification requirements";

    activity.verificationNotes =
      notes || activity.rejectionReason;

    activity.verifierWallet =
      verifierWallet || null;

    activity.rejectedAt = new Date();

    await activity.save();

    res.json({
      success: true,
      message: "Activity rejected successfully",
      activity
    });

  } catch (error) {
    console.error("Reject activity error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to reject activity"
    });
  }
};


// ============================================================
// APPROVE ACTIVITY
// ============================================================

const approveActivity = async (req, res) => {
  try {
    const {
      credits,
      txHash,
      blockNumber,
      verifierWallet,
      contractAddress,
      notes
    } = req.body;

    if (!credits || Number(credits) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid credit amount is required"
      });
    }

    if (!txHash) {
      return res.status(400).json({
        success: false,
        message: "Blockchain transaction hash is required"
      });
    }

    const activity = await Activity.findOne({
      $or: [
        { _id: req.params.id },
        { activityId: req.params.id }
      ]
    });

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: "Activity not found"
      });
    }

    if (!["pending", "under_review"].includes(activity.status)) {
      return res.status(400).json({
        success: false,
        message: "This activity has already been processed"
      });
    }

    const duplicate = await Activity.findOne({
      "blockchain.transactionHash": txHash
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "This blockchain transaction has already been recorded"
      });
    }

    const user = await User.findById(activity.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Activity owner not found"
      });
    }

    if (!user.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "User does not have a wallet address"
      });
    }

    // --------------------------------------------------------
    // Mark activity as verified
    // --------------------------------------------------------

    activity.status = "verified";

    activity.credits = {
      ...(activity.credits || {}),
      issued: Number(credits)
    };

    activity.verifierWallet =
      verifierWallet || null;

    activity.verificationNotes =
      notes || "";

    activity.verifiedAt = new Date();

    activity.blockchain = {
      contractAddress:
        contractAddress || null,

      transactionHash:
        txHash,

      blockNumber:
        blockNumber || null,

      network:
        "sepolia"
    };

    await activity.save();


    // --------------------------------------------------------
    // Create CarbonCredit record
    // --------------------------------------------------------

    if (CarbonCredit) {
      const existingCredit =
        await CarbonCredit.findOne({
          activityId: activity._id
        });

      if (!existingCredit) {

        const creditId =
          `CXC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

        await CarbonCredit.create({
          creditId,

          ownerId:
            activity.userId,

          activityId:
            activity._id,

          amount:
            Number(credits),

          remainingAmount:
            Number(credits),

          status:
            "available",

          methodology:
            activity.methodology || {},

          co2e:
            Number(activity.impact?.co2e || 0) / 1000,

          vintage:
            new Date(activity.dateOfActivity || Date.now())
              .getFullYear(),

          issuanceDate:
            new Date(),

          blockchain: {
            tokenId: null,

            contractAddress:
              contractAddress || null,

            transactionHash:
              txHash,

            blockNumber:
              blockNumber || null
          }
        });
      }
    }


    // --------------------------------------------------------
    // Update wallet mirror
    // --------------------------------------------------------

    try {

      let wallet =
        await Wallet.findOne({
          userId: activity.userId
        });

      if (!wallet) {
        wallet = new Wallet({
          userId: activity.userId,
          walletAddress: user.walletAddress || null
        });
      }

      // Wallet.balance is a nested object in the current schema.
      // Keep the database mirror in sync with the newly issued credits.
      if (!wallet.balance || typeof wallet.balance !== "object") {
        wallet.balance = {
          available: 0,
          listed: 0,
          locked: 0,
          redeemed: 0,
          retired: 0
        };
      }

      wallet.balance.available =
        Number(wallet.balance.available || 0) + Number(credits);

      wallet.walletAddress =
        user.walletAddress || wallet.walletAddress || null;

      wallet.estimatedValue.amount =
        Number(wallet.balance.available || 0) * 200;

      await wallet.save();

    } catch (walletError) {

      console.warn(
        "Wallet mirror update failed:",
        walletError.message
      );
    }


    res.json({
      success: true,

      message:
        "Activity verified and blockchain transaction recorded",

      activity
    });

  } catch (error) {

    console.error(
      "Approve activity error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to approve activity"
    });
  }
};


module.exports = {
  getStats,
  getActivities,
  getActivity,
  approveActivity,
  rejectActivity
};