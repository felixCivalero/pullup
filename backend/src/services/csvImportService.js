// backend/src/services/csvImportService.js
// CSV import service for CRM

/**
 * Parse CSV string into array of objects
 * Handles quoted fields, commas in values, etc.
 */
export function parseCsv(csvText) {
  const lines = csvText.split("\n").filter((line) => line.trim());
  if (lines.length === 0) return [];

  // Parse header
  const headers = parseCsvLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length !== headers.length) {
      console.warn(
        `Row ${i + 1} has ${values.length} columns, expected ${headers.length}`
      );
      continue;
    }

    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      // End of field
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  // Add last field
  values.push(current.trim());

  return values;
}

/**
 * Parse Swedish number format to cents
 * "1762,00" -> 176200
 * "0,00" -> 0
 */
export function parseSwedishAmount(amountStr) {
  if (!amountStr || amountStr.trim() === "") return 0;

  // Remove spaces and replace comma with dot
  const cleaned = amountStr.trim().replace(/\s/g, "").replace(",", ".");
  const amount = parseFloat(cleaned);

  if (isNaN(amount)) return 0;

  // Convert to cents
  return Math.round(amount * 100);
}

/**
 * Normalize email address
 */
export function normalizeEmail(email) {
  if (!email) return null;
  return email.trim().toLowerCase();
}

/**
 * Map CSV row to person data structure
 */
export function mapCsvRowToPerson(row, userId) {
  const email = normalizeEmail(row.Email || row.email);
  if (!email) {
    return { error: "missing_email", row };
  }

  const stripeCustomerId = row.id || row.Id || null;
  const name = (row.Name || row.name || "").trim() || null;
  const description = (row.Description || row.description || "").trim() || null;

  // Parse amounts
  const totalSpend = parseSwedishAmount(
    row["Total Spend"] || row["total_spend"] || row.totalSpend || "0,00"
  );
  const refundedVolume = parseSwedishAmount(
    row["Refunded Volume"] ||
      row["refunded_volume"] ||
      row.refundedVolume ||
      "0,00"
  );
  const disputeLosses = parseSwedishAmount(
    row["Dispute Losses"] ||
      row["dispute_losses"] ||
      row.disputeLosses ||
      "0,00"
  );

  // Parse payment count
  const paymentCount =
    parseInt(
      row["Payment Count"] || row["payment_count"] || row.paymentCount || "0",
      10
    ) || 0;

  // Metadata
  const subscriptionType =
    row["subscription_type (metadata)"] ||
    row["subscription_type"] ||
    row.subscriptionType ||
    null;
  const interestedIn =
    row["interested_in (metadata)"] ||
    row["interested_in"] ||
    row.interestedIn ||
    null;
  const product =
    row["product (metadata)"] || row["product"] || row.product || null;
  const createdMetadata =
    row["created (metadata)"] || row["created"] || row.created || null;

  // Build import metadata
  const importMetadata = {
    description,
    card_id: row["Card ID"] || row["card_id"] || row.cardId || null,
    created_utc:
      row["Created (UTC)"] || row["created_utc"] || row.createdUtc || null,
    product,
    created_metadata: createdMetadata,
  };

  return {
    email,
    name,
    stripeCustomerId,
    totalSpend,
    paymentCount,
    refundedVolume,
    disputeLosses,
    subscriptionType,
    interestedIn,
    importSource: "csv_stripe_export",
    importMetadata,
  };
}

/**
 * Import people from CSV data
 * Returns: { created: number, updated: number, errors: array }
 */
export async function importPeopleFromCsv(csvText, userId) {
  // Import data functions
  const { findPersonByEmail, findOrCreatePerson, updatePerson } = await import(
    "../data.js"
  );
  const { supabase } = await import("../supabase.js");

  const rows = parseCsv(csvText);
  const results = {
    created: 0,
    updated: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const personData = mapCsvRowToPerson(row, userId);

      if (personData.error) {
        results.errors.push({
          row: i + 2, // +2 because header is row 1, and we're 0-indexed
          error: personData.error,
          data: row,
        });
        continue;
      }

      // Find existing person by email or Stripe customer ID
      let existingPerson = null;

      if (personData.email) {
        existingPerson = await findPersonByEmail(personData.email);
      }

      if (!existingPerson && personData.stripeCustomerId) {
        const { data, error } = await supabase
          .from("people")
          .select("*")
          .eq("stripe_customer_id", personData.stripeCustomerId)
          .single();

        if (data && !error) {
          // Map database person to application format
          existingPerson = {
            id: data.id,
            email: data.email,
            name: data.name,
            phone: data.phone,
            notes: data.notes,
            tags: data.tags || [],
            stripeCustomerId: data.stripe_customer_id,
            totalSpend: data.total_spend || 0,
            paymentCount: data.payment_count || 0,
            refundedVolume: data.refunded_volume || 0,
            disputeLosses: data.dispute_losses || 0,
            subscriptionType: data.subscription_type || null,
            interestedIn: data.interested_in || null,
            importSource: data.import_source || null,
            importMetadata: data.import_metadata || null,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
        }
      }

      if (existingPerson) {
        // Update existing person
        const updates = {
          // Update name if provided and different
          name: personData.name || existingPerson.name,
          // Update Stripe customer ID if provided
          stripeCustomerId:
            personData.stripeCustomerId || existingPerson.stripeCustomerId,
          // Update CRM fields (merge with existing or use new)
          totalSpend: Math.max(
            existingPerson.totalSpend || 0,
            personData.totalSpend
          ),
          paymentCount: Math.max(
            existingPerson.paymentCount || 0,
            personData.paymentCount
          ),
          refundedVolume: Math.max(
            existingPerson.refundedVolume || 0,
            personData.refundedVolume
          ),
          disputeLosses: Math.max(
            existingPerson.disputeLosses || 0,
            personData.disputeLosses
          ),
          subscriptionType:
            personData.subscriptionType ||
            existingPerson.subscriptionType ||
            null,
          interestedIn:
            personData.interestedIn || existingPerson.interestedIn || null,
          importSource: personData.importSource,
          importMetadata: personData.importMetadata,
        };

        const updateResult = await updatePerson(existingPerson.id, updates);
        if (updateResult.error) {
          throw new Error(updateResult.error);
        }
        results.updated++;
      } else {
        // Create new person
        const newPerson = await findOrCreatePerson(
          personData.email,
          personData.name
        );
        if (newPerson) {
          // Update with CRM fields
          const updateResult = await updatePerson(newPerson.id, {
            stripeCustomerId: personData.stripeCustomerId,
            totalSpend: personData.totalSpend,
            paymentCount: personData.paymentCount,
            refundedVolume: personData.refundedVolume,
            disputeLosses: personData.disputeLosses,
            subscriptionType: personData.subscriptionType,
            interestedIn: personData.interestedIn,
            importSource: personData.importSource,
            importMetadata: personData.importMetadata,
          });
          if (updateResult.error) {
            throw new Error(updateResult.error);
          }
        }
        results.created++;
      }
    } catch (error) {
      results.errors.push({
        row: i + 2,
        error: error.message || "unknown_error",
        data: row,
      });
      console.error(`Error importing row ${i + 2}:`, error);
    }
  }

  return results;
}
