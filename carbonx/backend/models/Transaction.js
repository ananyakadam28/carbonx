const mongoose = require("mongoose");

const transactionSchema =
    new mongoose.Schema(
        {
            type: {
                type: String,

                enum: [
                    "credit_issued",
                    "credit_purchased",
                    "credit_sold",
                    "credit_redeemed",
                    "credit_retired",
                    "credit_transferred"
                ],

                required: true
            },

            fromUserId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "User",

                default: null
            },

            toUserId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "User",

                default: null
            },

            creditId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "CarbonCredit",

                required: true
            },

            amount: {
                type: Number,
                required: true
            },

            status: {
                type: String,

                enum: [
                    "pending",
                    "completed",
                    "failed"
                ],

                default: "pending"
            },

            blockchain: {
                txHash: String,
                blockNumber: Number
            }
        },

        {
            timestamps: true
        }
    );

module.exports =
    mongoose.model(
        "Transaction",
        transactionSchema
    );