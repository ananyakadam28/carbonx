const mongoose = require("mongoose");

const marketplaceSchema =
    new mongoose.Schema(
        {
            sellerId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "User",

                required: true
            },

            creditId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "CarbonCredit",

                required: true
            },

            category: String,

            title: {
                type: String,
                required: true
            },

            description: String,

            quantity: {
                type: Number,
                required: true
            },

            remainingQuantity: {
                type: Number,
                required: true
            },

            pricePerCredit: {
                type: Number,
                required: true
            },

            currency: {
                type: String,
                default: "INR"
            },

            status: {
                type: String,

                enum: [
                    "active",
                    "sold",
                    "cancelled",
                    "expired"
                ],

                default: "active"
            },

            durationDays: {
                type: Number,
                default: 30
            },

            expiresAt: {
                type: Date,
                default: null
            }
        },

        {
            timestamps: true
        }
    );

module.exports =
    mongoose.model(
        "MarketplaceListing",
        marketplaceSchema
    );