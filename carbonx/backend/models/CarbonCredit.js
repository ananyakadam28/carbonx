const mongoose = require("mongoose");

const carbonCreditSchema =
    new mongoose.Schema(
        {
            creditId: {
                type: String,
                unique: true,
                required: true
            },

            ownerId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "User",

                required: true
            },

            activityId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "Activity",

                required: true
            },

            amount: {
                type: Number,
                required: true
            },

            remainingAmount: {
                type: Number,
                required: true
            },

            status: {
                type: String,

                enum: [
                    "pending",
                    "available",
                    "listed",
                    "sold",
                    "redeemed",
                    "retired",
                    "cancelled"
                ],

                default: "pending"
            },

            methodology: String,

            co2e: Number,

            vintage: Number,

            issuanceDate: Date,

            blockchain: {

                tokenId: String,

                contractAddress: String,

                transactionHash: String,

                blockNumber: Number
            }
        },

        {
            timestamps: true
        }
    );

module.exports =
    mongoose.model(
        "CarbonCredit",
        carbonCreditSchema
    );