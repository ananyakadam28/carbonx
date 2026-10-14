const mongoose = require("mongoose");

const walletSchema =
    new mongoose.Schema(
        {
            userId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "User",

                unique: true,

                required: true
            },

            walletAddress: {
                type: String,
                default: null
            },

            balance: {

                available: {
                    type: Number,
                    default: 0
                },

                listed: {
                    type: Number,
                    default: 0
                },

                locked: {
                    type: Number,
                    default: 0
                },

                redeemed: {
                    type: Number,
                    default: 0
                },

                retired: {
                    type: Number,
                    default: 0
                }
            },

            estimatedValue: {

                currency: {
                    type: String,
                    default: "INR"
                },

                amount: {
                    type: Number,
                    default: 0
                }
            },

            ledgerId: {
                type: String,
                default: null
            }
        },

        {
            timestamps: true
        }
    );

module.exports =
    mongoose.model(
        "Wallet",
        walletSchema
    );