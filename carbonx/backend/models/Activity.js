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

        // Solar installation reference & immutable snapshot for audit trail
        installationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Installation"
        },

        installationSnapshot: {
            installationId: mongoose.Schema.Types.ObjectId,
            name: String,
            capacityKw: Number,
            address: String,
            meterIdentifier: String,
            gridConfiguration: String,
            inverterDetails: String
        },

        // Reporting period details
        reportingPeriod: {
            periodType: {
                type: String,
                enum: ["daily", "weekly", "monthly", "custom"],
                default: "monthly"
            },
            startDate: Date,
            endDate: Date,
            daysCount: Number
        },

        // Detailed solar generation & consumption metrics
        solarMetrics: {
            generation: {
                reportedValue: Number,
                reportedUnit: {
                    type: String,
                    enum: ["Wh", "kWh", "MWh"],
                    default: "kWh"
                },
                canonicalKwh: Number
            },
            consumption: {
                reportedValue: Number,
                reportedUnit: {
                    type: String,
                    enum: ["Wh", "kWh", "MWh"],
                    default: "kWh"
                },
                canonicalKwh: Number,
                consumptionType: {
                    type: String,
                    default: "total_premises" // Clearly defined: Total Premises Electricity Consumption
                }
            },
            selfConsumptionKwh: Number,
            gridExportKwh: Number,
            gridImportKwh: Number,
            netDisplacementKwh: Number
        },

        // Supporting proof references (mandatory for solar)
        evidence: [
            {
                evidenceId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Evidence"
                },
                fileName: String,
                fileType: String,
                fileSize: Number,
                fileUrl: String,
                documentType: String,
                uploadedAt: {
                    type: Date,
                    default: Date.now
                }
            }
        ],

        notes: {
            type: String,
            trim: true
        },

        rejectionReason: String,
        verificationNotes: String,
        verifierWallet: String,
        verifiedAt: Date,
        rejectedAt: Date,

        blockchain: {
            contractAddress: String,
            transactionHash: String,
            blockNumber: Number,
            network: String
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