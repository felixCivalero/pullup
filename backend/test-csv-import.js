// Test script for CSV import
// Usage: node test-csv-import.js <path-to-csv-file>

import { readFileSync } from "fs";
import { importPeopleFromCsv } from "./src/services/csvImportService.js";

const csvFilePath = process.argv[2];

if (!csvFilePath) {
  console.error("Usage: node test-csv-import.js <path-to-csv-file>");
  process.exit(1);
}

try {
  console.log(`Reading CSV file: ${csvFilePath}`);
  const csvText = readFileSync(csvFilePath, "utf-8");

  console.log(`CSV file size: ${csvText.length} characters`);
  console.log(`CSV lines: ${csvText.split("\n").length}`);

  // Use a test user ID (replace with actual user ID for testing)
  // You can get your user ID from Supabase auth.users table
  const testUserId = process.env.TEST_USER_ID;

  if (!testUserId) {
    console.error("ERROR: TEST_USER_ID environment variable is required");
    console.error(
      "Usage: TEST_USER_ID=<your-user-id> node test-csv-import.js <path-to-csv-file>"
    );
    process.exit(1);
  }

  console.log("\nStarting import...");
  const startTime = Date.now();

  const results = await importPeopleFromCsv(csvText, testUserId);

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  console.log("\n✅ Import completed!");
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`\nSummary:`);
  console.log(`  Created: ${results.created}`);
  console.log(`  Updated: ${results.updated}`);
  console.log(`  Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log(`\n⚠️  First 10 errors:`);
    results.errors.slice(0, 10).forEach((error) => {
      console.log(`  Row ${error.row}: ${error.error}`);
    });
  }

  process.exit(0);
} catch (error) {
  console.error("\n❌ Import failed:", error);
  process.exit(1);
}
