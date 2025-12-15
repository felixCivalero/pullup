// backend/src/middleware/validation.js
// Input validation middleware for API endpoints

/**
 * Validates event creation/update data
 */
export function validateEventData(req, res, next) {
  const errors = [];

  // Title validation
  if (req.body.title !== undefined) {
    if (typeof req.body.title !== "string") {
      errors.push("Title must be a string");
    } else if (!req.body.title.trim()) {
      errors.push("Title is required");
    } else if (req.body.title.length > 500) {
      errors.push("Title must be less than 500 characters");
    }
  }

  // Description validation
  if (req.body.description !== undefined) {
    if (typeof req.body.description !== "string") {
      errors.push("Description must be a string");
    } else if (req.body.description.length > 10000) {
      errors.push("Description must be less than 10000 characters");
    }
  }

  // Location validation
  if (req.body.location !== undefined) {
    if (typeof req.body.location !== "string") {
      errors.push("Location must be a string");
    } else if (req.body.location.length > 500) {
      errors.push("Location must be less than 500 characters");
    }
  }

  // Location coordinates validation
  if (req.body.locationLat !== undefined && req.body.locationLat !== null) {
    const lat = Number(req.body.locationLat);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.push("Location latitude must be a number between -90 and 90");
    }
  }

  if (req.body.locationLng !== undefined && req.body.locationLng !== null) {
    const lng = Number(req.body.locationLng);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.push("Location longitude must be a number between -180 and 180");
    }
  }

  // Date validation
  if (req.body.startsAt !== undefined) {
    if (typeof req.body.startsAt !== "string") {
      errors.push("Start date must be a string (ISO format)");
    } else {
      const startDate = new Date(req.body.startsAt);
      if (isNaN(startDate.getTime())) {
        errors.push("Start date must be a valid date");
      }
    }
  }

  if (req.body.endsAt !== undefined && req.body.endsAt !== null) {
    if (typeof req.body.endsAt !== "string") {
      errors.push("End date must be a string (ISO format)");
    } else {
      const endDate = new Date(req.body.endsAt);
      if (isNaN(endDate.getTime())) {
        errors.push("End date must be a valid date");
      } else if (req.body.startsAt) {
        const startDate = new Date(req.body.startsAt);
        if (endDate < startDate) {
          errors.push("End date must be after start date");
        }
      }
    }
  }

  // Capacity validation
  if (
    req.body.cocktailCapacity !== undefined &&
    req.body.cocktailCapacity !== null
  ) {
    const capacity = Number(req.body.cocktailCapacity);
    if (isNaN(capacity) || capacity < 1 || capacity > 100000) {
      errors.push("Cocktail capacity must be a number between 1 and 100000");
    }
  }

  if (req.body.foodCapacity !== undefined && req.body.foodCapacity !== null) {
    const capacity = Number(req.body.foodCapacity);
    if (isNaN(capacity) || capacity < 1 || capacity > 100000) {
      errors.push("Food capacity must be a number between 1 and 100000");
    }
  }

  if (req.body.totalCapacity !== undefined && req.body.totalCapacity !== null) {
    const capacity = Number(req.body.totalCapacity);
    if (isNaN(capacity) || capacity < 1 || capacity > 100000) {
      errors.push("Total capacity must be a number between 1 and 100000");
    }
  }

  // Dinner settings validation
  if (req.body.dinnerEnabled !== undefined) {
    if (typeof req.body.dinnerEnabled !== "boolean") {
      errors.push("dinnerEnabled must be a boolean");
    }
  }

  if (
    req.body.dinnerStartTime !== undefined &&
    req.body.dinnerStartTime !== null
  ) {
    if (typeof req.body.dinnerStartTime !== "string") {
      errors.push("Dinner start time must be a string (ISO format)");
    } else {
      const dinnerStart = new Date(req.body.dinnerStartTime);
      if (isNaN(dinnerStart.getTime())) {
        errors.push("Dinner start time must be a valid date");
      }
    }
  }

  if (req.body.dinnerEndTime !== undefined && req.body.dinnerEndTime !== null) {
    if (typeof req.body.dinnerEndTime !== "string") {
      errors.push("Dinner end time must be a string (ISO format)");
    } else {
      const dinnerEnd = new Date(req.body.dinnerEndTime);
      if (isNaN(dinnerEnd.getTime())) {
        errors.push("Dinner end time must be a valid date");
      } else if (req.body.dinnerStartTime) {
        const dinnerStart = new Date(req.body.dinnerStartTime);
        if (dinnerEnd < dinnerStart) {
          errors.push("Dinner end time must be after dinner start time");
        }
      }
    }
  }

  if (
    req.body.dinnerSeatingIntervalHours !== undefined &&
    req.body.dinnerSeatingIntervalHours !== null
  ) {
    const interval = Number(req.body.dinnerSeatingIntervalHours);
    if (isNaN(interval) || interval < 0.5 || interval > 24) {
      errors.push("Dinner seating interval must be between 0.5 and 24 hours");
    }
  }

  if (
    req.body.dinnerMaxSeatsPerSlot !== undefined &&
    req.body.dinnerMaxSeatsPerSlot !== null
  ) {
    const seats = Number(req.body.dinnerMaxSeatsPerSlot);
    if (isNaN(seats) || seats < 1 || seats > 1000) {
      errors.push("Dinner max seats per slot must be between 1 and 1000");
    }
  }

  // Max plus ones validation
  if (req.body.maxPlusOnesPerGuest !== undefined) {
    const maxPlusOnes = Number(req.body.maxPlusOnesPerGuest);
    if (isNaN(maxPlusOnes) || maxPlusOnes < 0 || maxPlusOnes > 10) {
      errors.push("Max plus ones per guest must be between 0 and 10");
    }
  }

  // Boolean fields validation
  if (req.body.waitlistEnabled !== undefined) {
    if (typeof req.body.waitlistEnabled !== "boolean") {
      errors.push("waitlistEnabled must be a boolean");
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: "Validation failed",
      errors,
    });
  }

  next();
}

/**
 * Validates RSVP submission data
 */
export function validateRsvpData(req, res, next) {
  const errors = [];

  // Email validation
  if (!req.body.email) {
    errors.push("Email is required");
  } else if (typeof req.body.email !== "string") {
    errors.push("Email must be a string");
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(req.body.email.trim())) {
      errors.push("Email must be a valid email address");
    }
    if (req.body.email.length > 255) {
      errors.push("Email must be less than 255 characters");
    }
  }

  // Name validation (optional)
  if (req.body.name !== undefined && req.body.name !== null) {
    if (typeof req.body.name !== "string") {
      errors.push("Name must be a string");
    } else if (req.body.name.length > 200) {
      errors.push("Name must be less than 200 characters");
    }
  }

  // Plus ones validation
  if (req.body.plusOnes !== undefined) {
    const plusOnes = Number(req.body.plusOnes);
    if (isNaN(plusOnes) || plusOnes < 0 || plusOnes > 10) {
      errors.push("Plus ones must be a number between 0 and 10");
    }
  }

  // Dinner validation
  if (req.body.wantsDinner !== undefined) {
    if (typeof req.body.wantsDinner !== "boolean") {
      errors.push("wantsDinner must be a boolean");
    }
  }

  if (req.body.wantsDinner && req.body.dinnerTimeSlot) {
    if (typeof req.body.dinnerTimeSlot !== "string") {
      errors.push("Dinner time slot must be a string (ISO format)");
    } else {
      const slotDate = new Date(req.body.dinnerTimeSlot);
      if (isNaN(slotDate.getTime())) {
        errors.push("Dinner time slot must be a valid date");
      }
    }
  }

  if (
    req.body.dinnerPartySize !== undefined &&
    req.body.dinnerPartySize !== null
  ) {
    const partySize = Number(req.body.dinnerPartySize);
    if (isNaN(partySize) || partySize < 1 || partySize > 20) {
      errors.push("Dinner party size must be between 1 and 20");
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: "Validation failed",
      errors,
    });
  }

  next();
}

/**
 * Validates RSVP update data
 */
export function validateRsvpUpdateData(req, res, next) {
  const errors = [];

  // Email validation (optional for updates)
  if (req.body.email !== undefined) {
    if (typeof req.body.email !== "string") {
      errors.push("Email must be a string");
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(req.body.email.trim())) {
        errors.push("Email must be a valid email address");
      }
      if (req.body.email.length > 255) {
        errors.push("Email must be less than 255 characters");
      }
    }
  }

  // Name validation (optional)
  if (req.body.name !== undefined && req.body.name !== null) {
    if (typeof req.body.name !== "string") {
      errors.push("Name must be a string");
    } else if (req.body.name.length > 200) {
      errors.push("Name must be less than 200 characters");
    }
  }

  // Plus ones validation
  if (req.body.plusOnes !== undefined) {
    const plusOnes = Number(req.body.plusOnes);
    if (isNaN(plusOnes) || plusOnes < 0 || plusOnes > 10) {
      errors.push("Plus ones must be a number between 0 and 10");
    }
  }

  // Pull-up counts validation
  if (
    req.body.dinnerPullUpCount !== undefined &&
    req.body.dinnerPullUpCount !== null
  ) {
    const count = Number(req.body.dinnerPullUpCount);
    if (isNaN(count) || count < 0 || count > 100) {
      errors.push("Dinner pull-up count must be between 0 and 100");
    }
  }

  if (
    req.body.cocktailOnlyPullUpCount !== undefined &&
    req.body.cocktailOnlyPullUpCount !== null
  ) {
    const count = Number(req.body.cocktailOnlyPullUpCount);
    if (isNaN(count) || count < 0 || count > 100) {
      errors.push("Cocktail pull-up count must be between 0 and 100");
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: "Validation failed",
      errors,
    });
  }

  next();
}
