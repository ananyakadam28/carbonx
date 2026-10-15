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

            // Quantity of credits transferred.
            amount: {
                type: Number,
                required: true
            },

            // Price per credit at the time of the transaction.
            pricePerCredit: {
                type: Number,
                default: 0
            },

            // Total monetary value of the transaction.
            totalAmount: {
                type: Number,
                default: 0
            },

            // Currency used for the transaction (e.g. INR).
            currency: {
                type: String,
                default: "INR"
            },

            // Reference to the marketplace listing that triggered this transaction.
            listingId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "MarketplaceListing",

                default: null
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