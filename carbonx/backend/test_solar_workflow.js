require("dotenv").config();
const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");

const User = require("./models/User");
const Installation = require("./models/Installation");
const Activity = require("./models/Activity");
const Evidence = require("./models/Evidence");

const installationRoutes = require("./routes/installationRoutes");
const activityRoutes = require("./routes/activityRoutes");
const verifierRoutes = require("./routes/verifierRoutes");

async function runTests() {
    console.log("=================================================");
    console.log("   CARBONX SOLAR ACTIVITY & BACKEND TEST SUITE   ");
    console.log("=================================================");

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB");

    // Setup test express server
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.use("/api/installations", installationRoutes);
    app.use("/api/activities", activityRoutes);
    app.use("/api/verifier", verifierRoutes);

    const server = app.listen(5099);
    console.log("✓ Test server listening on http://localhost:5099");

    const BASE_URL = "http://localhost:5099/api";

    // Find two test users: User A and User B
    let userA = await User.findOne({ email: "alice@gmail.com" });
    let userB = await User.findOne({ email: "bob@gmail.com" });

    if (!userA) {
        userA = await User.create({
            carbonxId: "CX-TEST-A",
            name: "Alice Tester",
            email: "alice@gmail.com",
            passwordHash: "hash123",
            role: "citizen"
        });
    }

    if (!userB) {
        userB = await User.create({
            carbonxId: "CX-TEST-B",
            name: "Bob Tester",
            email: "bob@gmail.com",
            passwordHash: "hash456",
            role: "citizen"
        });
    }

    const tokenA = jwt.sign(
        { userId: userA._id.toString(), carbonxId: userA.carbonxId, role: "citizen" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
    );

    const tokenB = jwt.sign(
        { userId: userB._id.toString(), carbonxId: userB.carbonxId, role: "citizen" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
    );

    const verifierToken = jwt.sign(
        { userId: userA._id.toString(), carbonxId: "VX-0042", role: "verifier" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
    );

    let createdInstallationId = null;
    let uploadedEvidenceId = null;
    let createdActivityId = null;

    try {
        // -------------------------------------------------------------
        // TEST 1: User A gets installations
        // -------------------------------------------------------------
        console.log("\n[TEST 1] User A fetches installations");
        let res = await fetch(`${BASE_URL}/installations`, {
            headers: { Authorization: `Bearer ${tokenA}` }
        });
        let data = await res.json();
        console.log(`✓ Status: ${res.status}, installations count: ${data.installations?.length ?? 0}`);

        // -------------------------------------------------------------
        // TEST 2: User A creates a solar installation
        // -------------------------------------------------------------
        console.log("\n[TEST 2] User A creates a solar installation");
        res = await fetch(`${BASE_URL}/installations`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`
            },
            body: JSON.stringify({
                installationName: "Alice Rooftop Solar",
                capacityKw: 6.5,
                location: { address: "Plot 10, Sector 12, Navi Mumbai" },
                meterIdentifier: "MTR-ALICE-01",
                gridConfiguration: "grid_connected",
                inverterDetails: "Solis 6kW Inverter"
            })
        });
        data = await res.json();
        if (res.status !== 201 || !data.installation?._id) {
            throw new Error(`Failed to create installation: ${JSON.stringify(data)}`);
        }
        createdInstallationId = data.installation._id;
        console.log(`✓ Created installation ID: ${createdInstallationId}, capacity: ${data.installation.capacityKw} kW`);

        // -------------------------------------------------------------
        // TEST 3: User B tries to update User A's installation (Security check)
        // -------------------------------------------------------------
        console.log("\n[TEST 3] Security check: User B tries to edit User A's installation");
        res = await fetch(`${BASE_URL}/installations/${createdInstallationId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenB}`
            },
            body: JSON.stringify({ capacityKw: 999 })
        });
        data = await res.json();
        if (res.status !== 403) {
            throw new Error(`Expected 403 Forbidden, got ${res.status}`);
        }
        console.log(`✓ Access correctly denied with 403 Forbidden: "${data.message}"`);

        // -------------------------------------------------------------
        // TEST 4: User A updates installation capacity
        // -------------------------------------------------------------
        console.log("\n[TEST 4] User A updates installation details");
        res = await fetch(`${BASE_URL}/installations/${createdInstallationId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`
            },
            body: JSON.stringify({ capacityKw: 7.2 })
        });
        data = await res.json();
        if (res.status !== 200 || data.installation?.capacityKw !== 7.2) {
            throw new Error(`Failed to update installation: ${JSON.stringify(data)}`);
        }
        console.log(`✓ Installation capacity updated to: ${data.installation.capacityKw} kW`);

        // -------------------------------------------------------------
        // TEST 5: Submission without installation must fail
        // -------------------------------------------------------------
        console.log("\n[TEST 5] Submit solar activity without installation reference");
        res = await fetch(`${BASE_URL}/activities`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`
            },
            body: JSON.stringify({
                activityType: "solar",
                activityName: "Solar Electricity Generation"
            })
        });
        data = await res.json();
        if (res.status !== 400) {
            throw new Error(`Expected 400, got ${res.status}`);
        }
        console.log(`✓ Rejected with 400: "${data.message}"`);

        // -------------------------------------------------------------
        // TEST 6: Invalid reporting dates (start > end) must fail
        // -------------------------------------------------------------
        console.log("\n[TEST 6] Submit solar activity with reversed dates");
        res = await fetch(`${BASE_URL}/activities`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`
            },
            body: JSON.stringify({
                activityType: "solar",
                installationId: createdInstallationId,
                reportingPeriod: {
                    startDate: "2026-10-10",
                    endDate: "2026-10-01"
                },
                solarMetrics: {
                    generation: { reportedValue: 100, reportedUnit: "kWh" },
                    consumption: { reportedValue: 50, reportedUnit: "kWh" }
                }
            })
        });
        data = await res.json();
        if (res.status !== 400) {
            throw new Error(`Expected 400 for reversed dates, got ${res.status}`);
        }
        console.log(`✓ Rejected reversed dates with 400: "${data.message}"`);

        // -------------------------------------------------------------
        // TEST 7: Future end date must fail
        // -------------------------------------------------------------
        console.log("\n[TEST 7] Submit solar activity with future end date");
        res = await fetch(`${BASE_URL}/activities`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`
            },
            body: JSON.stringify({
                activityType: "solar",
                installationId: createdInstallationId,
                reportingPeriod: {
                    startDate: "2026-10-01",
                    endDate: "2099-12-31"
                },
                solarMetrics: {
                    generation: { reportedValue: 100, reportedUnit: "kWh" },
                    consumption: { reportedValue: 50, reportedUnit: "kWh" }
                }
            })
        });
        data = await res.json();
        if (res.status !== 400) {
            throw new Error(`Expected 400 for future date, got ${res.status}`);
        }
        console.log(`✓ Rejected future date with 400: "${data.message}"`);

        // -------------------------------------------------------------
        // TEST 8: Mandatory proof requirement (missing proof must fail)
        // -------------------------------------------------------------
        console.log("\n[TEST 8] Submit solar activity without mandatory proof");
        res = await fetch(`${BASE_URL}/activities`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`
            },
            body: JSON.stringify({
                activityType: "solar",
                installationId: createdInstallationId,
                reportingPeriod: {
                    startDate: "2026-09-01",
                    endDate: "2026-09-30",
                    periodType: "monthly"
                },
                solarMetrics: {
                    generation: { reportedValue: 3430, reportedUnit: "kWh" },
                    consumption: { reportedValue: 1200, reportedUnit: "kWh" }
                },
                evidenceIds: [] // No evidence attached!
            })
        });
        data = await res.json();
        if (res.status !== 400) {
            throw new Error(`Expected 400 for missing proof, got ${res.status}`);
        }
        console.log(`✓ Rejected missing proof with 400: "${data.message}"`);

        // -------------------------------------------------------------
        // TEST 9: Upload proof file via /api/activities/upload-evidence
        // -------------------------------------------------------------
        console.log("\n[TEST 9] Upload supporting proof document");
        // Create a dummy proof file
        const testProofPath = path.join(__dirname, "test_inverter_report.pdf");
        fs.writeFileSync(testProofPath, "%PDF-1.4 Fake solar inverter generation telemetry report");

        const form = new FormData();
        const fileBlob = new Blob([fs.readFileSync(testProofPath)], { type: "application/pdf" });
        form.append("proofFiles", fileBlob, "test_inverter_report.pdf");

        res = await fetch(`${BASE_URL}/activities/upload-evidence`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenA}`
            },
            body: form
        });
        data = await res.json();
        if (res.status !== 201 || !data.evidence?.[0]?.evidenceId) {
            throw new Error(`Failed to upload evidence: ${JSON.stringify(data)}`);
        }
        uploadedEvidenceId = data.evidence[0].evidenceId;
        console.log(`✓ Evidence uploaded. ID: ${uploadedEvidenceId}, SHA-256 hash: ${data.evidence[0].hash?.slice(0, 16)}...`);

        // -------------------------------------------------------------
        // TEST 10: Security check on Evidence file access
        // -------------------------------------------------------------
        console.log("\n[TEST 10] Security check: User B tries to view User A's uploaded evidence file");
        res = await fetch(`${BASE_URL}/activities/evidence/${uploadedEvidenceId}/file`, {
            headers: { Authorization: `Bearer ${tokenB}` }
        });
        if (res.status !== 403) {
            throw new Error(`Expected 403 Forbidden for unauthorized evidence access, got ${res.status}`);
        }
        console.log(`✓ Unauthorized evidence access blocked with 403 Forbidden`);

        // Verifier can view User A's evidence file
        res = await fetch(`${BASE_URL}/activities/evidence/${uploadedEvidenceId}/file`, {
            headers: { Authorization: `Bearer ${verifierToken}` }
        });
        if (res.status !== 200) {
            throw new Error(`Expected 200 for verifier evidence access, got ${res.status}`);
        }
        console.log(`✓ Verifier authorized access to evidence confirmed with 200 OK`);

        // -------------------------------------------------------------
        // TEST 11: Successful Solar Activity Submission
        // -------------------------------------------------------------
        console.log("\n[TEST 11] User A submits valid solar activity with monthly period & proof");
        res = await fetch(`${BASE_URL}/activities`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`
            },
            body: JSON.stringify({
                activityType: "solar",
                activityName: "Solar Electricity Generation",
                installationId: createdInstallationId,
                reportingPeriod: {
                    startDate: "2026-09-01",
                    endDate: "2026-09-30",
                    periodType: "monthly"
                },
                solarMetrics: {
                    generation: { reportedValue: 3430, reportedUnit: "kWh" },
                    consumption: { reportedValue: 1200, reportedUnit: "kWh" },
                    selfConsumptionKwh: 1000,
                    gridExportKwh: 2430,
                    gridImportKwh: 200
                },
                evidenceIds: [uploadedEvidenceId],
                notes: "Monthly net-metering report verified against Solis telemetry."
            })
        });
        data = await res.json();
        if (res.status !== 201 || !data.activity?._id) {
            throw new Error(`Failed to create solar activity: ${JSON.stringify(data)}`);
        }
        createdActivityId = data.activity._id;
        const act = data.activity;
        console.log(`✓ Activity created successfully. ID: ${createdActivityId}`);
        console.log(`  - Status: ${act.status}`);
        console.log(`  - Measurement quantity: ${act.measurement.quantity} ${act.measurement.unit}`);
        console.log(`  - Avoided CO2 impact: ${act.impact.co2e} kg CO2e (${act.impact.co2e / 1000} tCO2e)`);
        console.log(`  - Estimated Credits: ${act.credits.estimated} CC (issued: ${act.credits.issued})`);
        console.log(`  - Installation Snapshot capacity: ${act.installationSnapshot?.capacityKw} kW`);
        console.log(`  - Attached evidence count: ${act.evidence?.length}`);

        // Validate backend calculation accuracy: 3430 kWh * 0.70 kg/kWh = 2401.0 kg CO2e
        const expectedCo2 = 3430 * 0.70;
        const expectedCredits = expectedCo2 / 1000;
        if (Math.abs(act.impact.co2e - expectedCo2) > 0.01) {
            throw new Error(`Calculation mismatch! Expected ${expectedCo2}, got ${act.impact.co2e}`);
        }
        if (Math.abs(act.credits.estimated - expectedCredits) > 0.001) {
            throw new Error(`Credits mismatch! Expected ${expectedCredits}, got ${act.credits.estimated}`);
        }
        console.log(`✓ Server-side calculation matches VM0007 / ACM0002 methodology: 3430 * 0.70 = 2401 kg CO2e -> 2.401 CC`);

        // -------------------------------------------------------------
        // TEST 12: Historical Snapshot Invariance Test
        // -------------------------------------------------------------
        console.log("\n[TEST 12] Historical snapshot invariance: Update installation capacity to 15 kW");
        await fetch(`${BASE_URL}/installations/${createdInstallationId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`
            },
            body: JSON.stringify({ capacityKw: 15.0 })
        });

        // Re-read previous activity
        const storedAct = await Activity.findById(createdActivityId);
        if (storedAct.installationSnapshot.capacityKw !== 7.2) {
            throw new Error(`Historical snapshot was mutated! Expected 7.2 kW, found ${storedAct.installationSnapshot.capacityKw}`);
        }
        console.log(`✓ Historical activity snapshot remained intact at 7.2 kW despite installation update to 15 kW`);

        // -------------------------------------------------------------
        // TEST 13: Dynamic Unit Conversion (MWh)
        // -------------------------------------------------------------
        console.log("\n[TEST 13] Unit conversion test: Submit activity in MWh");
        // Upload a 2nd proof file
        const form2 = new FormData();
        form2.append("proofFiles", new Blob(["Proof 2"], { type: "text/plain" }), "mwh_meter_bill.pdf");
        const upload2Res = await (await fetch(`${BASE_URL}/activities/upload-evidence`, {
            method: "POST",
            headers: { Authorization: `Bearer ${tokenA}` },
            body: form2
        })).json();
        const proofId2 = upload2Res.evidence[0].evidenceId;

        res = await fetch(`${BASE_URL}/activities`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`
            },
            body: JSON.stringify({
                activityType: "solar",
                installationId: createdInstallationId,
                reportingPeriod: {
                    startDate: "2026-08-01",
                    endDate: "2026-08-31",
                    periodType: "monthly"
                },
                solarMetrics: {
                    generation: { reportedValue: 2.5, reportedUnit: "MWh" }, // 2.5 MWh = 2,500 kWh
                    consumption: { reportedValue: 1.0, reportedUnit: "MWh" }  // 1.0 MWh = 1,000 kWh
                },
                evidenceIds: [proofId2]
            })
        });
        data = await res.json();
        const actMwh = data.activity;
        if (actMwh.measurement.quantity !== 2500) {
            throw new Error(`Canonical conversion error: Expected 2500 kWh, got ${actMwh.measurement.quantity}`);
        }
        const expectedMwhCo2 = 2500 * 0.70; // 1750 kg
        if (actMwh.impact.co2e !== expectedMwhCo2) {
            throw new Error(`MWh CO2 calculation error: Expected ${expectedMwhCo2}, got ${actMwh.impact.co2e}`);
        }
        console.log(`✓ 2.5 MWh accurately converted to 2,500 kWh; avoided emissions: ${actMwh.impact.co2e} kg CO2e`);

        // -------------------------------------------------------------
        // TEST 14: Verifier inspection endpoint
        // -------------------------------------------------------------
        console.log("\n[TEST 14] Verifier inspection endpoint");
        res = await fetch(`${BASE_URL}/verifier/activities/${createdActivityId}`, {
            headers: { Authorization: `Bearer ${verifierToken}` }
        });
        data = await res.json();
        if (res.status !== 200 || !data.activity) {
            throw new Error(`Verifier fetch failed: ${JSON.stringify(data)}`);
        }
        console.log(`✓ Verifier loaded activity: Title="${data.activity.activityName}", SnapshotCapacity=${data.activity.installationSnapshot?.capacityKw} kW, EvidenceAttached=${data.activity.evidence?.length}`);

        // -------------------------------------------------------------
        // TEST 15: Non-solar activity backward compatibility
        // -------------------------------------------------------------
        console.log("\n[TEST 15] Non-solar activity backward compatibility (Tree Plantation)");
        res = await fetch(`${BASE_URL}/activities`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`
            },
            body: JSON.stringify({
                activityType: "trees",
                activityName: "Mangrove Restoration",
                dateOfActivity: "2026-09-15",
                measurement: { quantity: 50, unit: "trees" },
                impact: { co2e: 1050, unit: "kgCO2e" },
                credits: { estimated: 1.05 }
            })
        });
        data = await res.json();
        if (res.status !== 201) {
            throw new Error(`Non-solar activity submission failed: ${JSON.stringify(data)}`);
        }
        console.log(`✓ Non-solar activity preserved and created with status: ${data.activity.status}`);

        // Clean up temporary test files
        if (fs.existsSync(testProofPath)) fs.unlinkSync(testProofPath);

        console.log("\n=================================================");
        console.log("   ALL 15 TESTS PASSED SUCCESSFULLY! 🚀         ");
        console.log("=================================================");

    } catch (err) {
        console.error("\n❌ TEST SUITE FAILED:", err);
        process.exitCode = 1;
    } finally {
        server.close();
        await mongoose.disconnect();
        process.exit(process.exitCode || 0);
    }
}

runTests();
