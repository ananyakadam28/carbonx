const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Activity = require("../models/Activity");
const Installation = require("../models/Installation");
const Evidence = require("../models/Evidence");

// Methodology Constants for Grid-Connected Solar Electricity
const SOLAR_METHODOLOGY = {
    code: "CARBONX-MRV-V2.4",
    name: "CarbonX MRV Standard / Grid-Connected Solar (VM0007 / ACM0002)",
    emissionFactor: 0.70, // 0.70 kg CO2e / kWh (Baseline Grid Emission Factor)
    emissionFactorUnit: "kgCO2e/kWh"
};

// Unit conversion helper to canonical kWh
const toCanonicalKwh = (value, unit) => {
    const val = Number(value);
    if (!Number.isFinite(val) || val < 0) return 0;
    const u = String(unit || "kWh").trim().toLowerCase();
    if (u === "wh") return val / 1000;
    if (u === "mwh") return val * 1000;
    return val; // default kWh
};

/**
 * Upload supporting proof documents/files for an activity
 */
exports.uploadEvidence = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No files were uploaded. Please select at least one supporting proof document."
            });
        }

        const uploadedEvidence = [];

        for (const file of req.files) {
            // Compute SHA-256 hash for document integrity and tamper-proofing
            let fileHash = "";
            try {
                const fileBuffer = fs.readFileSync(file.path);
                fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
            } catch (err) {
                console.error("Hash calculation error for", file.filename, err);
            }

            const evidenceDoc = await Evidence.create({
                userId,
                fileName: file.filename,
                originalName: file.originalname,
                fileType: file.mimetype,
                fileSize: file.size,
                storagePath: file.path,
                fileUrl: `/api/activities/evidence/temp/file`, // updated with real ID below
                hash: fileHash,
                documentType: file.mimetype.includes("pdf") ? "document_pdf" : "image_or_report",
                verificationStatus: "pending"
            });

            evidenceDoc.fileUrl = `/api/activities/evidence/${evidenceDoc._id}/file`;
            await evidenceDoc.save();

            uploadedEvidence.push({
                evidenceId: evidenceDoc._id,
                fileName: evidenceDoc.originalName || file.originalname,
                storedName: evidenceDoc.fileName,
                fileType: evidenceDoc.fileType,
                fileSize: evidenceDoc.fileSize,
                fileUrl: evidenceDoc.fileUrl,
                hash: fileHash,
                uploadedAt: evidenceDoc.createdAt
            });
        }

        res.status(201).json({
            success: true,
            message: `${uploadedEvidence.length} proof document(s) uploaded successfully`,
            evidence: uploadedEvidence
        });
    } catch (error) {
        console.error("Evidence upload error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to upload evidence document",
            error: error.message
        });
    }
};

/**
 * Securely stream / download an evidence file with access control
 */
exports.getEvidenceFile = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const role = req.user?.role;
        const { id } = req.params;

        const evidence = await Evidence.findById(id);
        if (!evidence) {
            return res.status(404).json({ success: false, message: "Evidence record not found" });
        }

        // Access control: strictly restrict to evidence owner OR verifiers/admins
        const isOwner = evidence.userId.toString() === userId;
        const isVerifierOrAdmin = role === "verifier" || role === "admin";

        if (!isOwner && !isVerifierOrAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied: You are not authorized to view this evidence file"
            });
        }

        const filePath = evidence.storagePath || path.join(__dirname, "../uploads", evidence.fileName);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: "Evidence file not found on server" });
        }

        res.setHeader("Content-Type", evidence.fileType || "application/octet-stream");
        res.setHeader("Content-Disposition", `inline; filename="${evidence.originalName || evidence.fileName}"`);
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        console.error("Stream evidence error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve evidence file",
            error: error.message
        });
    }
};

/**
 * Create an activity (supports both simplified solar flow and generic activities)
 */
exports.createActivity = async (req, res) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        const {
            activityType,
            activityName,
            description,
            dateOfActivity,
            location,
            measurement,
            impact,
            credits,
            methodology,
            // New Solar & Periodic reporting fields
            installationId,
            reportingPeriod,
            solarMetrics,
            evidenceIds,
            evidence,
            notes
        } = req.body;

        const isSolar = String(activityType || "").trim().toLowerCase() === "solar";

        if (isSolar) {
            // ========================================================
            // SOLAR SPECIFIC VALIDATIONS & WORKFLOW
            // ========================================================

            // 1. Solar Installation Validation
            if (!installationId) {
                return res.status(400).json({
                    success: false,
                    message: "A registered solar installation is required for solar activity submission."
                });
            }

            const installation = await Installation.findById(installationId);
            if (!installation || !installation.isActive) {
                return res.status(404).json({
                    success: false,
                    message: "Solar installation not found or is no longer active."
                });
            }

            // Enforce ownership: NEVER trust user ID from client body
            if (installation.userId.toString() !== userId) {
                return res.status(403).json({
                    success: false,
                    message: "Unauthorized: You do not own this solar installation."
                });
            }

            // Snapshot installation details for immutable historical audit trail
            const installationSnapshot = {
                installationId: installation._id,
                name: installation.installationName,
                capacityKw: installation.capacityKw,
                address: installation.location?.address || "",
                meterIdentifier: installation.meterIdentifier || "",
                gridConfiguration: installation.gridConfiguration || "grid_connected",
                inverterDetails: installation.inverterDetails || ""
            };

            // 2. Reporting Period Validation
            const startDateRaw = reportingPeriod?.startDate || dateOfActivity;
            const endDateRaw = reportingPeriod?.endDate || dateOfActivity;

            if (!startDateRaw || !endDateRaw) {
                return res.status(400).json({
                    success: false,
                    message: "Reporting period start date and end date are required."
                });
            }

            const startDate = new Date(startDateRaw);
            const endDate = new Date(endDateRaw);

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid reporting period dates provided."
                });
            }

            if (startDate > endDate) {
                return res.status(400).json({
                    success: false,
                    message: "Reporting period start date cannot be later than end date."
                });
            }

            const now = new Date();
            // Allow up to 1 day clock drift
            if (endDate.getTime() > now.getTime() + 86400000) {
                return res.status(400).json({
                    success: false,
                    message: "Reporting period end date cannot be in the future."
                });
            }

            const msPerDay = 1000 * 60 * 60 * 24;
            const daysCount = Math.max(1, Math.round((endDate - startDate) / msPerDay) + 1);

            const periodType = ["daily", "weekly", "monthly", "custom"].includes(reportingPeriod?.periodType)
                ? reportingPeriod.periodType
                : (daysCount <= 1 ? "daily" : daysCount <= 7 ? "weekly" : daysCount <= 31 ? "monthly" : "custom");

            // 3. Electricity Generation & Consumption Validation
            const genVal = Number(solarMetrics?.generation?.reportedValue ?? measurement?.quantity);
            const genUnit = String(solarMetrics?.generation?.reportedUnit ?? measurement?.unit ?? "kWh").trim();

            if (!Number.isFinite(genVal) || genVal <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Solar electricity generated must be a positive number greater than zero."
                });
            }

            const canonicalGenKwh = toCanonicalKwh(genVal, genUnit);

            const consVal = Number(solarMetrics?.consumption?.reportedValue ?? 0);
            const consUnit = String(solarMetrics?.consumption?.reportedUnit ?? "kWh").trim();

            if (!Number.isFinite(consVal) || consVal < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Electricity consumed cannot be negative."
                });
            }

            const canonicalConsKwh = toCanonicalKwh(consVal, consUnit);

            // Optional breakdown readings
            const selfConsKwh = Number(solarMetrics?.selfConsumptionKwh) || 0;
            const gridExpKwh = Number(solarMetrics?.gridExportKwh) || Math.max(0, canonicalGenKwh - selfConsKwh);
            const gridImpKwh = Number(solarMetrics?.gridImportKwh) || Math.max(0, canonicalConsKwh - selfConsKwh);
            const netDisplacementKwh = canonicalGenKwh - canonicalConsKwh;

            // 4. MANDATORY SUPPORTING PROOF VALIDATION
            // Check attached evidence in evidenceIds, evidence array, or files
            const attachedEvidenceIds = Array.isArray(evidenceIds)
                ? evidenceIds
                : (Array.isArray(evidence) ? evidence.map(e => e.evidenceId || e._id).filter(Boolean) : []);

            if (attachedEvidenceIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Supporting proof is mandatory for solar activity submission. Please upload at least one generation report, meter reading, or utility statement."
                });
            }

            // Verify evidence records belong to the user
            const evidenceRecords = await Evidence.find({
                _id: { $in: attachedEvidenceIds },
                userId
            });

            if (evidenceRecords.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Valid supporting proof documents could not be found. Please re-upload your proof file."
                });
            }

            const evidenceDataList = evidenceRecords.map(e => ({
                evidenceId: e._id,
                fileName: e.originalName || e.fileName,
                fileType: e.fileType,
                fileSize: e.fileSize,
                fileUrl: e.fileUrl || `/api/activities/evidence/${e._id}/file`,
                documentType: e.documentType,
                uploadedAt: e.createdAt
            }));

            // 5. INDEPENDENT SERVER-SIDE CALCULATION
            // Under ACM0002 / VM0007, Avoided Emissions = Clean Solar kWh * 0.70 kg CO2e/kWh
            const avoidedCo2Kg = canonicalGenKwh * SOLAR_METHODOLOGY.emissionFactor;
            const estimatedCredits = avoidedCo2Kg / 1000; // 1 CC per 1000 kg CO2e (1 metric ton)

            const activity = await Activity.create({
                userId,
                activityType: "solar",
                activityName: String(activityName || "Solar Electricity Generation").trim(),
                description: description || `Solar clean electricity generation reported for period ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}.`,
                dateOfActivity: endDate, // Activity timestamp matches the end of the reporting period
                location: {
                    address: installationSnapshot.address,
                    latitude: installation.location?.latitude,
                    longitude: installation.location?.longitude
                },
                measurement: {
                    quantity: canonicalGenKwh,
                    unit: "kWh"
                },
                impact: {
                    co2e: avoidedCo2Kg,
                    unit: "kgCO2e"
                },
                credits: {
                    estimated: Number(estimatedCredits.toFixed(4)),
                    issued: 0 // Always 0 on initial submission. Never issued until verifier confirmation!
                },
                methodology: SOLAR_METHODOLOGY,
                installationId: installation._id,
                installationSnapshot,
                reportingPeriod: {
                    periodType,
                    startDate,
                    endDate,
                    daysCount
                },
                solarMetrics: {
                    generation: {
                        reportedValue: genVal,
                        reportedUnit: genUnit,
                        canonicalKwh: canonicalGenKwh
                    },
                    consumption: {
                        reportedValue: consVal,
                        reportedUnit: consUnit,
                        canonicalKwh: canonicalConsKwh,
                        consumptionType: "total_premises"
                    },
                    selfConsumptionKwh: selfConsKwh,
                    gridExportKwh: gridExpKwh,
                    gridImportKwh: gridImpKwh,
                    netDisplacementKwh
                },
                evidence: evidenceDataList,
                notes: notes ? String(notes).trim() : "",
                status: "pending"
            });

            // Associate evidence records with the created activity
            await Evidence.updateMany(
                { _id: { $in: evidenceRecords.map(e => e._id) } },
                { $set: { activityId: activity._id } }
            );

            return res.status(201).json({
                success: true,
                message: "Solar activity submitted successfully for MRV verification",
                activity: {
                    ...activity.toObject(),
                    id: activity._id
                }
            });
        }

        // ========================================================
        // GENERIC ACTIVITY TYPES (PRESERVED FOR NON-SOLAR WORKFLOWS)
        // ========================================================
        if (
            !activityType ||
            !activityName ||
            !dateOfActivity ||
            !measurement?.quantity
        ) {
            return res.status(400).json({
                success: false,
                message: "Activity type, name, date and quantity are required"
            });
        }

        const quantity = Number(measurement.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: "Quantity must be greater than zero"
            });
        }

        const activity = await Activity.create({
            userId,
            activityType,
            activityName: String(activityName).trim(),
            description: description || "",
            dateOfActivity: new Date(dateOfActivity),
            location: {
                address:
                    typeof location === "string"
                        ? location
                        : location?.address || "",
                latitude: Number(location?.latitude) || undefined,
                longitude: Number(location?.longitude) || undefined
            },
            measurement: {
                quantity,
                unit: measurement.unit || ""
            },
            impact: {
                co2e: Number(impact?.co2e ?? impact?.co2eKg ?? 0),
                unit: impact?.unit || "kgCO2e"
            },
            credits: {
                estimated: Number(credits?.estimated || 0),
                issued: Number(credits?.issued || 0)
            },
            methodology: methodology || {},
            notes: notes || "",
            status: "pending"
        });

        res.status(201).json({
            success: true,
            message: "Activity submitted successfully",
            activity: {
                ...activity.toObject(),
                id: activity._id
            }
        });

    } catch (error) {
        console.error("Activity creation error:", error);
        res.status(500).json({
            success: false,
            message: "Activity submission failed",
            error: error.message
        });
    }
};

/**
 * Retrieve activities submitted by the authenticated user
 */
exports.getMyActivities = async (req, res) => {
    try {
        const activities = await Activity.find({
            userId: req.user.userId
        })
            .populate("installationId", "installationName capacityKw meterIdentifier location")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            activities: activities.map(a => ({
                ...a.toObject(),
                id: a._id
            }))
        });

    } catch (error) {
        console.error("Activity fetch error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch activities",
            error: error.message
        });
    }
};

/**
 * Get a single activity by ID
 */
exports.getActivityById = async (req, res) => {
    try {
        const { id } = req.params;
        const activity = await Activity.findById(id)
            .populate("installationId")
            .populate("userId", "name email carbonxId walletAddress");

        if (!activity) {
            return res.status(404).json({ success: false, message: "Activity not found" });
        }

        const isOwner = activity.userId?._id?.toString() === req.user.userId || activity.userId?.toString() === req.user.userId;
        const isStaff = req.user?.role === "verifier" || req.user?.role === "admin";

        if (!isOwner && !isStaff) {
            return res.status(403).json({ success: false, message: "Unauthorized to access this activity" });
        }

        res.json({
            success: true,
            activity: {
                ...activity.toObject(),
                id: activity._id
            }
        });
    } catch (error) {
        console.error("Get activity error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve activity",
            error: error.message
        });
    }
};
