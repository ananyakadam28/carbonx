const mongoose = require("mongoose");

const verificationSchema =
    new mongoose.Schema(
        {
            activityId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "Activity",

                required: true
            },

            verifierId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "User"
            },

            status: {
                type: String,

                enum: [
                    "pending",
                    "verified",
                    "rejected"
                ],

                default: "pending"
            },

            checks: {

                evidenceValid: {
                    type: Boolean,
                    default: false
                },

                locationVerified: {
                    type: Boolean,
                    default: false
                },

                quantityVerified: {
                    type: Boolean,
                    default: false
                },

                methodologyValid: {
                    type: Boolean,
                    default: false
                }
            },

            calculatedImpact: {
                co2e: Number
            },

            approvedCredits: Number,

            remarks: String,

            verifiedAt: Date
        },

        {
            timestamps: true
        }
    );

module.exports =
    mongoose.model(
        "Verification",
        verificationSchema
    );