const mongoose = require("mongoose");

const ledgerRecordSchema =
    new mongoose.Schema(
        {
            recordType: {
                type: String,

                enum: [
                    "activity_attestation",
                    "credit_issuance",
                    "credit_transfer",
                    "credit_retirement"
                ],

                required: true
            },

            activityId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "Activity"
            },

            creditId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "CarbonCredit"
            },

            payloadHash: String,

            blockchain: {

                network: String,

                chainId: Number,

                contractAddress: String,

                transactionHash: String,

                blockNumber: Number
            },

            status: {
                type: String,

                enum: [
                    "pending",
                    "confirmed",
                    "failed"
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
        "LedgerRecord",
        ledgerRecordSchema
    );