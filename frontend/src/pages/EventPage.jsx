// frontend/src/pages/EventPage.jsx
// Mobile-first, Instagram-friendly event page
import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { PartyPopper } from "lucide-react";
import {
  FaPaperPlane,
  FaInstagram,
  FaSpotify,
  FaTiktok,
  FaSoundcloud,
  FaCalendar,
  FaMapMarkerAlt,
} from "react-icons/fa";
import { SilverIcon } from "../components/ui/SilverIcon.jsx";
import { MediaCarousel, CarouselDots, useCarouselSwipe } from "../components/MediaCarousel";
import { useToast } from "../components/Toast";
import {
  getEventShareUrl,
  getGoogleMapsUrl,
  formatLocationShort,
} from "../lib/urlUtils";
import { formatEventDate, formatEventTime } from "../lib/dateUtils.js";
import { ModalOrDrawer } from "../components/ui/ModalOrDrawer";
import { RsvpForm } from "../components/RsvpForm";
import { PaymentForm } from "../components/PaymentForm";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { publicFetch } from "../lib/api.js";
import { isNetworkError, handleNetworkError } from "../lib/errorHandler.js";
import { logger } from "../lib/logger.js";
import { colors } from "../theme/colors.js";

export function EventPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const [event, setEvent] = useState(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [showRsvpForm, setShowRsvpForm] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(null); // { clientSecret, amount, currency, booking }
  const [currentPartySize, setCurrentPartySize] = useState(1); // Track party size for price calculation
  const [waitlistOffer, setWaitlistOffer] = useState(null); // Waitlist payment link offer
  const [waitlistToken, setWaitlistToken] = useState(null); // Waitlist token from URL
  const [vipOffer, setVipOffer] = useState(null); // VIP invite offer
  const [vipToken, setVipToken] = useState(null); // VIP token from URL
  const [canShareStory, setCanShareStory] = useState(false);
  const [showSharePicker, setShowSharePicker] = useState(false);
  const [selectedShareIndexes, setSelectedShareIndexes] = useState(new Set());

  // MUST be called before any early returns to follow Rules of Hooks
  const swipeHandlers = useCarouselSwipe(
    event?.media?.length || 0,
    setCarouselIndex,
  );

  // Memoize the payment success handler to prevent PaymentForm remounts
  // MUST be called before any early returns to follow Rules of Hooks
  const handlePaymentSuccess = useCallback(
    async (paymentIntent) => {
      // Stripe confirmed the PaymentIntent on the client.
      const currentPayment = pendingPayment;
      const currentEvent = event; // Capture event at callback time

      // Basic safety fallback if state was lost
      if (!currentPayment || !currentEvent) {
        if (currentEvent?.slug) {
          navigate(`/e/${currentEvent.slug}/success`, {
            state: {
              booking: {
                name:
                  paymentIntent?.charges?.data?.[0]?.billing_details?.name ||
                  null,
                email: null,
              },
              payment: {
                id: paymentIntent.id,
                status: paymentIntent.status || "succeeded",
              },
            },
          });
        }
        return;
      }

      // Standard PaymentIntent flow (Option B):
      // - Client confirms PaymentIntent with Stripe.js
      // - If Stripe returns succeeded, redirect immediately
      // - Backend/webhook later fulfills based on payment_intent.succeeded
      // - FALLBACK: If webhook doesn't arrive, manually verify payment
      if (paymentIntent?.status === "succeeded") {
        // Fallback: Manually verify payment with backend
        // This ensures payment status updates even if webhook doesn't arrive
        try {
          console.log(
            "[EventPage] Payment succeeded, verifying with backend..."
          );
          const verifyRes = await publicFetch(
            `/payments/verify/${paymentIntent.id}`,
            {
              method: "POST",
            }
          );
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            console.log("[EventPage] Payment verified:", verifyData);
          } else {
            console.warn(
              "[EventPage] Payment verification failed, but payment succeeded client-side"
            );
          }
        } catch (verifyError) {
          console.error("[EventPage] Error verifying payment:", verifyError);
          // Don't block user flow - payment succeeded client-side
        }

        setPendingPayment(null);
        setShowRsvpForm(false);
        // Extract booking data from nested structure for paid events
        const rsvpData = currentPayment.booking?.rsvp || {};
        const statusDetails = currentPayment.booking?.statusDetails || {};
        const eventData = currentPayment.booking?.event || currentEvent;

        // Extract dinner info from multiple possible locations
        // Backend returns it in statusDetails, but also in rsvp.dinner
        const dinnerBookingStatus =
          statusDetails?.dinnerBookingStatus ||
          rsvpData?.dinner?.bookingStatus ||
          rsvpData?.dinnerBookingStatus ||
          null;
        const wantsDinner =
          statusDetails?.wantsDinner !== undefined
            ? statusDetails.wantsDinner
            : rsvpData?.dinner?.enabled || rsvpData?.wantsDinner || false;

        navigate(`/e/${currentEvent.slug}/success`, {
          state: {
            booking: {
              name: currentPayment.booking?.name || rsvpData?.name || null,
              email: currentPayment.booking?.email || rsvpData?.email || null,
              bookingStatus:
                statusDetails?.bookingStatus ||
                rsvpData?.bookingStatus ||
                "CONFIRMED",
              dinnerBookingStatus: dinnerBookingStatus,
              wantsDinner: wantsDinner,
              partySize:
                rsvpData?.partySize || currentPayment.booking?.partySize || 1,
              plusOnes: rsvpData?.plusOnes || 0,
              dinnerPartySize:
                rsvpData?.dinnerPartySize ||
                rsvpData?.dinner?.partySize ||
                null,
              dinnerTimeSlot:
                rsvpData?.dinnerTimeSlot || rsvpData?.dinner?.slotTime || null,
            },
            payment: {
              id: currentPayment.paymentId,
              status: "succeeded",
              amount: currentPayment.amount,
              currency: currentPayment.currency,
              paymentBreakdown: currentPayment.paymentBreakdown,
            },
          },
        });
      } else {
        console.warn(
          "[EventPage] PaymentIntent not succeeded after confirm:",
          paymentIntent?.status
        );
      }
    },
    [event, navigate, pendingPayment]
  );

  // Memoize PaymentFormComponent to prevent unnecessary remounts
  // MUST be called before any early returns to follow Rules of Hooks
  const PaymentFormComponent = useMemo(() => {
    if (!event || event?.ticketType !== "paid" || !event?.slug) {
      return null;
    }
    const eventSlug = event.slug; // Capture slug to avoid closure issues
    return ({
      clientSecret,
      amount,
      currency,
      onSuccess,
      onError,
      showButton,
    }) => (
      <PaymentForm
        clientSecret={clientSecret}
        amount={amount}
        currency={currency}
        eventSlug={eventSlug}
        onSuccess={pendingPayment ? handlePaymentSuccess : onSuccess}
        onError={onError}
        showButton={showButton}
      />
    );
  }, [event, pendingPayment, handlePaymentSuccess]);

  // Check if event has passed - MUST be called before any early returns to follow Rules of Hooks
  const isEventPast = useMemo(() => {
    if (!event) return false;
    const now = new Date();
    // Use endsAt if available, otherwise use startsAt
    const eventEndTime = event.endsAt ? new Date(event.endsAt) : (event.startsAt ? new Date(event.startsAt) : null);
    if (!eventEndTime) return false;
    return now > eventEndTime;
  }, [event]);

  // Detect mobile file-sharing support (for "Add to Story" button)
  useEffect(() => {
    async function checkShareSupport() {
      if (!navigator.canShare) return;
      try {
        const testFile = new File([new Uint8Array(1)], "test.png", { type: "image/png" });
        if (navigator.canShare({ files: [testFile] })) {
          setCanShareStory(true);
        }
      } catch {
        // Not supported
      }
    }
    checkShareSupport();
  }, []);

  useEffect(() => {
    async function loadEvent() {
      setLoading(true);
      setNotFound(false);

      // Check for waitlist or VIP token first
      const waitlistQueryToken = searchParams.get("wl");
      const vipQueryToken = searchParams.get("vip");

      // Prefer waitlist token if both are present (they shouldn't be)
      const initialTokenType = waitlistQueryToken
        ? "waitlist"
        : vipQueryToken
          ? "vip"
          : null;
      const initialToken = waitlistQueryToken || vipQueryToken || null;

      if (initialToken && initialTokenType === "waitlist") {
        // If waitlist token exists, validate it first to get event info
        try {
          const offerRes = await publicFetch(
            `/events/${slug}/waitlist-offer?wl=${initialToken}`
          );
          if (offerRes.ok) {
            const offerData = await offerRes.json();
            // Token is valid - use event from token response directly
            if (offerData.event && offerData.event.id) {
              setEvent(offerData.event);
              setWaitlistOffer(offerData);
              setWaitlistToken(initialToken);
              setSearchParams({}, { replace: true });
              setLoading(false);
              return;
            }
          } else {
            const error = await offerRes.json().catch(() => ({}));
            console.error("Invalid waitlist token:", error);
            setSearchParams({}, { replace: true });
          }
        } catch (err) {
          console.error("Error validating waitlist token:", err);
          setSearchParams({}, { replace: true });
        }
      } else if (initialToken && initialTokenType === "vip") {
        // VIP token: validate to get event + invite info
        try {
          const offerRes = await publicFetch(
            `/events/${slug}/vip-offer?vip=${initialToken}`
          );
          if (offerRes.ok) {
            const offerData = await offerRes.json();
            if (offerData.event && offerData.event.id) {
              setEvent(offerData.event);
              setVipOffer(offerData);
              setVipToken(initialToken);
              setShowRsvpForm(true);
              setSearchParams({}, { replace: true });
              setLoading(false);
              return;
            }
          } else {
            const error = await offerRes.json().catch(() => ({}));
            console.error("Invalid VIP token:", error);
            setSearchParams({}, { replace: true });
          }
        } catch (err) {
          console.error("Error validating VIP token:", err);
          setSearchParams({}, { replace: true });
        }
      }

      // Normal event loading (no token or token validation failed)
      try {
        const res = await publicFetch(`/events/${slug}`);
        if (res.status === 404) {
          setNotFound(true);
          setEvent(null);
          return;
        }
        if (!res.ok) throw new Error("Failed to load event");
        const data = await res.json();
        // Debug: Log event structure to verify slug exists (dev-only)
        logger.debug("[EventPage] Loaded event", {
          id: data.id,
          slug: data.slug,
          title: data.title,
          hasImage: !!data.imageUrl,
        });
        if (!data.slug) {
          console.error("[EventPage] WARNING: Event missing slug!", data);
        }
        setEvent(data);

        // If we still have tokens in the URL and event loaded, validate now
        if (waitlistQueryToken) {
          try {
            const offerRes = await publicFetch(
              `/events/${slug}/waitlist-offer?wl=${waitlistQueryToken}`
            );
            if (offerRes.ok) {
              const offerData = await offerRes.json();
              setWaitlistOffer(offerData);
              setWaitlistToken(waitlistQueryToken);
              setSearchParams({}, { replace: true });
            } else {
              const error = await offerRes.json().catch(() => ({}));
              console.error("Invalid waitlist token:", error);
              setSearchParams({}, { replace: true });
            }
          } catch (err) {
            console.error("Error validating waitlist token:", err);
            setSearchParams({}, { replace: true });
          }
        } else if (vipQueryToken) {
          try {
            const offerRes = await publicFetch(
              `/events/${slug}/vip-offer?vip=${vipQueryToken}`
            );
            if (offerRes.ok) {
              const offerData = await offerRes.json();
              setVipOffer(offerData);
              setVipToken(vipQueryToken);
              setShowRsvpForm(true);
              setSearchParams({}, { replace: true });
            } else {
              const error = await offerRes.json().catch(() => ({}));
              console.error("Invalid VIP token:", error);
              setSearchParams({}, { replace: true });
            }
          } catch (err) {
            console.error("Error validating VIP token:", err);
            setSearchParams({}, { replace: true });
          }
        }
      } catch (err) {
        console.error("Error loading event", err);
        if (isNetworkError(err)) {
          handleNetworkError(err, showToast, "Failed to load event");
        }
      } finally {
        setLoading(false);
      }
    }

    if (slug) loadEvent();
  }, [slug, searchParams, setSearchParams, showToast]);

  // Track page view (fire-and-forget, never blocks rendering)
  useEffect(() => {
    if (!event?.id || !slug) return;
    try {
      // Get or create a persistent visitor ID
      let visitorId = localStorage.getItem("pullup_visitor_id");
      if (!visitorId) {
        visitorId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem("pullup_visitor_id", visitorId);
      }

      // Parse UTM params from the current URL
      const params = new URLSearchParams(window.location.search);
      const isMobile = window.innerWidth < 768;

      publicFetch(`/events/${slug}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId,
          referrer: document.referrer || null,
          utm_source: params.get("utm_source") || null,
          utm_medium: params.get("utm_medium") || null,
          utm_campaign: params.get("utm_campaign") || null,
          utm_content: params.get("utm_content") || null,
          deviceType: isMobile ? "mobile" : "desktop",
        }),
      }).catch(() => {}); // Silently ignore tracking failures
    } catch {
      // Never let tracking break the page
    }
  }, [event?.id, slug]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          position: "relative",
          background:
            `${colors.gradientGlow}, ${colors.background}`,
          padding: "40px 16px",
        }}
      >
        <div className="responsive-container responsive-container-wide">
          <div
            className="responsive-card"
            style={{
              background: "rgba(12, 10, 18, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "18px", opacity: 0.8 }}>Loading event…</div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div
        style={{
          minHeight: "100vh",
          position: "relative",
          background:
            `${colors.gradientGlow}, ${colors.background}`,
          padding: "40px 16px",
        }}
      >
        <div className="responsive-container responsive-container-wide">
          <div
            className="responsive-card"
            style={{
              background: "rgba(12, 10, 18, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "18px", opacity: 0.8 }}>
              Event not found.
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function handleRsvpSubmit(data) {
    setRsvpLoading(true);
    const submittedData = data; // Store submitted data for later use
    try {
      // Include waitlist or VIP data if present
      let requestBody = { ...data };
      if (waitlistOffer && waitlistOffer.rsvpDetails && waitlistToken) {
        requestBody = {
          ...requestBody,
          waitlistRsvpId: waitlistOffer.rsvpDetails.id,
          waitlistToken: waitlistToken,
        };
      } else if (vipOffer && vipOffer.invite && vipToken) {
        requestBody = {
          ...requestBody,
          vipToken,
        };
      }

      const res = await publicFetch(`/events/${event.slug}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));

        if (res.status === 409 && err.error === "full") {
          return false;
        }

        if (res.status === 409 && err.error === "duplicate") {
          return false;
        }

        // Handle payment errors specifically
        if (res.status === 500 && err.error === "payment_failed") {
          console.error("Payment creation error:", err.details || err.message);
          return false;
        }

        throw new Error(err.error || err.message || "Failed to RSVP");
      }

      const body = await res.json();

      // If this is a paid event and payment is required, store payment info
      // and let the inline PaymentForm handle confirmation with Stripe.
      if (body.stripe?.clientSecret && body.payment) {
        setPendingPayment({
          clientSecret: body.stripe.clientSecret,
          amount: body.payment.amount, // Customer total (ticket + service fee)
          currency: body.payment.currency || "usd",
          paymentId: body.stripe.paymentId,
          paymentBreakdown: body.paymentBreakdown || null, // Fee breakdown for display
          booking: {
            name: body.rsvp?.name || submittedData?.name || null,
            email: body.rsvp?.email || submittedData?.email || null,
            rsvp: body.rsvp,
            event: body.event,
            statusDetails: body.statusDetails || null, // Include statusDetails for dinner info
          },
        });
        // Keep RSVP modal open with payment section active
        return true;
      }

      // Handle different status scenarios with appropriate messages
      const statusDetails = body.statusDetails || {
        bookingStatus:
          body.rsvp?.bookingStatus ||
          (body.rsvp?.status === "attending" ? "CONFIRMED" : "WAITLIST"),
        dinnerBookingStatus:
          body.rsvp?.dinner?.bookingStatus ||
          (body.rsvp?.dinnerStatus === "confirmed"
            ? "CONFIRMED"
            : body.rsvp?.dinnerStatus === "waitlist"
            ? "WAITLIST"
            : null),
        wantsDinner:
          body.rsvp?.dinner?.enabled || body.rsvp?.wantsDinner || false,
        // Backward compatibility
        cocktailStatus: body.rsvp?.status || "attending",
        dinnerStatus: body.rsvp?.dinnerStatus || null,
      };

      const bookingStatus =
        statusDetails.bookingStatus ||
        (statusDetails.cocktailStatus === "attending"
          ? "CONFIRMED"
          : "WAITLIST");
      const dinnerBookingStatus =
        statusDetails.dinnerBookingStatus ||
        (statusDetails.dinnerStatus === "confirmed"
          ? "CONFIRMED"
          : statusDetails.dinnerStatus === "waitlist"
          ? "WAITLIST"
          : null);
      const wantsDinner = statusDetails.wantsDinner;

      // Build appropriate message based on status
      let message = "";
      let subtext = "";
      let toastType = "success";

      if (bookingStatus === "WAITLIST") {
        // Entire booking is on waitlist (all-or-nothing)
        message = "You're on the waitlist";
        toastType = "info";

        if (wantsDinner && dinnerBookingStatus === "WAITLIST") {
          subtext =
            "Dinner is full right now. The host will reach out if a table opens.";
        } else {
          subtext =
            "The event is full right now. The host will reach out if a spot opens.";
        }
      } else if (bookingStatus === "CONFIRMED") {
        // Fully confirmed
        message = "You're in!";
        if (wantsDinner && dinnerBookingStatus === "CONFIRMED") {
          subtext = "Your dinner time is confirmed. Check the details above.";
        }
      }

      // Close RSVP form
      setShowRsvpForm(false);

      // Redirect to success page with booking details
      setTimeout(() => {
        navigate(`/e/${event.slug}/success`, {
          state: {
            booking: {
              name: body.rsvp?.name || submittedData?.name || null,
              email: body.rsvp?.email || submittedData?.email || null,
              bookingStatus: bookingStatus,
              dinnerBookingStatus: dinnerBookingStatus,
              wantsDinner: wantsDinner,
              partySize:
                body.rsvp?.partySize ||
                (submittedData?.plusOnes ? 1 + submittedData.plusOnes : 1),
              plusOnes: body.rsvp?.plusOnes || submittedData?.plusOnes || 0,
              dinnerPartySize:
                body.rsvp?.dinnerPartySize ||
                body.rsvp?.dinner?.partySize ||
                submittedData?.dinnerPartySize ||
                null,
              dinnerTimeSlot:
                body.rsvp?.dinnerTimeSlot ||
                body.rsvp?.dinner?.slotTime ||
                submittedData?.dinnerTimeSlot ||
                null,
              statusDetails: statusDetails,
            },
          },
        });
      }, 1000);

      return true; // Success
    } catch (err) {
      console.error(err);
      if (isNetworkError(err)) {
        handleNetworkError(err, showToast, "Network error. Please try again.");
      } else {
        console.error("RSVP error:", err.message || err);
      }
      return false;
    } finally {
      setRsvpLoading(false);
    }
  }

  // Use share URL for better link previews (returns HTML with OG tags)
  const shareUrl = event && event.slug ? getEventShareUrl(event.slug) : "";

  // Determine share mode based on media settings
  const isAutoCarousel = event?.mediaSettings?.autoscroll && event?.media?.length > 1;
  const isManualCarousel = !event?.mediaSettings?.autoscroll && event?.media?.length > 1;
  const carouselInterval = event?.mediaSettings?.interval || 5;

  // Generate a video from carousel images by drawing each on a canvas at the set interval
  async function createCarouselVideo(mediaItems, intervalSec) {
    const size = 1080; // Story-friendly square
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    // Pre-load all images
    const images = await Promise.all(
      mediaItems.map(
        (m) =>
          new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = m.url;
          })
      )
    );
    const validImages = images.filter(Boolean);
    if (validImages.length === 0) return null;

    // Record the canvas as video
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("video/mp4")
        ? "video/mp4"
        : "video/webm",
    });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const done = new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
    });

    recorder.start();

    // Draw each image for intervalSec, looping once through all images
    for (const img of validImages) {
      // Cover-fit the image into the square canvas
      const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      await new Promise((r) => setTimeout(r, intervalSec * 1000));
    }

    recorder.stop();
    return done;
  }

  // Build file(s) to share based on media type
  async function buildShareFiles() {
    if (!event) return [];

    // Single video → share the video directly
    if (event.media?.length === 1 && event.media[0].mediaType === "video") {
      const res = await fetch(event.media[0].url);
      const blob = await res.blob();
      return [new File([blob], `${event.title || "event"}.mp4`, { type: blob.type || "video/mp4" })];
    }

    // Auto-scroll carousel → generate a video from the images
    if (isAutoCarousel) {
      const blob = await createCarouselVideo(event.media, carouselInterval);
      if (blob) {
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        return [new File([blob], `${event.title || "event"}.${ext}`, { type: blob.type })];
      }
    }

    // Manual carousel with picker → share only selected images
    if (isManualCarousel && selectedShareIndexes.size > 0) {
      const selected = event.media.filter((_, i) => selectedShareIndexes.has(i));
      return Promise.all(
        selected.map(async (m, i) => {
          const res = await fetch(m.url);
          const blob = await res.blob();
          const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
          return new File([blob], `${event.title || "event"}-${i + 1}.${ext}`, { type: blob.type || "image/jpeg" });
        })
      );
    }

    // Single image or cover fallback
    const url = event.coverImageUrl || event.imageUrl || event.media?.[0]?.url;
    if (!url) return [];
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
    return [new File([blob], `${event.title || "event"}.${ext}`, { type: blob.type || "image/jpeg" })];
  }

  // Format date/time (centralized helpers)
  const eventDate = event?.startsAt ? formatEventDate(event.startsAt, event.timezone) : "";
  const eventTime = event?.startsAt ? formatEventTime(event.startsAt, event.timezone) : "";

  const mediaCount = event?.media?.length || 0;
  const canSwipeEvent = mediaCount > 1 && !event?.mediaSettings?.autoscroll;

  return (
    <>
      <style>{`
        /* Prevent horizontal scroll and ensure proper alignment */
        body {
          overflow-x: hidden;
          overflow-y: hidden;
          width: 100%;
          height: 100vh;
          height: 100dvh; /* Dynamic viewport height for mobile */
        }
        html {
          overflow: hidden;
          height: 100vh;
          height: 100dvh; /* Dynamic viewport height for mobile */
        }
        @supports (height: 100dvh) {
          body, html {
            height: 100dvh;
          }
        }
        * {
          box-sizing: border-box;
        }
        /* Desktop-specific styles */
        @media (min-width: 768px) {
          .description-text {
            max-width: 60%;
          }
          /* On desktop, always make description scrollable when needed */
          .description-container {
            flex: 1 !important;
            min-height: 0 !important;
          }
          .description-container .description-text {
            max-width: 60%;
          }
          /* On desktop, content group always behaves as expanded */
          .content-group-desktop {
            flex: 0 1 auto !important;
            max-height: calc(100vh - 90px) !important;
            overflow: hidden !important;
          }
        }
        /* Content group - contains Share/Event Details + Description, moves up together */
        .content-group {
          flex-shrink: 0;
          flex: 0 0 auto;
        }
        /* When description is expanded, content group sizes naturally (not forced to top) */
        .content-group-expanded {
          flex: 0 1 auto;
          max-height: calc(100vh - 90px);
          max-height: calc(100dvh - 90px);
          overflow: hidden;
        }
        @supports (height: 100dvh) {
          .content-group-expanded {
            max-height: calc(100dvh - 90px);
          }
        }
        /* Static info section - sticks to top of description */
        .static-info-section {
          flex-shrink: 0;
        }
        /* Scrollable description container - works on all screen sizes */
        .description-scrollable {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          padding-right: 4px; /* Space for scrollbar */
        }
        .description-scrollable::-webkit-scrollbar {
          width: 4px;
        }
        .description-scrollable::-webkit-scrollbar-track {
          background: transparent;
        }
        .description-scrollable::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
        }
        .description-scrollable::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        /* Content container accounts for sticky button - mobile optimized */
        .event-content-container {
          height: calc(100vh - 90px);
          height: calc(100dvh - 90px); /* Use dynamic viewport height when supported (better for mobile) */
          max-height: calc(100vh - 90px);
          max-height: calc(100dvh - 90px);
          box-sizing: border-box;
        }
        @supports (height: 100dvh) {
          .event-content-container {
            height: calc(100dvh - 90px);
            max-height: calc(100dvh - 90px);
          }
        }
        /* Outer container for proper viewport handling */
        .event-page-container {
          min-height: 100vh;
          min-height: 100dvh; /* Use dynamic viewport height when supported */
          height: 100vh;
          height: 100dvh;
          overflow: hidden;
        }
      `}</style>
      <div
        className="event-page-container"
        {...(canSwipeEvent ? swipeHandlers : {})}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "100vw",
          overflowX: "hidden",
          overflowY: "hidden",
          background: "#05040a",
          cursor: canSwipeEvent ? "grab" : undefined,
        }}
      >
        {/* Event Media as Full Background (carousel or single image) */}
        {(event?.media?.length > 0 || event?.imageUrl) && (
          <>
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: "100%",
                height: "100%",
                zIndex: 0,
              }}
            >
              {event?.media?.length > 0 ? (
                <MediaCarousel media={event.media} mediaSettings={event.mediaSettings} hideDots controlledIndex={canSwipeEvent ? carouselIndex : undefined} onIndexChange={setCarouselIndex} />
              ) : (
                <img
                  src={event.imageUrl}
                  alt={event.title}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              )}
            </div>
            {/* Gradient overlay - fades to black at bottom */}
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background:
                  "linear-gradient(to bottom, transparent 0%, transparent 40%, rgba(5, 4, 10, 0.3) 60%, rgba(5, 4, 10, 0.7) 75%, #05040a 100%)",
                pointerEvents: "none",
                zIndex: 1,
              }}
            />
          </>
        )}

        {/* Content - Overlaid on background */}
        <div
          className="event-content-container"
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            padding: "20px",
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          {/* Title at the top - always visible */}
          <h1
            style={{
              fontSize: "clamp(28px, 8vw, 40px)",
              fontWeight: 800,
              lineHeight: "1.2",
              color: "#fff",
              letterSpacing: "-0.02em",
              margin: 0,
              marginTop: "20px",
              marginBottom: "0",
              paddingBottom: "12px",
              flexShrink: 0,
            }}
          >
            {event?.title}
          </h1>

          {/* Content group - Share/Event Details + Description - moves up together when expanded */}
          <div
            className={`content-group ${
              showDescription ? "content-group-expanded" : ""
            } content-group-desktop`}
            style={{
              marginTop: "auto",
              display: "flex",
              flexDirection: "column",
              pointerEvents: "auto",
            }}
          >
            {/* Static info section - sticks to top of description */}
            <div
              className="static-info-section"
              style={{
                flexShrink: 0,
                paddingTop: "16px",
              }}
            >
              {/* Carousel dots */}
              {event?.media?.length > 1 && !event?.mediaSettings?.autoscroll && (
                <CarouselDots
                  count={event.media.length}
                  currentIndex={carouselIndex}
                  style={{ paddingTop: "12px", paddingBottom: "4px" }}
                />
              )}

              {/* Social Icons - Share, Instagram, Spotify */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  marginBottom: "12px",
                }}
              >
                {/* Share icon - always visible */}
                <button
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    margin: 0,
                    boxShadow: "none",
                    appearance: "none",
                    WebkitAppearance: "none",
                    MozAppearance: "none",
                    outline: "none",
                    color: "inherit",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                  }}
                  onClick={async () => {
                    if (!shareUrl) return;

                    // Manual carousel on mobile → open picker first
                    if (canShareStory && isManualCarousel) {
                      setSelectedShareIndexes(new Set());
                      setShowSharePicker(true);
                      return;
                    }

                    if (navigator.share) {
                      try {
                        if (canShareStory) {
                          const files = await buildShareFiles();
                          if (files.length > 0) {
                            await navigator.share({ files, url: shareUrl });
                            return;
                          }
                        }
                        await navigator.share({ url: shareUrl });
                        return;
                      } catch (err) {
                        if (err?.name === "AbortError") return;
                        console.error("Error sharing:", err);
                      }
                    }

                    // Fallback: copy to clipboard
                    try {
                      await navigator.clipboard.writeText(shareUrl);
                      showToast("Link copied!", "success");
                    } catch (copyErr) {
                      console.error("Failed to copy:", copyErr);
                      showToast("Failed to copy link", "error");
                    }
                  }}
                >
                  <FaPaperPlane size={20} />
                </button>

                {/* Instagram icon - conditional */}
                {event?.instagram && (
                  <a
                    href={event.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "rgba(255, 255, 255, 0.8)",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#fff";
                      e.currentTarget.style.transform = "scale(1.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "rgba(255, 255, 255, 0.8)";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    <FaInstagram size={20} />
                  </a>
                )}

                {/* Spotify icon - conditional */}
                {event?.spotify && (
                  <a
                    href={event.spotify}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "rgba(255, 255, 255, 0.8)",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#fff";
                      e.currentTarget.style.transform = "scale(1.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "rgba(255, 255, 255, 0.8)";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    <FaSpotify size={20} />
                  </a>
                )}

                {/* TikTok icon - conditional */}
                {event?.tiktok && (
                  <a
                    href={event.tiktok}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "rgba(255, 255, 255, 0.8)",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#fff";
                      e.currentTarget.style.transform = "scale(1.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "rgba(255, 255, 255, 0.8)";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    <FaTiktok size={20} />
                  </a>
                )}

                {/* SoundCloud icon - conditional */}
                {event?.soundcloud && (
                  <a
                    href={event.soundcloud}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "rgba(255, 255, 255, 0.8)",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#fff";
                      e.currentTarget.style.transform = "scale(1.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "rgba(255, 255, 255, 0.8)";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    <FaSoundcloud size={20} />
                  </a>
                )}
              </div>

              {/* Date & Time */}
              {(eventDate || eventTime) && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    marginBottom: "12px",
                    fontSize: "16px",
                    lineHeight: "1.4",
                    color: "rgba(255, 255, 255, 0.9)",
                  }}
                >
                  <FaCalendar
                    size={18}
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      marginTop: "1px",
                      color: "rgba(255, 255, 255, 0.7)",
                    }}
                  />
                  <span>
                    {eventDate}
                    {eventTime && ` at ${eventTime}`}
                  </span>
                </div>
              )}

              {/* Location */}
              {event?.location && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    marginBottom: "12px",
                    fontSize: "16px",
                    lineHeight: "1.4",
                    color: "rgba(255, 255, 255, 0.9)",
                  }}
                >
                  <FaMapMarkerAlt
                    size={18}
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      marginTop: "1px",
                      color: "rgba(255, 255, 255, 0.7)",
                    }}
                  />
                  <a
                    href={getGoogleMapsUrl(
                      event.location,
                      event.locationLat,
                      event.locationLng
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "rgba(255, 255, 255, 0.9)",
                      textDecoration: "none",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.3)",
                      transition: "all 0.2s ease",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.color = "#fff";
                      e.target.style.borderBottomColor =
                        "rgba(255, 255, 255, 0.6)";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.color = "rgba(255, 255, 255, 0.9)";
                      e.target.style.borderBottomColor =
                        "rgba(255, 255, 255, 0.3)";
                    }}
                  >
                    {formatLocationShort(event.location)}
                  </a>
                </div>
              )}
            </div>

            {/* Description - sticks below Share/Event Details, becomes scrollable when group reaches minimum */}
            {event?.description && (
              <div
                className={`description-container ${
                  showDescription ? "description-scrollable" : ""
                }`}
                style={{
                  flex: showDescription ? "1" : "0 0 auto",
                  minHeight: showDescription ? 0 : "auto",
                  paddingTop: "16px",
                  paddingBottom: showDescription ? "0" : "0",
                }}
              >
                <div style={{ marginBottom: showDescription ? "0" : "8px" }}>
                  <p
                    className="description-text"
                    style={{
                      fontSize: "16px",
                      lineHeight: "1.5",
                      color: "rgba(255, 255, 255, 0.85)",
                      margin: 0,
                      marginBottom: showDescription ? "4px" : "0",
                      whiteSpace: "pre-line",
                      wordWrap: "break-word",
                      overflowWrap: "break-word",
                      display: showDescription ? "block" : "-webkit-box",
                      WebkitLineClamp: showDescription ? "none" : 2,
                      WebkitBoxOrient: "vertical",
                      overflow: showDescription ? "visible" : "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {event.description}
                  </p>
                  <button
                    className="read-more-button"
                    onClick={() => setShowDescription(!showDescription)}
                    style={{
                      background: "none",
                      border: "none",
                      color: colors.silverText,
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: "pointer",
                      padding: "4px 0",
                      margin: "4px 0 0 0",
                      textDecoration: "none",
                      display: "inline-block",
                      WebkitTapHighlightColor: "transparent",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#fff";
                      e.currentTarget.style.transform = "scale(1.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "rgba(255, 255, 255, 0.8)";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    {showDescription ? "Read less" : "Read more"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky CTA Button */}
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            padding: "16px 20px",
            paddingBottom: "max(16px, env(safe-area-inset-bottom))",
            background:
              "linear-gradient(to top, #05040a 0%, rgba(5, 4, 10, 0.98) 70%, transparent 100%)",
            backdropFilter: "blur(20px)",
            zIndex: 100,
            boxSizing: "border-box",
            width: "100%",
            maxWidth: "420px",
          }}
        >
          <Button
            onClick={() => setShowRsvpForm(true)}
            fullWidth
            size="lg"
            disabled={loading || !event || isEventPast}
          >
            {isEventPast
              ? "Event has ended"
              : event?.ticketType === "paid" && event?.ticketPrice
              ? (() => {
                  // Show base price (1 ticket) on button - total will be shown in modal
                  const baseTotal = event.ticketPrice; // 1 ticket
                  const currency = (
                    event.ticketCurrency || "usd"
                  ).toLowerCase();
                  const symbol = currency === "sek" ? "kr" : "$";
                  const amount = (baseTotal / 100).toFixed(2);
                  return `Pull up — from ${symbol}${amount}`;
                })()
              : "Pull up"}
          </Button>
        </div>

        {/* RSVP Form Modal/Drawer (with inline payment section for paid events) */}
        <ModalOrDrawer
          isOpen={showRsvpForm}
          onClose={() => {
            setShowRsvpForm(false);
            setPendingPayment(null);
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Waitlist offer banner */}
            {waitlistOffer && (
              <div
                style={{
                  padding: "16px",
                  background: "rgba(59, 130, 246, 0.1)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  borderRadius: "8px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "#3b82f6",
                    marginBottom: "8px",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <SilverIcon as={PartyPopper} size={20} style={{ color: "#3b82f6" }} />
                    You've got a spot!
                  </span>
                </div>
                <div style={{ fontSize: "14px", opacity: 0.9 }}>
                  Your booking details are locked based on your original
                  waitlist request. Complete payment below to confirm your spot.
                </div>
              </div>
            )}
            <RsvpForm
              event={event}
              onSubmit={handleRsvpSubmit}
              loading={rsvpLoading}
              onClose={() => {
                setShowRsvpForm(false);
                setPendingPayment(null);
                // Clear waitlist offer when closing
                setWaitlistOffer(null);
                setWaitlistToken(null);
                setVipOffer(null);
                setVipToken(null);
              }}
              onPartySizeChange={setCurrentPartySize}
              // Waitlist upgrade props
              waitlistOffer={waitlistOffer}
              waitlistToken={waitlistToken}
              // VIP invite props
              vipOffer={vipOffer}
              vipToken={vipToken}
              // Payment props for paid events
              isPaidEvent={event?.ticketType === "paid"}
              ticketPrice={event?.ticketPrice}
              ticketCurrency={(event?.ticketCurrency || "usd").toLowerCase()}
              currentPartySize={currentPartySize}
              pendingPayment={pendingPayment}
              PaymentFormComponent={PaymentFormComponent}
            />
          </div>
        </ModalOrDrawer>

        {/* Share picker for manual carousels — select which images to share */}
        <ModalOrDrawer
          isOpen={showSharePicker}
          onClose={() => setShowSharePicker(false)}
          title="Share to Story"
        >
          <div style={{ padding: "16px" }}>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", marginBottom: "16px" }}>
              Select the images you want to share
            </p>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "8px",
              marginBottom: "20px",
            }}>
              {event?.media?.map((m, i) => (
                <button
                  key={m.id || i}
                  type="button"
                  onClick={() => {
                    setSelectedShareIndexes((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    });
                  }}
                  style={{
                    position: "relative",
                    aspectRatio: "1",
                    border: selectedShareIndexes.has(i)
                      ? "3px solid #fff"
                      : "3px solid transparent",
                    borderRadius: "12px",
                    overflow: "hidden",
                    padding: 0,
                    background: "#1a1a2e",
                    cursor: "pointer",
                    opacity: selectedShareIndexes.size > 0 && !selectedShareIndexes.has(i) ? 0.5 : 1,
                    transition: "all 0.2s ease",
                  }}
                >
                  <img
                    src={m.thumbnailUrl || m.url}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                  {selectedShareIndexes.has(i) && (
                    <div style={{
                      position: "absolute",
                      top: "6px",
                      right: "6px",
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      background: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
            <button
              disabled={selectedShareIndexes.size === 0}
              onClick={async () => {
                setShowSharePicker(false);
                try {
                  const files = await buildShareFiles();
                  if (files.length > 0 && navigator.share) {
                    await navigator.share({ files, url: shareUrl });
                  }
                } catch (err) {
                  if (err?.name === "AbortError") return;
                  console.error("Error sharing:", err);
                  showToast("Couldn't share", "error");
                }
              }}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: "14px",
                border: "none",
                background: selectedShareIndexes.size > 0
                  ? "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)"
                  : "#333",
                color: "#fff",
                fontWeight: 700,
                fontSize: "16px",
                cursor: selectedShareIndexes.size > 0 ? "pointer" : "not-allowed",
                opacity: selectedShareIndexes.size > 0 ? 1 : 0.5,
                transition: "all 0.2s ease",
              }}
            >
              Share {selectedShareIndexes.size > 0 ? `${selectedShareIndexes.size} image${selectedShareIndexes.size > 1 ? "s" : ""}` : ""}
            </button>
          </div>
        </ModalOrDrawer>
      </div>
    </>
  );
}
