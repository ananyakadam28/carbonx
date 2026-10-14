const mongoose = require("mongoose");

const redemptionSchema =
    new mongoose.Schema(
        {
            userId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "User",

                required: true
            },

            offerId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                required: true
            },

            creditsUsed: {
                type: Number,
                required: true
            },

            reward: {

                type: {
                    type: String
                },

                title: String,

                value: Number,

                currency: {
                    type: String,
                    default: "INR"
                }
            },

            status: {
                type: String,

                enum: [
                    "pending",
                    "processing",
                    "completed",
                    "failed"
                ],

                default: "pending"
            },

            redemptionCode: String,

            blockchain: {
                transactionHash: String,
                blockNumber: Number,
                contractAddress: String,
                walletAddress: String,
                network: {
                    type: String,
                    default: "sepolia"
                }
            }
        },

        {
            timestamps: true
        }
    );

module.exports =
    mongoose.model(
        "Redemption",
        redemptionSchema
    );