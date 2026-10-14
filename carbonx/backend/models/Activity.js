const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        activityType: {
            type: String,
            required: true
        },

        activityName: {
            type: String,
            required: true
        },

        description: {
            type: String
        },

        dateOfActivity: {
            type: Date,
            required: true
        },

        location: {
            address: String,
            latitude: Number,
            longitude: Number
        },

        measurement: {
            quantity: Number,
            unit: String
        },

        impact: {
            co2e: {
                type: Number,
                default: 0
            },

            unit: {
                type: String,
                default: "tons"
            }
        },

        credits: {
            estimated: {
                type: Number,
                default: 0
            },

            issued: {
                type: Number,
                default: 0
            }
        },

        methodology: {
            code: String,
            name: String,
            emissionFactor: Number,
            emissionFactorUnit: String
        },

        status: {
            type: String,

            enum: [
                "draft",
                "pending",
                "under_review",
                "verified",
                "rejected",
                "issued"
            ],

            default: "pending"
        }
    },

    {
        timestamps: true
    }
);

module.exports =
    mongoose.model(
        "Activity",
        activitySchema
    );