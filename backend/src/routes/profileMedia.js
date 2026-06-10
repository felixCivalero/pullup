// Host profile media routes: profile picture upload + brand logo upload/delete.
// Extracted verbatim from index.js — zero behavior change.

import { getUserProfile, updateUserProfile } from "../data.js";
import { requireAuth } from "../middleware/auth.js";
import { sniffUploadedImage } from "../lib/uploads.js";

export function registerProfileMediaRoutes(app) {
  app.post("/host/profile/picture", requireAuth, async (req, res) => {
    try {
      const { imageData } = req.body;

      let sniff;
      try {
        sniff = sniffUploadedImage(imageData, {
          maxBytes: 5 * 1024 * 1024,
          label: "Profile picture",
        });
      } catch (e) {
        return res.status(e.statusCode || 400).json(e.body);
      }
      const { buffer, extension, mime } = sniff;
      // Avatars don't need animation; drop GIF here to keep this surface tight.
      if (extension === "gif") {
        return res.status(415).json({
          error: "Profile picture must be JPEG, PNG, or WebP.",
        });
      }

      const fileName = `${req.user.id}/profile.${extension}`;

      // Upload to Supabase Storage
      const { supabase } = await import("../supabase.js");
      const { data, error } = await supabase.storage
        .from("profile-pictures")
        .upload(fileName, buffer, {
          contentType: mime,
          upsert: true, // Overwrite if exists
        });

      if (error) {
        console.error("Storage upload error:", error);
        return res.status(500).json({ error: "Failed to upload image" });
      }

      // Store just the file path in the database
      // We'll generate the appropriate URL (public or signed) when fetching
      // This allows us to switch between public/private buckets easily
      const updated = await updateUserProfile(req.user.id, {
        profilePicture: fileName, // Store path, not full URL
      });

      // Generate URL for immediate return (try signed first, fallback to public)
      let imageUrl = null;
      try {
        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from("profile-pictures")
          .createSignedUrl(fileName, 3600); // 1 hour for response

        if (!urlError && signedUrlData?.signedUrl) {
          imageUrl = signedUrlData.signedUrl;
        }
      } catch (error) {
        console.error("Signed URL error:", error);
      }

      // Fallback to public URL if signed URL fails
      if (!imageUrl) {
        const {
          data: { publicUrl },
        } = supabase.storage.from("profile-pictures").getPublicUrl(fileName);
        imageUrl = publicUrl;
      }

      // Return profile with the generated URL
      const profileWithUrl = {
        ...updated,
        profilePicture: imageUrl,
      };

      res.json(profileWithUrl);
    } catch (error) {
      console.error("Error uploading profile picture:", error);
      res.status(500).json({ error: "Failed to upload profile picture" });
    }
  });

  // Upload brand logo
  app.post("/host/profile/logo", requireAuth, async (req, res) => {
    try {
      const { imageData } = req.body;

      let sniff;
      try {
        sniff = sniffUploadedImage(imageData, {
          maxBytes: 512 * 1024,
          label: "Logo",
        });
      } catch (e) {
        return res.status(e.statusCode || 400).json(e.body);
      }
      const { buffer, extension, mime } = sniff;
      const fileName = `${req.user.id}/logo.${extension}`;

      const { supabase } = await import("../supabase.js");
      const { error } = await supabase.storage
        .from("profile-pictures")
        .upload(fileName, buffer, {
          contentType: mime,
          upsert: true,
        });

      if (error) {
        console.error("Storage upload error:", error);
        return res.status(500).json({ error: "Failed to upload logo" });
      }

      const updated = await updateUserProfile(req.user.id, {
        brandLogo: fileName,
      });

      // Generate URL for immediate return
      let logoUrl = null;
      try {
        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from("profile-pictures")
          .createSignedUrl(fileName, 3600);
        if (!urlError && signedUrlData?.signedUrl) {
          logoUrl = signedUrlData.signedUrl;
        }
      } catch (err) {
        console.error("Signed URL error:", err);
      }

      if (!logoUrl) {
        const { data: { publicUrl } } = supabase.storage.from("profile-pictures").getPublicUrl(fileName);
        logoUrl = publicUrl;
      }

      res.json({ ...updated, brandLogo: logoUrl });
    } catch (error) {
      console.error("Error uploading brand logo:", error);
      res.status(500).json({ error: "Failed to upload brand logo" });
    }
  });

  // Delete brand logo
  app.delete("/host/profile/logo", requireAuth, async (req, res) => {
    try {
      const profile = await getUserProfile(req.user.id);
      if (profile.brandLogo) {
        let filePath = profile.brandLogo;
        if (filePath.includes("profile-pictures/")) {
          const urlMatch = filePath.match(/profile-pictures\/([^?]+)/);
          if (urlMatch) filePath = urlMatch[1];
        }
        const { supabase } = await import("../supabase.js");
        await supabase.storage.from("profile-pictures").remove([filePath]);
      }

      const updated = await updateUserProfile(req.user.id, { brandLogo: null });
      res.json(updated);
    } catch (error) {
      console.error("Error deleting brand logo:", error);
      res.status(500).json({ error: "Failed to delete brand logo" });
    }
  });
}
